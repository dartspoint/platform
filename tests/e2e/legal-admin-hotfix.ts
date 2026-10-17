import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect,type Locator,type Page} from '@playwright/test';
import {db} from '../../packages/data/src/db';
import {login,origin} from './helpers';

// A focused regression against real local Auth, Mailpit, API and PostgreSQL.
// The only injected fault aborts a real refresh request, after a real save.
assert.equal(process.env.APP_ENV,'development');
assert.equal(process.env.MAIL_PROVIDER,'local');
assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);
assert.equal(origin,'http://127.0.0.1:4300');
for(const value of [process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.DATABASE_URL!,process.env.MIGRATION_DATABASE_URL!])assert.equal(new URL(value).hostname,'127.0.0.1');
process.umask(0o077);
const directory='artifacts/legal-admin-hotfix-browser',prefix='hotfix-'+randomUUID().slice(0,8);
await mkdir(directory,{recursive:true,mode:0o700});
const browser=await chromium.launch({headless:true});
const checks:Record<string,boolean>={};
const report={ok:false,realLocalAuth:true,realMailpit:true,realPersistence:true,noPublishedDocumentChanges:true,checks,screenshots:[] as {width:number;height:number;fullPage:boolean}[],temporaryOwnerRevoked:false,ownedImmutableDraftEvidenceRetained:false,browserClosed:false,primaryFailure:false,cleanupFailure:false};
let actor:Awaited<ReturnType<typeof login>>|undefined,ownerGranted=false,stage='real_auth';
let postCount=0;

async function bundle(page:Page){const response=await page.request.get(origin+'/api/documents?admin=1');assert.equal(response.status(),200);return response.json();}
function editor(page:Page){return page.getByRole('form',{name:'Werkversie bewerken',exact:true});}
function saveButton(form:Locator){return form.getByRole('button',{name:/^Werkversie (opslaan|opgeslagen)$/});}
async function fillDraft(form:Locator,version:string,markdown:string){
 await form.getByLabel('Nieuw versienummer',{exact:true}).fill(version);
 await form.getByLabel('Documenttekst (Markdown)',{exact:true}).fill(markdown);
 await form.getByLabel(/^Wijzigingssamenvatting/).fill('Eigen lokale regressiecontrole zonder publicatie.');
 await form.getByLabel('Reden voor het beheerlog',{exact:true}).fill('Eigen lokale browsercontrole van de juridische editor.');
}
async function assertNearSave(message:Locator,form:Locator){
 await expect(message).toBeVisible();
 const status=await message.boundingBox(),button=await saveButton(form).boundingBox();
 assert.ok(status&&button,'Feedback and save button must have rendered bounds');
 assert.ok(Math.abs(status.y+status.height/2-button.y-button.height/2)<360,'Save feedback must remain beside the action');
}
async function noHorizontalClip(page:Page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Legal administration must fit the viewport');}
async function capture(page:Page,name:string){const height=await page.evaluate(()=>Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)),width=page.viewportSize()!.width,fullPage=height<=5000;await page.screenshot({path:directory+'/'+name,fullPage,mask:[page.locator('input'),page.locator('textarea')]});report.screenshots.push({width,height,fullPage});}

