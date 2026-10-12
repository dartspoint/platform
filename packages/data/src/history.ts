import {z} from 'zod';
import {db} from './db';
import type {Actor} from './auth';
import {uuid} from '../../contracts/src/index';
export async function matchHistory(actor:Actor,input:unknown){
 const {before,id}=z.object({before:z.iso.datetime().optional(),id:uuid.optional()}).strict().parse(input);
 return (await db().query(`select m.id,m.game_number,m.mode,m.ranked,m.rules,m.started_at,m.ended_at,r.kind,r.winner_id,r.data,
 (select jsonb_agg(jsonb_build_object('id',l.user_id,'before',l.before,'after',l.after,'delta',l.delta)) from rating_ledger l where l.match_id=m.id) ledger,
 (select jsonb_agg(jsonb_build_object('id',p.user_id,'seat',p.seat,'name',pr.username)) from match_players p join profiles pr on pr.id=p.user_id where p.match_id=m.id) players
 from matches m join match_results r on r.match_id=m.id where exists(select 1 from match_players p where p.match_id=m.id and p.user_id=$1)
 and ($2::timestamptz is null or (m.ended_at,m.id)<($2::timestamptz,$3::uuid)) order by m.ended_at desc,m.id desc limit 100`,[actor.id,before??null,id??'ffffffff-ffff-ffff-ffff-ffffffffffff'])).rows;
}

export async function personalRecords(actor:Actor){
 const result=await db().query(`with own_events as (
 select r.match_id,e from match_results r join match_players p on p.match_id=r.match_id
 join match_statistics s on s.match_id=r.match_id and s.user_id=p.user_id
 cross join lateral jsonb_array_elements(r.data->'events') e
 where p.user_id=$1 and (e->>'player')::integer=p.seat
 ), legs as (select match_id,e->>'leg' leg,count(*) darts,bool_or((e->>'checkout')::boolean) finished from own_events group by match_id,e->>'leg')
 select coalesce(max((data->>'highestVisit')::integer),0) "highestVisit",
 coalesce(max((data->>'highestCheckout')::integer),0) "highestCheckout",
 count(*) filter(where (data->>'won')::boolean)::integer wins,
 coalesce(sum((data->>'oneEighties')::integer),0)::integer "oneEighties",
 (select min(darts)::integer from legs where finished) "fastestLeg",
 coalesce((select jsonb_agg(label order by label) from (select distinct e->'hit'->>'label' label from own_events where (e->'hit'->>'double')::boolean and e->'hit'->>'label'<>'BULL') d),'[]'::jsonb) doubles
 from match_statistics where user_id=$1`,[actor.id]);return result.rows[0];
}
