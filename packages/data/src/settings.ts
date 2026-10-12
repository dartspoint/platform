import {z} from 'zod';
import {transaction,audit,redis} from './db';
import {staff,type Actor} from './auth';
import {requireThat,DomainError} from '../../contracts/src/index';
import {DEFAULT_ADMIN_SETTINGS,validateAdminSettings,type AdminSettings,type AdminSettingsPatch} from './settings-model';
export async function saveSettings(actor:Actor,input:unknown){
 staff(actor,true);const p=z.object({patch:z.record(z.string(),z.record(z.string(),z.unknown())),reason:z.string().trim().min(5).max(500)}).strict().parse(input);
 return transaction(async c=>{
  await c.query('select * from private.admission_lock where id=1 for update');const row=(await c.query("select data from private.system_settings where key='settings' for update")).rows[0];
  const base=(row?.data??DEFAULT_ADMIN_SETTINGS) as AdminSettings;const next={...base};
  for(const [section,value] of Object.entries(p.patch)){requireThat(section in base,'unknown_section',400);const key=section as keyof AdminSettings;for(const field of Object.keys(value))requireThat(field in base[key],'unknown_setting',400);(next as Record<string,unknown>)[section]={...base[key],...value};}
  try{validateAdminSettings(next);}catch(e){throw new DomainError('invalid_settings',400,e instanceof Error?e.message:'Ongeldige instellingen');}requireThat(next.game.finish==='double','double_out_required',400);
  await c.query("insert into private.system_settings(key,data) values('settings',$1) on conflict(key) do update set data=$1,version=system_settings.version+1",[JSON.stringify(next)]);
  await (await redis()).set('dartspoint:maintenance',next.platform.maintenance?'1':'0');await audit(c,actor.id,'settings.save','platform',{sections:Object.keys(p.patch)},p.reason);return {ok:true};
 });
}
