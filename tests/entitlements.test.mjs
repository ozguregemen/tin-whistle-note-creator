import assert from "node:assert/strict";
import test from "node:test";
import { createEntitlements, dayKey, ENTITLEMENTS_KEY, FREE_LIMITS, monthKey } from "../app/entitlements.mjs";

function memoryStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

function setup({ start = new Date(2026, 10, 23, 10, 0).getTime(), storage = memoryStore() } = {}) {
  let time = start;
  const entitlements = createEntitlements({ storage, now: () => time });
  return { entitlements, storage, advance: ms => { time += ms; }, setTime: value => { time = value; } };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test("day and month keys use the local calendar", () => {
  const late = new Date(2026, 0, 31, 23, 59).getTime();
  assert.equal(dayKey(late), "2026-01-31");
  assert.equal(monthKey(late), "2026-01");
  assert.equal(dayKey(late + 2 * 60 * 1000), "2026-02-01");
});

test("the first eight lessons are free and the rest need premium", () => {
  const { entitlements } = setup();
  assert.equal(FREE_LIMITS.freeLessons, 8);
  assert.equal(entitlements.lessonAccess(0, "first-b"), "free");
  assert.equal(entitlements.lessonAccess(7, "twinkle-twinkle"), "free");
  assert.equal(entitlements.lessonAccess(8, "steady-beat"), "locked");
  entitlements.grantPremium({ plan: "lifetime", productId: "premium_lifetime" });
  assert.equal(entitlements.lessonAccess(23, "last"), "premium");
});

test("a rewarded unlock opens one lesson for 24 hours", () => {
  const { entitlements, advance } = setup();
  entitlements.unlockLesson("steady-beat");
  assert.equal(entitlements.lessonAccess(8, "steady-beat"), "unlocked");
  assert.equal(entitlements.lessonAccess(9, "c-sharp"), "locked");
  advance(23 * HOUR);
  assert.equal(entitlements.lessonAccess(8, "steady-beat"), "unlocked");
  advance(2 * HOUR);
  assert.equal(entitlements.lessonAccess(8, "steady-beat"), "locked");
});

test("free users follow three different songs a day; repeats are free", () => {
  const { entitlements, advance } = setup();
  assert.deepEqual(entitlements.useSongFollow("a"), { allowed: true, used: 1, limit: 3 });
  assert.deepEqual(entitlements.useSongFollow("a"), { allowed: true, used: 1, limit: 3 });
  entitlements.useSongFollow("b");
  entitlements.useSongFollow("c");
  assert.deepEqual(entitlements.peekSongFollow("d"), { allowed: false, used: 3, limit: 3 });
  assert.deepEqual(entitlements.useSongFollow("d"), { allowed: false, used: 3, limit: 3 });
  assert.equal(entitlements.peekSongFollow("b").allowed, true);

  entitlements.grantSongFollow();
  assert.deepEqual(entitlements.useSongFollow("d"), { allowed: true, used: 4, limit: 4 });
  assert.equal(entitlements.peekSongFollow("e").allowed, false);

  advance(DAY);
  assert.deepEqual(entitlements.peekSongFollow("e"), { allowed: true, used: 0, limit: 3 });
});

test("premium follows any number of songs", () => {
  const { entitlements } = setup();
  entitlements.grantPremium({ plan: "yearly", productId: "premium", expiresAt: Date.now() * 2 });
  for (const song of ["a", "b", "c", "d", "e"]) assert.equal(entitlements.useSongFollow(song).allowed, true);
});

test("transcriptions: three a month, counted only when recorded, ad bonus adds one", () => {
  const { entitlements, setTime } = setup();
  assert.deepEqual(entitlements.peekTranscription(), { allowed: true, used: 0, limit: 3 });
  entitlements.recordTranscription();
  entitlements.recordTranscription();
  entitlements.recordTranscription();
  assert.deepEqual(entitlements.peekTranscription(), { allowed: false, used: 3, limit: 3 });
  entitlements.grantTranscription();
  assert.deepEqual(entitlements.peekTranscription(), { allowed: true, used: 3, limit: 4 });

  setTime(new Date(2026, 11, 1, 9, 0).getTime());
  assert.deepEqual(entitlements.peekTranscription(), { allowed: true, used: 0, limit: 3 });
});

test("premium transcriptions have a fair-use ceiling", () => {
  const { entitlements } = setup();
  entitlements.grantPremium({ plan: "lifetime", productId: "premium_lifetime" });
  assert.deepEqual(entitlements.peekTranscription(), { allowed: true, used: 0, limit: 100 });
});

test("a subscription stays active a week past expiry without a new check, then lapses", () => {
  const { entitlements, advance } = setup();
  entitlements.grantPremium({ plan: "monthly", productId: "premium", expiresAt: new Date(2026, 10, 24).getTime() });
  assert.equal(entitlements.isPremium(), true);
  advance(6 * DAY);
  assert.equal(entitlements.isPremium(), true);
  advance(2 * DAY);
  assert.equal(entitlements.isPremium(), false);
});

test("lifetime never expires and revoking removes any plan", () => {
  const { entitlements, advance } = setup();
  entitlements.grantPremium({ plan: "lifetime", productId: "premium_lifetime", expiresAt: 5 });
  assert.equal(entitlements.premium()?.expiresAt, null);
  advance(3650 * DAY);
  assert.equal(entitlements.isPremium(), true);
  entitlements.revokePremium();
  assert.equal(entitlements.isPremium(), false);
});

test("state survives a restart and malformed data falls back to free", () => {
  const storage = memoryStore();
  const first = setup({ storage });
  first.entitlements.useSongFollow("a");
  first.entitlements.grantPremium({ plan: "lifetime", productId: "premium_lifetime" });
  const second = setup({ storage });
  assert.equal(second.entitlements.isPremium(), true);
  assert.equal(second.entitlements.peekSongFollow("b").used, 1);

  for (const raw of ["not json", "null", JSON.stringify({ premium: { plan: "forever", productId: 1 } })]) {
    const broken = setup({ storage: memoryStore({ [ENTITLEMENTS_KEY]: raw }) });
    assert.equal(broken.entitlements.isPremium(), false);
    assert.deepEqual(broken.entitlements.peekSongFollow("a"), { allowed: true, used: 0, limit: 3 });
  }
});

test("listeners hear every change and storage failures keep the session working", () => {
  const failing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } };
  const { entitlements } = setup({ storage: failing });
  let calls = 0;
  const stop = entitlements.subscribe(() => { calls += 1; });
  entitlements.useSongFollow("a");
  entitlements.grantTranscription();
  stop();
  entitlements.useSongFollow("b");
  assert.equal(calls, 2);
  assert.equal(entitlements.peekSongFollow("c").used, 2);
});

test("unknown plans are rejected", () => {
  const { entitlements } = setup();
  assert.throws(() => entitlements.grantPremium({ plan: "weekly", productId: "x" }), /Unknown plan/);
});
