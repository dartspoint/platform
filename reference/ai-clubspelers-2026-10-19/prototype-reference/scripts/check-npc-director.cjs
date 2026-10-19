/* Headless checks of the real director, scoring, rooms and rating ledger.
 * Run: node scripts/check-npc-director.cjs
 * Timers and browser storage are in memory. No network, browser or React render.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'lib') + path.sep;
const STORAGE = 'dartspoint:npc-director:v1';
const RATING_STORAGE = 'dartspoint.demo-elo.v1';
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith('@/')) request = path.join(ROOT, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = function(module, filename) {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true},
  });
  module._compile(result.outputText, filename);
};

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
    setItem: (key, value) => data.set(String(key), String(value)),
    removeItem: key => data.delete(String(key)),
    clear: () => data.clear(),
    entries: () => Object.fromEntries(data),
  };
}
function createRuntime({session = {}, local = {}} = {}) {
  for (const filename of Object.keys(require.cache)) if (filename.startsWith(LIB)) delete require.cache[filename];
  const sessionStorage = memoryStorage(session), localStorage = memoryStorage(local);
  let timerId = 0;
  const timers = new Map();
  global.setInterval = (fn, delay) => {const id = ++timerId; timers.set(id, {fn, delay, repeat: true}); return id;};
  global.clearInterval = id => timers.delete(id);
  global.setTimeout = (fn, delay) => {const id = ++timerId; timers.set(id, {fn, delay, repeat: false}); return id;};
  global.clearTimeout = id => timers.delete(id);
  global.sessionStorage = sessionStorage;
  global.localStorage = localStorage;
  global.window = {sessionStorage, localStorage, addEventListener() {}, removeEventListener() {}};
  const director = require(path.join(LIB, 'darts-npc.ts'));
  const roster = require(path.join(LIB, 'darts-npc-profiles.ts')).npcProfiles;
  const rules = require(path.join(LIB, 'darts-rules.ts'));
  const ratings = require(path.join(LIB, 'darts-ratings.ts'));
  const rooms = require(path.join(LIB, 'darts-admin-operations.ts'));
  return {director, roster, rules, ratings, rooms, timers, sessionStorage, localStorage};
}
const copy = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} vs ${expected}`);
const pending = runtime => runtime.director.getNpcSnapshot().invitations.filter(invite => invite.status === 'pending');
const results = [];
function check(name, run) {
  const start = Date.now();
  try {const detail = run(); results.push({name, passed: true, milliseconds: Date.now() - start, ...detail}); console.log(`PASS ${name}`);}
  catch (error) {results.push({name, passed: false, error: error.stack}); console.error(`FAIL ${name}\n${error.stack}`);}
}

check('25 distinct adult personas, 13 men and 12 women', () => {
  const {roster} = createRuntime();
  assert.equal(roster.length, 25);
  assert.equal(new Set(roster.map(p => p.id)).size, 25);
  assert.equal(new Set(roster.map(p => p.nickname)).size, 25);
  assert.equal(roster.filter(p => p.gender === 'man').length, 13);
  assert.equal(roster.filter(p => p.gender === 'vrouw').length, 12);
  assert.ok(roster.every(p => Number.isInteger(p.age) && p.age >= 18 && p.age <= 40 && p.isAi));
  assert.ok(roster.every(p => p.bio && p.interests.length >= 3 && p.personality.length >= 3 && p.responseExamples.nl.length && p.responseExamples.en.length));
});

check('online target respects zero, maximum and disabled population', () => {
  const {director, roster} = createRuntime();
  const base = director.getNpcSnapshot();
  for (const hour of [0, 6, 12, 18, 23]) for (const humans of [0, 3, 15, 40, 100]) for (let maxOnline = 0; maxOnline <= 25; maxOnline++) {
    const state = {...base, settings: {...base.settings, hour, humans, maxOnline}};
    const target = director.npcTarget(state);
    assert.ok(Number.isInteger(target) && target >= 0 && target <= maxOnline && target <= 25);
    if (maxOnline === 0) assert.equal(target, 0);
  }
  assert.equal(director.npcTarget({...base, disabled: roster.map(p => p.id)}), 0);
});

check('corrupt saved state is discarded and valid state restores', () => {
  let runtime = createRuntime();
  runtime.director.initializeNpcDirector();
  const valid = copy(runtime.director.getNpcSnapshot());
  const invalid = [
    '{bad-json',
    JSON.stringify({...valid, people: Object.fromEntries(runtime.roster.map(p => [p.id, null]))}),
    JSON.stringify({...valid, matches: {length: 0}}),
    JSON.stringify({...valid, disabled: null}),
    JSON.stringify({...valid, speed: 'fast'}),
    JSON.stringify({...valid, settings: {...valid.settings, maxOnline: 99}}),
    JSON.stringify({...valid, chat: [{id: 'bad', text: null}]}),
  ];
  for (const saved of invalid) {
    runtime = createRuntime({session: {[STORAGE]: saved}});
    runtime.director.initializeNpcDirector();
    const state = runtime.director.getNpcSnapshot();
    assert.equal(state.hydrated, true);
    assert.equal(Object.keys(state.people).length, 25);
    assert.equal(state.settings.maxOnline, 25);
    assert.ok(Array.isArray(state.matches) && Array.isArray(state.chat) && Array.isArray(state.disabled));
    runtime.director.tickNpcDirector();
    assert.ok(Number.isFinite(runtime.director.getNpcSnapshot().time));
  }
  runtime = createRuntime({session: {[STORAGE]: JSON.stringify(valid)}});
  runtime.director.initializeNpcDirector();
  assert.equal(runtime.director.getNpcSnapshot().runId, valid.runId);
  assert.equal(runtime.director.getNpcSnapshot().time, valid.time);
  assert.ok(runtime.rooms.getAdminOperations().rooms.some(room => room.name === 'International'));
  return {corruptFixtures: invalid.length};
});

check('NPC darts use legal board hits and finish odd/even rests on a double', () => {
  const {director, roster, rules} = createRuntime();
  let throws = 0, completed = 0;
  for (const profile of roster) for (const initial of [2, 3, 5, 17, 39, 40, 41, 50, 61, 79, 80, 99, 100, 121, 170]) {
    let remaining = initial;
    for (let visit = 0; visit < 120 && remaining > 0; visit++) {
      const visitStart = remaining;
      for (let dart = 0; dart < 3; dart++) {
        const hit = director.npcThrow(profile, remaining, 3 - dart);
        assert.ok([hit.x, hit.y, hit.score].every(Number.isFinite));
        assert.deepEqual(hit, rules.scoreDart(hit.x, hit.y));
        assert.ok(Number.isInteger(hit.score) && hit.score >= 0 && hit.score <= 60);
        const result = rules.applyDart(remaining, visitStart, hit);
        assert.ok(Number.isInteger(result.remaining) && result.remaining >= 0 && result.remaining !== 1 && result.remaining <= visitStart);
        if (result.checkout) assert.ok(hit.double && hit.score === remaining);
        remaining = result.remaining;
        throws++;
        if (result.checkout || result.bust) break;
      }
    }
    assert.equal(remaining, 0, `${profile.nickname} could not finish ${initial} within 120 visits`);
    completed++;
  }
  return {legalThrows: throws, completedLegs: completed};
});

check('one pending invitation reserves its NPC; decline and expiry are final', () => {
  const runtime = createRuntime(), {director} = runtime;
  director.initializeNpcDirector();
  director.setNpcActiveRoom('Nederland 1');
  director.forceNpcAction('invite');
  assert.equal(pending(runtime).length, 1);
  const invite = copy(pending(runtime)[0]);
  for (let i = 0; i < 5; i++) director.forceNpcAction('invite');
  assert.equal(pending(runtime).length, 1);
  director.forceNpcAction('presence', invite.npcId);
  director.forceNpcAction('match', invite.npcId);
  assert.equal(director.getNpcSnapshot().people[invite.npcId].online, true);
  assert.ok(!director.getNpcSnapshot().matches.some(m => m.phase === 'playing' && m.players.includes(invite.npcId)));
  assert.equal(director.respondNpcInvitation(invite.id, false), true);
  assert.equal(director.respondNpcInvitation(invite.id, true), false);
  assert.equal(director.getNpcSnapshot().humanBusy, false);
  const suppressUntil = director.getNpcSnapshot().suppressedUntil;
  director.setNpcSpeed(60);
  for (let i = 0; i < 15; i++) director.tickNpcDirector();
  assert.ok(director.getNpcSnapshot().time < suppressUntil);
  assert.equal(pending(runtime).length, 0);
  director.forceNpcAction('invite');
  const expired = copy(pending(runtime)[0]);
  assert.ok(expired);
  director.updateNpcSettings({enableInvites: false});
  for (let i = 0; i < 6; i++) director.tickNpcDirector();
  assert.equal(director.getNpcSnapshot().invitations.find(i => i.id === expired.id).status, 'expired');
  assert.equal(director.respondNpcInvitation(expired.id, true), false);
});

check('accepted invitation cannot be accepted again or matched elsewhere', () => {
  const runtime = createRuntime(), {director} = runtime;
  director.initializeNpcDirector();
  director.forceNpcAction('invite');
  const invite = copy(pending(runtime)[0]);
  assert.ok(invite);
  assert.equal(director.respondNpcInvitation(invite.id, true), true);
  assert.equal(director.respondNpcInvitation(invite.id, true), false);
  director.forceNpcAction('match', invite.npcId);
  assert.equal(director.getNpcSnapshot().humanMatch.npcId, invite.npcId);
  assert.equal(director.getNpcSnapshot().people[invite.npcId].status, 'playing');
  assert.ok(!director.getNpcSnapshot().matches.some(m => m.phase === 'playing' && m.players.includes(invite.npcId)));
});

check('human DP settlement is zero sum, obeys active mode and is idempotent', () => {
  const runtime = createRuntime(), {director, roster, ratings} = runtime;
  director.initializeNpcDirector();
  const profile = roster[0], matchId = `test-${director.getNpcSnapshot().runId}`;
  const beforeHuman = ratings.getRatingProfile('Nick').rating, beforeNpc = ratings.getRatingProfile(profile.nickname).rating;
  director.finishHumanNpcMatch(profile.id, true, true);
  assert.equal(director.getNpcSnapshot().humanPlayed, 0, 'a result without active context is ignored');
  director.beginHumanNpcMatch(profile.id, true, matchId);
  director.finishHumanNpcMatch(profile.id, true, false); // active match mode wins over a caller flag
  let state = director.getNpcSnapshot();
  near(state.humanRating + state.people[profile.id].rating, beforeHuman + beforeNpc, 'human/NPC total DP');
  assert.ok(state.humanRating > beforeHuman);
  assert.equal(state.humanPlayed, 1);
  assert.equal(state.humanWins, 1);
  assert.equal(state.people[profile.id].played, 1);
  const after = copy(state);
  director.finishHumanNpcMatch(profile.id, true, true);
  state = director.getNpcSnapshot();
  assert.equal(state.humanRating, after.humanRating);
  assert.equal(state.humanPlayed, after.humanPlayed);
  assert.equal(state.people[profile.id].played, after.people[profile.id].played);
  const ledger = JSON.parse(runtime.localStorage.getItem(RATING_STORAGE));
  assert.equal(ledger.ledger.filter(entry => entry.id === matchId).length, 1);
  director.beginHumanNpcMatch(profile.id, false, matchId + '-practice');
  director.finishHumanNpcMatch(profile.id, false, true);
  near(director.getNpcSnapshot().humanRating, after.humanRating, 'practice human DP');
  near(director.getNpcSnapshot().people[profile.id].rating, after.people[profile.id].rating, 'practice NPC DP');
  const runId = director.getNpcSnapshot().runId;
  director.resetNpcDirector();
  assert.notEqual(director.getNpcSnapshot().runId, runId);
  near(director.getNpcSnapshot().humanRating, after.humanRating, 'reset keeps booked DP');
});

check('1000 manual ticks retain finite legal state, bounded logs and zero-sum DP', () => {
  const runtime = createRuntime(), {director, roster, ratings} = runtime;
  director.initializeNpcDirector();
  director.updateNpcSettings({enableInvites: false});
  director.setNpcSpeed(60);
  const names = ['Nick', ...roster.map(p => p.nickname)];
  const totalBefore = names.reduce((sum, name) => sum + ratings.getRatingProfile(name).rating, 0);
  let finished = 0;
  const seenFinished = new Set();
  for (let tick = 0; tick < 1000; tick++) {
    director.tickNpcDirector();
    const state = director.getNpcSnapshot();
    const online = Object.values(state.people).filter(p => p.online);
    assert.ok(online.length >= 0 && online.length <= 25);
    const playersInMatches = new Set();
    for (const match of state.matches) {
      assert.ok(match.scores.every(score => Number.isInteger(score) && score >= 0 && score <= 301 && score !== 1));
      assert.ok(match.players[0] !== match.players[1]);
      if (match.phase === 'playing') for (const id of match.players) {assert.ok(!playersInMatches.has(id), 'one simultaneous match per NPC'); playersInMatches.add(id);}
      if (match.phase === 'finished') {assert.ok(match.scores.includes(0)); seenFinished.add(match.id);}
    }
    assert.ok(Object.values(state.people).every(p => [p.rating, p.played, p.wins, p.nextActionAt, p.leaveAt].every(Number.isFinite)));
    assert.ok(state.events.length <= 160 && state.chat.length <= 160 && state.matches.length <= 40);
    assert.ok(state.people && Object.keys(state.people).length === 25);
    for (const room of runtime.rooms.getAdminOperations().rooms) {
      const npcCount = online.filter(p => p.room === room.name).length;
      assert.ok(npcCount + room.count <= room.capacity, `${room.name} capacity exceeded`);
      if (room.status !== 'active' || room.category === 'tournament') assert.equal(npcCount, 0);
    }
  }
  finished = seenFinished.size;
  assert.ok(finished > 0, 'simulation completes legal matches');
  near(names.reduce((sum, name) => sum + ratings.getRatingProfile(name).rating, 0), totalBefore, 'platform total DP');
  return {manualTicks: 1000, completedMatchesObserved: finished};
});

console.log(JSON.stringify({ok: results.every(result => result.passed), checks: results}, null, 2));
process.exitCode = results.every(result => result.passed) ? 0 : 1;
