import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect,type Page} from '@playwright/test';
import {db} from '../../packages/data/src/db';
import {login,origin} from './helpers';

assert.equal(process.env.APP_ENV,'development');
assert.equal(process.env.MAIL_PROVIDER,'local');
assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);
assert.ok(['http://127.0.0.1:4300','http://127.0.0.1:4301'].includes(origin));
for(const value of [process.env.DATABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_URL!])assert.equal(new URL(value).hostname,'127.0.0.1');
process.umask(0o077);
const browser=await chromium.launch(),checks:Record<string,boolean>={};
const sessions:Awaited<ReturnType<typeof login>>[]=[];
let adminId:string|undefined,stage='authentication',releaseDelayed:(()=>void)|undefined;
const directory='artifacts/profile-contact/browser';
await mkdir(directory,{recursive:true,mode:0o700});
const contact=(page:Page)=>page.locator('[data-player-contact]');
const endpoint=(id:string)=>origin+'/api/platform/admin/player-contact?userId='+id;
async function ownProfile(page:Page){await page.goto(origin+'/lobby');await page.getByRole('button',{name:'Mijn profiel',exact:true}).click();await expect(page.locator('.profile-view')).toBeVisible();}
async function dossier(page:Page,name:string){await page.getByRole('button',{name:'Beheer '+name,exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();}
try{
 const target=await login(browser,'MailT');target.email=target.email.toLowerCase();sessions.push(target);
 const viewer=await login(browser,'MailV');viewer.email=viewer.email.toLowerCase();sessions.push(viewer);adminId=viewer.id;
 const page=viewer.page;page.setDefaultTimeout(20000);await page.emulateMedia({reducedMotion:'reduce'});
 let contactRequests=0;page.on('request',request=>{if(request.url().includes('/admin/player-contact?'))contactRequests++;});
 stage='ordinary_player';await ownProfile(page);await expect(contact(page)).toHaveCount(0);
 assert.equal(contactRequests,0,'A normal profile must not request privileged contact data');
 let denied=await page.request.get(endpoint(target.id));assert.equal(denied.status(),403);assert.equal((await denied.text()).includes(target.email),false);
 checks.playerHasNeitherContactUIRequestsNorAPIAccess=true;

 stage='administrator';await db().query("insert into user_roles(user_id,role,granted_by) values($1,'admin',$1)",[viewer.id]);
 await ownProfile(page);await expect(contact(page)).toContainText(viewer.email);checks.generalProfileShowsEmailToAdministrator=true;
 const privileged=await page.request.get(endpoint(target.id));assert.equal(privileged.status(),200);assert.match(privileged.headers()['cache-control'],/no-store/);assert.match(privileged.headers()['cache-control'],/private/);
 assert.deepEqual(await privileged.json(),{id:target.id,email:target.email});checks.contactAPIIsPrivateAndContainsOnlyRequestedEmail=true;

 stage='player_dossier';await page.goto(origin+'/beheer?tab=players');await dossier(page,target.name);await expect(contact(page)).toContainText(target.email);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await dossier(page,viewer.name);await expect(contact(page)).toContainText(viewer.email);await expect(contact(page)).not.toContainText(target.email);
 checks.administrationDossierShowsTheSelectedPlayerEmail=true;
 await page.screenshot({path:directory+'/administrator-dossier.png',mask:[contact(page)]});

 stage='late_profile_response';await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;releaseDelayed=resolve;});let delayed=false;
 await page.route('**/admin/player-contact?userId='+target.id,async route=>{delayed=true;await gate;try{await route.continue();}catch{/* Closing the previous profile aborts this exact request. */}});
 await dossier(page,target.name);await expect.poll(()=>delayed).toBe(true);await expect(contact(page)).not.toContainText(viewer.email);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await dossier(page,viewer.name);await expect(contact(page)).toContainText(viewer.email);
 release();await page.waitForTimeout(150);await expect(contact(page)).not.toContainText(target.email);await page.unroute('**/admin/player-contact?userId='+target.id);
 checks.switchingProfilesNeverDisplaysThePreviousEmail=true;

 stage='projection_privacy';
 for(const path of ['/api/platform/bootstrap','/api/platform/public']){
  const response=await page.request.get(origin+path);assert.equal(response.status(),200);const value=await response.json();assert.equal(JSON.stringify(value).includes(target.email),false);
  for(const player of value.players??[])assert.equal('email' in player,false);
  for(const member of value.admin?.members??[])assert.equal('email' in member,false);
 }
 checks.sharedAndPublicProfilesExcludeEmail=true;
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);checks.mobileContactFitsViewport=true;

 stage='revocation';await db().query("update user_roles set revoked_at=now() where user_id=$1 and role='admin'",[viewer.id]);
 denied=await page.request.get(endpoint(target.id));assert.equal(denied.status(),403);assert.equal((await denied.text()).includes(target.email),false);
 await ownProfile(page);await expect(contact(page)).toHaveCount(0);checks.revokedAdministratorLosesAPIAndUIAccess=true;
 await db().query("insert into private.support_team_roles(user_id,role,granted_by,reason) values($1,'platform',$1,'Owned profile contact browser fixture')",[viewer.id]);
 await ownProfile(page);await expect(contact(page)).toHaveCount(0);assert.equal((await page.request.get(endpoint(target.id))).status(),403);checks.supportPlatformRoleDoesNotGrantProfileContact=true;
 await writeFile(directory+'/result.json',JSON.stringify({ok:true,realLocalAuth:true,realPersistence:true,noResponseFulfillment:true,checks},null,2));
 console.log(JSON.stringify({event:'profile_contact_browser_passed',checks:Object.keys(checks).length}));
}catch(error){await writeFile(directory+'/failure.json',JSON.stringify({ok:false,stage,checks},null,2));throw error;}
finally{
 releaseDelayed?.();
 if(adminId){await db().query("update user_roles set revoked_at=coalesce(revoked_at,now()) where user_id=$1 and role='admin'",[adminId]);await db().query("update private.support_team_roles set revoked_at=coalesce(revoked_at,now()) where user_id=$1 and role='platform'",[adminId]);}
 for(const session of sessions)try{await session.page.request.post(origin+'/api/platform/auth/logout',{data:{},headers:{origin}});}catch{}
 // Retain the normal onboarding/audit evidence; only these temporary permissions
 // are revoked. No published document or immutable record is deleted.
 await browser.close();await db().end();
}
