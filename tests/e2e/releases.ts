import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect,type BrowserContext} from '@playwright/test';
import {db} from '../../packages/data/src/db';
import {login,origin,get,post} from './helpers';

// Only new, owned local Auth fixtures; no cloud sessions or production accounts.
assert.equal(process.env.APP_ENV,'development');
assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);
for(const value of [origin,process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.DATABASE_URL!])assert.equal(new URL(value).hostname,'127.0.0.1');
process.umask(0o077);
const directory='artifacts/release-management-browser';await mkdir(directory,{recursive:true,mode:0o700});
const browser=await chromium.launch(),contexts:BrowserContext[]=[],checks:Record<string,boolean>={};
let adminId:string|undefined;let completed=false;const seededCards:string[]=[];
try{
  const guest=await browser.newPage();await guest.goto(origin+'/updates');assert.equal(new URL(guest.url()).pathname,'/inloggen');await guest.close();checks.updatesRequiresAuthentication=true;
  const player=await login(browser,'ReleasePlayer'),admin=await login(browser,'ReleaseAdmin'),other=await login(browser,'ReleaseOther');
  contexts.push(player.context,admin.context,other.context);adminId=admin.id;
  // Owner is an existing Platformbeheer role; these are newly created local fixtures.
  assert.ok((await db().query("select 1 from user_roles where role='owner' and revoked_at is null limit 1")).rowCount,'A pre-existing owner permits safe test-owner cleanup');
  await db().query("insert into user_roles(user_id,role,granted_by) values($1,'owner',$1)",[admin.id]);
  const page=player.page;page.setDefaultTimeout(20000);await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(origin+'/updates');await expect(page.getByRole('heading',{name:'Toegevoegd aan DartsPoint',exact:true})).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
  const ideaButton=page.getByRole('button',{name:'Idee inbrengen',exact:true});await ideaButton.click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Jouw idee')).toBeFocused();
  const title='Lokale releasecontrole '+randomUUID().slice(0,8),description='Mijn privé-uitleg blijft alleen voor mijn account en platformbeheer.';
  await dialog.getByLabel('Jouw idee').fill(title);await dialog.getByLabel('Vertel er iets meer over').fill(description);
  await page.keyboard.press('Escape');const discard=page.getByRole('alertdialog');await expect(discard).toBeVisible();
  await discard.getByRole('button',{name:'Verder schrijven',exact:true}).click();await expect(dialog.getByLabel('Jouw idee')).toHaveValue(title);await expect(dialog.getByLabel('Jouw idee')).toBeFocused();checks.dirtyCloseRetainsInputAndFocus=true;console.log('release_browser_checkpoint:dirty_close');
  // Lose the first response AFTER the real server commit; the retry must reuse its UUID.
  const requestIds:string[]=[];let lost=false;
  await page.route('**/api/platform/releases/submit',async route=>{
    requestIds.push(route.request().postDataJSON().requestId);
    if(!lost){lost=true;const committed=await route.fetch();assert.equal(committed.status(),200);await route.abort('failed');}
    else await route.continue();
  });
  await dialog.getByRole('button',{name:'Verstuur mijn idee',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Je invoer blijft bewaard');await expect(dialog.getByLabel('Jouw idee')).toHaveValue(title);await expect(dialog.getByLabel('Vertel er iets meer over')).toHaveValue(description);
  await dialog.getByRole('button',{name:'Verstuur mijn idee',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Bedankt voor het meedenken.',exact:true})).toBeVisible();
  assert.equal(requestIds.length,2);assert.equal(requestIds[0],requestIds[1]);await page.unroute('**/api/platform/releases/submit');
  await dialog.getByRole('button',{name:'Bekijk mijn ideeën',exact:true}).click();await expect(dialog.getByRole('heading',{name:title,exact:true})).toHaveCount(1);
  const own=(await get(page,'releases/mine')).ideas,idea=own.find((item:any)=>item.title===title);assert.ok(idea);assert.equal(own.filter((item:any)=>item.title===title).length,1);assert.equal(idea.status,'ideas');
  assert.equal((await get(other.page,'releases/mine')).ideas.some((item:any)=>item.id===idea.id),false);assert.equal((await other.page.request.get(origin+'/api/platform/releases/admin')).status(),403);
  checks.lostResponseRetryCreatesOnePrivateIdea=true;console.log('release_browser_checkpoint:lost_response_retry');
  await dialog.getByRole('button',{name:'Venster sluiten',exact:true}).click();await expect(ideaButton).toBeFocused();
  for(let index=0;index<4;index++){
    let seed=await post(admin.page,'releases/admin',{action:'create',title:`Eigen geschiedenisfixture ${index} ${randomUUID().slice(0,8)}`,description:'Afzonderlijk lokaal browserfixture',category:'other',requestId:randomUUID()});seededCards.push(seed.id);
    seed=await post(admin.page,'releases/admin',{action:'update',id:seed.id,expectedRevision:seed.revision,requestId:randomUUID(),patch:{status:'added',releaseTitle:`Eerdere browsertoevoeging ${index}`,releaseSummary:'Eerdere openbare toevoeging voor de volledige geschiedeniscontrole.'}});
    await post(admin.page,'releases/admin',{action:'publish',id:seed.id,expectedRevision:seed.revision,requestId:randomUUID()});
  }
  const manager=admin.page;manager.setDefaultTimeout(20000);await manager.emulateMedia({reducedMotion:'reduce'});await manager.setViewportSize({width:1600,height:1000});await manager.goto(origin+'/beheer?tab=releases');
  const newIdea=manager.getByRole('button',{name:'Nieuw idee',exact:true}).first();await newIdea.click();let newEditor=manager.getByRole('dialog');await newEditor.getByLabel(/^Titel van het idee/).fill('Niet opgeslagen beheerconcept');await manager.keyboard.press('Escape');let discardAdmin=manager.getByRole('alertdialog');await discardAdmin.getByRole('button',{name:'Verder bewerken',exact:true}).click();await expect(newEditor.getByLabel(/^Titel van het idee/)).toHaveValue('Niet opgeslagen beheerconcept');await manager.keyboard.press('Escape');discardAdmin=manager.getByRole('alertdialog');await discardAdmin.getByRole('button',{name:'Wijzigingen laten vervallen',exact:true}).click();await expect(manager.getByRole('dialog')).toHaveCount(0);await newIdea.click();await expect(manager.getByRole('dialog').getByLabel(/^Titel van het idee/)).toHaveValue('');await manager.keyboard.press('Escape');checks.adminDiscardReleasesPointerLock=true;
  await manager.getByLabel('Zoek ideeën en verbeteringen',{exact:true}).fill(String(idea.number));
  const cardButton=manager.getByRole('button',{name:`Open #${idea.number}: ${title}`,exact:true}),cardNode=manager.locator('article[draggable]').filter({has:cardButton});
  await expect(cardNode).toHaveCount(1);await cardNode.dragTo(manager.locator('section[data-status="considering"]'),{sourcePosition:{x:20,y:10},targetPosition:{x:40,y:70}});
  const statusChoice=manager.getByRole('combobox',{name:`Status van #${idea.number}: ${title}`,exact:true});await expect(statusChoice).toHaveValue('considering');checks.desktopDragMovesCard=true;console.log('release_browser_checkpoint:desktop_drag');
  await manager.setViewportSize({width:390,height:844});await statusChoice.focus();await manager.keyboard.press('ArrowDown');await manager.keyboard.press('Enter');await expect(statusChoice).toHaveValue('doing');await expect(statusChoice).toBeFocused();
  await statusChoice.selectOption('added');await expect(statusChoice).toHaveValue('added');assert.equal(await manager.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await manager.screenshot({path:directory+'/admin-mobile.png'});checks.mobileAndKeyboardStatusChoice=true;console.log('release_browser_checkpoint:mobile_keyboard_status');
  assert.equal((await get(page,'releases/publications')).updates.some((item:any)=>item.number===idea.number),false);checks.addedDoesNotPublish=true;
  const publicTitle='Een openbare verbetering '+randomUUID().slice(0,8),summary='Dit is de openbare momentopname, zonder privé-inzending of interne notities.';
  await manager.setViewportSize({width:1600,height:1000});await cardButton.click();let editor=manager.getByRole('dialog').filter({has:manager.getByRole('heading',{name:'Idee & voortgang',exact:true})});
  await editor.getByLabel(/^Openbare titel/).fill(publicTitle);await editor.getByLabel(/^Openbare samenvatting/).fill(summary);await editor.getByLabel(/^Interne notities/).fill('Geheime interne notitie');await editor.getByLabel(/^Versie/).fill('qa-local');
  await editor.getByRole('button',{name:'Opslaan',exact:true}).click();await expect(editor.getByRole('button',{name:'Publiceren in lobby',exact:true})).toBeEnabled();await editor.getByRole('button',{name:'Publiceren in lobby',exact:true}).click();
  let confirmation=manager.getByRole('alertdialog').filter({has:manager.getByRole('heading',{name:'Deze update publiceren?',exact:true})});await expect(confirmation.getByRole('heading',{name:publicTitle,exact:true})).toBeVisible();await expect(confirmation.getByText('Geheime interne notitie',{exact:true})).toHaveCount(0);
  assert.equal((await get(page,'releases/publications')).updates.some((item:any)=>item.number===idea.number),false,'Preview alone does not publish');await confirmation.getByRole('button',{name:'Publiceren in lobby',exact:true}).click();await expect(editor.getByRole('button',{name:'Intrekken',exact:true})).toBeVisible();checks.adminPublicPreviewAndExplicitPublish=true;
  const publicSnapshot=(await get(page,'releases/publications')).updates.find((item:any)=>item.number===idea.number);assert.equal(publicSnapshot.title,publicTitle);assert.deepEqual(Object.keys(publicSnapshot).sort(),['category','id','number','publishedAt','summary','title','version']);checks.publicSnapshotHasOnlySafeFields=true;
  const room=(await get(page,'bootstrap')).rooms.find((item:any)=>item.name==='Nederland 1');assert.ok(room);await post(page,'room',{roomId:room.id});await page.goto(origin+'/spelen');
  const widget=page.locator('[data-widget-id]').filter({has:page.getByRole('heading',{name:'Laatste toevoegingen',exact:true})});await expect(widget).toBeVisible();
  const url=page.url(),chat=page.getByLabel('Chatbericht',{exact:true}).first();await chat.fill('Niet verzonden kamerconcept');
  await expect(widget.locator('ol[aria-label="Gepubliceerde toevoegingen"]>li')).toHaveCount(3);await widget.getByRole('button',{name:'Alle toevoegingen',exact:true}).click();await expect(page.getByRole('dialog').getByRole('button',{name:'Lees toevoeging: Eerdere browsertoevoeging 0',exact:true})).toBeVisible();assert.ok(await page.getByRole('dialog').locator('ol[aria-label="Gepubliceerde toevoegingen"]>li').count()>=5);checks.fullHistoryExceedsWidgetLimit=true;await page.getByRole('dialog').getByRole('button',{name:'Lees toevoeging: '+publicTitle,exact:true}).click();await expect(page.getByRole('dialog').getByText(summary,{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');assert.equal(page.url(),url);await expect(chat).toHaveValue('Niet verzonden kamerconcept');checks.inRoomDetailsPreserveChatDraftAndLocation=true;
  await page.screenshot({path:directory+'/room-desktop.png'});
  await page.setViewportSize({width:390,height:844});await widget.getByRole('button',{name:'Idee inbrengen',exact:true}).click();const mobileDialog=page.getByRole('dialog');await mobileDialog.getByLabel('Jouw idee').fill('Mobiel concept');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);const action=await mobileDialog.getByRole('button',{name:'Verstuur mijn idee',exact:true}).boundingBox();assert.ok(action&&action.y>=0&&action.y+action.height<=844);
  await page.screenshot({path:directory+'/idea-mobile.png'});
  await page.setViewportSize({width:390,height:500});await expect.poll(async()=>{const box=await mobileDialog.getByRole('button',{name:'Verstuur mijn idee',exact:true}).boundingBox();return Boolean(box&&box.y>=0&&box.y+box.height<=500);},{message:'Submit remains visible after a keyboard-sized viewport resize'}).toBe(true);await page.screenshot({path:directory+'/idea-mobile-keyboard.png'});
  await page.keyboard.press('Escape');await page.getByRole('alertdialog').getByRole('button',{name:'Invoer wissen',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);checks.mobileActionsVisibleAndDiscardWorks=true;
  await widget.getByRole('button',{name:'Idee inbrengen',exact:true}).click();await expect(page.getByRole('dialog').getByLabel('Jouw idee')).toHaveValue('');await page.keyboard.press('Escape');checks.explicitDiscardClearsInput=true;
  // A genuine concurrent write makes the old editor fail safely without replacing typed text.
  await editor.getByLabel(/^Openbare titel/).fill('Dit lokale concept moet behouden blijven');
  const concurrent=(await get(admin.page,'releases/admin')).items.find((item:any)=>item.id===idea.id);
  await post(admin.page,'releases/admin',{action:'update',id:concurrent.id,expectedRevision:concurrent.revision,requestId:randomUUID(),patch:{notes:'Parallel opgeslagen beheernotitie'}});
  await editor.getByRole('button',{name:'Opslaan',exact:true}).click();await expect(editor.getByRole('alert').filter({hasText:'Jouw formulier'}).first()).toBeVisible();await expect(editor.getByLabel(/^Openbare titel/)).toHaveValue('Dit lokale concept moet behouden blijven');
  await editor.getByRole('button',{name:'Nieuwste versie laden',exact:true}).click();confirmation=manager.getByRole('alertdialog').filter({has:manager.getByRole('heading',{name:'Nieuwste versie laden?',exact:true})});await confirmation.getByRole('button',{name:'Nieuwste versie laden',exact:true}).click();await expect(confirmation).toHaveCount(0);await expect(editor.getByLabel(/^Openbare titel/)).toHaveValue(publicTitle);checks.concurrentEditorPreservesTypedText=true;
  // Editing the card preserves its snapshot until an explicit second publication.
  const nextPublicTitle='Gewijzigde openbare titel '+randomUUID().slice(0,8);await editor.getByLabel(/^Openbare titel/).fill(nextPublicTitle);await editor.getByRole('button',{name:'Opslaan',exact:true}).click();await expect(editor.getByRole('button',{name:'Publicatie bijwerken',exact:true})).toBeEnabled();
  assert.deepEqual((await get(page,'releases/publications')).updates.find((item:any)=>item.number===idea.number),publicSnapshot);
  await editor.getByRole('button',{name:'Publicatie bijwerken',exact:true}).click();confirmation=manager.getByRole('alertdialog').filter({has:manager.getByRole('heading',{name:'Deze update publiceren?',exact:true})});await confirmation.getByRole('button',{name:'Publiceren in lobby',exact:true}).click();await expect(confirmation).toHaveCount(0);
  assert.equal((await get(page,'releases/publications')).updates.find((item:any)=>item.number===idea.number).title,nextPublicTitle);checks.internalEditsNeedExplicitRepublish=true;
  await editor.getByRole('button',{name:'Intrekken',exact:true}).click();confirmation=manager.getByRole('alertdialog').filter({has:manager.getByRole('heading',{name:'Publicatie intrekken?',exact:true})});await confirmation.getByRole('button',{name:'Publicatie intrekken',exact:true}).click();await expect(confirmation).toHaveCount(0);assert.equal((await get(page,'releases/publications')).updates.some((item:any)=>item.number===idea.number),false);checks.explicitWithdrawRemovesPublication=true;
  await editor.getByRole('button',{name:'Publiceren in lobby',exact:true}).click();confirmation=manager.getByRole('alertdialog').filter({has:manager.getByRole('heading',{name:'Deze update publiceren?',exact:true})});await confirmation.getByRole('button',{name:'Publiceren in lobby',exact:true}).click();await expect(confirmation).toHaveCount(0);await editor.getByRole('button',{name:'Sluiten',exact:true}).click();
  await statusChoice.selectOption('doing');confirmation=manager.getByRole('alertdialog').filter({has:manager.getByRole('heading',{name:'Verplaatsen en publicatie intrekken?',exact:true})});await expect(confirmation).toBeVisible();assert.ok((await get(page,'releases/publications')).updates.find((item:any)=>item.number===idea.number),'Confirmation preserves the existing publication');await confirmation.getByRole('button',{name:'Verplaatsen en intrekken',exact:true}).click();await expect(statusChoice).toHaveValue('doing');assert.equal((await get(page,'releases/publications')).updates.some((item:any)=>item.number===idea.number),false);checks.confirmedMoveAtomicallyWithdraws=true;
  await statusChoice.selectOption('added');await expect(statusChoice).toHaveValue('added');
  // The direct link opens the precise widget editor, and its preview stays read-only.
  await manager.getByRole('button',{name:'Lobbywidget inrichten',exact:true}).click();await expect(manager.getByRole('heading',{name:'Laatste toevoegingen',exact:true})).toBeVisible();await manager.getByRole('tab',{name:'Voorbeeld',exact:true}).click();const previewWidget=manager.locator('.dp-room-feed-preview [data-widget-id]').filter({has:manager.getByRole('heading',{name:'Laatste toevoegingen',exact:true})});await expect(previewWidget.getByRole('button',{name:'Idee inbrengen',exact:true})).toBeDisabled();await expect(previewWidget.getByRole('button',{name:'Mijn ideeën',exact:true})).toHaveCount(0);await manager.getByRole('tab',{name:/^Widgets/}).click();await manager.getByRole('button',{name:'Open releasebeheer',exact:true}).click();await expect(manager.getByRole('heading',{name:'Van goed idee naar mooie update.',exact:true})).toBeVisible();checks.widgetEditorCrossLinksAndReadonlyPreview=true;
  await page.goto(origin+'/updates');await page.getByRole('button',{name:'Mijn ideeën',exact:true}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.getByRole('dialog').getByText('Toegevoegd',{exact:true})).toBeVisible();await page.screenshot({path:directory+'/my-ideas-mobile.png'});
  completed=true;console.log('Release player browser flow passed: real storage, lost-response idempotency, private projections, publication snapshots, keyboard and mobile dialogs');
}finally{
  if(adminId&&seededCards.length){const fixturePage=contexts[1]?.pages()[0];if(fixturePage){const board=await get(fixturePage,'releases/admin');for(const id of seededCards){const item=board.items.find((entry:any)=>entry.id===id);if(item?.publication)await post(fixturePage,'releases/admin',{action:'withdraw',id,expectedRevision:item.revision,requestId:randomUUID()});}}}
  if(adminId)await db().query("update user_roles set revoked_at=coalesce(revoked_at,now()) where user_id=$1 and role='owner'",[adminId]);
  await writeFile(directory+'/result.json',JSON.stringify({ok:completed,checks},null,2));
  for(const context of contexts)await context.close();await browser.close();await db().end();
}
