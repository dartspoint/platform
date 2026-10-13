/** Administrator-invoked acceptance fixture. No endpoint; staging/local only. */
import {createClient} from '@supabase/supabase-js';
import {Pool} from 'pg';
import {applicationPostgresOptions} from '../../packages/data/src/postgres';
import {createHash,randomBytes,createCipheriv,publicEncrypt,createPublicKey} from 'node:crypto';
import {readFileSync} from 'node:fs';
let phase='environment';

async function main(){
 const local=process.env.APP_ENV==='development'&&['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname);
 if(process.env.APP_ENV!=='staging'&&!local)throw new Error('Staging fixture only');
 const request=JSON.parse(process.env.DP_FIXTURE_PUBLIC_KEY??readFileSync(0,'utf8'));
 if(Object.keys(request).sort().join(',')!=='publicKey')throw new Error('Public key required');
 const key=createPublicKey(request.publicKey);
 if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<3072)throw new Error('RSA 3072+ required');
 const fingerprint=createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex').slice(0,12);
 const provider=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const pool=new Pool({...applicationPostgresOptions(process.env.DATABASE_URL!),max:1,connectionTimeoutMillis:8000});
 const fixtures=[];
 try{
  for(const slot of ['a','b']){
   const email=`staging-browser-${fingerprint}-${slot}@validation.invalid`,username=`QaProbe${fingerprint}${slot}`;
   phase='auth-create';
   const {data:created,error:createError}=await provider.auth.admin.createUser({email,email_confirm:true,app_metadata:{dartspoint_acceptance_fixture:fingerprint}});
   let user=created.user;
   if(createError?.code==='email_exists'){
    const {data:listing,error:listError}=await provider.auth.admin.listUsers({page:1,perPage:1000});
    if(listError)throw new Error('Fixture lookup failed');
    user=listing.users.find(candidate=>candidate.email===email&&candidate.app_metadata.dartspoint_acceptance_fixture===fingerprint)??null;
   }else if(createError)throw new Error('Fixture Auth creation failed');
   if(!user||user.app_metadata.dartspoint_acceptance_fixture!==fingerprint)throw new Error('Unexpected fixture account');
   const id=user.id;
   phase='profile';const client=await pool.connect();
   try{
    await client.query('begin');
    const owned=(await client.query('select username,onboarded_at from profiles where id=$1 and not exists(select 1 from user_roles where user_id=$1 and revoked_at is null) for update',[id])).rows[0];
    if(!owned||(owned.onboarded_at&&owned.username!==username))throw new Error('Unexpected fixture profile');
    if(!owned.onboarded_at)await client.query('update profiles set username=$2,onboarded_at=now(),updated_at=now(),version=version+1 where id=$1',[id,username]);
    await client.query('insert into player_ratings(user_id) values($1) on conflict do nothing',[id]);
    await client.query('insert into preferences(user_id,data) values($1,$2) on conflict do nothing',[id,JSON.stringify({privateMessages:'everyone'})]);
    if(!owned.onboarded_at)await client.query("insert into private.audit_events(actor_id,action,subject,data,reason) values(null,'acceptance.fixture',$1,$2,'Afzonderlijke staging-browsertest; geen e-mail verstuurd')",[id,JSON.stringify({fixture:fingerprint,environment:process.env.APP_ENV,username})]);
    await client.query('commit');
   }catch(error){await client.query('rollback');throw error;}finally{client.release();}
   phase='auth-challenge';const {data:link,error:linkError}=await provider.auth.admin.generateLink({type:'magiclink',email});
   if(linkError||!link.properties?.hashed_token)throw new Error('Fixture challenge failed');
   const verifier=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
   phase='auth-verify';const {data:signed,error:signError}=await verifier.auth.verifyOtp({type:'email',token_hash:link.properties.hashed_token});
   if(signError||!signed.session||signed.user?.id!==id)throw new Error('Fixture verification failed');
   fixtures.push({id,username,session:signed.session});
  }
  // Hybrid encryption: only the requesting development machine can read tokens.
  const secret=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv);
  const plaintext=Buffer.from(JSON.stringify({origin:process.env.NEXT_PUBLIC_APP_URL,supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,fixture:fingerprint,fixtures}));
  const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  console.log(JSON.stringify({version:1,fixture:fingerprint,key:publicEncrypt({key,oaepHash:'sha256'},secret).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')}));
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Staging browser fixture failed at '+phase+'; no credentials displayed');process.exitCode=1;});
