import {Pool} from 'pg';
import {postgresOptions} from '../../packages/data/src/postgres';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {db,redis} from '../../packages/data/src/db';
import {authAdmin,actorById} from '../../packages/data/src/auth';
import {onboard,preferences,joinRoom,chatHistory,sendMessage} from '../../packages/data/src/community';
import {adminAction} from '../../packages/data/src/admin';
import {roomsProjection} from '../../packages/data/src/projections';
import {getLegalPublicBundle,recordLegalAcceptance} from '../../packages/data/src/legal';
import {renderSystemEvent} from '../../packages/i18n/src/system-events';
assert.equal(process.env.APP_ENV,'development');
const control=new Pool(postgresOptions(process.env.MIGRATION_DATABASE_URL!));
const fixtures:string[]=[],rooms:string[]=[];
try{
 const suffix=randomUUID().slice(0,8);
 async function make(name:string){const user=await authAdmin().auth.admin.createUser({email:`qa-i18n-${name}-${suffix}@dartspoint.local`,email_confirm:true});assert.equal(user.error,null);const id=user.data.user!.id;fixtures.push(id);await onboard(await actorById(id,Date.now()+3600000,false),{username:name+suffix});return actorById(id,Date.now()+3600000);}
 const player=await make('I18nPlayer'),peer=await make('I18nPeer'),staff=await make('I18nAdmin');
 await db().query("insert into user_roles(user_id,role,granted_by) values($1,'admin',$1)",[staff.id]);const admin=await actorById(staff.id,Date.now()+3600000);
 assert.equal((await db().query('select data from preferences where user_id=$1',[player.id])).rows[0].data.locale,undefined);
 await preferences(player,{locale:'en'});assert.equal((await db().query('select data from preferences where user_id=$1',[player.id])).rows[0].data.locale,'en');
 await assert.rejects(()=>preferences(player,{locale:'en',userId:peer.id}));await assert.rejects(()=>preferences(player,{locale:'fr'}));
 const base={name:'I18nRoom'+suffix,subtitle:'Original description',capacity:10,category:'social',status:'active',rules:'Original rules',minRating:0,maxRating:5000,moderatorIds:[]};
 await assert.rejects(()=>adminAction(player,{action:'room-save',args:[{...base,region:'NL',primaryLanguage:'en'}]}),{code:'forbidden'});
 const made=await adminAction(admin,{action:'room-save',args:[{...base,region:null,primaryLanguage:'nl'}]}) as unknown as {id:string};assert.equal(typeof made.id,'string');rooms.push(made.id);
 let room=(await roomsProjection(false,player.id)).find(r=>r.id===made.id)!;assert.equal(room.region,null);assert.equal(room.primaryLanguage,'nl');
 await adminAction(admin,{action:'room-save',args:[{...base,id:made.id,region:'international',primaryLanguage:'en'}]});
 room=(await roomsProjection(false,player.id)).find(r=>r.id===made.id)!;assert.equal(room.region,'international');assert.equal(room.primaryLanguage,'en');
 await adminAction(admin,{action:'room-save',args:[{...base,id:made.id,region:'GB-ENG',primaryLanguage:'nl'}]});
 await adminAction(admin,{action:'room-save',args:[{...base,id:made.id}]});room=(await roomsProjection(false,player.id)).find(r=>r.id===made.id)!;assert.equal(room.region,'GB-ENG','old clients preserve metadata');assert.equal(room.primaryLanguage,'nl');
 await assert.rejects(()=>adminAction(admin,{action:'room-save',args:[{...base,id:made.id,region:'UK'}]}));
 await joinRoom(player,{roomId:made.id});await joinRoom(peer,{roomId:made.id});await joinRoom(peer,{roomId:made.id});
 const events=await chatHistory(player,room.channelId);const joined=events.filter((event:any)=>event.kind==='room.member_joined'&&event.actor_id===peer.id);assert.equal(joined.length,1);assert.equal(joined[0].system_event.schemaVersion,1);
 const event=joined[0];assert.equal(renderSystemEvent(event.system_event,'en',event.body),peer.username+' joined the room.');assert.equal(renderSystemEvent(event.system_event,'nl',event.body),peer.username+' komt de kamer binnen.');
 const body='Nederlands English <b>test</b> comes from the player';await sendMessage(peer,{channelId:room.channelId,clientMessageId:randomUUID(),body});const history=await chatHistory(player,room.channelId);assert.equal(history.find((m:any)=>m.kind==='human')?.body,body);
 const nl=await getLegalPublicBundle('nl'),en=await getLegalPublicBundle('en');for(const key of ['terms','privacy','guide']){assert.ok(en.current[key]);assert.equal(en.current[key]!.id,nl.current[key]!.id);assert.equal(new Date(en.current[key]!.effectiveAt!).getTime(),new Date(nl.current[key]!.effectiveAt!).getTime());assert.equal(en.current[key]!.language,'en');}
 await recordLegalAcceptance(player.id,{termsVersionId:en.current.terms!.id,privacyVersionId:en.current.privacy!.id,language:'en',termsTranslationId:en.current.terms!.translationId,privacyTranslationId:en.current.privacy!.translationId,age16Confirmed:true,termsAccepted:true});
 const accepted=(await db().query('select language,terms_translation_id from private.legal_acceptances where user_id=$1',[player.id])).rows[0];assert.equal(accepted.language,'en');assert.ok(accepted.terms_translation_id);
 await recordLegalAcceptance(player.id,{termsVersionId:nl.current.terms!.id,privacyVersionId:nl.current.privacy!.id,language:'nl',age16Confirmed:true,termsAccepted:true});assert.equal((await db().query('select count(*)::int n from private.legal_acceptances where user_id=$1',[player.id])).rows[0].n,1);
 await adminAction(admin,{action:'room-save',args:[{...base,id:made.id,region:null,primaryLanguage:null}]});room=(await roomsProjection(false,player.id)).find(r=>r.id===made.id)!;assert.equal(room.region,null);assert.equal(room.primaryLanguage,null);
 await writeFile('artifacts/i18n/integration-result.json',JSON.stringify({ok:true,realDatabase:true,realAuthFixtures:true,preferenceOwnership:true,roomPermissions:true,independentMetadata:true,legacyRequestCompatibility:true,oneEventTwoLanguages:true,humanContentUnchanged:true,translationEvidence:true,languageSwitchNoNewAcceptance:true},null,2));console.log('Internationalisation database, permissions, event and legal evidence checks passed');
}catch(error){console.error('Internationalisation assertion failed',error);throw error;}finally{
 for(const id of rooms){await control.query('delete from private.room_visits where room_id=$1',[id]);await control.query('delete from chat_messages where room_id=$1 or channel_id in(select id from channels where room_id=$1)',[id]);await control.query('delete from room_memberships where room_id=$1',[id]);await control.query('delete from chat_preferences where channel_id in(select id from channels where room_id=$1)',[id]);await control.query('delete from channel_memberships where channel_id in(select id from channels where room_id=$1)',[id]);await control.query('delete from channels where room_id=$1',[id]);await control.query('delete from community_rooms where id=$1',[id]);}
 for(const id of fixtures){await control.query('delete from private.legal_acceptances where user_id=$1',[id]);await control.query('delete from user_roles where user_id=$1 or granted_by=$1',[id]);await authAdmin().auth.admin.deleteUser(id);}
 await control.end();await db().end();await(await redis()).quit();
}
