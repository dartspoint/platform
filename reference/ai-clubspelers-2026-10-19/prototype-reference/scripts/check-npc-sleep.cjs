/* Room-observation and sleep regressions against the real NPC director.
 * Run: node scripts/check-npc-sleep.cjs
 * Fake browser storage/clocks only; no renderer, network or provider API calls.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'lib') + path.sep;
const DIRECTOR = 'dartspoint:npc-director:v1';
const WELCOME = 'dartspoint:npc-conversation-welcome:v1';
const RATING = 'dartspoint.demo-elo.v1';
const nativeNow = Date.now;
let realNow = 1792360800000;
Date.now = () => realNow;
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  return resolve.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true},
}).outputText, filename);
const copy = value => JSON.parse(JSON.stringify(value));
function storage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {getItem: key => entries.get(String(key)) ?? null, setItem: (key, value) => entries.set(String(key), String(value)), removeItem: key => entries.delete(String(key)), entries: () => Object.fromEntries(entries)};
}
function runtime({session = storage({[WELCOME]: 'attempted'}), local = storage()} = {}) {
  for (const filename of Object.keys(require.cache)) if (filename.startsWith(LIB)) delete require.cache[filename];
  let sequence = 0; const timers = new Map();
  global.setTimeout = (fn, delay) => {const id = ++sequence; timers.set(id, {fn, delay, due: realNow + delay, repeat: false}); return id;};
  global.setInterval = (fn, delay) => {const id = ++sequence; timers.set(id, {fn, delay, due: realNow + delay, repeat: true}); return id;};
  global.clearTimeout = global.clearInterval = id => timers.delete(id);
  global.sessionStorage = session; global.localStorage = local;
  global.window = {sessionStorage: session, localStorage: local, navigator: {}, addEventListener() {}, removeEventListener() {}};
  return {director: require(path.join(LIB, 'darts-npc.ts')), guard: require(path.join(LIB, 'darts-npc-text.ts')), roster: require(path.join(LIB, 'darts-npc-profiles.ts')).npcProfiles, ratings: require(path.join(LIB, 'darts-ratings.ts')), timers, session, local};
}
function fixture({humans = 3, activeRoom = 'Nederland 1', peopleRoom = activeRoom, count = 2, due = false, welcome = true} = {}) {
  let r = runtime(); const state = copy(r.director.getNpcSnapshot());
  state.runId = 'sleep-fixture'; state.hydrated = true; state.running = true; state.activeRoom = activeRoom; state.speed = 1;
  state.settings = {...state.settings, humans, chatIntensity: 0, enableInvites: false, autoReduce: false, maxOnline: count};
  for (const [index, profile] of r.roster.entries()) Object.assign(state.people[profile.id], {
    online: index < count, status: index < count ? 'available' : 'offline', room: peopleRoom,
    nextActionAt: state.time + (due ? -100000 : 1e10), leaveAt: state.time + (due ? -100000 : 1e10),
  });
  r = runtime({session: storage({...(welcome ? {[WELCOME]: 'attempted'} : {}), [DIRECTOR]: JSON.stringify(state)})});
  r.director.initializeNpcDirector(); return r;
}
async function flush(r) {
  await r.guard.publishNpcText({npcId: r.roster[24].id, channel: 'test:flush', candidates: [], publish() {}});
  await Promise.resolve();
}
async function elapse(r, milliseconds) {
  const end = realNow + milliseconds;
  while (realNow < end) {
    realNow = Math.min(realNow + 250, end);
    for (const [id, timer] of [...r.timers]) if (timer.due <= realNow && r.timers.has(id)) {
      if (timer.repeat) timer.due += timer.delay; else r.timers.delete(id);
      timer.fn();
    }
    await flush(r);
  }
}
const npcPosts = r => r.director.getNpcSnapshot().chat.filter(item => !item.human);
const pending = r => r.director.getNpcSnapshot().invitations.filter(item => item.status === 'pending');
const activity = r => {
  const s = r.director.getNpcSnapshot();
  return copy({time: s.time, people: s.people, matches: s.matches, invitations: s.invitations, chat: s.chat.filter(item => !item.human), humanRating: s.humanRating, humanPlayed: s.humanPlayed, humanWins: s.humanWins});
};
const checks = [];
async function check(name, run) {
  try {const detail = await run(); checks.push({name, passed: true, ...detail}); console.log('PASS ' + name);}
  catch (error) {checks.push({name, passed: false, error: error.stack}); console.error('FAIL ' + name + '\n' + error.stack);}
}
async function main() {
  await check('zero real humans always means a zero NPC target, independent of schedule, cap and auto-reduction', async () => {
    const r = runtime(), base = r.director.getNpcSnapshot(); let combinations = 0;
    for (const hour of [0, 3, 6, 12, 17, 21, 23]) for (const autoReduce of [false, true]) for (const maxOnline of [0, 1, 5, 14, 25]) {
      assert.equal(r.director.npcTarget({...base, settings: {...base.settings, humans: 0, hour, autoReduce, maxOnline}}), 0); combinations++;
    }
    return {combinations};
  });
  await check('room occupancy counts real humans only in their actual observed room', async () => {
    const r = fixture(); const state = r.director.getNpcSnapshot();
    assert.equal(r.director.npcRoomHasHumans('Nederland 1'), true);
    for (const room of ['Nederland 2', 'Ranked', 'International', 'Toernooikamer', 'unknown']) assert.equal(r.director.npcRoomHasHumans(room), false, room);
    assert.equal(r.director.npcRoomHasHumans('Nederland 1', {...state, settings: {...state.settings, humans: 0}}), false);
    assert.equal(r.director.npcRoomHasHumans('Nederland 2', {...state, activeRoom: 'Nederland 2'}), true);
  });
  await check('an empty platform freezes clocks, presence, chat, matches and rating ledgers across accelerated ticks', async () => {
    const r = fixture({humans: 0, due: true, welcome: false});
    r.director.setNpcSpeed(60); r.director.updateNpcSettings({chatIntensity: 100, enableInvites: true}); await flush(r);
    const before = copy(r.director.getNpcSnapshot()), ledger = r.local.getItem(RATING);
    await elapse(r, 30000);
    assert.deepEqual(copy(r.director.getNpcSnapshot()), before, 'sleeping ticks or welcome timer mutated director state');
    assert.equal(r.local.getItem(RATING), ledger, 'sleep booked an NPC result');
    assert.equal(r.director.getNpcConversationDebug().length, 0);
    return {sleepingTicks: 30, speed: 60};
  });
  await check('manual force buttons and direct conversation starts cannot bypass zero-human sleep', async () => {
    const r = fixture({humans: 0}); const before = activity(r);
    for (const kind of ['presence', 'chat', 'conversation', 'match', 'invite']) for (const actor of [undefined, r.roster[0].id, r.roster[3].id]) r.director.forceNpcAction(kind, actor);
    assert.equal(r.director.startNpcConversation('Nederland 1'), false);
    assert.equal(r.director.startNpcConversation('International'), false);
    await flush(r); assert.deepEqual(activity(r), before);
    r.director.beginHumanNpcMatch(r.roster[0].id, true, 'forbidden-sleep-start');
    assert.equal(r.director.getNpcSnapshot().humanMatch, undefined, 'sleep should not manufacture a new human match');
    assert.equal(r.director.getNpcSnapshot().humanBusy, false);
  });
  await check('NPC chat, conversation and match actions stay dormant in a different empty room', async () => {
    const r = fixture({activeRoom: 'Nederland 1', peopleRoom: 'Nederland 2'}); const actor = r.roster[0].id;
    const before = activity(r); const captured = r.director.captureNpcDialogueGuard(actor, 'Nederland 2');
    assert.equal(captured(), false);
    assert.equal(r.director.startNpcConversation('Nederland 2', actor), false);
    r.director.forceNpcAction('chat', actor); r.director.forceNpcAction('match', actor); await flush(r);
    assert.deepEqual(activity(r), before, 'an NPC in an unobserved room acted because a human was elsewhere');
  });
  await check('reset preserves zero humans and the selected room instead of inventing visitors or restarting activity', async () => {
    const r = fixture({humans: 0, activeRoom: 'Nederland 2', welcome: false});
    const oldRunId = r.director.getNpcSnapshot().runId; r.director.resetNpcDirector();
    const reset = r.director.getNpcSnapshot(); assert.notEqual(reset.runId, oldRunId);
    assert.equal(reset.settings.humans, 0); assert.equal(reset.activeRoom, 'Nederland 2'); assert.equal(r.director.npcTarget(), 0);
    assert.ok(Object.values(reset.people).every(person => !person.online && person.status === 'offline'));
    const before = activity(r); await elapse(r, 5000); assert.deepEqual(activity(r), before);
    for (const kind of ['presence', 'chat', 'conversation', 'match', 'invite']) r.director.forceNpcAction(kind);
    await flush(r); assert.deepEqual(activity(r), before);
  });
  await check('a human reply scheduled before sleep is cancelled forever across zero-to-one wake', async () => {
    const r = fixture({count: 1}); r.director.sendNpcRoomMessage('Nederland 1', 'hoi');
    const source = r.director.getNpcSnapshot().chat.find(item => item.human); assert.ok(source);
    r.director.updateNpcSettings({humans: 0}); r.director.updateNpcSettings({humans: 1});
    await elapse(r, 5000);
    assert.equal(npcPosts(r).filter(item => item.replyToId === source.id).length, 0);
    assert.deepEqual(npcPosts(r), [], 'a stale greeting escaped without its source metadata');
  });
  await check('match-chat publication waiting for the final Web Lock cannot revive after sleep and wake', async () => {
    const r = fixture({count: 1}), profile = r.roster[0], room = 'Nederland 1';
    r.director.beginHumanNpcMatch(profile.id, false, 'sleep-lock-match', room); await flush(r);
    const current = r.director.captureNpcDialogueGuard(profile.id, room, true); assert.equal(current(), true);
    const waiting = [], delivered = [];
    window.navigator.locks = {request: (_name, callback) => new Promise(resolve => waiting.push(() => resolve(callback())))};
    const result = r.guard.publishNpcText({npcId: profile.id, channel: 'match:sleep-lock', candidates: r.director.npcReplyCandidates(profile, 'hoi', false, room), canPublish: current, publish: text => delivered.push(text)});
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(waiting.length, 1); const acceptedBefore = r.guard.getNpcTextGuardSnapshot().acceptedTotal;
    r.director.updateNpcSettings({humans: 0}); assert.equal(current(), false);
    r.director.updateNpcSettings({humans: 1}); assert.equal(current(), false, 'the sleep epoch must never become valid again');
    waiting.shift()(); const status = await result; delete window.navigator.locks;
    assert.equal(status.sent, false); assert.equal(status.reason, 'cancelled'); assert.deepEqual(delivered, []);
    assert.equal(r.guard.getNpcTextGuardSnapshot().acceptedTotal, acceptedBefore, 'cancelled text consumed the twelve-hour history');
    assert.equal(r.director.captureNpcDialogueGuard(profile.id, room, true)(), true, 'newly scheduled, current-context match replies can resume');
  });
  await check('in-progress NPC conversations end on sleep and never replay their delayed turns after wake', async () => {
    const r = fixture(); assert.equal(r.director.startNpcConversation('Nederland 1', r.roster[0].id), true); await flush(r);
    assert.ok(npcPosts(r).length >= 1); assert.ok(r.director.getNpcConversationDebug().length);
    const published = copy(npcPosts(r)); r.director.updateNpcSettings({humans: 0});
    assert.equal(r.director.getNpcConversationDebug().length, 0);
    r.director.updateNpcSettings({humans: 1}); await elapse(r, 16000);
    assert.deepEqual(npcPosts(r), published, 'sleeping conversational turns were replayed after wake');
  });
  await check('NPC-only matches pause without scoring or DP changes and resume when their room is observed again', async () => {
    const r = fixture(); r.director.forceNpcAction('match', r.roster[0].id); await flush(r);
    const match = r.director.getNpcSnapshot().matches.find(item => item.phase === 'playing'); assert.ok(match);
    r.director.updateNpcSettings({humans: 0}); const before = activity(r); const ledger = r.local.getItem(RATING);
    await elapse(r, 15000); assert.deepEqual(activity(r), before); assert.equal(r.local.getItem(RATING), ledger);
    r.director.updateNpcSettings({humans: 1}); await elapse(r, 15000);
    const resumed = r.director.getNpcSnapshot().matches.find(item => item.id === match.id);
    assert.ok(resumed.turn > match.turn || resumed.phase === 'finished', 'a fresh room observer never resumed the existing game');
  });
  await check('humans in another room do not advance an existing NPC-only game in the empty original room', async () => {
    const r = fixture(); r.director.forceNpcAction('match', r.roster[0].id); await flush(r);
    const match = copy(r.director.getNpcSnapshot().matches.find(item => item.phase === 'playing')); assert.ok(match);
    r.director.setNpcActiveRoom('Nederland 2'); await elapse(r, 15000);
    assert.deepEqual(r.director.getNpcSnapshot().matches.find(item => item.id === match.id), match);
    assert.equal(npcPosts(r).filter(item => item.room === 'Nederland 1').length, 0);
    r.director.setNpcActiveRoom('Nederland 1'); await elapse(r, 15000);
    const resumed = r.director.getNpcSnapshot().matches.find(item => item.id === match.id);
    assert.ok(resumed.turn > match.turn || resumed.phase === 'finished');
  });
  await check('pending invitations expire on sleep and cannot be accepted after wake', async () => {
    const r = fixture(); r.director.updateNpcSettings({enableInvites: true}); r.director.forceNpcAction('invite', r.roster[0].id);
    const invite = pending(r)[0]; assert.ok(invite); r.director.updateNpcSettings({humans: 0});
    assert.equal(pending(r).length, 0); assert.equal(r.director.respondNpcInvitation(invite.id, true), false);
    r.director.updateNpcSettings({humans: 1}); assert.equal(r.director.respondNpcInvitation(invite.id, true), false);
    assert.equal(r.director.getNpcSnapshot().humanMatch, undefined);
  });
  await check('leaving a room cancels its pending invitation and queued reply even if the human immediately returns', async () => {
    const r = fixture({count: 1}); r.director.sendNpcRoomMessage('Nederland 1', 'hallo');
    r.director.updateNpcSettings({enableInvites: true}); r.director.forceNpcAction('invite', r.roster[0].id);
    const invite = pending(r)[0]; assert.ok(invite); r.director.setNpcActiveRoom('Nederland 2');
    assert.equal(pending(r).length, 0); r.director.setNpcActiveRoom('Nederland 1');
    assert.equal(r.director.respondNpcInvitation(invite.id, true), false); await elapse(r, 5000); assert.deepEqual(npcPosts(r), []);
  });
  await check('saved zero-human state restores asleep and scheduled timers do not wake it by themselves', async () => {
    let r = fixture(); r.director.updateNpcSettings({humans: 0}); const runId = r.director.getNpcSnapshot().runId;
    r = runtime({session: storage(r.session.entries()), local: storage(r.local.entries())}); r.director.initializeNpcDirector(); await flush(r);
    assert.equal(r.director.getNpcSnapshot().settings.humans, 0); assert.equal(r.director.getNpcSnapshot().runId, runId);
    const before = activity(r); await elapse(r, 10000); assert.deepEqual(activity(r), before); assert.deepEqual(npcPosts(r), []);
  });
  await check('wake schedules future opportunities instead of catching up missed actions or simulating time spent asleep', async () => {
    const r = fixture({humans: 0, due: true}); const asleepTime = r.director.getNpcSnapshot().time;
    await elapse(r, 60000); assert.equal(r.director.getNpcSnapshot().time, asleepTime);
    r.director.updateNpcSettings({humans: 1}); const awake = r.director.getNpcSnapshot();
    for (const person of Object.values(awake.people).filter(item => item.online && item.status !== 'playing')) assert.ok(person.nextActionAt > asleepTime, 'overdue NPC action remained immediately payable');
    const before = {posts: npcPosts(r).length, matches: awake.matches.length, invitations: awake.invitations.length};
    await elapse(r, 1000); const after = r.director.getNpcSnapshot();
    assert.equal(after.time, asleepTime + 1000); assert.equal(npcPosts(r).length, before.posts); assert.equal(after.matches.length, before.matches); assert.equal(after.invitations.length, before.invitations);
  });
  await check('an already-started human match can settle once during sleep without starting autonomous NPC work', async () => {
    const r = fixture({count: 1}), profile = r.roster[0];
    r.director.beginHumanNpcMatch(profile.id, true, 'human-completes-while-asleep', 'Nederland 1');
    assert.equal(r.director.getNpcSnapshot().humanMatch?.id, 'human-completes-while-asleep');
    const totalBefore = r.director.getNpcSnapshot().humanRating + r.director.getNpcSnapshot().people[profile.id].rating;
    r.director.updateNpcSettings({humans: 0}); r.director.finishHumanNpcMatch(profile.id, true, true);
    const completed = r.director.getNpcSnapshot(); assert.equal(completed.humanPlayed, 1); assert.equal(completed.humanWins, 1); assert.equal(completed.humanMatch, undefined);
    assert.ok(completed.humanRating > 1500); assert.ok(Math.abs(completed.humanRating + completed.people[profile.id].rating - totalBefore) < 1e-8);
    r.director.finishHumanNpcMatch(profile.id, true, true); assert.equal(r.director.getNpcSnapshot().humanPlayed, 1);
    const before = activity(r); await elapse(r, 5000); assert.deepEqual(activity(r), before); assert.deepEqual(npcPosts(r), []);
    const ledger = JSON.parse(r.local.getItem(RATING)); assert.equal(ledger.ledger.filter(item => item.id === 'human-completes-while-asleep').length, 1);
  });
  console.log(JSON.stringify({ok: checks.every(item => item.passed), checks}, null, 2));
  process.exitCode = checks.every(item => item.passed) ? 0 : 1;
}
main().catch(error => {console.error(error); process.exitCode = 1;}).finally(() => {Date.now = nativeNow;});
