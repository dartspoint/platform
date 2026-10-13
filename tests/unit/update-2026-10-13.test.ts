import test from 'node:test';
import assert from 'node:assert/strict';
import {meterPosition,meterFraction,admittedMoment,trustedLatency,ServerClock} from '../../packages/game-core/src/timing';
import {dedupeAudit,formatAudit} from '../../packages/game-core/src/audit-presentation';
import {launchSignupSchema,launchUnsubscribeSchema,unsubscribeHash} from '../../packages/data/src/launch';
import {unreadCount,unreadLabel} from '../../apps/web/lib/chat-unread';
test('Meter geometry preserves triangular periods and both stop axes',()=>{
 assert.equal(meterPosition(0,0,'horizontal'),0);assert.ok(Math.abs(meterPosition(550,0,'horizontal')-1.14)<1e-10);assert.equal(meterPosition(2200,0,'horizontal'),0);assert.equal(meterPosition(2500,0,'vertical'),0);
 for(let t=0;t<10000;t+=13)for(const axis of ['horizontal','vertical'] as const)assert.ok(meterFraction(t,0,axis)>=0&&meterFraction(t,0,axis)<=1);
});
test('Server ingress bounds compensation, phase history and future claims',()=>{
 assert.equal(admittedMoment(1000,80,950,960,2000),960);assert.equal(admittedMoment(1000,0,800,900,2000),1000);
 for(const args of [[799,0,800,0,2000],[1000,91,800,0,2000],[2001,0,800,0,2000],[1000,0,800,1001,2000],[NaN,0,0,0,2000]])assert.throws(()=>admittedMoment(...args as [number,number,number,number,number]));
 assert.equal(trustedLatency([20,20]),0);assert.equal(trustedLatency([20,80,180,350,1000]),40);assert.equal(trustedLatency([350,350,350]),90);assert.equal(trustedLatency([-1,NaN,2000]),0);
});
test('Monotonic filtered server clock does not follow repeated slow snapshots',()=>{
 const c=new ServerClock();c.seed(1000,100);c.seed(999999,200);assert.equal(c.now(200),1100);c.sample(1150,200,300);assert.equal(c.now(300),1200);c.sample(20000,300,4300);assert.equal(c.now(400),1300);
});
test('Unread counts actual messages, includes closed DMs and deduplicates channel IDs',()=>{
 const channels=[{id:'r',kind:'community',roomId:'room',unread:3},{id:'a',kind:'private',unread:2},{id:'b',kind:'private',unread:1},{id:'a',kind:'private',unread:2},{id:'foreign',kind:'community',roomId:'else',unread:10}];assert.equal(unreadCount(channels,'room'),6);channels[1].unread=0;assert.equal(unreadCount(channels,'room'),4);assert.equal(unreadLabel(110),'99+');
});
test('Dutch audit deduplication distinguishes global role and per-room rights',()=>{
 const event={id:'1',at:Date.now(),actor:'Danny',action:'member.role',subject:'123e4567-e89b-12d3-a456-426614174000',subjectName:'Sam',detail:'',data:{beforeRole:'player',role:'admin'}};const formatted=formatAudit(event);assert.equal(formatted.change,'Speler → Platformbeheerder');assert.equal(formatted.subject,'Sam');assert.equal(dedupeAudit([event,event]).length,1);
 assert.equal(formatAudit({...event,action:'room.moderator.assigned',data:{roomName:'Nederland 1'}}).change,'Nederland 1');assert.equal(formatAudit({...event,subjectName:undefined,data:undefined}).subject,'Verwijderd of onbekend onderwerp');
 const filterAudit=formatAudit({...event,action:'chat.filter.save',subjectName:'regel',detail:'De regel is gecontroleerd',data:{before:{version:2},after:{version:3,active:false,allow:false}}});assert.equal(filterAudit.action,'heeft een filterregel bijgewerkt');assert.match(filterAudit.change,/Versie 2 → 3.*Uitgeschakeld.*De regel is gecontroleerd/);
 assert.equal(formatAudit({...event,action:'profile.rename-required',detail:'De naam is gecontroleerd',data:{}}).action,'heeft een naamswijziging verplicht gesteld');
});
test('Launch validation normalizes email and forbids consent omission, honeypots and extra data',()=>{
 assert.equal(launchSignupSchema.parse({email:'  PLAYER@EXAMPLE.COM ',consent:true,website:''}).email,'player@example.com');
 for(const input of [{email:'a@b.nl',consent:false,website:''},{email:'a@b.nl',website:''},{email:'a@b.nl',consent:true,website:'bot'},{email:'a@b.nl',consent:true,website:'',role:'admin'}])assert.equal(launchSignupSchema.safeParse(input).success,false);
 assert.ok(launchUnsubscribeSchema.safeParse({token:'a'.repeat(43)}).success);assert.equal(launchUnsubscribeSchema.safeParse({token:'short'}).success,false);assert.match(unsubscribeHash('a'.repeat(43)),/^[0-9a-f]{64}$/);
});