try{
 actor=await login(browser,'LegalFix');
 assert.ok(actor.email.endsWith('@dartspoint.local'));
 const existingOwner=await db().query("select 1 from user_roles where role='owner' and revoked_at is null and user_id<>$1 limit 1",[actor.id]);
 assert.equal(existingOwner.rowCount,1,'A pre-existing owner must remain after the temporary fixture role is revoked');
 const identity=await db().query('select username from profiles where id=$1',[actor.id]);assert.equal(identity.rows[0]?.username,actor.name);
 await db().query("insert into user_roles(user_id,role,granted_by) values($1,'owner',$1)",[actor.id]);ownerGranted=true;
 const page=actor.page;page.setDefaultTimeout(20000);await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1366,height:900});
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/documents'&&request.method()==='POST')postCount++;});
 await page.goto(origin+'/beheer?tab=legal');
 await expect(page.getByRole('heading',{name:'Juridisch en informatie',exact:true,level:2})).toBeVisible();
 await expect(editor(page)).toBeVisible();
 const originalBundle=await bundle(page);
 assert.ok(originalBundle.versions.some((item:any)=>item.key==='terms'&&item.publishedAt),'The local fixture needs published terms to exercise the existing correction guard');
 const originalPublications=originalBundle.versions.filter((item:any)=>item.publishedAt).map((item:any)=>item.id).sort();

 stage='client_validation';
 await page.getByRole('button',{name:'Algemene voorwaarden',exact:true}).click();
 const termsMarkdown='# Eigen lokale voorwaardencontrole\n\nDeze ongepubliceerde browserfixture controleert alleen dat een correctie kan worden opgeslagen. Er worden geen openbare voorwaarden gewijzigd.';
 await fillDraft(editor(page),'ongeldige versie',termsMarkdown);
 const beforeValidation=postCount;
 await editor(page).getByRole('button',{name:'Werkversie opslaan',exact:true}).click();
 await expect(editor(page).getByRole('alert')).toBeVisible();
 assert.equal(postCount,beforeValidation,'Invalid draft fields must be explained before any save request');
 await expect(editor(page).getByLabel('Documenttekst (Markdown)',{exact:true})).toHaveValue(termsMarkdown);
 checks.inlineValidationPreservesInputWithoutPosting=true;
 await page.getByRole('button',{name:'Privacyverklaring',exact:true}).click();
 await expect(editor(page).getByLabel('Documenttekst (Markdown)',{exact:true})).toHaveValue('');
 const privateWorktext='Eigen nog niet opgeslagen privacywerktekst die gescheiden moet blijven van de voorwaarden.';
 await editor(page).getByLabel('Documenttekst (Markdown)',{exact:true}).fill(privateWorktext);
 await page.getByRole('button',{name:'Algemene voorwaarden',exact:true}).click();
 await expect(editor(page).getByLabel('Documenttekst (Markdown)',{exact:true})).toHaveValue(termsMarkdown);
 await page.getByRole('button',{name:'Privacyverklaring',exact:true}).click();
 await expect(editor(page).getByLabel('Documenttekst (Markdown)',{exact:true})).toHaveValue(privateWorktext);
 await page.getByRole('button',{name:'Algemene voorwaarden',exact:true}).click();
 assert.equal(postCount,beforeValidation);checks.documentSwitchPreservesSeparateUnsavedTexts=true;

 stage='terms_save';
 const termsVersion=prefix+'-terms';await editor(page).getByLabel('Nieuw versienummer',{exact:true}).fill(termsVersion);
 await expect(editor(page).getByRole('checkbox',{name:'Spelers moeten de nieuwe voorwaarden opnieuw aanvaarden',exact:true})).not.toBeChecked();
 const beforeTermsSave=postCount;
 const termsSaved=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/documents'&&response.request().method()==='POST');
 await editor(page).getByRole('button',{name:'Werkversie opslaan',exact:true}).click();
 assert.equal((await termsSaved).status(),200);
 await assertNearSave(editor(page).getByRole('status'),editor(page));
 await expect(saveButton(editor(page))).toBeDisabled();assert.equal(postCount,beforeTermsSave+1);checks.unchangedSavedTermsCannotBeResubmitted=true;
 let saved=(await bundle(page)).versions.find((item:any)=>item.version===termsVersion);
 assert.ok(saved);assert.equal(saved.markdown,termsMarkdown);assert.equal(saved.key,'terms');assert.equal(saved.requiresAcceptance,false);assert.equal(saved.material,false);assert.equal(saved.publishedAt,null);
 checks.termsCorrectionDefaultDoesNotRequestAcceptance=true;
 checks.termsSavedWithVisibleConfirmation=true;
 await page.reload();await expect(editor(page)).toBeVisible();
 saved=(await bundle(page)).versions.find((item:any)=>item.version===termsVersion);assert.equal(saved?.markdown,termsMarkdown);assert.equal(saved?.publishedAt,null);
 checks.termsDraftPersistsAfterReload=true;

 stage='duplicate_version';
 await page.getByRole('button',{name:'Algemene voorwaarden',exact:true}).click();
 await fillDraft(editor(page),termsVersion,termsMarkdown+'\n\nInvoer die bij een conflict bewaard moet blijven.');
 const duplicate=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/documents'&&response.request().method()==='POST');
 await editor(page).getByRole('button',{name:'Werkversie opslaan',exact:true}).click();
 assert.equal((await duplicate).status(),409);
 await assertNearSave(editor(page).getByRole('alert'),editor(page));
 await expect(editor(page).getByLabel('Nieuw versienummer',{exact:true})).toHaveValue(termsVersion);
 await expect(editor(page).getByLabel('Documenttekst (Markdown)',{exact:true})).toHaveValue(termsMarkdown+'\n\nInvoer die bij een conflict bewaard moet blijven.');
 assert.equal((await bundle(page)).versions.filter((item:any)=>item.version===termsVersion).length,1);
 checks.duplicateConflictIsVisibleAndKeepsInput=true;

 stage='privacy_save_refresh_fault';
 await page.reload();await expect(editor(page)).toBeVisible();
 await page.getByRole('button',{name:'Privacyverklaring',exact:true}).click();
 const privacyVersion=prefix+'-privacy',privacyMarkdown='# Eigen lokale privacycontrole\n\nDeze ongepubliceerde browserfixture controleert het bewaren van een privacywerkversie. De openbare privacyverklaring blijft ongewijzigd.';
 await fillDraft(editor(page),privacyVersion,privacyMarkdown);
 let refreshAborted=false;
 await page.route('**/api/documents?admin=1',async route=>{if(route.request().method()==='GET'&&!refreshAborted){refreshAborted=true;await route.abort('failed');}else await route.continue();});
 const beforePrivacySave=postCount;
 const privacySaved=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/documents'&&response.request().method()==='POST');
 await editor(page).getByRole('button',{name:'Werkversie opslaan',exact:true}).click();
 assert.equal((await privacySaved).status(),200);
 await expect.poll(()=>refreshAborted).toBe(true);
 await assertNearSave(editor(page).getByRole('status'),editor(page));
 await expect(saveButton(editor(page))).toBeDisabled();assert.equal(postCount,beforePrivacySave+1);checks.unchangedSavedPrivacyCannotBeResubmitted=true;
 await page.unroute('**/api/documents?admin=1');
 saved=(await bundle(page)).versions.find((item:any)=>item.version===privacyVersion);assert.ok(saved);assert.equal(saved.key,'privacy');assert.equal(saved.markdown,privacyMarkdown);assert.equal(saved.requiresAcceptance,false);assert.equal(saved.publishedAt,null);
 checks.successfulSaveRemainsConfirmedAfterRefreshNetworkFailure=true;
 await page.reload();await expect(editor(page)).toBeVisible();
 saved=(await bundle(page)).versions.find((item:any)=>item.version===privacyVersion);assert.equal(saved?.markdown,privacyMarkdown);assert.equal(saved?.publishedAt,null);
 checks.privacyDraftPersistsAfterReload=true;

 stage='filtered_history_and_mobile';
 const history=page.getByRole('region',{name:'Versieoverzicht',exact:true});
 await page.getByRole('button',{name:'Privacyverklaring',exact:true}).click();
 await expect(history.getByText(privacyVersion,{exact:true})).toBeVisible();await expect(history.getByText(termsVersion,{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Algemene voorwaarden',exact:true}).click();
 await expect(history.getByText(termsVersion,{exact:true})).toBeVisible();await expect(history.getByText(privacyVersion,{exact:true})).toHaveCount(0);
 checks.versionHistoryCanBeFilteredByDocument=true;
 await capture(page,'legal-desktop.png');
 for(const width of [320,390]){await page.setViewportSize({width,height:844});await noHorizontalClip(page);await editor(page).getByRole('button',{name:'Werkversie opslaan',exact:true}).scrollIntoViewIfNeeded();await expect(editor(page).getByRole('button',{name:'Werkversie opslaan',exact:true})).toBeVisible();await capture(page,'legal-'+width+'.png');}
 checks.mobile320And390FitViewport=true;
 const final=(await bundle(page)).versions;
 assert.deepEqual(final.filter((item:any)=>item.publishedAt).map((item:any)=>item.id).sort(),originalPublications);
 assert.equal(final.filter((item:any)=>item.version.startsWith(prefix)).length,2);
 report.ok=true;
}catch(error){report.primaryFailure=true;console.error(JSON.stringify({event:'legal_admin_hotfix_failed',stage}));throw error;}
finally{
 let cleanupError:unknown;
 try{
  if(actor&&ownerGranted){
   assert.equal((await db().query("select 1 from user_roles where role='owner' and revoked_at is null and user_id<>$1 limit 1",[actor.id])).rowCount,1);
   const retained=await db().query('select v.version,p.version_id from private.legal_versions v left join private.legal_publications p on p.version_id=v.id where v.created_by=$1',[actor.id]);
   assert.ok(retained.rows.every(row=>row.version.startsWith(prefix)&&!row.version_id),'Only owned unpublished fixture drafts may have been created');
   report.ownedImmutableDraftEvidenceRetained=retained.rows.length!==0;
   await db().query("update user_roles set revoked_at=coalesce(revoked_at,now()) where user_id=$1 and role='owner' and granted_by=$1",[actor.id]);
   assert.equal((await db().query("select 1 from user_roles where user_id=$1 and role='owner' and revoked_at is null",[actor.id])).rowCount,0);report.temporaryOwnerRevoked=true;
   await actor.page.request.post(origin+'/api/platform/auth/logout',{data:{},headers:{origin}});
  }
 }catch(error){cleanupError=error;}
 try{await browser.close();report.browserClosed=true;}catch(error){cleanupError??=error;}
 try{await db().end();}catch(error){cleanupError??=error;}
 if(cleanupError){report.ok=false;report.cleanupFailure=true;}
 await writeFile(directory+'/results.json',JSON.stringify(report,null,2),{mode:0o600});
 if(cleanupError){if(report.primaryFailure)console.error(JSON.stringify({event:'legal_admin_hotfix_cleanup_failed',primaryFailurePreserved:true}));else throw cleanupError;}
}
console.log(JSON.stringify({event:'legal_admin_hotfix_browser_passed',checks:Object.keys(checks).length,realLocalAuth:true,realPersistence:true,temporaryOwnerRevoked:report.temporaryOwnerRevoked}));
