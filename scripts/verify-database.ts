import {Pool} from 'pg';
import {applicationPostgresOptions} from '../packages/data/src/postgres';
const pool=new Pool({...applicationPostgresOptions(process.env.DATABASE_URL!),max:1});
try{
 const result=await pool.query("select rolsuper,rolbypassrls,pg_has_role(current_user,'dartspoint_app','MEMBER') member,current_setting('server_version_num')::int version from pg_roles where rolname=current_user");
 const role=result.rows[0];
 if(!role||role.rolsuper||role.rolbypassrls||!role.member||Math.floor(role.version/10000)!==17)throw new Error('Invalid application database role or PostgreSQL major');
 console.log('Application database role, PostgreSQL 17 and TLS connection verified');
}finally{await pool.end();}
