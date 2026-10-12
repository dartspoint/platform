import { authAdmin } from '../packages/data/src/auth';
import { transaction, audit, db } from '../packages/data/src/db';
import { requireThat, uuid } from '../packages/contracts/src/index';

const environment=process.env.APP_ENV;
requireThat(['development','staging','production'].includes(environment??''),'environment_required');
const id=uuid.parse(process.env.BOOTSTRAP_OWNER_USER_ID);
const email=process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
requireThat(email && process.env.BOOTSTRAP_OWNER_CONFIRM===`${environment}:${id}`,'explicit_confirmation_required');
const {data,error}=await authAdmin().auth.admin.getUserById(id);
requireThat(!error && data.user?.email_confirmed_at && data.user.email?.toLowerCase()===email,'verified_identity_required');
await transaction(async c=>{
 await c.query('select pg_advisory_xact_lock(1247281199)');
 requireThat(!(await c.query('select 1 from private.owner_bootstrap_events where environment=$1',[environment])).rowCount,'bootstrap_already_used',409);
 requireThat(!(await c.query("select 1 from user_roles where role='owner' and revoked_at is null")).rowCount,'owner_already_exists',409);
 requireThat((await c.query('select 1 from profiles where id=$1 and onboarded_at is not null and status=$2',[id,'active'])).rowCount,'complete_profile_required');
 await c.query("insert into user_roles(user_id,role,granted_by) values($1,'owner',$1)",[id]);
 await c.query('insert into private.owner_bootstrap_events(environment,user_id) values($1,$2)',[environment,id]);
 await audit(c,id,'owner.bootstrap',id,{environment},'Explicit verified operator bootstrap');
});
console.log(JSON.stringify({event:'owner_bootstrap_completed',environment}));
await db().end();
