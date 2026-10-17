import assert from 'node:assert/strict';
import {chromium,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {db} from '../../packages/data/src/db';
import {origin,login} from './helpers';

// A focused follow-up to documents-support.ts. Both identities sign in through
// real local Auth; the real support worker sends its reply through Mailpit.
assert.equal(process.env.APP_ENV,'development');
assert.equal(process.env.MAIL_PROVIDER,'local');
assert.equal(origin,'http://127.0.0.1:4300');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname,'127.0.0.1');
assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);
process.umask(0o077);

const browser=await chromium.launch(),sessions:Awaited<ReturnType<typeof login>>[]=[];
const directory='artifacts/documents-support-delivery-browser';
const checks:Record<string,boolean>={};
let ownerId:string|undefined;
const thread=(page:Page)=>page.locator('section[tabindex="-1"]');
await mkdir(directory,{recursive:true,mode:0o700});
try{
 const requester=await login(browser,'MailPlayer');sessions.push(requester);
 const owner=await login(browser,'MailOwner');sessions.push(owner);ownerId=owner.id;
 await db().query("insert into user_roles(user_id,role,granted_by) values($1,'owner',$1)",[owner.id]);
 await requester.page.goto(origin+'/support');
 await requester.page.getByRole('combobox',{name:/^Onderwerp/}).selectOption('general');
 const title='Bezorgcontrole '+randomUUID().slice(0,8);
 await requester.page.getByLabel('Korte titel',{exact:true}).fill(title);
 await requester.page.getByLabel('Je bericht',{exact:true}).fill('Eigen lokale controle van de bezorgstatus van een antwoord.');
 const created=requester.page.waitForResponse(response=>response.url()===origin+'/api/support/tickets'&&response.request().method()==='POST');
 await requester.page.getByRole('button',{name:'Verstuur mijn vraag',exact:true}).click();
 const createResponse=await created;assert.equal(createResponse.status(),200);
 const ticketId=(await createResponse.json()).ticketId;assert.ok(ticketId);
 await requester.page.goto(origin+'/handleiding');
 await owner.page.goto(origin+'/team/support?ticket='+ticketId);
 await thread(owner.page).getByRole('button',{name:'Ik pak dit ticket op',exact:true}).click();
 await thread(owner.page).getByLabel('Je echte voornaam',{exact:true}).fill('Mila');
 await thread(owner.page).getByRole('button',{name:'Voornaam opslaan',exact:true}).click();
 await expect(thread(owner.page).getByLabel('Je bericht',{exact:true})).toBeEnabled();
 const reply='Je ontvangt dit antwoord via de lokale testmaildienst.';
 await thread(owner.page).getByLabel('Je bericht',{exact:true}).fill(reply);
 await thread(owner.page).getByRole('button',{name:'Antwoord versturen',exact:true}).click();
 await expect(thread(owner.page).getByText(reply,{exact:true})).toBeVisible();
 const panel=thread(owner.page).getByRole('region',{name:'E-mailbezorging',exact:true});
 await expect(panel).toBeVisible();
 const replyDelivery=panel.getByRole('article').filter({has:owner.page.getByText('Supportantwoord',{exact:true})});
 await expect(replyDelivery.getByText('Aangenomen door e-maildienst',{exact:true})).toBeVisible({timeout:30000});
 checks.realAcceptedDeliveryVisibleToStaff=true;
 const detailResponse=await owner.page.request.get(origin+'/api/support/tickets/'+ticketId);assert.equal(detailResponse.status(),200);
 const detail=await detailResponse.json();assert.equal(detail.canReconcileMail,true);
 const acceptedReply=detail.deliveries.find((delivery:any)=>delivery.kind==='reply'&&delivery.status==='accepted');assert.ok(acceptedReply);
 for(const delivery of detail.deliveries){
  assert.deepEqual(Object.keys(delivery).sort(),['attempts','busy','canRetry','firstAttemptAt','id','kind','nextTry','requiresReconciliation','status','updatedAt'].sort());
  if(delivery.status==='accepted')assert.equal(delivery.canRetry,false,'An accepted reply must not offer a blind resend');
 }
 checks.mailMetadataDoesNotExposeAddressesOrContent=true;
 const listing=await(await fetch('http://127.0.0.1:62424/api/v1/messages')).json();
 let replyDelivered=false;
 for(const item of listing.messages.filter((message:any)=>message.To.some((recipient:any)=>recipient.Address.toLowerCase()===requester.email.toLowerCase()))){
  const mail=await(await fetch('http://127.0.0.1:62424/api/v1/message/'+item.ID)).json();
  if(String(mail.MessageID).includes('dp-support-'+acceptedReply.id+'@dartspoint.nl')){
   const text=String(mail.Text||mail.HTML||'');
   assert.ok(text.includes('/mijn-tickets?ticket='+ticketId));
   assert.equal(text.includes(reply),false,'An account notification must keep the private answer inside the authenticated ticket');
   replyDelivered=true;
  }
 }
 assert.equal(replyDelivered,true,'The accepted status must correspond to a real local reply');
 checks.acceptedStatusMatchesActualLocalMailbox=true;
 await requester.page.goto(origin+'/mijn-tickets?ticket='+ticketId);
 await expect(thread(requester.page).getByText(reply,{exact:true})).toBeVisible();
 await expect(requester.page.getByRole('region',{name:'E-mailbezorging',exact:true})).toHaveCount(0);
 const ownResponse=await requester.page.request.get(origin+'/api/support/tickets/'+ticketId);assert.equal(ownResponse.status(),200);
 const own=await ownResponse.json();assert.deepEqual(own.deliveries,[]);assert.equal(Boolean(own.canReconcileMail),false);
 checks.mailRecoveryIsNotExposedToRequester=true;
 // Only the address-free delivery region is captured. No thread, email or token.
 await panel.screenshot({path:directory+'/staff-mail-status.png'});
 await writeFile(directory+'/results.json',JSON.stringify({ok:true,realAuth:true,realPersistence:true,realMailpit:true,checks},null,2),{mode:0o600});
 console.log(JSON.stringify({event:'documents_support_delivery_browser_passed',checks:Object.keys(checks).length,noEmailOrTokenArtifacts:true}));
}catch(error){
 const page=sessions.at(-1)?.page;
 if(page){await page.screenshot({path:directory+'/failure.png',fullPage:true}).catch(()=>{});console.error(JSON.stringify({event:'support_delivery_browser_failure',path:new URL(page.url()).pathname,language:await page.locator('html').getAttribute('lang'),headings:await page.getByRole('heading').allTextContents(),buttons:await page.getByRole('button').allTextContents()}));}
 throw error;
}finally{
 for(const session of sessions)try{await session.page.request.post(origin+'/api/platform/auth/logout',{data:{},headers:{origin}});}catch{}
 if(ownerId)await db().query("update user_roles set revoked_at=coalesce(revoked_at,now()) where user_id=$1 and role='owner'",[ownerId]);
 await browser.close();await db().end();
}
