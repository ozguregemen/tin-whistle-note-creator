import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import bundledCatalog from "../catalog/catalog.json";
import { fingeringFor } from "../app/fingerings.mjs";
import { PracticeMicrophone } from "../app/practice-microphone";
import { buildTutorialSteps, TUTORIAL_LESSONS } from "../app/tutorial-curriculum.mjs";
import { createWhistlePlayer, type WhistleVoice } from "../app/whistle-player.mjs";

type Language = "en" | "tr";
type LogEntry = { at: string; text: string };
type Check = { label: string; status: "pending" | "ok" | "fail"; detail: string };
type MicMode = "free" | "lesson";

const SOURCE_API_URL = "https://tin-whistle-note-source-api.ozguregemenbusiness.workers.dev";
const COMMUNITY_API_URL = "https://tin-whistle-community.ozguregemenbusiness.workers.dev";
const LANGUAGE_KEY = "twnc-language";
const SOLFEGE: Record<string, string> = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };
const WRITTEN_NOTES = [
  ["D", 4], ["E", 4], ["F#", 4], ["G", 4], ["A", 4], ["B", 4], ["C#", 5],
  ["D", 5], ["E", 5], ["F#", 5], ["G", 5], ["A", 5], ["B", 5],
] as const;
const SCALE = WRITTEN_NOTES.slice(0, 8);
const FIRST_LESSON = TUTORIAL_LESSONS[0];
const FIRST_LESSON_STEPS = buildTutorialSteps(FIRST_LESSON);

const COPY = {
  en: {
    title: "Tin Whistle Note Creator",
    subtitle: "Android prototype · Stage 1",
    language: "Türkçe",
    languageLabel: "Switch language to Turkish",
    soundTitle: "The app's tin whistle sound",
    soundHint: "Tap a note. Written for high D: written E4 sounds as E5.",
    voice: { soundfont: "Tin whistle soundfont", samples: "Tin whistle WAV samples", oscillator: "Fallback tone (samples did not load)" } as Record<WhistleVoice, string>,
    voiceLoading: "Loading tin whistle sound…",
    voiceIdle: "Sound loads on first tap.",
    playScale: "Play D scale",
    stopScale: "Stop",
    micTitle: "Microphone",
    free: "Free play",
    lesson: "Lesson 1 follow",
    lessonHint: "Lesson 1 asks for three separate B notes. One long B should count only once.",
    diagnostics: "Device check",
    runChecks: "Run checks",
    log: "Event log",
    copyLog: "Copy log",
    copied: "Copied",
    online: "Online",
    offline: "Offline",
    songs: "songs",
  },
  tr: {
    title: "Tin Whistle Note Creator",
    subtitle: "Android prototipi · Aşama 1",
    language: "English",
    languageLabel: "Dili İngilizceye çevir",
    soundTitle: "Uygulamanın tin whistle sesi",
    soundHint: "Bir notaya dokun. Yüksek Re yazımı: yazılı E4, E5 olarak duyulur.",
    voice: { soundfont: "Tin whistle soundfont", samples: "Tin whistle WAV örnekleri", oscillator: "Yedek ton (örnekler yüklenemedi)" } as Record<WhistleVoice, string>,
    voiceLoading: "Tin whistle sesi yükleniyor…",
    voiceIdle: "Ses ilk dokunuşta yüklenir.",
    playScale: "Re gamını çal",
    stopScale: "Durdur",
    micTitle: "Mikrofon",
    free: "Serbest çalma",
    lesson: "1. ders takibi",
    lessonHint: "1. ders üç ayrı Si ister. Tek uzun Si yalnızca bir kez sayılmalı.",
    diagnostics: "Cihaz kontrolü",
    runChecks: "Kontrolleri çalıştır",
    log: "Olay kaydı",
    copyLog: "Kaydı kopyala",
    copied: "Kopyalandı",
    online: "Çevrimiçi",
    offline: "Çevrimdışı",
    songs: "şarkı",
  },
};

function initialLanguage(): Language {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_KEY);
    if (saved === "en" || saved === "tr") return saved;
  } catch { /* Storage may be unavailable. */ }
  return navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

