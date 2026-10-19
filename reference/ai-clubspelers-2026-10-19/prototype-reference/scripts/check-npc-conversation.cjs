/* Real modules with a fake real clock, scheduled timers and browser storage.
 * No network, live models, browser renderer or real waits.
 * Run: node scripts/check-npc-conversation.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const ROOT=path.resolve(__dirname,'..'),LIB=path.join(ROOT,'lib')+path.sep;
const DIRECTOR='dartspoint:npc-director:v1',WELCOME='dartspoint:npc-conversation-welcome:v1';
const nativeNow=Date.now;let realNow=1792351800000;
Date.now=()=>realNow;
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,isMain,options){return resolve.call(this,request.startsWith('@/')?path.join(ROOT,request.slice(2)):request,parent,isMain,options);};
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText,filename);
function storage(initial={}){const map=new Map(Object.entries(initial));return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(String(key),String(value)),removeItem:key=>map.delete(key),entries:()=>Object.fromEntries(map)};}
function runtime({session=storage({[WELCOME]:'attempted'}),local=storage()}={}){
  for(const filename of Object.keys(require.cache))if(filename.startsWith(LIB))delete require.cache[filename];
  let sequence=0;const timers=new Map();
  global.setTimeout=(fn,delay)=>{const id=++sequence;timers.set(id,{fn,delay,due:realNow+delay,repeat:false});return id;};
  global.setInterval=(fn,delay)=>{const id=++sequence;timers.set(id,{fn,delay,due:realNow+delay,repeat:true});return id;};
  global.clearTimeout=global.clearInterval=id=>timers.delete(id);
  global.sessionStorage=session;global.localStorage=local;global.window={sessionStorage:session,localStorage:local,navigator:{},addEventListener(){},removeEventListener(){}};
  const director=require(path.join(LIB,'darts-npc.ts')),guard=require(path.join(LIB,'darts-npc-text.ts')),roster=require(path.join(LIB,'darts-npc-profiles.ts')).npcProfiles,conversation=require(path.join(LIB,'darts-npc-conversation.ts')),rooms=require(path.join(LIB,'darts-admin-operations.ts'));
  return {director,guard,roster,conversation,rooms,timers,session,local};
}
const copy=value=>JSON.parse(JSON.stringify(value));
async function flush(r){await r.guard.publishNpcText({npcId:r.roster[24].id,channel:'test:flush',candidates:[],publish(){}});await Promise.resolve();}
async function elapse(r,ms){const end=realNow+ms;while(realNow<end){realNow=Math.min(realNow+250,end);for(const [id,timer] of [...r.timers])if(timer.due<=realNow&&r.timers.has(id)){if(timer.repeat)timer.due+=timer.delay;else r.timers.delete(id);timer.fn();}await flush(r);}}
function fixture({room='Nederland 1',speed=10,maxOnline=2}={}){
  let r=runtime();const state=copy(r.director.getNpcSnapshot());state.runId='conversation-fixture';state.hydrated=true;state.settings={...state.settings,chatIntensity:0,enableInvites:false,autoReduce:false,maxOnline};state.activeRoom=room;state.speed=speed;
  for(const [index,p] of r.roster.entries())Object.assign(state.people[p.id],{online:index<2,status:index<2?'available':'offline',room,nextActionAt:state.time+1e10,leaveAt:state.time+1e10});
  r=runtime({session:storage({[WELCOME]:'attempted',[DIRECTOR]:JSON.stringify(state)})});r.director.initializeNpcDirector();return r;
}
async function begin(r){r.director.forceNpcAction('conversation',r.roster[0].id);await flush(r);return r.director.getNpcConversationDebug()[0];}
const threads=r=>r.director.getNpcSnapshot().chat.filter(c=>c.threadId);
const checks=[];
async function check(name,run){try{const detail=await run();checks.push({name,passed:true,...detail});console.log('PASS '+name);}catch(error){checks.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack);}}
async function main(){
  await check('a fresh session visibly starts one bounded conversation without a five-minute wait',async()=>{
    const r=runtime({session:storage()});r.director.initializeNpcDirector();await elapse(r,1000);assert.ok(threads(r).length>=1);await elapse(r,14000);const messages=threads(r);assert.ok(messages.some(c=>c.replyToId),'another NPC actually replies');const first=messages[0].threadId;assert.ok(messages.filter(c=>c.threadId===first).length<=5);assert.equal(r.session.getItem(WELCOME),'attempted');return {messages:messages.length};
  });
  await check('manual conversation contains two different actors and coherent reply links, never unrelated profile quotes',async()=>{
    const r=fixture(),thread=await begin(r);assert.ok(thread);assert.equal(threads(r).length,1);await elapse(r,30000);const messages=threads(r).filter(c=>c.threadId===thread.id);assert.equal(messages.length,thread.maxTurns);assert.ok(messages.length>=2&&messages.length<=5);assert.equal(new Set(messages.map(c=>c.name)).size,2);for(let i=1;i<messages.length;i++){assert.equal(messages[i].replyToId,messages[i-1].id);assert.notEqual(messages[i].name,messages[i-1].name);assert.equal(messages[i].topic,messages[0].topic);assert.equal(messages[i].room,'Nederland 1');}assert.ok(messages.every(c=>!r.roster.flatMap(p=>p.responseExamples.nl).includes(c.text)));assert.equal(r.director.getNpcConversationDebug().length,0);await elapse(r,30000);assert.equal(threads(r).filter(c=>c.threadId===thread.id).length,messages.length,'completed thread never recurses');return {topic:messages[0].topic,turns:messages.length,transcript:messages.map(c=>`${c.name}: ${c.text}`)};
  });
  await check('real pacing floor prevents a 60x simulation from posting an instant reply burst',async()=>{
    const r=fixture({speed:60});await begin(r);await elapse(r,1750);assert.equal(threads(r).length,1);await elapse(r,9000);assert.ok(threads(r).length>=2);const first=threads(r)[0];assert.ok(threads(r).slice(1).every(c=>c.id!==first.id));
  });
  await check('real time alone cannot publish a reply while director ticks are stopped',async()=>{
    const r=fixture();await begin(r);const count=threads(r).length;realNow+=10000;await flush(r);assert.equal(threads(r).length,count);r.director.tickNpcDirector();r.director.tickNpcDirector();await flush(r);assert.ok(threads(r).length>count);
  });
  for(const [name,action] of [
    ['pause and resume',(r,t)=>{r.director.setNpcRunning(false);r.director.setNpcRunning(true);}],
    ['disabled actor',(r,t)=>r.director.toggleNpc(t.actors[1])],
    ['actor goes offline',(r,t)=>r.director.forceNpcAction('presence',t.actors[1])],
    ['actor starts playing',(r,t)=>r.director.beginHumanNpcMatch(t.actors[1],false,'cancel-thread-match')],
    ['actor leaves the room',(r,t)=>{r.director.setNpcActiveRoom('Nederland 2');r.director.forceNpcAction('invite',t.actors[1]);}],
    ['room is closed',(r,t)=>{const room=r.rooms.getAdminOperations().rooms.find(x=>x.name===t.room);r.rooms.saveAdminRoom({...room,status:'closed'});}],
    ['director reset',(r,t)=>r.director.resetNpcDirector()],
  ])await check('queued follow-up is cancelled on '+name,async()=>{const r=fixture(),t=await begin(r);assert.ok(t);action(r,t);await elapse(r,18000);assert.equal(threads(r).filter(c=>c.threadId===t.id&&c.replyToId).length,0);assert.ok(!r.director.getNpcConversationDebug().some(x=>x.id===t.id));});
  await check('a human room post ends the NPC thread and yields the floor to the visitor',async()=>{const r=fixture(),t=await begin(r);r.director.sendNpcRoomMessage(t.room,'Hoi, ik zoek een tegenstander.');await elapse(r,18000);assert.equal(threads(r).filter(c=>c.threadId===t.id&&c.replyToId).length,0);assert.ok(r.director.getNpcSnapshot().chat.some(c=>c.human));assert.ok(!r.director.getNpcConversationDebug().some(c=>c.id===t.id));});
  await check('an unaccepted opener creates no reply and consumes no conversation family',async()=>{
    const r=fixture();r.director.forceNpcAction('conversation',r.roster[0].id);r.director.setNpcRunning(false);await flush(r);assert.equal(threads(r).length,0);assert.equal(r.director.getNpcConversationDebug().length,0);assert.equal(r.guard.getNpcTextGuardSnapshot().acceptedTotal,0);
  });
  await check('exhausted opener candidates remain silent without a reply or uniqueness bypass',async()=>{
    const r=fixture();const plans=r.conversation.npcConversationPlans(r.roster[0],r.roster[1],false,()=>.5);for(const plan of plans)await r.guard.publishNpcText({npcId:r.roster[5].id,channel:'private:guard-fixture',candidates:r.conversation.npcConversationCandidates(plan,0,r.roster[0],false),publish(){}});const before=r.guard.getNpcTextGuardSnapshot().acceptedTotal;await begin(r);await elapse(r,15000);assert.equal(threads(r).length,0);assert.equal(r.director.getNpcConversationDebug().length,0);assert.equal(r.guard.getNpcTextGuardSnapshot().acceptedTotal,before);assert.ok(r.guard.getNpcTextGuardSnapshot().blockedTotal>=plans.length);
  });
  await check('a globally blocked reply terminates its thread instead of inventing a suffix',async()=>{
    const r=fixture(),t=await begin(r),plan=r.conversation.npcConversationPlans(r.roster[0],r.roster[1],false,()=>.5).find(p=>p.topic===t.topic),peer=r.roster.find(p=>p.id===t.actors[1]);assert.ok(plan);await r.guard.publishNpcText({npcId:r.roster[9].id,channel:'match:another-room',candidates:r.conversation.npcConversationCandidates(plan,1,peer,false),publish(){}});await elapse(r,20000);assert.equal(threads(r).length,1);assert.equal(r.director.getNpcConversationDebug().length,0);
  });
  await check('repeated manual scenarios select unused subjects inside the shared 12-hour window',async()=>{
    const r=fixture();for(let i=0;i<4;i++){const t=await begin(r);assert.ok(t);await elapse(r,30000);}const roots=threads(r).filter(c=>!c.replyToId);assert.equal(roots.length,4);assert.equal(new Set(roots.map(c=>c.topic)).size,4);assert.equal(new Set(threads(r).map(c=>c.text.toLowerCase())).size,threads(r).length);return {subjects:roots.map(c=>c.topic)};
  });
  await check('English open-room conversation uses English context and still shares template families',async()=>{
    const r=fixture({room:'International'});const t=await begin(r);await elapse(r,30000);const messages=threads(r);assert.ok(messages.length>=2);assert.ok(messages.every(c=>c.room==='International'));const plan=r.conversation.npcConversationPlans(r.roster[0],r.roster[1],false,()=>.5).find(p=>p.topic===t.topic);const denied=await r.guard.publishNpcText({npcId:r.roster[8].id,channel:'room:Nederland 2',candidates:r.conversation.npcConversationCandidates(plan,0,r.roster[0],false),publish(){throw Error('translated duplicate escaped');}});assert.equal(denied.sent,false);
  });
  await check('source-aware replies address actual content and ignore unknown posts or greeting ping-pong',async()=>{
    const r=fixture();assert.equal(r.conversation.npcConversationReplyPlan('Hoi allemaal!',false),null);assert.equal(r.conversation.npcConversationReplyPlan('Een losse opmerking zonder herkend gespreksonderwerp.',false),null);const pace=r.conversation.npcConversationReplyPlan('Rustig tempo is prima, geen haast.',false),finish=r.conversation.npcConversationReplyPlan('Waarom kies je die dubbel?',false);assert.match(pace.turns[1],/rustig tempo/);assert.match(finish.turns[1],/finish.*dubbel/);assert.ok(!pace.turns[1].includes('Dubbel 16'));
  });
  await check('profile writing styles vary without arbitrary spelling mistakes or uniform slang',async()=>{
    const r=fixture();const lower=r.roster.find(p=>p.writingStyle.capitalization==='lowercase'),sentence=r.roster.find(p=>p.writingStyle.capitalization==='sentence');assert.ok(lower&&sentence);const text='Even rustig kijken. Welke dubbel kies jij?';assert.equal(r.conversation.styleNpcConversationText(lower,text,false),r.conversation.styleNpcConversationText(lower,text,false).toLowerCase());assert.ok(r.conversation.styleNpcConversationText(sentence,text,false).startsWith('Even'));assert.ok(r.roster.filter(p=>p.writingStyle.capitalization==='lowercase').length<25);
  });
  console.log(JSON.stringify({ok:checks.every(c=>c.passed),checks},null,2));process.exitCode=checks.every(c=>c.passed)?0:1;
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Date.now=nativeNow;});
