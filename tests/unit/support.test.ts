import assert from 'node:assert/strict';
import {test} from 'node:test';
import {supportRoles,supportTicketInput,supportTeamInput,supportMessageInput} from '../../packages/contracts/src/support';
import {supportValidateFile} from '../../packages/data/src/support-attachments';
import {randomUUID} from 'node:crypto';
test('Support accepts only the separate team-role model and server-owned requester identity',()=>{
 assert.deepEqual(supportRoles,['tournament','chat','game','platform']);
 const ticket={clientRequestId:randomUUID(),topicId:'privacy',title:'Mijn inzageverzoek',body:'Geef mijn gegevens.'};
 assert.equal(supportTicketInput.safeParse(ticket).success,true);
 assert.equal(supportTicketInput.safeParse({...ticket,requesterId:randomUUID()}).success,false);
 assert.equal(supportTeamInput.safeParse({userId:randomUUID(),roles:['admin'],firstName:'Anne',reason:'Onveilige verhoging'}).success,false);
 assert.equal(supportMessageInput.safeParse({clientRequestId:randomUUID(),body:'Antwoord',visibility:'internal',authorId:randomUUID()}).success,false);
});
test('Attachment content must match a supported media type; browser declarations are insufficient',async()=>{
 await assert.rejects(supportValidateFile(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'image/png'));
 await assert.rejects(supportValidateFile(Buffer.from('%PDF-1.7\nno end marker'),'application/pdf'));
 await assert.rejects(supportValidateFile(Buffer.from('%PDF-1.7\n%%EOF'),'image/png'));
 assert.equal(await supportValidateFile(Buffer.from('%PDF-1.7\n%%EOF'),'application/pdf'),'application/pdf');
});
import {createHmac} from 'node:crypto';
import {verifySupportWebhook,supportMailAuthenticated,supportMailAutomatic,supportMailReferences} from '../../packages/data/src/support-inbound';
test('Inbound signature covers exact bytes and timestamp; transport signing does not authenticate an email sender',()=>{
 const secret='whsec_'+Buffer.alloc(32,19).toString('base64'),raw='{"type":"email.received"}',id='msg_unit',stamp=String(Math.floor(Date.now()/1000));
 const signature=createHmac('sha256',Buffer.alloc(32,19)).update(id+'.'+stamp+'.'+raw).digest('base64');
 const headers=new Headers({'svix-id':id,'svix-timestamp':stamp,'svix-signature':'v1,'+signature});
 assert.equal(verifySupportWebhook(raw,headers,secret).id,id);
 assert.throws(()=>verifySupportWebhook(raw+' ',headers,secret));
 assert.throws(()=>verifySupportWebhook(raw,headers,secret,Date.now()+301000));
 assert.equal(supportMailAuthenticated({headers:{'authentication-results':'dmarc=pass; dkim=pass'}}),false);
 assert.equal(supportMailAuthenticated({authentication:{dmarc:'pass',dkim:'pass',spf:'fail'}}),true);
 assert.equal(supportMailAutomatic({headers:{'Auto-Submitted':'auto-replied'}}),true);
 assert.deepEqual(supportMailReferences({'In-Reply-To':'<known@example.invalid>','References':'<known@example.invalid> <other@example.invalid>'}),['<known@example.invalid>','<other@example.invalid>']);
});