function noteLabel(pitch: string, octave: number) {
  const sharp = pitch.endsWith("#");
  return { solfege: `${SOLFEGE[pitch[0]]}${sharp ? "♯" : ""}`, code: `${pitch.replace("#", "♯")}${octave}` };
}

function Holes({ pattern }: { pattern: string | null }) {
  return (
    <span className="mobile-note-holes" aria-hidden="true">
      {(pattern ?? "000000").split("").map((mark, index) => (
        <span key={index} className={`hole ${mark === "1" ? "closed" : mark === "h" ? "half" : "open"}`} />
      ))}
    </span>
  );
}

async function checkFetch(url: string, init?: RequestInit) {
  const started = performance.now();
  const response = await fetch(url, { cache: "no-store", ...init });
  const elapsed = Math.round(performance.now() - started);
  return { response, elapsed };
}

export function MobilePrototype() {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const copy = COPY[language];
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  const [voice, setVoice] = useState<WhistleVoice | "loading" | "idle">("idle");
  const [activeNote, setActiveNote] = useState<number | null>(null);
  const [scalePlaying, setScalePlaying] = useState(false);
  const [micMode, setMicMode] = useState<MicMode>("free");
  const [micRun, setMicRun] = useState(0);
  const [checks, setChecks] = useState<Check[]>([]);
  const [log, setLog] = useState<LogEntry[]>(() => [{
    at: new Date().toLocaleTimeString("tr-TR", { hour12: false }),
    text: `Start · ${Capacitor.getPlatform()} · ${navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] ?? navigator.userAgent}`,
  }]);
  const [copied, setCopied] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const contextRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<ReturnType<typeof createWhistlePlayer> | null>(null);
  const scaleRef = useRef<{ notes: { stop(): void }[]; frame?: number } | null>(null);

  const addLog = useCallback((text: string) => {
    const at = new Date().toLocaleTimeString("tr-TR", { hour12: false });
    setLog(entries => [{ at, text }, ...entries].slice(0, 60));
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    try { window.localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Keep it for this visit. */ }
  }, [language]);

  useEffect(() => {
    const onVisibility = () => {
      const shown = document.visibilityState !== "hidden";
      setVisible(shown);
      addLog(`visibility: ${document.visibilityState}`);
      if (!shown) void contextRef.current?.suspend().catch(() => {});
    };
    const onNetwork = () => { setOnline(navigator.onLine); addLog(navigator.onLine ? "network: online" : "network: offline"); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    const appState = Capacitor.isNativePlatform()
      ? CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        addLog(`app: ${isActive ? "foreground" : "background"}`);
        // Release the microphone and silence the player when the app leaves the screen.
        if (!isActive) {
          setVisible(false);
          void contextRef.current?.suspend().catch(() => {});
        } else {
          setVisible(document.visibilityState !== "hidden");
        }
      })
      : null;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
      void appState?.then(handle => handle.remove());
    };
  }, [addLog]);

  async function ensurePlayer() {
    let context = contextRef.current;
    if (!context || context.state === "closed") {
      context = new AudioContext();
      contextRef.current = context;
      const created = context;
      created.addEventListener("statechange", () => addLog(`player AudioContext: ${created.state}`));
      playerRef.current = createWhistlePlayer({ context });
      addLog(`player AudioContext: ${context.sampleRate} Hz, base latency ${Math.round((context.baseLatency ?? 0) * 1000)} ms`);
    }
    if (context.state !== "running") await context.resume();
    const player = playerRef.current!;
    if (player.voice === "oscillator") {
      setVoice("loading");
      const loaded = await player.load();
      setVoice(loaded);
      addLog(`whistle voice: ${loaded}`);
    }
    return { context, player };
  }

  function stopScale() {
    const scale = scaleRef.current;
    scaleRef.current = null;
    if (!scale) return;
    if (scale.frame !== undefined) cancelAnimationFrame(scale.frame);
    scale.notes.forEach(note => note.stop());
    setActiveNote(null);
    setScalePlaying(false);
  }

  async function playNote(index: number) {
    stopScale();
    try {
      const { player } = await ensurePlayer();
      const [pitch, octave] = WRITTEN_NOTES[index];
      player.play({ pitch, octave }, { duration: 0.7 });
      setActiveNote(index);
      window.setTimeout(() => setActiveNote(current => (current === index ? null : current)), 700);
    } catch (error) {
      addLog(`play failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function playScale() {
    if (scaleRef.current) { stopScale(); return; }
    try {
      const { context, player } = await ensurePlayer();
      const beat = 60 / 100;
      const begin = context.currentTime + 0.08;
      const starts = SCALE.map((_, index) => begin + index * beat);
      const scale: { notes: { stop(): void }[]; frame?: number } = {
        notes: SCALE.map(([pitch, octave], index) => player.play({ pitch, octave }, { at: starts[index], duration: beat * 0.9 })),
      };
      scaleRef.current = scale;
      setScalePlaying(true);
      const follow = () => {
        if (scaleRef.current !== scale) return;
        // Follow the audio clock so the highlight stays with the sound.
        const now = context.currentTime;
        if (now > starts[starts.length - 1] + beat) { stopScale(); return; }
        let index = -1;
        while (index + 1 < starts.length && starts[index + 1] <= now) index += 1;
        setActiveNote(index >= 0 ? index : null);
        scale.frame = requestAnimationFrame(follow);
      };
      scale.frame = requestAnimationFrame(follow);
    } catch (error) {
      addLog(`scale failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function runChecks() {
    const results: Check[] = [];
    const push = (check: Check) => { results.push(check); setChecks([...results]); };
    setChecks([]);
    push({ label: "Platform", status: "ok", detail: `${Capacitor.getPlatform()} · native=${Capacitor.isNativePlatform()} · ${location.origin}` });
    push({ label: "WebView", status: "ok", detail: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] ?? navigator.userAgent });
    const hasAudio = "AudioContext" in window;
    const hasMicrophone = typeof navigator.mediaDevices?.getUserMedia === "function";
    push({
      label: "Web Audio / getUserMedia",
      status: hasAudio && hasMicrophone ? "ok" : "fail",
      detail: `AudioContext=${hasAudio} · getUserMedia=${hasMicrophone} · secure=${window.isSecureContext}`,
    });
    push({ label: "Paketli katalog / Bundled catalog", status: bundledCatalog.songs?.length ? "ok" : "fail", detail: `${bundledCatalog.songs?.length ?? 0} ${copy.songs}` });

    const assets = [
      "audio/tin-whistle/0780_GeneralUserGS_sf2_file.js",
      "audio/tin-whistle/81_v0-127_rr1.wav",
      "audio/tin-whistle/85_v0-127_rr1.wav",
      "models/basic-pitch/model.json",
      "models/basic-pitch/group1-shard1of1.bin",
    ];
    for (const asset of assets) {
      try {
        const { response, elapsed } = await checkFetch(new URL(asset, document.baseURI).href);
        const size = (await response.arrayBuffer()).byteLength;
        push({ label: asset, status: response.ok && size > 0 ? "ok" : "fail", detail: `${response.status} · ${(size / 1024).toFixed(0)} KB · ${elapsed} ms` });
      } catch (error) {
        push({ label: asset, status: "fail", detail: error instanceof Error ? error.message : String(error) });
      }
    }

    const services = [
      { label: "Source API GET /health", url: `${SOURCE_API_URL}/health` },
      { label: "Community API GET /songs", url: `${COMMUNITY_API_URL}/api/community/songs?q=&offset=0` },
    ];
    for (const service of services) {
      try {
        const { response, elapsed } = await checkFetch(service.url, { credentials: "omit" });
        push({ label: service.label, status: response.ok ? "ok" : "fail", detail: `HTTP ${response.status} · ${elapsed} ms · origin ${location.origin}` });
      } catch (error) {
        push({
          label: service.label,
          status: "fail",
          detail: `${navigator.onLine ? "CORS/Origin blocked or unreachable" : "offline"} · origin ${location.origin} · ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    addLog(`checks: ${results.filter(check => check.status === "ok").length}/${results.length} ok`);
  }

  async function copyLog() {
    const text = [
      ...checks.map(check => `[${check.status}] ${check.label}: ${check.detail}`),
      ...[...log].reverse().map(entry => `${entry.at} ${entry.text}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      addLog("clipboard unavailable");
    }
  }

  const voiceText = voice === "idle" ? copy.voiceIdle : voice === "loading" ? copy.voiceLoading : copy.voice[voice];

  return (
    <main className="mobile-shell">
      <header className="mobile-header">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <button type="button" className="mobile-chip" aria-label={copy.languageLabel} onClick={() => setLanguage(language === "tr" ? "en" : "tr")}>
          {copy.language}
        </button>
      </header>

      <section className="mobile-card" aria-labelledby="mobile-sound-title">
        <div className="mobile-card-head">
          <h2 id="mobile-sound-title">{copy.soundTitle}</h2>
          <p role="status" className={`mobile-voice mobile-voice-${voice}`}>{voiceText}</p>
        </div>
        <p className="mobile-hint">{copy.soundHint}</p>
        <div className="mobile-note-grid">
          {WRITTEN_NOTES.map(([pitch, octave], index) => {
            const label = noteLabel(pitch, octave);
            return (
              <button type="button" key={`${pitch}${octave}`} className={`mobile-note${activeNote === index ? " is-active" : ""}`}
                aria-pressed={activeNote === index} aria-label={`${label.solfege} ${label.code}`} onClick={() => void playNote(index)}>
                <strong>{label.solfege}</strong>
                <span>{label.code}</span>
                <Holes pattern={fingeringFor(pitch, octave)} />
              </button>
            );
          })}
        </div>
        <button type="button" className="mobile-primary" onClick={() => void playScale()}>
          {scalePlaying ? copy.stopScale : copy.playScale}
        </button>
      </section>

      <section className="mobile-card mobile-mic" aria-labelledby="mobile-mic-title">
        <div className="mobile-card-head">
          <h2 id="mobile-mic-title">{copy.micTitle}</h2>
          <span className={`mobile-network ${online ? "is-online" : "is-offline"}`}>{online ? "●" : "○"} {online ? copy.online : copy.offline}</span>
        </div>
        <div className="mobile-segmented" role="group" aria-label={copy.micTitle}>
          {(["free", "lesson"] as const).map(mode => (
            <button type="button" key={mode} aria-pressed={micMode === mode} className={micMode === mode ? "is-selected" : undefined}
              onClick={() => { setMicMode(mode); setMicRun(run => run + 1); }}>
              {mode === "free" ? copy.free : copy.lesson}
            </button>
          ))}
        </div>
        {micMode === "lesson" && <p className="mobile-hint">{copy.lessonHint} {FIRST_LESSON.guide[language]}</p>}
        <PracticeMicrophone key={`${micMode}:${micRun}`} language={language} visible={visible}
          steps={micMode === "lesson" ? FIRST_LESSON_STEPS : []}
          lesson={micMode === "lesson" ? { onComplete: () => addLog(`lesson ${FIRST_LESSON.id}: completed`) } : undefined}
          onUseChange={active => addLog(`microphone: ${active ? "on" : "off"}`)} />
      </section>

      <section className="mobile-card" aria-labelledby="mobile-diagnostics-title">
        <div className="mobile-card-head">
          <h2 id="mobile-diagnostics-title">{copy.diagnostics}</h2>
          <button type="button" className="mobile-chip" onClick={() => void runChecks()}>{copy.runChecks}</button>
        </div>
        {checks.length > 0 && (
          <ul className="mobile-checks">
            {checks.map(check => (
              <li key={check.label} className={`is-${check.status}`}>
                <span aria-hidden="true">{check.status === "ok" ? "✓" : check.status === "fail" ? "✗" : "…"}</span>
                <div><strong>{check.label}</strong><small>{check.status === "ok" ? "OK" : "FAIL"} · {check.detail}</small></div>
              </li>
            ))}
          </ul>
        )}
        <div className="mobile-card-head">
          <h3>{copy.log}</h3>
          <button type="button" className="mobile-chip" onClick={() => void copyLog()}>{copied ? copy.copied : copy.copyLog}</button>
        </div>
        <ol className="mobile-log">
          {log.map((entry, index) => <li key={`${entry.at}-${index}`}><time>{entry.at}</time> {entry.text}</li>)}
        </ol>
      </section>
    </main>
  );
}
