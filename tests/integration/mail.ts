import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {db,redis} from '../../packages/data/src/db';
import {authAdmin,actorById} from '../../packages/data/src/auth';
import {onboard} from '../../packages/data/src/community';
assert.equal(process.env.APP_ENV,'development');assert.equal(process.env.MAIL_PROVIDER,'local');
try{
 const suffix=randomUUID().slice(0,8),email=`qa-mail-${suffix}@dartspoint.local`;const made=await authAdmin().auth.admin.createUser({email,email_confirm:true});assert.equal(made.error,null);const id=made.data.user!.id;await onboard(await actorById(id,Date.now()+3600000,false),{username:'qaMail'+suffix});
 const event=(await db().query('select id from private.outbox_events where dedupe_key=$1',['welcome:'+id])).rows[0].id;
 for(let attempt=0;attempt<100;attempt++){if((await db().query('select 1 from private.outbox_events where id=$1 and delivered_at is not null',[event])).rowCount)break;await new Promise(r=>setTimeout(r,100));}
 assert.equal((await db().query("select 1 from private.email_deliveries where event_id=$1 and state='accepted'",[event])).rowCount,1);
 async function messages(){const result=await(await fetch(process.env.LOCAL_MAILPIT_URL+'/api/v1/messages')).json();return result.messages.filter((m:any)=>m.To.some((to:any)=>to.Address.toLowerCase()===email));}
 const delivered=await messages();assert.equal(delivered.length,1);const mail=await(await fetch(process.env.LOCAL_MAILPIT_URL+'/api/v1/message/'+delivered[0].ID)).json();assert.ok(mail.HTML.includes('http://127.0.0.1:4300/lobby'),'Captured development email links to the local app');
 await db().query('update private.outbox_events set delivered_at=null,locked_until=null,next_try=now() where id=$1',[event]);
 for(let attempt=0;attempt<100;attempt++){if((await db().query('select 1 from private.outbox_events where id=$1 and delivered_at is not null',[event])).rowCount)break;await new Promise(r=>setTimeout(r,100));}
 assert.equal((await messages()).length,1);assert.equal((await db().query('select 1 from notifications where source_event=$1',[event])).rowCount,1);
 await writeFile('artifacts/mail-result.json',JSON.stringify({ok:true,actualVerifiedRecipient:true,realWorkerOutbox:true,actualMailpitDelivery:true,localLinks:true,acceptedDeliveryNotRepeated:true,notificationOnce:true},null,2));console.log('Real worker outbox, captured email, local links and accepted delivery dedupe passed');
}finally{await db().end();await(await redis()).quit();}
