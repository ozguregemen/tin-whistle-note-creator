import { frequencyForWhistleNote } from "./practice.mjs";
import {
  base64AudioBuffer,
  midiForWhistleNote,
  playbackRateForMidi,
  sampleZoneForMidi,
  soundfontLoopForZone,
  soundfontTriggerMidiForAudibleMidi,
  soundfontZoneForMidi,
  WHISTLE_SAMPLE_ZONES,
  WHISTLE_SOUNDFONT,
} from "./whistle-sampler.mjs";

/**
 * Framework-free tin whistle voice shared by the mobile shell.
 * It uses the same assets and fallback order as the web practice player:
 * GeneralUser GS soundfont, then the CC BY-SA WAV zones, then a sine tone.
 *
 * @typedef {"soundfont" | "samples" | "oscillator"} WhistleVoice
 * @typedef {{ pitch: string, octave: number }} WrittenNote
 */

/** @param {string} src @returns {Promise<void>} */
function injectScript(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find(script => script.src === src);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error(`Could not load ${src}`)), { once: true });
    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.append(script);
    }
  });
}

/**
 * @param {{
 *   context: BaseAudioContext,
 *   baseUrl?: string,
 *   loadScript?: (src: string) => Promise<void>,
 *   fetchImpl?: typeof fetch,
 *   globals?: Record<string, any>,
 *   decode?: (encoded: string) => string,
 * }} options
 */
export function createWhistlePlayer({
  context,
  baseUrl = globalThis.document?.baseURI ?? "",
  loadScript = injectScript,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  globals = globalThis,
  decode = globalThis.atob,
}) {
  /** @type {any[]} */
  let soundfontZones = [];
  /** @type {Map<number, AudioBuffer>} */
  let sampleBuffers = new Map();
  /** @type {WhistleVoice} */
  let voice = "oscillator";
  /** @type {Promise<WhistleVoice> | null} */
  let loading = null;

  async function loadSoundfont() {
    let preset = globals[WHISTLE_SOUNDFONT.globalName];
    if (!preset) {
      await loadScript(new URL(WHISTLE_SOUNDFONT.file, baseUrl).href);
      preset = globals[WHISTLE_SOUNDFONT.globalName];
    }
    if (!preset?.zones?.length) throw new Error("Whistle soundfont did not register its preset");
    return Promise.all(preset.zones.map(async (/** @type {any} */ zone) => {
      const encoded = base64AudioBuffer(zone.file, decode);
      if (!encoded) throw new Error("Whistle soundfont zone is empty");
      return { ...zone, buffer: await context.decodeAudioData(encoded) };
    }));
  }

  async function loadSamples() {
    const entries = await Promise.all(WHISTLE_SAMPLE_ZONES.map(async zone => {
      const response = await fetchImpl(new URL(zone.file, baseUrl).href);
      if (!response.ok) throw new Error(`Whistle sample returned ${response.status}`);
      return /** @type {const} */ ([zone.rootMidi, await context.decodeAudioData(await response.arrayBuffer())]);
    }));
    return new Map(entries);
  }

  /** @returns {Promise<WhistleVoice>} */
  function load() {
    if (voice !== "oscillator") return Promise.resolve(voice);
    loading ??= (async () => {
      try {
        soundfontZones = await loadSoundfont();
        voice = "soundfont";
      } catch {
        try {
          sampleBuffers = await loadSamples();
          voice = "samples";
        } catch {
          voice = "oscillator";
        }
      }
      loading = null;
      return voice;
    })();
    return loading;
  }

  /**
   * Plays a written D-whistle note. Written E4 sounds as E5.
   * @param {WrittenNote} note
   * @param {{ at?: number, duration?: number, gain?: number }} [timing]
   */
  function play(note, timing = {}) {
    const start = timing.at ?? context.currentTime;
    const duration = Math.max(0.08, timing.duration ?? 0.5);
    const end = start + duration;
    const audibleMidi = midiForWhistleNote(note.pitch, note.octave);
    const triggerMidi = soundfontTriggerMidiForAudibleMidi(audibleMidi, WHISTLE_SOUNDFONT.soundingOffsetSemitones);
    const soundfontZone = soundfontZoneForMidi(triggerMidi, soundfontZones);
    const legacyZone = sampleZoneForMidi(audibleMidi);
    const legacyBuffer = legacyZone ? sampleBuffers.get(legacyZone.rootMidi) : undefined;
    const output = context.createGain();
    /** @type {AudioScheduledSourceNode} */
    let source;
    let peak;
    /** @type {WhistleVoice} */
    let used;

    if (soundfontZone?.buffer && triggerMidi !== null) {
      const sample = context.createBufferSource();
      const loop = soundfontLoopForZone(soundfontZone);
      sample.buffer = soundfontZone.buffer;
      sample.playbackRate.setValueAtTime(playbackRateForMidi(triggerMidi, soundfontZone), start);
      if (loop) {
        sample.loop = true;
        sample.loopStart = loop.start;
        sample.loopEnd = loop.end;
      }
      source = sample;
      peak = 0.58;
      used = "soundfont";
    } else if (legacyBuffer && legacyZone && audibleMidi !== null) {
      const sample = context.createBufferSource();
      sample.buffer = legacyBuffer;
      sample.playbackRate.setValueAtTime(playbackRateForMidi(audibleMidi, legacyZone.rootMidi), start);
      source = sample;
      peak = 0.72;
      used = "samples";
    } else {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequencyForWhistleNote(note.pitch, note.octave), start);
      source = oscillator;
      peak = 0.16;
      used = "oscillator";
    }

    peak *= timing.gain ?? 1;
    const release = Math.min(0.06, duration / 3);
    output.gain.setValueAtTime(0.0001, start);
    output.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    output.gain.setValueAtTime(peak, end - release);
    output.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(output);
    output.connect(context.destination);
    source.start(start);
    source.stop(end + 0.01);

    let stopped = false;
    source.addEventListener("ended", () => {
      stopped = true;
      source.disconnect();
      output.disconnect();
    }, { once: true });

    return {
      voice: used,
      audibleMidi,
      endsAt: end,
      stop() {
        if (stopped) return;
        const now = context.currentTime;
        output.gain.cancelScheduledValues(now);
        output.gain.setValueAtTime(Math.max(0.0001, output.gain.value), now);
        output.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
        try { source.stop(now + 0.04); } catch { /* Already stopped. */ }
      },
    };
  }

  return {
    load,
    play,
    get voice() { return voice; },
  };
}
