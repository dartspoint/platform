import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {masterKey,encryptIntegration,decryptIntegration} from '../../packages/data/src/integration-crypto';
import {canonicalizeNpcText,nearDuplicate,textFamily,safeConversationText} from '../../packages/data/src/npc-text';
import {npcOutputSchema} from '../../packages/contracts/src/npc';
test('NPC text guard rejects hidden/reformatted and near duplicate text, without a global time gate',()=>{
 const names=['Nick','Bas'];
 const original=canonicalizeNpcText('Nick, koffie en daarna even wandelen?',names);
 for(const candidate of ['BAS, KÓFFIE en daarna even wandelen! 😊','Nick\u200b koffie en daarna even wandelen 123','Koffie en daarna even wandelen? haha'])assert(nearDuplicate(original,canonicalizeNpcText(candidate,names)));
 assert(!nearDuplicate(original,canonicalizeNpcText('Welke muziek luister je tijdens het koken?',names)));
 assert.equal(textFamily('hello'),'greeting-short-v1');assert.equal(textFamily('hoi'),'greeting-short-v1');
});
test('Unproven game compliments and greeting game drift fail closed',()=>{
 for(const s of ['Netjes die dubbel','Je hebt gewonnen','Nice throw, 180!','You won the last game'])assert(!safeConversationText(s,'hoi'));
 assert(safeConversationText('hoi, hoe gaat ie?','hoi'));
 assert(!safeConversationText('Wil je een potje spelen?','hello'));
 assert(!npcOutputSchema.safeParse({decision:'say',text:null,topic:'darts',replyToMessageId:null}).success);
});
test('Integration encryption authenticates environment, version, key, nonce and ciphertext',()=>{
 const prior={...process.env};try{
 process.env.AI_INTEGRATION_MASTER_KEY_B64=randomBytes(32).toString('base64');process.env.AI_INTEGRATION_MASTER_KEY_ID='test-v1';process.env.APP_ENV='development';
 const secret='sk-fixed-fictitious-test-key-only',encrypted=encryptIntegration(secret,2),row={...encrypted,key_id:encrypted.keyId,version:2};
 assert.equal(decryptIntegration(row),secret);assert.notDeepEqual(encrypted.nonce,encryptIntegration(secret,2).nonce);
 assert.throws(()=>decryptIntegration({...row,version:3}));const modified=Buffer.from(row.ciphertext);modified[0]^=1;assert.throws(()=>decryptIntegration({...row,ciphertext:modified}));
 process.env.APP_ENV='staging';assert.throws(()=>decryptIntegration(row));process.env.APP_ENV='development';
 process.env.AI_INTEGRATION_MASTER_KEY_B64=randomBytes(32).toString('base64');assert.throws(()=>decryptIntegration(row));
 for(const value of [undefined,'',Buffer.alloc(31).toString('base64'),Buffer.alloc(32).toString('base64')+'\n','not_base64'])assert.throws(()=>masterKey(value));
 }finally{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);}
});
