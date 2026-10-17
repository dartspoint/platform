import type {PoolClient} from 'pg';
import {isLocale,type Locale} from '../../i18n/src/locale';
export async function notificationLocale(c:Pick<PoolClient,'query'>,userId?:string|null,flow?:unknown):Promise<Locale>{
 const account=userId?(await c.query("select data->>'locale' locale from public.preferences where user_id=$1",[userId])).rows[0]?.locale:null;
 return isLocale(account)?account:isLocale(flow)?flow:'nl';
}
