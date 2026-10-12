import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/lib/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  return nextResolve(specifier, context);
} });
const KEY = "dartspoint:social:v1";
const values = new Map([[KEY, JSON.stringify({ blocked: [], moderation: [], reports: [], queues: { "83626": ["Nick"] } })]]);
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
globalThis.localStorage = storage;
globalThis.window = { localStorage: storage };
const social = await import("../lib/darts-social.ts");

// Previous saved profiles get seed friends without losing existing social data.
assert.deepEqual(social.getDartsSocial().friends, ["Mila", "Bullseye", "Joey180", "Rookie", "Sophie"]);
assert.deepEqual(social.getDartsSocial().queues["83626"], ["Nick"]);
assert.equal(social.friendStatus("Nick"), "self");
assert.equal(social.sendFriendRequest("Nick").ok, false);
assert.equal(social.sendFriendRequest("  ").ok, false);
assert.equal(social.sendFriendRequest("Mila").ok, false);
assert.equal(social.friendStatus("TripleKim"), "incoming");
assert.equal(social.cancelFriendRequest("TripleKim").ok, false);
assert.equal(social.acceptFriendRequest("TripleKim").ok, true);
assert.equal(social.acceptFriendRequest("TripleKim").ok, false);
assert.equal(social.isFriend("TripleKim"), true);
assert.equal(social.canReceivePrivate("TripleKim", "friends", false), true);

assert.equal(social.sendFriendRequest("DoubleOut").ok, true);
assert.equal(social.friendStatus("DoubleOut"), "outgoing");
assert.equal(social.isFriend("DoubleOut"), false, "Sending never silently accepts");
assert.equal(social.acceptFriendRequest("DoubleOut").ok, false, "Only an incoming request is self-accepted");
assert.equal(social.sendFriendRequest("DoubleOut").ok, false);
assert.equal(social.canReceivePrivate("DoubleOut", "friends", false), false);
assert.equal(social.cancelFriendRequest("DoubleOut").ok, true);
assert.equal(social.friendStatus("DoubleOut"), "none");
assert.equal(social.sendFriendRequest("DoubleOut").ok, true);
assert.equal(social.simulateFriendAcceptance("DoubleOut").ok, true);
assert.equal(social.friendStatus("DoubleOut"), "friends");
assert.equal(social.simulateFriendAcceptance("DoubleOut").ok, false);

assert.equal(social.removeFriend("Mila").ok, true);
assert.equal(social.isFriend("Mila"), false);
assert.equal(social.canReceivePrivate("Mila", "friends", false), false, "Seed name must not bypass removed friendship");
assert.equal(social.canReceivePrivate("Mila", "everyone", false), true);
assert.equal(social.canReceivePrivate("Mila", "friends", true), true, "Existing conversations retain their separate privacy rule");
assert.equal(social.canReceivePrivate("Mila", "nobody", false), false);

assert.equal(social.togglePersonalMute("Nick").ok, false);
assert.equal(social.togglePersonalMute("Bullseye").ok, true);
assert.equal(social.isPersonallyMuted("Bullseye"), true);
assert.equal(social.isFriend("Bullseye"), true, "Personal mute preserves friendship");
assert.equal(social.canReceivePrivate("Bullseye", "everyone", true), false);
assert.equal(social.isRoomMuted("Bullseye", "Nederland 1"), false, "Personal mute is not moderation");
assert.equal(social.togglePersonalMute("Bullseye").ok, true);
assert.equal(social.canReceivePrivate("Bullseye", "friends", true), true);
assert.equal(social.sendFriendRequest("NightOwl").ok, true);
social.toggleBlocked("NightOwl");
assert.equal(social.friendStatus("NightOwl"), "none", "Blocking cancels pending contact requests");
assert.equal(social.sendFriendRequest("NightOwl").ok, false);
assert.equal(social.canReceivePrivate("NightOwl", "everyone", true), false);
social.toggleBlocked("NightOwl");
assert.equal(social.canReceivePrivate("NightOwl", "everyone", false), true);

// Moderator actions enforce role, target protection, concrete reason and bounded duration.
assert.equal(social.canModeratePlayer("Nick", "Nederland 1", "Mila"), false);
assert.equal(social.canModeratePlayer("Mila", "Nederland 1", "Mila"), false);
assert.equal(social.canModeratePlayer("Rookie", "Nederland 1", "DoubleOut"), false);
assert.equal(social.canModeratePlayer("Rookie", "Nederland 1", "Mila"), true);
assert.equal(social.moderationAction({ name: "Rookie", room: "Nederland 1", kind: "mute", actor: "DoubleOut", reason: "Repeated spam", minutes: 10 }), false);
assert.equal(social.moderationAction({ name: "Rookie", room: "Nederland 1", kind: "mute", reason: "Spam", minutes: 10 }), false);
assert.equal(social.moderationAction({ name: "Rookie", room: "Nederland 1", kind: "mute", reason: "Repeated spam", minutes: 0 }), false);
assert.equal(social.moderationAction({ name: "Rookie", room: "Nederland 1", kind: "mute", reason: "Repeated spam", minutes: 10 }), true);
assert.equal(social.isRoomMuted("Rookie", "Nederland 1"), true);
assert.equal(social.isRoomMuted("Rookie", "Afterhours"), false);
assert.equal(social.isPersonallyMuted("Rookie"), false);
const sanction = social.getDartsSocial().moderation.at(-1);
assert.equal(social.isRoomMuted("Rookie", "Nederland 1", sanction.until + 1), false);
assert.equal(social.revokeModeration(sanction.id, "DoubleOut"), false);
assert.equal(social.revokeModeration(sanction.id), true);
assert.equal(social.isRoomMuted("Rookie", "Nederland 1"), false);

const restored = await import("../lib/darts-social.ts?restore=1");
assert.deepEqual(restored.getDartsSocial(), social.getDartsSocial());
assert.equal(restored.isFriend("Mila"), false, "Removed seed friendships stay removed after reload");
assert.equal(restored.getPlayerPresence("Sophie").online, false);
assert.equal(restored.getPlayerPresence("Joey180").room, "Afterhours");
assert.equal(restored.getPlayerPresence("Unknown contact").online, false);

// Rejected requests and explicitly emptied friend lists must not resurrect on reload.
values.set(KEY, JSON.stringify({ ...social.getDartsSocial(), friends: [], friendRequests: [{ id: "incoming-test", name: "FreshDart", direction: "incoming", createdAt: Date.now() }] }));
const empty = await import("../lib/darts-social.ts?empty=1");
assert.equal(empty.getDartsSocial().friends.length, 0);
assert.equal(empty.rejectFriendRequest("FreshDart").ok, true);
const afterRejection = await import("../lib/darts-social.ts?rejection=1");
assert.equal(afterRejection.getDartsSocial().friendRequests.length, 0);
assert.equal(afterRejection.getDartsSocial().friends.length, 0);
console.log("Friends checks passed: legacy migration, request lifecycle/idempotency, explicit acceptance, dynamic privacy, personal mute versus room moderation, role/owner protection and persisted restoration.");
