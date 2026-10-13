import {transaction} from './db';
// Admission serializes this final delivery check with every match start.
export async function deliverGameInviteNotification(event:{id:string;user_id:string;kind:string;payload:{inviteId:string;[key:string]:unknown}}){
 return transaction(async c=>{
  await c.query('select id from private.admission_lock where id=1 for update');
  const live=(await c.query("select 1 from game_invites i where i.id=$1 and i.invitee_id=$2 and i.state='pending' and i.expires_at>now() and not exists(select 1 from active_player_reservations r where r.user_id in(i.inviter_id,i.invitee_id))",[event.payload.inviteId,event.user_id])).rowCount;
  if(live)await c.query('insert into notifications(user_id,kind,payload,source_event) values($1,$2,$3,$4) on conflict(source_event) do nothing',[event.user_id,event.kind,JSON.stringify(event.payload),event.id]);
  return !!live;
 });
}
