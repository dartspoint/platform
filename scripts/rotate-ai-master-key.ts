/** Server maintenance only. Keep previous keys in runtime until this succeeds.
 * Never accepts or prints plaintext provider credentials or encryption keys. */
import {transaction,db,audit} from '../packages/data/src/db';
import {decryptIntegration,encryptIntegration} from '../packages/data/src/integration-crypto';
if(!process.argv.includes('--rotate'))throw new Error('Explicit --rotate required');
try{await transaction(async c=>{
 const row=(await c.query("select * from private.integration_secrets where provider='openai' for update")).rows[0];
 if(!row.ciphertext||row.key_id===process.env.AI_INTEGRATION_MASTER_KEY_ID)return;
 const version=Number(row.version)+1,encrypted=encryptIntegration(decryptIntegration(row),version);
 await c.query("update private.integration_secrets set version=$1,ciphertext=$2,nonce=$3,tag=$4,key_id=$5,tested_version=case when tested_version=version then $1 else null end,updated_at=now() where provider='openai'",[version,encrypted.ciphertext,encrypted.nonce,encrypted.tag,encrypted.keyId]);
 await c.query("update private.npc_action_jobs set state='cancelled',reason='configuration-changed' where state in('pending','running')");await audit(c,null,'integration.openai.reencrypt','openai',{version});
 });console.log(JSON.stringify({event:'ai_master_rotation_complete'}));
}catch{console.error(JSON.stringify({event:'ai_master_rotation_failed'}));process.exitCode=1;}finally{await db().end();}
