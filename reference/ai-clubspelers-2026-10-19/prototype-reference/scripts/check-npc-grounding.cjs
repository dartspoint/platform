/* Grounding regressions against real dialogue/director/text-guard modules.
 * Run: node scripts/check-npc-grounding.cjs
 * In-memory browser storage, fake clocks/timers, no renderer/network/API calls.
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
const nativeNow = Date.now;
let realNow = 1792351800000;
Date.now = () => realNow;
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  return resolve.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true},
}).outputText, filename);
function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {getItem: key => map.get(String(key)) ?? null, setItem: (key, value) => map.set(String(key), String(value)), removeItem: key => map.delete(String(key))};
}
function runtime({session = storage({[WELCOME]: 'attempted'}), local = storage()} = {}) {
  for (const filename of Object.keys(require.cache)) if (filename.startsWith(LIB)) delete require.cache[filename];
  let sequence = 0;
  const timers = new Map();
  global.setTimeout = (fn, delay) => {const id = ++sequence; timers.set(id, {fn, delay, due: realNow + delay, repeat: false}); return id;};
  global.setInterval = (fn, delay) => {const id = ++sequence; timers.set(id, {fn, delay, due: realNow + delay, repeat: true}); return id;};
  global.clearTimeout = global.clearInterval = id => timers.delete(id);
  global.sessionStorage = session;
  global.localStorage = local;
  global.window = {sessionStorage: session, localStorage: local, navigator: {}, addEventListener() {}, removeEventListener() {}};
  const director = require(path.join(LIB, 'darts-npc.ts'));
  return {
    director,
    dialogue: require(path.join(LIB, 'darts-npc-dialogue.ts')),
    guard: require(path.join(LIB, 'darts-npc-text.ts')),
    roster: require(path.join(LIB, 'darts-npc-profiles.ts')).npcProfiles,
    rooms: require(path.join(LIB, 'darts-admin-operations.ts')),
    chat: require(path.join(LIB, 'darts-chat-state.ts')),
    timers, session, local,
  };
}
const copy = value => JSON.parse(JSON.stringify(value));
async function flush(r) {
  await r.guard.publishNpcText({npcId: r.roster[24].id, channel: 'test:flush', candidates: [], publish() {}});
  await Promise.resolve();
}
async function elapse(r, ms) {
  const end = realNow + ms;
  while (realNow < end) {
    realNow = Math.min(realNow + 250, end);
    for (const [id, timer] of [...r.timers]) if (timer.due <= realNow && r.timers.has(id)) {
      if (timer.repeat) timer.due += timer.delay; else r.timers.delete(id);
      timer.fn();
    }
    await flush(r);
  }
}
function fixture({room = 'Nederland 1', maxOnline = 1} = {}) {
  let r = runtime();
  const state = copy(r.director.getNpcSnapshot());
  state.runId = 'grounding-fixture'; state.hydrated = true; state.running = true; state.activeRoom = room; state.speed = 1;
  state.settings = {...state.settings, chatIntensity: 0, enableInvites: false, autoReduce: false, maxOnline};
  for (const [index, profile] of r.roster.entries()) Object.assign(state.people[profile.id], {
    online: index < maxOnline, status: index < maxOnline ? 'available' : 'offline', room,
    nextActionAt: state.time + 1e10, leaveAt: state.time + 1e10,
  });
  r = runtime({session: storage({[WELCOME]: 'attempted', [DIRECTOR]: JSON.stringify(state)})});
  r.director.initializeNpcDirector();
  return r;
}
function context(profile, facts = [], changes = {}) {
  return {npcId: profile.id, room: 'Nederland 1', humanId: 'human:Nick', humanName: 'Nick', now: realNow, npcAvailable: true, facts, ...changes};
}
function completedFact(profile, changes = {}) {
  return {id: 'event-grounding-match', matchId: 'grounding-match', room: 'Nederland 1', kind: 'match_completed', participants: [profile.id, 'human:Nick'], winnerId: 'human:Nick', at: realNow - 1000, ...changes};
}
const texts = candidates => candidates.map(candidate => typeof candidate === 'string' ? candidate : candidate.text);
const npcPosts = r => r.director.getNpcSnapshot().chat.filter(message => !message.human);
const humanPosts = r => r.director.getNpcSnapshot().chat.filter(message => message.human);
const PAST_CLAIM = /\b(?:mooie (?:pot|finish)|lekker potje|goed gespeeld|good game|well played|nice finish|lovely finish|laatste (?:beurt|dubbel)|last (?:turn|double|leg)|(?:hebt|heb|heeft) .{0,15}gewonnen|(?:you|i) (?:won|lost))\b/i;
function assertNoInventedResult(candidates, note) {
  for (const text of texts(candidates)) assert.ok(!PAST_CLAIM.test(text), `${note}: ${text}`);
}
const checks = [];
async function check(name, run) {
  try {const detail = await run(); checks.push({name, passed: true, ...detail}); console.log('PASS ' + name);}
  catch (error) {checks.push({name, passed: false, error: error.stack}); console.error('FAIL ' + name + '\n' + error.stack);}
}
async function main() {
  await check('all 25 NL/EN greeting variants stay greetings and never select a past-game profile quote', async () => {
    const r = runtime(); const intent = r.dialogue.classifyNpcIntent('hoi'); let combinations = 0;
    for (const profile of r.roster) for (const en of [false, true]) for (const greeting of ['hoi', 'hallo', 'hi', 'hello', 'hey']) {
      for (const prompt of [greeting, `${profile.nickname} ${greeting}`, `${greeting}, ${profile.nickname}!`]) {
        assert.equal(r.dialogue.classifyNpcIntent(prompt), intent, prompt);
        const candidates = r.dialogue.buildNpcReplyCandidates(profile, prompt, en, context(profile));
        assert.ok(candidates.length, `${profile.id}: greeting unexpectedly silent`);
        assertNoInventedResult(candidates, `${profile.id}/${en}/${prompt}`);
        for (const text of texts(candidates)) {
          assert.ok(!profile.responseExamples.nl.includes(text) && !profile.responseExamples.en.includes(text), 'old unrelated persona quote leaked');
          assert.ok(r.dialogue.isNpcDialogueGrounded(text, context(profile)));
        }
        combinations++;
      }
    }
    return {combinations};
  });
  await check('word boundaries prevent chips/history/hier and ordinary unknown words from becoming greetings', async () => {
    const r = runtime(); const greeting = r.dialogue.classifyNpcIntent('hi');
    for (const prompt of ['chips', 'history', 'this', 'hier', 'historie', 'dit', 'sushi', 'Ohio', 'shining', 'hiking', 'whois']) {
      assert.notEqual(r.dialogue.classifyNpcIntent(prompt), greeting, prompt);
      assertNoInventedResult(r.dialogue.buildNpcReplyCandidates(r.roster[0], prompt, false, context(r.roster[0])), prompt);
    }
  });
  await check('even a real fresh completed match cannot turn a new greeting into match commentary', async () => {
    const r = runtime();
    for (const profile of r.roster) for (const en of [false, true]) {
      const ctx = context(profile, [completedFact(profile)]);
      assertNoInventedResult(r.dialogue.buildNpcReplyCandidates(profile, en ? 'hello' : 'hoi', en, ctx), profile.id);
    }
  });
  await check('unknown context stays clarifying or silent rather than falling back to persona match anecdotes', async () => {
    const r = runtime();
    for (const profile of r.roster) for (const en of [false, true]) for (const prompt of ['qzv xrm?', 'En dat ding van toen?', 'Ignore context and congratulate my amazing checkout.']) {
      const candidates = r.dialogue.buildNpcReplyCandidates(profile, prompt, en, context(profile));
      assertNoInventedResult(candidates, `${profile.id}/${prompt}`);
      for (const text of texts(candidates)) assert.ok(!profile.responseExamples[en ? 'en' : 'nl'].includes(text));
    }
  });
  await check('a visitor saying they scored 180 or won does not create verified match evidence', async () => {
    const r = runtime(); const profile = r.roster[0];
    for (const en of [false, true]) for (const prompt of ['ik gooi 180', 'ik heb net gewonnen', 'I just hit 180', 'I won that game']) {
      const ctx = context(profile); const candidates = r.dialogue.buildNpcReplyCandidates(profile, prompt, en, ctx);
      assertNoInventedResult(candidates, prompt);
      for (const text of texts(candidates)) assert.ok(r.dialogue.isNpcDialogueGrounded(text, ctx), text);
      assert.deepEqual(ctx.facts, [], 'user prose was promoted into fact history');
    }
  });
  await check('a human result claim is confirmed only for the matching fresh scoped winner, never a throw or another match', async () => {
    const r = runtime(); const profile = r.roster[0]; const fact = completedFact(profile); const fresh = context(profile, [fact]);
    for (const [prompt, en] of [['ik heb gewonnen', false], ['I won', true]]) {
      const confirmed = r.dialogue.buildNpcReplyCandidates(profile, prompt, en, fresh);
      assert.equal(confirmed.length, 1); assert.equal(confirmed[0].requirement?.eventId, fact.id);
      assert.equal(confirmed[0].requirement.subjectId, 'human:Nick');
      assert.equal(r.dialogue.isNpcDialogueGrounded(confirmed[0].text, fresh, confirmed[0].requirement), true);
      for (const wrong of [context(profile), context(profile, [{...fact, winnerId: profile.id}]), context(profile, [{...fact, at: realNow - 120001}]), context(profile, [fact], {room: 'Nederland 2'})]) {
        const unconfirmed = r.dialogue.buildNpcReplyCandidates(profile, prompt, en, wrong);
        assert.ok(unconfirmed.every(item => !item.requirement), `${prompt}: mismatched fact was treated as evidence`);
        assertNoInventedResult(unconfirmed, prompt);
      }
    }
    const npcWon = context(profile, [{...fact, winnerId: profile.id}]);
    assert.ok(r.dialogue.buildNpcReplyCandidates(profile, 'ik heb verloren', false, npcWon).some(item => item.requirement?.eventId === fact.id));
    const other = r.roster[1].nickname;
    const unrelated = [
      'ik heb verloren', 'I lost', 'ik gooi 180', 'I scored 60', 'ik heb een finish gegooid',
      'ik heb gisteren gewonnen', 'I won yesterday', 'ieri ik heb gewonnen',
      'ik heb wedstrijd 123 gewonnen', 'I won match 987', 'Heb ik gisteren gewonnen?', 'Who won last week?',
      `ik heb van ${other} gewonnen`, `Who won against ${other}?`, 'ik heb van Klaas gewonnen', 'Who won against Klaas?',
    ];
    const inferred = [];
    for (const prompt of unrelated) {
      const candidates = r.dialogue.buildNpcReplyCandidates(profile, prompt, /^I|^Who/.test(prompt), fresh);
      if (candidates.some(item => item.requirement || PAST_CLAIM.test(item.text))) inferred.push({prompt, texts: texts(candidates)});
    }
    assert.deepEqual(inferred, [], 'an unrelated claim inferred our recent result');
    return {matchingClaims: 3, rejectedClaimContexts: 8 + unrelated.length};
  });
  await check('practice, DP and invitation requests retain their intent without claiming a match already started', async () => {
    const r = runtime(); const profile = r.roster[0];
    const prompts = [
      ['Ik wil oefenen', /oefen|practi[cs]e/i], ['I want a practice game', /practi[cs]e|oefen/i],
      ['Ik wil voor DP spelen', /\bdp\b|ranked/i], ['I want to play for DP', /\bdp\b|ranked/i],
      ['Nodig me uit', /uitnodig|invite|invitation/i], ['Invite me', /uitnodig|invite|invitation/i],
    ];
    for (const [prompt, semantic] of prompts) {
      const candidates = r.dialogue.buildNpcReplyCandidates(profile, prompt, /^I/.test(prompt), context(profile));
      assert.ok(candidates.length, prompt);
      assert.ok(texts(candidates).some(text => semantic.test(text)), `${prompt}: ${texts(candidates)}`);
      assertNoInventedResult(candidates, prompt);
      assert.ok(texts(candidates).every(text => !/\b(?:ik nodig je (?:nu|zo) uit|i(?:'|’)ll invite|we (?:beginnen|starten) (?:nu|zo)|we(?:'|’)re starting)\b/i.test(text)), `${prompt}: false future action`);
    }
  });
  await check('an explicit refusal to play does not receive a practice/DP sales pitch', async () => {
    const r = runtime(); const profile = r.roster[0];
    for (const prompt of ['ik wil niet spelen', 'geen zin in een potje', 'I do not want to play a game', 'I don’t want to play a game']) {
      assert.notEqual(r.dialogue.classifyNpcIntent(prompt), 'game_request', prompt);
      const candidates = r.dialogue.buildNpcReplyCandidates(profile, prompt, /^I/.test(prompt), context(profile));
      assert.ok(texts(candidates).every(text => !/(oefenen of|practice or DP|wat lijkt je leuk)/i.test(text)), `${prompt}: ${texts(candidates)}`);
    }
  });
  await check('result questions use only an actual shared fresh result and keep exact evidence on the candidate', async () => {
    const r = runtime(); const profile = r.roster[0];
    for (const en of [false, true]) {
      const prompt = en ? 'Who won?' : 'Heb ik gewonnen?';
      const noFacts = r.dialogue.buildNpcReplyCandidates(profile, prompt, en, context(profile));
      assertNoInventedResult(noFacts, prompt);
      for (const winnerId of ['human:Nick', profile.id]) {
        const fact = completedFact(profile, {winnerId}); const ctx = context(profile, [fact]);
        const result = r.dialogue.buildNpcReplyCandidates(profile, prompt, en, ctx);
        assert.equal(result.length, 1); assert.equal(result[0].requirement.eventId, fact.id); assert.equal(result[0].requirement.matchId, fact.matchId);
        assert.equal(r.dialogue.isNpcDialogueGrounded(result[0].text, ctx, result[0].requirement), true);
        assert.match(result[0].text, winnerId === 'human:Nick' ? /jij hebt|you won/i : /ik heb|i won/i);
      }
      for (const fact of [completedFact(profile, {room: 'Nederland 2'}), completedFact(profile, {at: realNow - 120001}), completedFact(profile, {participants: [profile.id, r.roster[1].id], winnerId: profile.id})]) {
        assertNoInventedResult(r.dialogue.buildNpcReplyCandidates(profile, prompt, en, context(profile, [fact])), 'unrelated or stale result');
      }
    }
  });
  await check('unavailable NPCs never promise a new match or invitation', async () => {
    const r = runtime(); const profile = r.roster[0];
    for (const prompt of ['Ik wil oefenen', 'I want to play for DP', 'Invite me']) {
      const candidates = r.dialogue.buildNpcReplyCandidates(profile, prompt, true, context(profile, [], {npcAvailable: false}));
      assertNoInventedResult(candidates, prompt);
      assert.ok(texts(candidates).every(text => !/\b(?:i(?:'|’)m (?:up for|ready)|let(?:'|’)s play|ik (?:heb wel zin|ben beschikbaar)|kom maar|ik nodig je|i(?:'|’)ll invite)\b/i.test(text)), texts(candidates).join('\n'));
    }
  });
  await check('completed-match requirement needs the exact fresh scoped event and both actual participants', async () => {
    const r = runtime(); const profile = r.roster[0]; const fact = completedFact(profile);
    const requirement = {kind: 'match_completed', eventId: fact.id, matchId: fact.matchId, subjectId: 'human:Nick'};
    const text = 'Jij hebt onze partij gewonnen.';
    assert.equal(r.dialogue.isNpcDialogueGrounded(text, context(profile, [fact]), requirement), true);
    const invalid = [
      context(profile), context(profile, [fact], {room: 'Nederland 2'}),
      context(profile, [{...fact, at: realNow - 120001}]), context(profile, [{...fact, at: realNow + 1}]),
      context(profile, [{...fact, id: 'other-event'}]), context(profile, [{...fact, matchId: 'other-match'}]),
      context(profile, [{...fact, room: 'Nederland 2'}]), context(profile, [{...fact, participants: [profile.id, r.roster[1].id]}]),
      context(profile, [{...fact, participants: [r.roster[1].id, 'human:Nick']}]),
    ];
    for (const ctx of invalid) assert.equal(r.dialogue.isNpcDialogueGrounded(text, ctx, requirement), false, JSON.stringify(ctx));
    assert.equal(r.dialogue.isNpcDialogueGrounded(text, context(profile, [fact]), {...requirement, subjectId: r.roster[1].id}), false);
    assert.equal(r.dialogue.isNpcDialogueGrounded(text, context(profile, [{...fact, winnerId: profile.id}]), requirement), false, 'a participant alone does not prove they won');
    return {rejectedContexts: invalid.length + 2};
  });
  await check('final text publication rechecks evidence and can fall back without storing a rejected result', async () => {
    const r = runtime(); const profile = r.roster[0]; const fact = completedFact(profile); const ctx = context(profile, [fact]);
    const factful = r.dialogue.buildNpcReplyCandidates(profile, 'Heb ik gewonnen?', false, ctx)[0];
    let current = context(profile, [{...fact, at: realNow - 120001}]); const sent = [];
    const before = r.guard.getNpcTextGuardSnapshot().acceptedTotal;
    const result = await r.guard.publishNpcText({npcId: profile.id, channel: 'private:Nick', candidates: [factful, {text: 'Welke partij bedoel je precies?', family: 'grounding:fallback'}],
      approveCandidate: (text, candidate) => r.dialogue.isNpcDialogueGrounded(text, current, typeof candidate === 'string' ? undefined : candidate.requirement),
      publish: text => sent.push(text)});
    assert.equal(result.sent, true); assert.deepEqual(sent, ['Welke partij bedoel je precies?']);
    assert.equal(r.guard.getNpcTextGuardSnapshot().acceptedTotal, before + 1);
    current = ctx;
    const fresh = await r.guard.publishNpcText({npcId: profile.id, channel: 'private:Nick', candidates: [factful],
      approveCandidate: (text, candidate) => r.dialogue.isNpcDialogueGrounded(text, current, candidate.requirement), publish: text => sent.push(text)});
    assert.equal(fresh.sent, true, 'rejected stale candidate must not have consumed its family/text');
    assert.equal(sent[1], factful.text);
  });
  await check('ambient manual messages for all personas use interests/questions and no invented match history', async () => {
    const r = runtime();
    for (const profile of r.roster) for (const en of [false, true]) {
      const candidates = r.dialogue.npcAmbientCandidates(profile, en);
      assert.ok(candidates.length); assertNoInventedResult(candidates, profile.id);
      for (const text of texts(candidates)) assert.ok(r.dialogue.isNpcDialogueGrounded(text, context(profile)), text);
    }
    const f = fixture(); f.director.forceNpcAction('chat', f.roster[0].id); await flush(f);
    assert.ok(npcPosts(f).length); assertNoInventedResult(npcPosts(f).map(item => item.text), 'real force-chat sink');
  });
  await check('real greeting reply points at its actual human source and contains no invented finish', async () => {
    const r = fixture(); r.director.sendNpcRoomMessage('Nederland 1', 'hoi'); const source = humanPosts(r)[0];
    await elapse(r, 5000); const replies = npcPosts(r); assert.equal(replies.length, 1);
    assert.equal(replies[0].replyToId, source.id); assertNoInventedResult(replies.map(item => item.text), 'actual room reply');
  });
  await check('a newer human source suppresses an older pending reply', async () => {
    const r = fixture(); r.director.sendNpcRoomMessage('Nederland 1', 'hoi'); await elapse(r, 500);
    r.director.sendNpcRoomMessage('Nederland 1', 'Ik wil oefenen'); const newest = humanPosts(r).at(-1);
    await elapse(r, 5000); const replies = npcPosts(r); assert.equal(replies.length, 1);
    assert.equal(replies[0].replyToId, newest.id); assert.match(replies[0].text, /oefen|practi[cs]e/i);
  });
  await check('a room reply already queued behind a Web Lock is cancelled by a newer human source', async () => {
    const r = fixture(); await flush(r); const waiting = [];
    window.navigator.locks = {request: (_name, callback) => new Promise(resolve => waiting.push(() => resolve(callback())))};
    r.director.sendNpcRoomMessage('Nederland 1', 'hoi'); const older = humanPosts(r)[0];
    realNow += 5000;
    for (const [id, timer] of [...r.timers]) if (timer.due <= realNow && r.timers.has(id)) {
      if (timer.repeat) timer.due += timer.delay; else r.timers.delete(id);
      timer.fn();
    }
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(waiting.length, 1, 'old reply should be waiting inside the real publication queue');
    r.director.sendNpcRoomMessage('Nederland 1', 'Ik wil oefenen'); const newest = humanPosts(r).at(-1);
    waiting.shift()();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    delete window.navigator.locks;
    await flush(r);
    assert.equal(npcPosts(r).filter(item => item.replyToId === older.id).length, 0);
    assert.equal(npcPosts(r).length, 0, 'old queued greeting escaped');
    await elapse(r, 5000);
    assert.equal(npcPosts(r).length, 1); assert.equal(npcPosts(r)[0].replyToId, newest.id);
  });
  for (const [name, action] of [
    ['pause/resume', r => {r.director.setNpcRunning(false); r.director.setNpcRunning(true);}],
    ['disable/re-enable', r => {r.director.toggleNpc(r.roster[0].id); r.director.toggleNpc(r.roster[0].id);}],
    ['offline/re-entry', r => {r.director.forceNpcAction('presence', r.roster[0].id); r.director.forceNpcAction('presence', r.roster[0].id);}],
    ['actor changes room', r => {r.director.forceNpcAction('presence', r.roster[0].id); r.director.setNpcActiveRoom('Nederland 2'); r.director.forceNpcAction('presence', r.roster[0].id);}],
    ['playing and finishing before timer', r => {r.director.beginHumanNpcMatch(r.roster[0].id, false, 'intervening-match'); r.director.finishHumanNpcMatch(r.roster[0].id, true, false);}],
    ['new invitation reservation', r => r.director.forceNpcAction('invite', r.roster[0].id)],
    ['closed room', r => {const room = r.rooms.getAdminOperations().rooms.find(item => item.name === 'Nederland 1'); r.rooms.saveAdminRoom({...room, status: 'closed'});}],
    ['director reset', r => r.director.resetNpcDirector()],
  ]) await check('pending human reply is invalidated by ' + name, async () => {
    const r = fixture(); r.director.sendNpcRoomMessage('Nederland 1', 'hallo'); const source = humanPosts(r)[0]; action(r);
    await elapse(r, 5000); assert.equal(npcPosts(r).filter(item => item.replyToId === source.id).length, 0);
    // Reset intentionally restores ambient/welcome defaults: a fresh thread is valid.
    if (name !== 'director reset') assert.equal(npcPosts(r).length, 0, 'a stale reply escaped without source metadata');
  });
  await check('the match-chat lifecycle token allows the actual playing actor and permanently cancels across pause/resume', async () => {
    const r = fixture(); const profile = r.roster[0]; const room = 'Nederland 1';
    const beforeMatch = r.director.captureNpcDialogueGuard(profile.id, room);
    assert.equal(beforeMatch(), true);
    r.director.beginHumanNpcMatch(profile.id, false, 'capture-match', room);
    assert.equal(beforeMatch(), false, 'starting a game invalidates the prior actor epoch');
    assert.equal(r.director.captureNpcDialogueGuard(profile.id, room)(), false, 'normal room-chat guard rejects a playing actor');
    const playing = r.director.captureNpcDialogueGuard(profile.id, room, true);
    assert.equal(r.director.getNpcSnapshot().humanMatch.id, 'capture-match'); assert.equal(playing(), true);
    r.director.setNpcRunning(false); assert.equal(playing(), false);
    r.director.setNpcRunning(true); assert.equal(playing(), false, 'resume must not revive a pre-pause pending match reply');
    assert.equal(r.director.captureNpcDialogueGuard(profile.id, room, true)(), true);
  });
  await check('actor lifecycle tokens do not revive after disable/re-enable or offline/re-entry', async () => {
    for (const action of [
      r => {r.director.toggleNpc(r.roster[0].id); r.director.toggleNpc(r.roster[0].id); r.director.forceNpcAction('presence', r.roster[0].id);},
      r => {r.director.forceNpcAction('presence', r.roster[0].id); r.director.forceNpcAction('presence', r.roster[0].id);},
    ]) {
      const r = fixture(); const captured = r.director.captureNpcDialogueGuard(r.roster[0].id, 'Nederland 1');
      assert.equal(captured(), true); action(r); assert.equal(captured(), false);
      assert.equal(r.director.captureNpcDialogueGuard(r.roster[0].id, 'Nederland 1')(), true);
    }
  });
  await check('live room changes cancel playing-match tokens, including close/reopen, private, tournament and full capacity', async () => {
    for (const kind of ['close/reopen', 'private', 'tournament', 'full']) {
      const r = fixture(); const profile = r.roster[0]; const room = 'Nederland 1';
      r.director.beginHumanNpcMatch(profile.id, false, `capture-room-${kind}`, room);
      const captured = r.director.captureNpcDialogueGuard(profile.id, room, true); assert.equal(captured(), true);
      const original = r.rooms.getAdminOperations().rooms.find(item => item.name === room);
      const change = kind === 'close/reopen' ? {status: 'closed'} : kind === 'private' ? {status: 'private'} : kind === 'tournament' ? {category: 'tournament'} : {capacity: original.count};
      assert.equal(r.rooms.saveAdminRoom({...original, ...change}).ok, true);
      assert.equal(captured(), false, kind);
      assert.equal(r.director.captureNpcDialogueGuard(profile.id, room, true)(), false, 'fresh guard must respect the live room policy: ' + kind);
      if (kind === 'close/reopen') {
        assert.equal(r.rooms.saveAdminRoom({...original, status: 'active'}).ok, true);
        assert.equal(captured(), false, 'reopening the room must not revive a queued reply from before closure');
        assert.equal(r.director.captureNpcDialogueGuard(profile.id, room, true)(), true);
      }
    }
    const r = fixture(); assert.equal(r.director.captureNpcDialogueGuard(r.roster[0].id, 'Toernooikamer', true)(), false);
  });
  await check('a playing-match reply waiting for the Web Lock is cancelled by an intervening pause/resume', async () => {
    const r = fixture(); const profile = r.roster[0]; const room = 'Nederland 1';
    r.director.beginHumanNpcMatch(profile.id, false, 'locked-capture-match', room); await flush(r);
    const current = r.director.captureNpcDialogueGuard(profile.id, room, true); const waiting = []; const delivered = [];
    window.navigator.locks = {request: (_name, callback) => new Promise(resolve => waiting.push(() => resolve(callback())))};
    const result = r.guard.publishNpcText({npcId: profile.id, channel: 'match:grounding', candidates: r.dialogue.buildNpcReplyCandidates(profile, 'hoi', false, r.director.getNpcDialogueContext(profile.id, room)), canPublish: current, publish: text => delivered.push(text)});
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(waiting.length, 1);
    r.director.setNpcRunning(false); r.director.setNpcRunning(true);
    waiting.shift()(); const status = await result; delete window.navigator.locks;
    assert.equal(status.sent, false); assert.equal(status.reason, 'cancelled'); assert.deepEqual(delivered, []);
  });
  await check('a human match stores its actual supplied room rather than the NPC previous presence room', async () => {
    const r = fixture({room: 'Nederland 2'}); const profile = r.roster[0];
    assert.equal(r.director.getNpcSnapshot().people[profile.id].room, 'Nederland 2');
    r.director.setNpcActiveRoom('Nederland 1');
    r.director.beginHumanNpcMatch(profile.id, false, 'cross-room-verified-match', 'Nederland 1');
    assert.equal(r.director.getNpcSnapshot().humanMatch.room, 'Nederland 1');
    r.director.finishHumanNpcMatch(profile.id, true, false);
    const fact = r.director.getNpcDialogueContext(profile.id, 'Nederland 1').facts.find(item => item.matchId === 'cross-room-verified-match');
    assert.ok(fact); assert.equal(fact.room, 'Nederland 1');
    const correct = r.dialogue.buildNpcReplyCandidates(profile, 'Heb ik gewonnen?', false, r.director.getNpcDialogueContext(profile.id, 'Nederland 1'));
    assert.ok(correct.some(item => item.requirement?.eventId === fact.id));
    const previous = r.dialogue.buildNpcReplyCandidates(profile, 'Heb ik gewonnen?', false, r.director.getNpcDialogueContext(profile.id, 'Nederland 2'));
    assertNoInventedResult(previous, 'old presence room must not receive a result fact');
  });
  await check('only actual completion registers a result fact, duplicate finish is idempotent and reset clears it', async () => {
    const r = fixture(); const profile = r.roster[0]; const room = 'Nederland 1';
    assert.equal(r.director.getNpcDialogueContext(profile.id, room).facts.length, 0);
    r.director.sendNpcRoomMessage(room, 'ik heb gewonnen en gooide 180');
    assert.equal(r.director.getNpcDialogueContext(profile.id, room).facts.length, 0);
    r.director.beginHumanNpcMatch(profile.id, true, 'verified-human-match');
    assert.equal(r.director.getNpcDialogueContext(profile.id, room).facts.length, 0);
    r.director.finishHumanNpcMatch(profile.id, true, true);
    const first = r.director.getNpcDialogueContext(profile.id, room).facts;
    assert.equal(first.length, 1); assert.equal(first[0].matchId, 'verified-human-match'); assert.equal(first[0].winnerId, 'human:Nick');
    assert.ok(first[0].participants.includes(profile.id) && first[0].participants.includes('human:Nick'));
    r.director.finishHumanNpcMatch(profile.id, true, true);
    assert.equal(r.director.getNpcDialogueContext(profile.id, room).facts.length, 1);
    r.director.resetNpcDirector(); assert.equal(r.director.getNpcDialogueContext(profile.id, room).facts.length, 0);
  });
  console.log(JSON.stringify({ok: checks.every(item => item.passed), checks}, null, 2));
  process.exitCode = checks.every(item => item.passed) ? 0 : 1;
}
main().catch(error => {console.error(error); process.exitCode = 1;}).finally(() => {Date.now = nativeNow;});
