import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {IntlMessageFormat} from 'intl-messageformat';
import {message} from '../../packages/i18n/src/messages';
import * as common from '../../packages/i18n/src/catalogs/common';
import {resolveLocale,domainLocale,localisedHref} from '../../packages/i18n/src/locale';
import {isTrustedOrigin,flowOrigin,trustedOrigins} from '../../packages/i18n/src/domains';
import {roomRegionSchema,roomLanguageSchema} from '../../packages/contracts/src/room-metadata';
import {renderSystemEvent} from '../../packages/i18n/src/system-events';
import {publicPageMetadata,searchContext,marketingStructuredData} from '../../apps/web/lib/seo';
import {renderDartsEmail} from '../../packages/emails/src/templates';

function argumentsIn(ast:ReturnType<IntlMessageFormat['getAst']>):string[]{return [...new Set(ast.flatMap((node:any)=>[...(node.type!==0&&node.type!==7?[node.value]:[]),...(node.options?Object.values(node.options).flatMap((option:any)=>argumentsIn(option.value)):[]),...(node.children?argumentsIn(node.children):[])]))].sort();}
test('Every module has valid NL/EN ICU messages with matching placeholders',()=>{
 const directory=new URL('../../packages/i18n/src/catalogs/',import.meta.url);
 for(const file of readdirSync(directory).filter(file=>file.endsWith('.nl.json'))){
  const nl=JSON.parse(readFileSync(new URL(file,directory),'utf8')),en=JSON.parse(readFileSync(new URL(file.replace('.nl.','.en.'),directory),'utf8'));
  assert.deepEqual(Object.keys(en).sort(),Object.keys(nl).sort(),file);
  for(const key of Object.keys(nl)){assert.ok(en[key].trim(),key);const a=new IntlMessageFormat(nl[key],'nl-NL',undefined,{ignoreTag:true}),b=new IntlMessageFormat(en[key],'en-GB',undefined,{ignoreTag:true});assert.deepEqual(argumentsIn(a.getAst()),argumentsIn(b.getAst()),file+':'+key);}
 }
 assert.deepEqual(Object.keys(common.nl),Object.keys(common.en));
 assert.equal(message(common.en,'en','rooms.count',{count:1}),'1 room');assert.equal(message(common.en,'en','rooms.count',{count:2}),'2 rooms');
});
test('Locale precedence keeps domain defaults independent of browser language and nationality',()=>{
 assert.equal(domainLocale('dartspoint.app'),'en');assert.equal(domainLocale('dartspoint.nl'),'nl');
 assert.equal(resolveLocale({domain:'en'}),'en');assert.equal(resolveLocale({domain:'en',guest:'nl'}),'nl');assert.equal(resolveLocale({domain:'nl',guest:'nl',account:'en'}),'en');assert.equal(resolveLocale({domain:'en',account:'en',explicit:'nl'}),'nl');assert.equal(resolveLocale({domain:'en',account:null}),'en');
 assert.equal(localisedHref('/handleiding?version=42#start','en'),'/en/handleiding?version=42#start');assert.equal(localisedHref('/spelen?match=42','en'),'/spelen?match=42');assert.equal(localisedHref('//evil.invalid','en'),'//evil.invalid');
});
test('Origins and callbacks use the same explicit environment boundary',()=>{
 assert.equal(isTrustedOrigin('https://dartspoint.app','production'),true);assert.equal(isTrustedOrigin('https://dartspoint.nl','production'),true);assert.equal(isTrustedOrigin('https://dartspoint.nl','staging'),false);assert.equal(isTrustedOrigin('https://dartspoint.app.evil.invalid','production'),false);assert.equal(isTrustedOrigin('https://user@dartspoint.app','production'),false);assert.equal(isTrustedOrigin('https://dartspoint.app/path','production'),false);assert.ok(!trustedOrigins('production').some(origin=>origin.includes('staging')));
 const previous=process.env.APP_ENV;try{process.env.APP_ENV='production';assert.equal(flowOrigin(new Request('http://internal.invalid/',{headers:{host:'dartspoint.app'}})),'https://dartspoint.app');assert.equal(flowOrigin(new Request('http://internal.invalid/',{headers:{host:'evil.invalid'}})),'https://dartspoint.nl');}finally{if(previous===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=previous;}
});
test('Room region, no region and room language are independent validated fields',()=>{
 for(const value of [null,'international','NL','GB','GB-ENG','GB-SCT','GB-WLS'])assert.equal(roomRegionSchema.safeParse(value).success,true);
 for(const value of ['UK','en','England','<script>'])assert.equal(roomRegionSchema.safeParse(value).success,false);
 assert.equal(roomLanguageSchema.parse('en'),'en');assert.equal(roomLanguageSchema.safeParse('GB').success,false);assert.notEqual(roomRegionSchema.parse(null),roomRegionSchema.parse('international'));
});
test('One trusted system event renders per recipient without changing legacy or human text',()=>{
 const event={schemaVersion:1,type:'room.member_joined',params:{displayName:'<Danny & friends>'}};
 assert.equal(renderSystemEvent(event,'nl','legacy'),'<Danny & friends> komt de kamer binnen.');assert.equal(renderSystemEvent(event,'en','legacy'),'<Danny & friends> joined the room.');
 assert.equal(renderSystemEvent({...event,schemaVersion:2},'en','oude melding'),'oude melding');assert.equal(renderSystemEvent({...event,params:{}},'en','oude melding'),'oude melding');assert.equal(renderSystemEvent(null,'en','Danny komt de kamer binnen.'),'Danny komt de kamer binnen.');
});
test('English public metadata canonicalises to the English document and keeps reciprocal alternates',()=>{
 const previous={APP_ENV:process.env.APP_ENV,NEXT_PUBLIC_APP_URL:process.env.NEXT_PUBLIC_APP_URL};try{process.env.APP_ENV='production';process.env.NEXT_PUBLIC_APP_URL='https://dartspoint.nl';const meta=publicPageMetadata({path:'/privacy',locale:'en',title:'Privacy notice',description:'Privacy'});assert.equal(meta.alternates?.canonical,'https://dartspoint.app/privacy');assert.equal(meta.alternates?.languages?.nl,'https://dartspoint.nl/privacy');assert.equal(meta.alternates?.languages?.en,'https://dartspoint.app/privacy');assert.equal(searchContext('production','https://dartspoint.app').indexable,true);assert.equal(marketingStructuredData('en')?.['@graph'][0].inLanguage,'en-GB');}finally{for(const[k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
test('Email locale changes the complete template while keeping identity, code and expiry',()=>{
 const en=renderDartsEmail({type:'otp',code:'123456'},{locale:'en'}),nl=renderDartsEmail({type:'otp',code:'123456'},{locale:'nl'});assert.match(en.subject,/sign-in/);assert.match(en.html,/lang="en"/);assert.match(en.text,/10 minutes/);assert.match(nl.text,/10 minuten/);assert.equal((en.html.match(/123456/g)??[]).length,1);
 const welcome=renderDartsEmail({type:'welcome',username:'<Nick>'},{locale:'en'});assert.match(welcome.html,/&lt;Nick&gt;/);assert.ok(!welcome.html.includes('<Nick>'));assert.match(welcome.html,/\/en\/privacy/);
});
test('Locale formatting preserves the instant across Amsterdam/London and DST',()=>{
 const instant=new Date('2026-10-25T01:30:00Z');assert.equal(new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'}).format(instant),'02:30');assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}).format(instant),'01:30');assert.equal(instant.toISOString(),'2026-10-25T01:30:00.000Z');
});

test('Reminder mail formats new event instants and durations for each recipient without changing time',()=>{
 const input={type:'tournament-reminder' as const,username:'Nick',eventName:'Open',startsAtLabel:'legacy label',startsAt:'2026-10-25T19:00:00Z',timeZone:'Europe/Amsterdam',checkInFromSchedule:true,roomName:'Nederland 1',checkInLabel:'legacy check-in'};
 const en=renderDartsEmail(input,{locale:'en'}),nl=renderDartsEmail(input,{locale:'nl'});
 assert.match(en.text,/Sunday, 25 October 2026 at 20:00/);assert.match(en.text,/Check your check-in window/);assert.match(nl.text,/zondag 25 oktober 2026 om 20:00/);assert.equal(input.startsAt,'2026-10-25T19:00:00Z');
 assert.match(renderDartsEmail({type:'moderation',username:'Nick',action:'mute',reason:'Literal source reason',caseId:'case',durationMinutes:2},{locale:'en'}).text,/2 minutes/);
 assert.match(renderDartsEmail({type:'match-reminder',username:'Nick',opponent:'Bull',gameMode:'501',startsAtLabel:'legacy',dueOn:'2026-10-25'},{locale:'en'}).text,/25 October 2026/);
});

test('Known game messages render from a safe event without changing source state or player names',async()=>{
 const {gameMessageEvent,renderGameMessage,gameMessageCatalogs}=await import('../../packages/i18n/src/game-messages');
 for(const key of Object.keys(gameMessageCatalogs.nl)){assert.deepEqual(argumentsIn(new IntlMessageFormat((gameMessageCatalogs.nl as any)[key],'nl').getAst()),argumentsIn(new IntlMessageFormat((gameMessageCatalogs.en as any)[key],'en').getAst()));}
 const name='Nick wint de wedstrijd! <script>';
 const source=name+' · T20 — 60 punten';assert.equal(renderGameMessage(source,'en',[name]),name+' · T20 — 60 points');assert.equal(renderGameMessage(source,'nl',[name]),source);
 assert.equal(renderGameMessage(name+' · 1 punten in deze beurt','en',[name]),name+' · 1 point this turn');
 assert.equal(renderGameMessage(name+' wint de wedstrijd!','en',[name]),name+' wins the match!');
 assert.equal(gameMessageEvent('Human text joined the room',[]),null);assert.equal(renderGameMessage('Unknown historical event','en'),'Unknown historical event');
 assert.equal(renderGameMessage('1 over — je moet eindigen op een dubbel.','en'),'1 left — you must finish on a double.');
});

test('Explicit manifest locale is stable even with a different guest preference',async()=>{
 const {GET}=await import('../../apps/web/app/api/manifest/route');
 for(const locale of ['nl','en']){
  const result=GET(new Request('https://dartspoint.nl/api/manifest?locale='+locale,{headers:{host:'dartspoint.nl',cookie:'dp-ui-locale='+(locale==='nl'?'en':'nl')}}));
  const manifest=await result.json();assert.equal(manifest.lang,locale);assert.equal(manifest.scope,'/');assert.match(result.headers.get('cache-control')??'',/private.*no-store/);
 }
});
