/**
 * Settings that differ between the web build and the installed mobile app.
 * The web entry points never call configureRuntime, so web behavior keeps
 * these defaults. The mobile entry configures them before the first render.
 *
 * @typedef {{
 *   platform: "web" | "android" | "ios",
 *   bundledSongs: readonly any[],
 *   youtubeAudio: boolean,
 *   pauseWhenHidden: boolean,
 * }} RuntimeConfig
 */

/** @type {RuntimeConfig} */
const DEFAULTS = Object.freeze({
  platform: "web",
  bundledSongs: Object.freeze([]),
  // YouTube MP3 download stays available on the web when the audio service allows it.
  youtubeAudio: true,
  pauseWhenHidden: false,
});

/** @type {RuntimeConfig} */
let current = DEFAULTS;

/** @param {Partial<RuntimeConfig>} settings */
export function configureRuntime(settings) {
  current = Object.freeze({ ...current, ...settings });
  return current;
}

export function runtimeConfig() {
  return current;
}

export function resetRuntimeConfig() {
  current = DEFAULTS;
}

export function isNativeApp() {
  return current.platform !== "web";
}
