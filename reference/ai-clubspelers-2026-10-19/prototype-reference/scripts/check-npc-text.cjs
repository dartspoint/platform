/* Real-time, shared NPC text-window checks. No browser/network/React render.
 * Run: node scripts/check-npc-text.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..'), LIB = path.join(ROOT, 'lib') + path.sep;
const STORAGE = 'dartspoint:npc-text-history:v1';
const modulePath = path.join(ROOT, process.env.NPC_TEXT_GUARD_MODULE || 'lib/darts-npc-text.ts');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith('@/')) request = path.join(ROOT, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = function(module, filename) {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {fileName: filename, compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true}});
  module._compile(result.outputText, filename);
};
function memoryStorage(initial = {}, broken = false) {
  const entries = new Map(Object.entries(initial));
  return {getItem(key) {if (broken) throw new Error('Storage unavailable'); return entries.has(key) ? entries.get(key) : null;}, setItem(key, value) {if (broken) throw new Error('Storage unavailable'); entries.set(String(key), String(value));}, removeItem(key) {entries.delete(key);}, clear() {entries.clear();}, entries: () => Object.fromEntries(entries)};
}
const realDateNow = Date.now;
let realNow = 1792351800000;
Date.now = () => realNow;
function clearLibs() {for (const filename of Object.keys(require.cache)) if (filename.startsWith(LIB)) delete require.cache[filename];}
function createRuntime({storage = memoryStorage(), session = memoryStorage(), locks = false} = {}) {
  clearLibs();
  let timerId = 0, lockRequests = 0;
  const timers = new Map(), queues = new Map();
  global.setInterval = (fn, delay) => {const id = ++timerId; timers.set(id, {fn, delay, repeat: true}); return id;};
  global.clearInterval = id => timers.delete(id);
  global.setTimeout = (fn, delay) => {const id = ++timerId; timers.set(id, {fn, delay, repeat: false}); return id;};
  global.clearTimeout = id => timers.delete(id);
  global.localStorage = storage; global.sessionStorage = session;
  const navigator = locks ? {locks: {request(name, ...args) {lockRequests++; const callback = args.at(-1), previous = queues.get(name) || Promise.resolve(); const task = previous.catch(() => {}).then(() => callback({name})); queues.set(name, task); return task;}}} : {};
  global.window = {localStorage: storage, sessionStorage: session, navigator, addEventListener() {}, removeEventListener() {}};
  const guard = require(modulePath), roster = require(path.join(LIB, 'darts-npc-profiles.ts')).npcProfiles;
  return {guard, roster, storage, session, timers, lockRequests: () => lockRequests};
}
function output(runtime, {npcId = runtime.roster[0].id, channel = 'room:Nederland 1', candidates, canPublish, sink} = {}) {
  const sent = [];
  const promise = runtime.guard.publishNpcText({npcId, channel, candidates, canPublish, publish(text) {sent.push(text); if (sink) sink(text);}});
  return Promise.resolve(promise).then(result => ({result, sent}));
}
const results = [];
async function check(name, run) {
  const started = realDateNow();
  try {const detail = await run(); results.push({name, passed: true, milliseconds: realDateNow() - started, ...detail}); console.log(`PASS ${name}`);}
  catch (error) {results.push({name, passed: false, error: error.stack}); console.error(`FAIL ${name}\n${error.stack}`);}
}
async function main() {
  await check('one global exact-text window across all 25 identities and channels', async () => {
    const runtime = createRuntime(), text = 'De zeelucht helpt me ontspannen na een lange wandeling langs het strand.';
    assert.equal(runtime.guard.NPC_TEXT_WINDOW_MS, 12 * 60 * 60 * 1000);
    assert.equal((await output(runtime, {candidates: [text]})).result.sent, true);
    for (let index = 0; index < runtime.roster.length; index++) {
      const result = await output(runtime, {npcId: runtime.roster[index].id, channel: ['room:International', 'private:Nick', 'match:demo'][index % 3], candidates: [text]});
      assert.equal(result.result.sent, false); assert.equal(result.result.reason, 'duplicate'); assert.equal(result.sent.length, 0);
    }
    return {identitiesChecked: 25};
  });
  await check('normalisation and near duplicates cannot bypass the global window', async () => {
    const runtime = createRuntime();
    const original = 'Wie heeft zin in een kort potje darts voor we koffie pakken?';
    assert.equal((await output(runtime, {candidates: [original]})).result.sent, true);
    for (const text of [
      '  WIE HEEFT ZIN IN EEN KORT POTJE DARTS VOOR WE KOFFIE PAKKEN!!! 🎯  ',
      'Wie heeft er zin in een kort potje darts voor we koffie pakken?',
      'Wie heeft zin in een kort potje darts, voor we koffie pakken?',
      'Wie\u200b heeft zin in een kort potje darts voor we koffie pakken?',
    ]) {
      const result = await output(runtime, {npcId: runtime.roster[1].id, candidates: [text]});
      assert.equal(result.result.sent, false, `near duplicate escaped: ${text}`);
    }
    assert.equal((await output(runtime, {candidates: ['Ik sleutel in het weekend aan oude racefietsen en zoek onderdelen.']})).result.sent, true, 'unrelated ideas remain publishable');
  });
  await check('substituting NPC names, numbers and diacritics does not create new text', async () => {
    const runtime = createRuntime();
    const first = `In het café zag ${runtime.roster[0].nickname} een score van 180 tijdens een héél mooie partij.`;
    assert.equal((await output(runtime, {candidates: [first]})).result.sent, true);
    const substituted = `In het cafe zag ${runtime.roster[1].nickname} een score van 140 tijdens een heel mooie partij.`;
    const result = await output(runtime, {npcId: runtime.roster[1].id, channel: 'match:another', candidates: [substituted]});
    assert.equal(result.result.sent, false); assert.equal(result.result.reason, 'duplicate');
  });
  await check('semantic families cover paraphrases without suffix workarounds', async () => {
    const runtime = createRuntime();
    assert.equal((await output(runtime, {candidates: [{text: 'Zullen we dezelfde wedstrijdinstellingen voor een revanche gebruiken?', family: 'rematch-same-settings'}]})).result.sent, true);
    const repeated = await output(runtime, {npcId: runtime.roster[2].id, channel: 'room:International', candidates: [{text: 'Fancy another one with the same rules?', family: 'rematch-same-settings'}]});
    assert.equal(repeated.result.sent, false);
    assert.equal(repeated.result.reason, 'duplicate');
    assert.equal(repeated.sent.length, 0);
  });
  await check('candidate fallback chooses new text and exhausted candidates stay silent', async () => {
    const runtime = createRuntime(), used = 'Vanavond luister ik naar jazz terwijl ik mijn volgende zet bepaal.';
    await output(runtime, {candidates: [used]});
    const fresh = 'Ik probeer vandaag vooral mijn concentratie op de buitenste dubbelring te houden.';
    const fallback = await output(runtime, {candidates: [used, fresh]});
    assert.equal(fallback.result.sent, true); assert.deepEqual(fallback.sent, [fresh]);
    const exhausted = await output(runtime, {candidates: [used, fresh]});
    assert.equal(exhausted.result.sent, false); assert.equal(exhausted.sent.length, 0);
    assert.equal((await output(runtime, {candidates: [' ', '\n']})).result.sent, false);
  });
  await check('12-hour expiry uses the real clock and survives module reload', async () => {
    const storage = memoryStorage(), runtime = createRuntime({storage}), text = 'Een stille ochtendwandeling is voor mij het beste begin van een vrije dag.';
    const started = realNow;
    await output(runtime, {candidates: [text]});
    realNow = started + runtime.guard.NPC_TEXT_WINDOW_MS - 1;
    assert.equal((await output(runtime, {candidates: [text]})).result.sent, false);
    const reloaded = createRuntime({storage});
    assert.equal((await output(reloaded, {npcId: reloaded.roster[24].id, candidates: [text]})).result.sent, false);
    realNow = started + reloaded.guard.NPC_TEXT_WINDOW_MS + 1;
    assert.equal((await output(reloaded, {candidates: [text]})).result.sent, true);
  });
  await check('a clock rollback never expires or backdates a reservation', async () => {
    const runtime = createRuntime(), started = realNow;
    const first = 'Een stadswandeling brengt me langs gevels waar ik steeds nieuwe details ontdek.';
    const duringRollback = 'Tijdens het koken probeer ik graag onverwachte combinaties van verse groenten.';
    await output(runtime, {candidates: [first]});
    realNow = started + 6 * 60 * 60 * 1000;
    assert.equal((await output(runtime, {candidates: [first]})).result.sent, false);
    const monotonicSeen = JSON.parse(runtime.storage.getItem(STORAGE)).lastSeenAt;
    realNow = started - 2 * 60 * 60 * 1000;
    assert.equal((await output(runtime, {candidates: [first]})).result.sent, false);
    assert.equal((await output(runtime, {candidates: [duringRollback]})).result.sent, true);
    const stored = JSON.parse(runtime.storage.getItem(STORAGE));
    assert.ok(stored.lastSeenAt >= monotonicSeen);
    assert.ok(stored.entries.find(entry => entry.text === duringRollback).at >= monotonicSeen);
    realNow = started + runtime.guard.NPC_TEXT_WINDOW_MS + 1;
    assert.equal((await output(runtime, {candidates: [first]})).result.sent, true);
    assert.equal((await output(runtime, {candidates: [duringRollback]})).result.sent, false, 'rollback text keeps its full conservative window');
  });
  await check('director reset and fast simulation do not clear real-time text history', async () => {
    const runtime = createRuntime(), text = 'In de herfst fotografeer ik graag de kleuren tussen de oude gebouwen.';
    await output(runtime, {candidates: [text]});
    const director = require(path.join(LIB, 'darts-npc.ts'));
    director.initializeNpcDirector(); director.setNpcSpeed(60); director.updateNpcSettings({enableInvites: false, chatIntensity: 0});
    for (let tick = 0; tick < 800; tick++) director.tickNpcDirector();
    assert.equal((await output(runtime, {candidates: [text]})).result.sent, false);
    director.resetNpcDirector();
    assert.equal((await output(runtime, {candidates: [text]})).result.sent, false);
  });
  await check('concurrent claims produce exactly one output with and without Web Locks', async () => {
    for (const locks of [false, true]) {
      const runtime = createRuntime({locks}), text = 'Mijn favoriete route gaat langs het water, de bomen en de oude molen.';
      const claims = await Promise.all(runtime.roster.map(profile => output(runtime, {npcId: profile.id, channel: 'room:' + profile.nickname, candidates: [text]})));
      assert.equal(claims.filter(value => value.result.sent).length, 1);
      assert.equal(claims.reduce((sum, value) => sum + value.sent.length, 0), 1);
      if (locks) assert.ok(runtime.lockRequests() > 0);
    }
  });
  await check('Web Locks serialize independent guard instances sharing origin storage', async () => {
    const runtime = createRuntime({locks: true});
    delete require.cache[modulePath];
    const secondGuard = require(modulePath), text = 'Tijdens een regenbui werk ik graag aan mijn miniatuurbouwproject aan de keukentafel.';
    const delivered = [];
    const request = (guard, index) => guard.publishNpcText({npcId: runtime.roster[index].id, channel: index ? 'private:Nick' : 'room:Nederland 1', candidates: [text], publish: value => delivered.push(value)});
    const claims = await Promise.all([request(runtime.guard, 0), request(secondGuard, 1)]);
    assert.equal(claims.filter(result => result.sent).length, 1);
    assert.equal(delivered.length, 1);
    assert.ok(runtime.lockRequests() >= 2);
  });
  await check('a full live ledger remains intact and fails closed at capacity', async () => {
    const roster = createRuntime().roster;
    const entries = Array.from({length: 5000}, (_, index) => ({at: realNow, npcId: roster[index % 25].id, channel: 'room:Nederland 1', text: 'Een reeds gepubliceerd testbericht over bloemen in de lentetuin.'}));
    const stored = {version: 1, lastSeenAt: realNow, acceptedTotal: 5000, blockedTotal: 0, lastBlockedAt: null, entries};
    const runtime = createRuntime({storage: memoryStorage({[STORAGE]: JSON.stringify(stored)})});
    const result = await output(runtime, {candidates: ['Welke route door het bos vinden jullie prettig voor een rustige wandeling?']});
    assert.equal(result.result.reason, 'capacity'); assert.equal(result.sent.length, 0);
    assert.equal(JSON.parse(runtime.storage.getItem(STORAGE)).entries.length, 5000);
  });
  await check('forced director output shares one guarded history with room and private sinks', async () => {
    const runtime = createRuntime(), director = require(path.join(LIB, 'darts-npc.ts'));
    const chat = require(path.join(LIB, 'darts-chat-state.ts'));
    director.initializeNpcDirector();
    director.setNpcRunning(false);
    const profile = runtime.roster[0];
    for (let request = 0; request < 6; request++) director.forceNpcAction('chat', profile.id);
    await runtime.guard.publishNpcText({npcId: profile.id, channel: 'flush', candidates: [], publish() {}});
    const authored = director.getNpcSnapshot().chat.filter(message => message.name === profile.nickname);
    assert.ok(authored.length > 0 && authored.length <= profile.responseExamples.nl.length);
    assert.equal(new Set(authored.map(message => message.text)).size, authored.length);
    const first = authored[0];
    const roomHistory = chat.getChatChannel('room:' + first.room).filter(message => message.name === profile.nickname);
    assert.equal(roomHistory.length, authored.length, 'director and shared chat sinks publish the same accepted messages');
    const duplicate = await output(runtime, {npcId: runtime.roster[4].id, channel: 'private:Nick', candidates: [first.text], sink: reply => chat.receivePrivateMessage(runtime.roster[4].nickname, reply)});
    assert.equal(duplicate.result.sent, false); assert.equal(duplicate.sent.length, 0);
    assert.ok(runtime.guard.getNpcTextGuardSnapshot().blockedTotal > 0);
  });
  await check('rendered 500-character text is guarded and stored before publishing', async () => {
    const runtime = createRuntime(), body = 'We nemen rustig de tijd en concentreren ons op iedere volgende pijl. '.repeat(10);
    let persisted = false;
    const first = await output(runtime, {candidates: [body + 'A'], sink(text) {persisted = !!runtime.storage.getItem(STORAGE); assert.ok(text.length <= 500);}});
    assert.equal(first.result.sent, true); assert.equal(persisted, true);
    const second = await output(runtime, {npcId: runtime.roster[3].id, candidates: [body + 'B']});
    assert.equal(second.result.sent, false); assert.equal(second.sent.length, 0);
  });
  await check('cancelled publications and unavailable storage do not produce output', async () => {
    const runtime = createRuntime(), text = 'Ik zoek een nieuwe route om mijn hardlooptraining iets afwisselender te maken.';
    assert.equal((await output(runtime, {candidates: [text], canPublish: () => false})).result.sent, false);
    assert.equal((await output(runtime, {candidates: [text]})).result.sent, true, 'cancelled output does not consume a text');
    const failed = createRuntime({storage: memoryStorage({}, true)});
    const unavailable = await output(failed, {candidates: ['Een uniek bericht bij onbeschikbare opslag.']});
    assert.equal(unavailable.result.sent, false); assert.equal(unavailable.sent.length, 0);
  });
  await check('malformed persisted history fails closed without crashing', async () => {
    for (const stored of ['{invalid-json', JSON.stringify({version: 1, entries: 'broken'}), JSON.stringify({version: 1, entries: [{at: 'yesterday', text: null}]})]) {
      const runtime = createRuntime({storage: memoryStorage({[STORAGE]: stored})});
      const result = await output(runtime, {candidates: ['Een nieuw bericht nadat corrupte historie is aangetroffen.']});
      assert.equal(result.result.sent, false); assert.equal(result.sent.length, 0);
    }
  });
  await check('new match seeds never manufacture unguarded NPC dialogue', async () => {
    const runtime = createRuntime(), chat = require(path.join(LIB, 'darts-chat-state.ts'));
    for (const profile of runtime.roster) {
      const messages = chat.getInitialChatChannel(`match:Nederland 1:seed-${profile.id}:${profile.nickname}`, ['Nick', profile.nickname]);
      assert.equal(messages.filter(message => !message.system && message.name === profile.nickname).length, 0);
      assert.ok(messages.some(message => message.system && message.text.includes(profile.nickname)));
    }
    const human = chat.getInitialChatChannel('match:Nederland 1:human-seed:Bullseye', ['Nick', 'Bullseye']);
    assert.ok(human.some(message => !message.system && message.name === 'Bullseye'), 'human demo seed remains available');
  });
  await check('legacy director and channel NPC messages are reserved for 12 real hours', async () => {
    const roster = createRuntime().roster;
    const fromDirector = 'Bij het strand zoek ik graag schelpen met bijzondere kleuren en vormen.';
    const fromChannel = 'De klimhal heeft deze week nieuwe routes die ik graag wil proberen.';
    const humanText = 'Mijn menselijke bericht hoeft geen tekst voor de NPC’s te reserveren.';
    const unknownText = 'Een onbekende auteur is geen van de vijfentwintig clubkarakters.';
    const session = memoryStorage({
      'dartspoint:npc-director:v1': JSON.stringify({chat: [
        {id: 'old-director', at: 1, room: 'Nederland 1', name: roster[0].nickname, text: fromDirector},
        {id: 'old-human', at: 1, room: 'Nederland 1', name: 'Nick', text: humanText, human: true},
      ]}),
      'dartspoint:chat:v1': JSON.stringify({version: 2, channels: [
        ['private:' + roster[1].nickname, [{id: 2, name: roster[1].nickname, text: fromChannel, time: '00:01'}]],
        ['room:Nederland 1', [{id: 3, name: 'UnknownLegacyUser', text: unknownText, time: '00:01'}]],
      ], drafts: [], openPrivateTabs: []}),
    });
    const runtime = createRuntime({session});
    runtime.guard.initializeNpcTextGuard();
    assert.equal((await output(runtime, {npcId: roster[24].id, candidates: [fromDirector]})).result.sent, false);
    assert.equal((await output(runtime, {npcId: roster[23].id, channel: 'match:new', candidates: [fromChannel]})).result.sent, false);
    assert.equal((await output(runtime, {candidates: [humanText]})).result.sent, true);
    assert.equal((await output(runtime, {candidates: [unknownText]})).result.sent, true);
    const reloaded = createRuntime({storage: runtime.storage});
    assert.equal((await output(reloaded, {candidates: [fromDirector]})).result.sent, false);
    assert.equal((await output(reloaded, {candidates: [fromChannel]})).result.sent, false);
    realNow += runtime.guard.NPC_TEXT_WINDOW_MS + 1;
    assert.equal((await output(reloaded, {candidates: [fromDirector]})).result.sent, true, 'legacy simtime must not expire a reservation immediately');
  });
  await check('legacy texts captured at boot survive an immediate director reset', async () => {
    const roster = createRuntime().roster;
    const text = 'Op een rustige zondag lees ik graag een detective met een verrassend einde.';
    const session = memoryStorage({'dartspoint:npc-director:v1': JSON.stringify({chat: [{name: roster[2].nickname, text, at: 1, room: 'Nederland 1'}]})});
    const runtime = createRuntime({session});
    runtime.guard.initializeNpcTextGuard();
    // The director can replace its saved snapshot before the async locked
    // migration runs. Capturing the visible history must happen synchronously.
    session.setItem('dartspoint:npc-director:v1', JSON.stringify({chat: []}));
    session.setItem('dartspoint:chat:v1', JSON.stringify({version: 2, channels: []}));
    const director = require(path.join(LIB, 'darts-npc.ts'));
    director.initializeNpcDirector(); director.resetNpcDirector();
    const result = await output(runtime, {npcId: roster[3].id, candidates: [text]});
    assert.equal(result.result.sent, false); assert.equal(result.sent.length, 0);
    const reloaded = createRuntime({storage: runtime.storage, session});
    assert.equal((await output(reloaded, {candidates: [text]})).result.sent, false);
  });
  await check('legacy migration merges with an existing ledger without losing booked history', async () => {
    const runtime = createRuntime();
    const booked = 'Tijdens de winter teken ik graag de lichtjes in de oude binnenstad.';
    await output(runtime, {candidates: [booked]});
    const before = JSON.parse(runtime.storage.getItem(STORAGE));
    // Emulate an existing ledger from the guard version before migration was
    // introduced; a completed migration must not replay on later reloads.
    delete before.legacyMigrated;
    runtime.storage.setItem(STORAGE, JSON.stringify(before));
    const legacy = 'Mijn balkon staat vol kruiden die ik gebruik om nieuwe gerechten te koken.';
    const session = memoryStorage({'dartspoint:npc-director:v1': JSON.stringify({chat: [{name: runtime.roster[4].nickname, text: legacy, at: 2, room: 'Nederland 1'}]})});
    const reloaded = createRuntime({storage: runtime.storage, session});
    reloaded.guard.initializeNpcTextGuard();
    assert.equal((await output(reloaded, {candidates: [booked]})).result.sent, false);
    assert.equal((await output(reloaded, {candidates: [legacy]})).result.sent, false);
    const after = JSON.parse(runtime.storage.getItem(STORAGE));
    assert.ok(after.acceptedTotal >= before.acceptedTotal);
    assert.ok(after.entries.some(entry => entry.text === booked));
    assert.ok(after.entries.some(entry => entry.text === legacy));
  });
  await check('completed legacy migration never re-ages stale visible chat', async () => {
    const roster = createRuntime().roster;
    const text = 'Bij zonsopgang maak ik foto’s van de vogels boven de haven.';
    const session = memoryStorage({'dartspoint:npc-director:v1': JSON.stringify({chat: [{name: roster[0].nickname, text, at: 1, room: 'Nederland 1'}]})});
    const runtime = createRuntime({session});
    assert.equal((await output(runtime, {candidates: [text]})).result.sent, false);
    realNow += runtime.guard.NPC_TEXT_WINDOW_MS + 1;
    const reloaded = createRuntime({storage: runtime.storage, session});
    assert.equal((await output(reloaded, {candidates: [text]})).result.sent, true, 'stale simulation history must not renew a completed migration');
  });
  console.log(JSON.stringify({ok: results.every(value => value.passed), checks: results}, null, 2));
  process.exitCode = results.every(value => value.passed) ? 0 : 1;
}
main().catch(error => {console.error(error); process.exitCode = 1;}).finally(() => {Date.now = realDateNow;});
