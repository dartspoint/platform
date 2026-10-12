import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {Client} from '@colyseus/sdk';
import {fullMatch} from './play-match';
import {login,get,post,origin} from './helpers';
const browser=await chromium.launch();

try{
 const a=await login(browser,'PlayerA'),b=await login(browser,'PlayerB'),viewer=await login(browser,'Viewer');
  const boot=await get(a.page,'bootstrap'),room=boot.rooms.find((r:any)=>r.name==='Nederland 1');
 for(const actor of [a,b,viewer])await post(actor.page,'room',{roomId:room.id});
 const invitation=await post(a.page,'invite',{targetId:b.id,roomId:room.id,rules:{startScore:301,doubleIn:true,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:true});
 const accepted=await post(b.page,'invite/respond',{inviteId:invitation.id,action:'accept'});const id=accepted.matchId;
 await a.page.goto(origin+'/spelen?match='+id);await b.page.goto(origin+'/spelen?match='+id);
 await a.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();await b.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();
 let state=await get(a.page,'match/'+id);for(let i=0;i<40&&state.lifecycle!=='playing';i++){await new Promise(r=>setTimeout(r,100));state=await get(a.page,'match/'+id);}assert.equal(state.lifecycle,'playing');
 const sdk=new Client('ws://127.0.0.1:42567');const spectator=await sdk.joinOrCreate('match',{matchId:id,token:viewer.token});
 let spectatorSnapshot:any;spectator.onMessage('snapshot',s=>{spectatorSnapshot=s;});
 const rejected=new Promise<any>(resolve=>spectator.onMessage('error',resolve));spectator.send('command',{protocolVersion:1,commandId:randomUUID(),matchId:id,expectedStateVersion:state.stateVersion,type:'dart.stop_horizontal',phaseToken:state.state.phaseToken});const error=await rejected;assert.equal(error.code,'spectator_read_only');
 await a.page.getByLabel('Chatbericht',{exact:true}).first().fill('Toetsenbordcontrole');await a.page.getByLabel('Chatbericht',{exact:true}).first().press('Space');assert.equal((await get(a.page,'match/'+id)).state.phase,'horizontal','Typing cannot throw a dart');
 await a.page.getByLabel('Chatbericht',{exact:true}).first().fill('Echte wedstrijdchat');await a.page.getByRole('button',{name:'Verstuur bericht',exact:true}).first().click();await b.page.getByText('Echte wedstrijdchat',{exact:true}).waitFor({timeout:10000});
 await a.page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();});await a.page.keyboard.press('Space');
 for(let i=0;i<40;i++){state=await get(a.page,'match/'+id);if(state.state.phase==='vertical')break;await new Promise(r=>setTimeout(r,50));}assert.equal(state.state.phase,'vertical');
 const scores=[...state.state.scores];await a.page.getByRole('button',{name:'Stop verticale indicator en gooi',exact:true}).click();
 for(let i=0;i<40;i++){state=await get(a.page,'match/'+id);if(state.state.pendingDart)break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(state.state.phase,'flight');assert.deepEqual(state.state.scores,scores);const committedHit=state.state.pendingDart.hit;
 await new Promise(r=>setTimeout(r,700));state=await get(a.page,'match/'+id);assert.equal(state.state.pendingDart,null);assert.equal(state.state.events.length,1);assert.deepEqual(state.state.events[0].hit,committedHit);
 for(let i=0;i<20&&spectatorSnapshot?.state?.events.length!==1;i++)await new Promise(r=>setTimeout(r,100));assert.equal(spectatorSnapshot.state.events.length,1);
 await a.page.reload();await a.page.getByRole('button',{name:'Stop horizontale indicator',exact:true}).waitFor();const restored=await get(a.page,'match/'+id);assert.deepEqual(restored.state.events,state.state.events);
 await a.page.screenshot({path:'artifacts/multiplayer-player-a.png',fullPage:true});await b.page.screenshot({path:'artifacts/multiplayer-player-b.png',fullPage:true});const result=await fullMatch(a,b,id);await spectator.leave();
 const totals=(await get(a.page,'bootstrap')).personalRecords;assert.ok(totals.highestCheckout>0);assert.ok(totals.fastestLeg>0);assert.equal(totals.wins,1);
 await writeFile('artifacts/multiplayer-result.json',JSON.stringify({ok:true,newOtpUsers:3,independentBrowsers:true,spectatorReadOnly:true,realMatchChatBetweenBrowsers:true,keyboardNoThrowWhileTyping:true,keyboardStopsMeter:true,accountRecordAggregates:true,authoritativeHit:true,scoreAtImpact:true,reconnectRestored:true,...result},null,2));
 console.log('Two browsers, spectator, authoritative impacts, reconnect, full match and Elo passed');
}finally{await browser.close();}
