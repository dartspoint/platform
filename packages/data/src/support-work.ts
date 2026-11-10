import {db} from './db';

// Claims and the lightweight readiness poll share predicates so retries, expired
// leases and time-based work cannot disappear behind a different eligibility rule.
export const dueOutboxSql="delivered_at is null and next_try<=now() and (locked_until is null or locked_until<now())";
export const expiredInvitesSql="state='pending' and expires_at<=now()";
export const queueAdvanceFromSql='matches m join match_results r on r.match_id=m.id';
export const queueAdvanceWhereSql="m.competition is null and r.winner_id is not null and (exists(select 1 from match_queues q where q.match_id=m.id) or exists(select 1 from private.queue_advances a where a.match_id=m.id and not a.finished))";
export const liveCompetitionsSql="status='live'";
export const dueInboundSql="state in('pending','error','processing') and next_try<=now() and (locked_until is null or locked_until<now())";
export const duePrivacyJobsSql="state in('pending','retry','waiting_ledger','running') and next_try<=now() and (locked_until is null or locked_until<now())";
export const dueAttachmentScansSql="scan_status in('pending','error') and scan_after<=now() and (scan_locked_until is null or scan_locked_until<now())";
export const dueTournamentRemindersSql=`t.published and t.status in('registration','checkin')
 and nullif(t.model->'settings'->>'startsAt','')::timestamptz between now() and now()+interval '30 minutes'
 and exists(select 1 from jsonb_array_elements(t.model->'participants') p
  where p->>'status' in('confirmed','checkedin') and not exists(
   select 1 from private.outbox_events e where e.dedupe_key='tournament-reminder:'||t.id::text||':'||(p->>'id')))`;
export const dueDivisionRemindersFromSql='division_fixtures f join seasons s on s.id=f.season_id';
export const dueDivisionRemindersSql=`s.status='live' and f.model->>'status'='scheduled'
 and (f.model->>'dueOn')::date between current_date and current_date+1
 and exists(select 1 from unnest(array[f.player_low,f.player_high]) player_id
  where not exists(select 1 from private.outbox_events e
   where e.dedupe_key='division-reminder:'||f.id::text||':'||player_id::text))`;

export const supportWorkBits={outbox:1,queues:2,competitions:4,reminders:8,inbound:16,privacy:32,attachments:64} as const;
export type SupportTask=keyof typeof supportWorkBits;
export const allSupportWork=Object.values(supportWorkBits).reduce((mask,bit)=>mask|bit,0);

// A single integer avoids returning seven result sets (and their field metadata)
// every second when the support worker has no work.
export const pendingSupportWorkSql=`select
 (case when exists(select 1 from private.outbox_events where ${dueOutboxSql}) then ${supportWorkBits.outbox} else 0 end)
 | (case when exists(select 1 from game_invites where ${expiredInvitesSql})
     or exists(select 1 from ${queueAdvanceFromSql} where ${queueAdvanceWhereSql}) then ${supportWorkBits.queues} else 0 end)
 | (case when exists(select 1 from tournaments where ${liveCompetitionsSql}) then ${supportWorkBits.competitions} else 0 end)
 | (case when exists(select 1 from tournaments t where ${dueTournamentRemindersSql})
     or exists(select 1 from ${dueDivisionRemindersFromSql} where ${dueDivisionRemindersSql}) then ${supportWorkBits.reminders} else 0 end)
 | (case when exists(select 1 from private.support_inbound_events where ${dueInboundSql}) then ${supportWorkBits.inbound} else 0 end)
 | (case when exists(select 1 from private.privacy_jobs where ${duePrivacyJobsSql}) then ${supportWorkBits.privacy} else 0 end)
 | (case when $1::boolean and exists(select 1 from private.support_attachments where ${dueAttachmentScansSql}) then ${supportWorkBits.attachments} else 0 end) ready`;

export async function pendingSupportWork(){
 const result=await db().query<{ready:number}>(pendingSupportWorkSql,[Boolean(process.env.CLAMAV_HOST)]);
 return result.rows[0].ready;
}
