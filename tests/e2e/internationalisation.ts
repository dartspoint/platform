import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {Client} from '@colyseus/sdk';
import {login,get,post,origin,testClientHeaders} from './helpers';
await mkdir('artifacts/i18n',{recursive:true});
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1366,height:900},locale:'nl-NL'});
await context.addInitScript('globalThis.__name = (fn) => fn;');
const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
let matchId:string|undefined,token:string|undefined;
try{
 const headers=testClientHeaders();await context.route('**/api/platform/auth/**',route=>route.continue({headers:{...route.request().headers(),...headers}}));
 await page.goto(origin+'/en');assert.equal(await page.locator('html').getAttribute('lang'),'en');await page.getByRole('heading',{name:/last leg/i}).waitFor();
 assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth>innerWidth),false);
 for(const locale of ['nl','en']){
  const response=await fetch(origin+'/api/auth/google/callback?flow=invalid',{redirect:'manual',headers:{Cookie:'dp-locale='+locale}});
  assert.equal(response.status,307);assert.equal(new URL(response.headers.get('location')!).pathname,'/'+locale+'/inloggen');
 }
 await page.goto(origin+'/en/inloggen');
 const email=`qa-i18n-flow-${randomUUID()}@dartspoint.local`;
 await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByRole('button',{name:'Get your sign-in code',exact:true}).click();await page.getByLabel('Your one-time code').waitFor();
 let code:string|undefined,mail:any;
 async function messages(){const listing=await(await fetch('http://127.0.0.1:62424/api/v1/messages')).json();return listing.messages.filter((m:any)=>m.To.some((to:any)=>to.Address.toLowerCase()===email));}
 for(let attempt=0;attempt<40&&!code;attempt++){const sent=await messages();if(sent[0]){mail=await(await fetch('http://127.0.0.1:62424/api/v1/message/'+sent[0].ID)).json();code=(mail.Text||mail.HTML).match(/\b\d{6}\b/)?.[0];}if(!code)await new Promise(resolve=>setTimeout(resolve,100));}
 assert.ok(code,'Actual English OTP arrived');assert.match(mail.HTML,/lang="en"/);assert.match(mail.Subject,/sign-in code/);
 const beforeMailCount=(await messages()).length;
 await page.getByLabel('Nederlands / English').selectOption('nl');await page.getByLabel('Je eenmalige code').waitFor();assert.equal((await messages()).length,beforeMailCount,'Language choice does not request another OTP');
 await page.getByLabel('Nederlands / English').selectOption('en');await page.getByLabel('Your one-time code').fill(code);await page.getByRole('button',{name:'Confirm your code',exact:true}).click();
 const username='I18nFlow'+randomUUID().slice(0,8);
 await page.getByLabel('Player name',{exact:true}).fill(username);await page.getByRole('checkbox',{name:/I am at least 16/}).check();await page.getByRole('checkbox',{name:/I accept the/}).check();await page.getByRole('button',{name:'Confirm my player name',exact:true}).click();await page.getByRole('button',{name:'Open the lobby',exact:true}).click();await page.waitForURL('**/lobby');
 let boot=await get(page,'bootstrap');assert.equal(boot.preferences.locale,'en');
 const pieces=(await context.cookies()).filter(c=>/^sb-.*-auth-token(?:\.\d+)?$/.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>c.value).join('');token=JSON.parse(Buffer.from(pieces.replace(/^base64-/,''),'base64url').toString()).access_token;
 const peer=await login(browser,'I18nPeer');const room=boot.rooms.find((r:any)=>r.name==='Nederland 1');assert.ok(room);
 for(const p of [page,peer.page])await post(p,'room',{roomId:room.id});
 const invitation=await post(page,'invite',{targetId:peer.id,roomId:room.id,rules:{startScore:301,doubleIn:true,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false});
 matchId=(await post(peer.page,'invite/respond',{inviteId:invitation.id,action:'accept'})).matchId;
 let connections=0;page.on('websocket',()=>connections++);
 await page.goto(origin+'/spelen?match='+matchId);await peer.page.goto(origin+'/spelen?match='+matchId);
 await page.getByRole('button',{name:'Start the match',exact:true}).click();await peer.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();
 await page.getByRole('button',{name:'Stop horizontal indicator',exact:true}).waitFor();await page.getByRole('button',{name:'Stop horizontal indicator',exact:true}).click();await page.getByRole('button',{name:'Stop vertical indicator and throw',exact:true}).waitFor();
 const before=await get(page,'match/'+matchId),baselineConnections=connections;
 await page.evaluate(()=>{(window as any).__i18nBoard=document.querySelector('svg[aria-label]');(window as any).__i18nInput=document.querySelector('.aim-meter-vertical');});
 const draft='Vrije tekst <b>exact hetzelfde</b>';
 await page.getByLabel('Chat message',{exact:true}).first().fill(draft);
 await page.getByRole('button',{name:'Open player menu',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByLabel('Nederlands / English').selectOption('nl');await page.getByRole('dialog').getByText('Jouw speelritme',{exact:true}).waitFor();
 assert.equal(await page.locator('html').getAttribute('lang'),'nl');assert.equal(connections,baselineConnections,'Language choice keeps personal and match sockets');
 const after=await get(page,'match/'+matchId);assert.equal(after.id,before.id);assert.equal(after.stateVersion,before.stateVersion);for(const key of ['scores','currentPlayer','phase','phaseToken','phaseStartedAt','pendingDart','dartsThrown'])assert.deepEqual(after.state[key],before.state[key],key);
 assert.equal(await page.evaluate(()=>(window as any).__i18nBoard===document.querySelector('svg[aria-label]')),true,'The actual board node remains mounted');
 assert.equal(await page.getByLabel('Chatbericht',{exact:true}).first().inputValue(),draft);
 boot=await get(page,'bootstrap');assert.equal(boot.preferences.locale,'nl');
 await page.screenshot({path:'artifacts/i18n/match-language-switch.png',fullPage:true});assert.deepEqual(errors,[]);
 await writeFile('artifacts/i18n/e2e-result.json',JSON.stringify({ok:true,actualEnglishOtp:true,languageChangeDoesNotResend:true,accountPreference:true,realTwoPlayerMatch:true,statePreserved:true,boardNodePreserved:true,socketsPreserved:true,draftPreserved:true},null,2));console.log('Real English OTP, bilingual registration and language switch in an active match passed');
}catch(error){
 await page.screenshot({path:'artifacts/i18n/match-language-failure.png',fullPage:true}).catch(()=>{});
 console.error(JSON.stringify({event:'i18n_browser_failure',path:new URL(page.url()).pathname,language:await page.locator('html').getAttribute('lang'),buttons:await page.getByRole('button').allTextContents(),errors}));throw error;
}finally{
 if(matchId&&token){try{const sdk=new Client(process.env.NEXT_PUBLIC_REALTIME_URL!),room=await sdk.joinOrCreate('match',{matchId,token});room.onMessage('snapshot',()=>{});room.onMessage('clock.challenge',()=>{});const snapshot=await get(page,'match/'+matchId);const receipt=new Promise(resolve=>{room.onMessage('receipt',resolve);room.onMessage('error',resolve);});room.send('command',{protocolVersion:1,commandId:randomUUID(),matchId,expectedStateVersion:snapshot.stateVersion,type:'match.forfeit'});await Promise.race([receipt,new Promise(resolve=>setTimeout(resolve,3000))]);await room.leave();}catch{}}
 await browser.close();
}
