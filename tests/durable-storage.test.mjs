import assert from "node:assert/strict";
import test from "node:test";
import { createNativeStore, durableStorage, setDurableStorage } from "../app/durable-storage.mjs";
import { completedTutorialLessons, TUTORIAL_PROGRESS_PREFIX } from "../app/tutorial-curriculum.mjs";

function fakePreferences(initial = {}) {
  const data = new Map(Object.entries(initial));
  const writes = [];
  return {
    data,
    writes,
    keys: async () => ({ keys: [...data.keys()] }),
    get: async ({ key }) => ({ value: data.get(key) ?? null }),
    set: async ({ key, value }) => { writes.push(["set", key, value]); data.set(key, value); },
    remove: async ({ key }) => { writes.push(["remove", key]); data.delete(key); },
  };
}

function fakeLocalStorage(entries) {
  const keys = Object.keys(entries);
  return { length: keys.length, key: index => keys[index] ?? null, getItem: key => entries[key] ?? null };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test("lesson progress saved natively survives a restart with an empty WebView storage", async () => {
  const preferences = fakePreferences();
  const first = await createNativeStore(preferences);
  first.setItem(`${TUTORIAL_PROGRESS_PREFIX}first-b`, "1");
  first.setItem("unrelated-key", "ignored on reload");
  await settle();

  const reopened = await createNativeStore(preferences, { fallback: fakeLocalStorage({}) });
  assert.deepEqual(completedTutorialLessons(reopened), ["first-b"]);
  assert.equal(reopened.getItem("unrelated-key"), null);
});

test("progress that only exists in WebView storage is copied into native storage once", async () => {
  const preferences = fakePreferences({ [`${TUTORIAL_PROGRESS_PREFIX}b-to-a`]: "1" });
  const store = await createNativeStore(preferences, {
    fallback: fakeLocalStorage({
      [`${TUTORIAL_PROGRESS_PREFIX}first-b`]: "1",
      [`${TUTORIAL_PROGRESS_PREFIX}b-to-a`]: "0",
      "other-site-key": "x",
    }),
  });
  await settle();
  assert.deepEqual(completedTutorialLessons(store), ["first-b", "b-to-a"]);
  // Native data wins over the older WebView copy; foreign keys are not imported.
  assert.deepEqual(preferences.writes, [["set", `${TUTORIAL_PROGRESS_PREFIX}first-b`, "1"]]);
});

test("removing a key removes it from native storage and failed writes are reported", async () => {
  const preferences = fakePreferences({ "twnc-language": "tr" });
  const errors = [];
  const store = await createNativeStore({ ...preferences, set: async () => { throw new Error("disk full"); } }, { onError: error => errors.push(error.message) });
  store.removeItem("twnc-language");
  store.setItem("twnc-language", "en");
  await settle();
  assert.equal(store.getItem("twnc-language"), "en");
  assert.equal(preferences.data.has("twnc-language"), false);
  assert.deepEqual(errors, ["disk full"]);
});

test("the active store can be swapped and restored", async () => {
  const memory = new Map();
  setDurableStorage({ getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) });
  durableStorage().setItem("twnc-language", "tr");
  assert.equal(memory.get("twnc-language"), "tr");
  setDurableStorage(null);
  assert.notEqual(durableStorage().getItem, undefined);
});
