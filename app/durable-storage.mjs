/**
 * Small synchronous key-value store for user progress and preferences.
 *
 * On the web it is the browser's localStorage. In the installed app the mobile
 * entry hydrates it from native storage (Android SharedPreferences, iOS
 * UserDefaults) before the first render and writes every change back, so
 * progress survives WebView storage clean-ups and app restarts.
 *
 * @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void }} KeyValueStore
 * @typedef {{
 *   keys(): Promise<{ keys: string[] }>,
 *   get(options: { key: string }): Promise<{ value: string | null }>,
 *   set(options: { key: string, value: string }): Promise<void>,
 *   remove(options: { key: string }): Promise<void>,
 * }} NativePreferences
 */

export const DURABLE_KEY_PREFIX = "twnc-";

/** @type {KeyValueStore} */
const browserStore = {
  getItem: key => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
  removeItem: key => globalThis.localStorage.removeItem(key),
};

/** @type {KeyValueStore} */
let active = browserStore;

export function durableStorage() {
  return active;
}

/** @param {KeyValueStore | null} store */
export function setDurableStorage(store) {
  active = store ?? browserStore;
}

/**
 * Loads app keys from native preferences into memory. Keys that only exist in
 * the WebView's localStorage (for example progress saved by the Stage 1 build)
 * are copied to native storage once, so nothing already earned is lost.
 *
 * @param {NativePreferences} preferences
 * @param {{ fallback?: Pick<Storage, "length" | "key" | "getItem"> | null, onError?: (error: unknown) => void }} [options]
 * @returns {Promise<KeyValueStore>}
 */
export async function createNativeStore(preferences, { fallback = null, onError = () => {} } = {}) {
  /** @type {Map<string, string>} */
  const values = new Map();
  const { keys } = await preferences.keys();
  const appKeys = keys.filter(key => key.startsWith(DURABLE_KEY_PREFIX));
  const loaded = await Promise.all(appKeys.map(async key => [key, (await preferences.get({ key })).value])) ;
  for (const [key, value] of loaded) if (typeof value === "string") values.set(key, value);

  /** @param {Promise<void>} write */
  const persist = write => { write.catch(onError); };

  if (fallback) {
    for (let index = 0; index < fallback.length; index += 1) {
      const key = fallback.key(index);
      if (!key?.startsWith(DURABLE_KEY_PREFIX) || values.has(key)) continue;
      const value = fallback.getItem(key);
      if (value === null) continue;
      values.set(key, value);
      persist(preferences.set({ key, value }));
    }
  }

  return {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      const text = String(value);
      values.set(key, text);
      persist(preferences.set({ key, value: text }));
    },
    removeItem(key) {
      values.delete(key);
      persist(preferences.remove({ key }));
    },
  };
}
