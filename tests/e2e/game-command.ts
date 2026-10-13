import {Room} from '@colyseus/sdk';
import {randomUUID} from 'node:crypto';
import type {Page} from '@playwright/test';
import {get,origin} from './helpers';
async function sendCommand(page:Page,snapshot:any,type:'match.forfeit'){
 const encoder=new Room('match');let bytes:number[]=[];
 encoder.connection={isOpen:true,send:(data:Uint8Array)=>bytes=[...data]} as any;
 encoder.send('command',{protocolVersion:1,commandId:randomUUID(),matchId:snapshot.matchId,expectedStateVersion:snapshot.stateVersion,phaseToken:snapshot.state.phaseToken,type});
 await page.evaluate(bytes=>{const socket=(window as any).__qaGameSocket;if(!socket||socket.readyState!==WebSocket.OPEN)throw new Error('Authenticated match socket unavailable for fixture cleanup');socket.send(new Uint8Array(bytes));},bytes);
}
export async function forfeitGame(page:Page,id:string,participants:Page[]=[page]){
 let snapshot=await get(page,'match/'+id);if(!['assigned','playing','paused'].includes(snapshot.lifecycle))return;
 // Confirm assigned/paused fixtures through the same authorized player views,
 // rather than adding a test-only cancellation permission to the game API.
 if(snapshot.lifecycle!=='playing'){
  for(const participant of participants){const url=new URL(participant.url());if(url.pathname!=='/spelen'||url.searchParams.get('match')!==id)await participant.goto(origin+'/spelen?match='+id);
   const own=await get(participant,'match/'+id);if(own.seat===null)throw new Error('Fixture cleanup participant is not a player');if(!own.state.ready[own.seat])await participant.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();}
  for(let n=0;n<50;n++){snapshot=await get(page,'match/'+id);if(snapshot.lifecycle==='playing'||!['assigned','paused'].includes(snapshot.lifecycle))break;await page.waitForTimeout(100);}
  if(snapshot.lifecycle!=='playing'){if(!['assigned','paused'].includes(snapshot.lifecycle))return;throw new Error('Fixture participants could not confirm match cleanup');}
 }
 for(let n=0;n<50&&snapshot.state.pendingDart;n++){await page.waitForTimeout(100);snapshot=await get(page,'match/'+id);}if(snapshot.state.pendingDart)throw new Error('Fixture impact has not settled for cleanup');
 let sender:Page|undefined;for(const participant of participants)if(await participant.evaluate(()=>{const socket=(window as any).__qaGameSocket;return !!socket&&socket.readyState===WebSocket.OPEN;})){sender=participant;break;}if(!sender)throw new Error('Authenticated match socket unavailable for fixture cleanup');
 for(let attempt=0;attempt<3;attempt++){snapshot=await get(sender,'match/'+id);if(!['assigned','playing','paused'].includes(snapshot.lifecycle))return;await sendCommand(sender,snapshot,'match.forfeit');for(let n=0;n<30;n++){if((await get(sender,'match/'+id)).lifecycle==='completed')return;await page.waitForTimeout(50);}}
 throw new Error('Fixture match was not forfeited');
}
