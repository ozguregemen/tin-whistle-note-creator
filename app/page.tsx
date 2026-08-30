"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { parseAbcScore } from "./abc.mjs";
import { transcribeAudioFile } from "./audio-transcription.mjs";
import { assessSongQuality } from "./catalog-quality.mjs";
import { arrangePhrasesForDWhistle, estimateDWhistleRegisters, isUpperWhistleRegister } from "./fingerings.mjs";
import { buildPhraseRanges, buildPlaybackPlan, frequencyForWhistleNote, nextPlaybackIndex, noteNeedsFollowing, remainingBeatsAfterElapsed } from "./practice.mjs";
import { normalizeSearchText, searchMatchScore } from "./search-relevance.mjs";
import { base64AudioBuffer, midiForWhistleNote, playbackRateForMidi, sampleZoneForMidi, soundfontLoopForZone, soundfontTriggerMidiForAudibleMidi, soundfontZoneForMidi, WHISTLE_SAMPLE_ZONES, WHISTLE_SOUNDFONT } from "./whistle-sampler.mjs";

type Language = "en" | "tr";
type StatusKey = "catalogPrepared" | "catalogFound" | "notFound" | "converted" | "invalidNotes" | "catalogUpdated" | "searching" | "sourceFound" | "discoveryFound" | "queueing" | "processing" | "needsReview" | "liveFound" | "sourceUnavailable" | "audioTranscribing" | "audioConverted" | "audioUnavailable";

type SongSource = {
  name: string;
  url: string;
  role: "note-source" | "cross-check";
};

type Song = {
  id: string;
  title: string;
  artist?: string;
  aliases: string[];
  subtitle: Record<Language, string>;
  difficulty: Record<Language, string>;
  notes: string;
  rhythm?: {
    bpm: number;
    source: "score" | "text" | "estimated" | "transcribed";
    tempoSource?: "score" | "curated" | "database" | "default";
    tempoConfidence?: number;
    tempoUrl?: string;
    durations: number[][];
    gaps?: number[][];
  };
  sourceStatus: "cross-checked" | "live" | "manual";
  sourceConfidence?: "estimated" | "omr-unreviewed";
  sources: SongSource[];
};

type Catalog = { songs: Song[] };

type SourceCandidate = {
  id: string;
  sourceId: "notalar" | "gitaregitim" | "songsterr" | "academic-pdf" | "web";
  sourceName: string;
  postId?: number;
  songId?: number;
  documentId?: string;
  title: string;
  url: string;
  processingMode: "text" | "omr" | "review";
  score: number;
};

type SourceJob = {
  requestId: string;
  status: "queued" | "completed" | "needs-review";
  reason?: string;
  song?: Song;
};

type ParsedNote = {
  token: string;
  display: string;
  pitch: string;
  octave: number;
  holes?: string;
  octaveAdjustment?: number;
};

type WhistleArrangement = {
  phrases: ParsedNote[][];
  semitoneShift: number;
  octaveAdjustments: number;
};

type PlaybackPhase = {
  index: number;
  kind: "delay" | "note";
  remainingBeats: number;
  startedAt: number;
  bpm: number;
};

type MetronomePhase = {
  remainingBeats: number;
  startedAt: number;
  bpm: number;
};

type SoundStatus = "idle" | "loading" | "ready" | "fallback";
type TempoStatus = "idle" | "loading" | "resolved" | "unavailable";

type WhistleSoundfontZone = {
  file: string;
  originalPitch: number;
  keyRangeLow: number;
  keyRangeHigh: number;
  loopStart: number;
  loopEnd: number;
  coarseTune: number;
  fineTune: number;
  sampleRate: number;
  buffer?: AudioBuffer;
};

type WhistleSoundfontPreset = { zones: WhistleSoundfontZone[] };

const COPY = {
  en: {
    languageAction: "Türkçe",
    languageLabel: "Switch language to Turkish",
    navHow: "How it works",
    badge: "MVP · D Tin Whistle",
    eyebrow: "Turkish melodies, adapted for tin whistle",
    heroTop: "Turn a melody into",
    heroAccent: "clear fingerings.",
    intro: "Choose a song or paste its notes. Tin Whistle Note Creator turns every note into a simple six-hole fingering diagram.",
    catalogTab: "Search catalog",
    pasteTab: "Paste notes",
    audioTab: "Transcribe audio",
    searchLabel: "What song would you like to play?",
    searchPlaceholder: "Song or folk tune name",
    find: "Find notes",
    suggested: "Try:",
    pasteLabel: "Separate notes with spaces and phrases with a “|”",
    pasteHint: "Use Do/Re/Mi or C/D/E · Add # for sharps · Add ' for the upper register · Example: D'",
    convert: "Convert",
    audioLabel: "Choose an audio file to extract its melody",
    audioHint: "MP3, WAV, OGG or FLAC · processed only in this browser · clearest with one prominent instrument",
    audioChoose: "Choose audio",
    audioTranscribing: "Transcribing pitch and timing locally…",
    audioConverted: "Audio melody converted into D-whistle fingerings",
    audioUnavailable: "No reliable melody was found in this audio. Try a clearer instrumental or isolated track.",
    catalogPrepared: "Verified web-sourced catalog is ready",
    catalogUpdated: "Latest source catalog loaded from GitHub",
    catalogFound: "Found in the web-sourced catalog",
    searching: "Searching live note sources…",
    sourceFound: "Matching score sources found. Choose the right result.",
    discoveryFound: "Web results found. Review the source before importing notes.",
    queueing: "Sending the selected score for processing…",
    processing: "Reading the selected score. This may take a few minutes…",
    needsReview: "The source was found, but automatic score reading needs review.",
    liveFound: "Live source converted into a fingering guide",
    sourceUnavailable: "The live source could not be reached. Try again or request the song.",
    notFound: "No reviewed source match yet. Request this song or paste its notes.",
    converted: "Notes converted into fingering diagrams",
    invalidNotes: "No valid notes found. Example: D4 E4 F#4 G4 | A4 B4",
    guide: "Fingering guide",
    closed: "Closed",
    half: "Half",
    open: "Open",
    print: "Print / PDF",
    practice: "Practice mode",
    play: "Play",
    pause: "Pause",
    stop: "Stop",
    tempo: "Tempo",
    tempoSearching: "Finding original BPM…",
    originalTempo: "Original tempo · BPM database",
    scoreTempo: "Tempo from score",
    defaultTempo: "90 BPM practice default · original tempo not found",
    bpmCredit: "BPM data",
    metronome: "Metronome",
    followNotes: "Follow active note",
    loopPhrase: "Loop phrase",
    selectPhrase: "Phrase to loop",
    loadingSound: "Loading tin whistle sound…",
    whistleSound: "Tin whistle sound",
    referenceSound: "Reference tone fallback",
    sampleCredit: "Irish tin whistle sound",
    soundBank: "GeneralUser GS sound bank",
    soundConversion: "WebAudioFont conversion",
    fallbackSamples: "CC fallback samples",
    scoreRhythm: "Score rhythm",
    textRhythm: "Rhythm markers from source",
    estimatedRhythm: "Estimated equal beats",
    transcribedRhythm: "Timing transcribed from audio",
    progress: "Progress",
    warningStart: "note(s) sit outside the supported D whistle range.",
    warningEnd: "Faded notes need a different octave or arrangement.",
    phrase: "Phrase",
    note: "note",
    notes: "notes",
    phrases: "phrases",
    noRhythm: "Rhythm is not included in this MVP",
    mvpScope: "MVP scope",
    howTitle: "Practice the right fingers at your own tempo.",
    step1Title: "Bring in the notes",
    step1Body: "Choose from the local catalog or paste a simple note sequence.",
    step2Title: "Check playability",
    step2Body: "Use chromatic and half-hole fingerings, then flag notes outside the supported range.",
    step3Title: "Practice the melody",
    step3Body: "Play, pause, follow the active note, and adjust the BPM.",
    footer: "A first step toward a more accessible Turkish tin whistle repertoire.",
    customTitle: "My melody",
    customSubtitle: "Manually entered note sequence",
    customDifficulty: "Custom",
    verified: "Cross-checked",
    liveSource: "Live API source",
    omrUnreviewed: "Machine-read notes · review pending",
    textEstimated: "Text notes · first register assumed",
    sourcedMelody: "Sourced melody",
    qualitySummary: "Source quality",
    qualityMelody: "Melody",
    qualityRhythm: "Rhythm",
    qualityTempo: "Tempo",
    knownTempo: "Original BPM found",
    defaultTempoShort: "Practice default",
    omrCaveat: "Automatic score reading can contain wrong notes. Treat this as a practice draft until it is cross-checked.",
    sources: "Sources",
    primarySource: "note source",
    crossCheck: "cross-check",
    requestSong: "Request this song",
    processSource: "Read this score",
    textSource: "Text notes · fast",
    scoreSource: "PDF / image score · OMR",
    reviewSource: "Open and review",
    webSource: "Web discovery · unverified",
    emptyTitle: "No note sheet selected",
    emptyBody: "We did not leave the previous song on screen. Only reviewed source matches are shown here.",
    sourceCaveat: "Pitch sequence is sourced; rhythm and note durations are not included yet.",
    arrangementTitle: "D-whistle arrangement",
    arrangementOriginal: "The source fits the standard two-register D-whistle range; its key is unchanged.",
    arrangementDown: "Transposed down",
    arrangementUp: "Transposed up",
    semitones: "semitones",
    intervalsPreserved: "The same shift is applied to every note, so the melody intervals stay intact.",
    arrangementOctaveAdjusted: "Extreme notes were moved to the nearest playable octave.",
    whistleOctaveHelp: "Whistle notation is written one octave below the sound: written E4 sounds as E5 on a high-D whistle.",
    lowRegister: "low register",
    highRegister: "high register",
    writtenPitch: "written",
  },
  tr: {
    languageAction: "English",
    languageLabel: "Dili İngilizceye geçir",
    navHow: "Nasıl çalışır?",
    badge: "MVP · D Tin Whistle",
    eyebrow: "Türkçe ezgiler, tin whistle’a uyarlanmış",
    heroTop: "Bir ezgiyi anlaşılır",
    heroAccent: "parmaklara dönüştür.",
    intro: "Bir şarkı seç veya notalarını yapıştır. Tin Whistle Note Creator her notayı altı delikli, kolay bir parmak şemasına çevirir.",
    catalogTab: "Katalogda ara",
    pasteTab: "Notaları yapıştır",
    audioTab: "Sesi notaya çevir",
    searchLabel: "Hangi şarkıyı çalmak istiyorsun?",
    searchPlaceholder: "Şarkı veya türkü adı",
    find: "Notaları bul",
    suggested: "Önerilen:",
    pasteLabel: "Notaları boşlukla, cümleleri “|” işaretiyle ayır",
    pasteHint: "Do/Re/Mi veya C/D/E kullan · Diyez için #, üst register için ' ekle · Örnek: Re'",
    convert: "Dönüştür",
    audioLabel: "Melodisini çıkarmak için bir ses dosyası seç",
    audioHint: "MP3, WAV, OGG veya FLAC · yalnızca bu tarayıcıda işlenir · belirgin tek enstrümanda daha iyi sonuç verir",
    audioChoose: "Ses seç",
    audioTranscribing: "Perde ve zamanlama tarayıcıda çıkarılıyor…",
    audioConverted: "Ses melodisi D-whistle parmaklarına dönüştürüldü",
    audioUnavailable: "Bu seste güvenilir bir melodi bulunamadı. Daha temiz bir enstrümantal veya izole kayıt dene.",
    catalogPrepared: "Doğrulanmış internet kaynaklı katalog hazır",
    catalogUpdated: "Güncel kaynak kataloğu GitHub’dan yüklendi",
    catalogFound: "İnternet kaynaklı katalogda bulundu",
    searching: "Canlı nota kaynaklarında aranıyor…",
    sourceFound: "Eşleşen nota kaynakları bulundu. Doğru sonucu seç.",
    discoveryFound: "Web sonuçları bulundu. Notayı içe aktarmadan önce kaynağı kontrol et.",
    queueing: "Seçilen nota işlenmek üzere gönderiliyor…",
    processing: "Seçilen nota okunuyor. Bu işlem birkaç dakika sürebilir…",
    needsReview: "Kaynak bulundu ancak otomatik nota okuma sonucunun kontrol edilmesi gerekiyor.",
    liveFound: "Canlı kaynak parmak rehberine dönüştürüldü",
    sourceUnavailable: "Canlı kaynağa ulaşılamadı. Yeniden deneyebilir veya şarkıyı isteyebilirsin.",
    notFound: "Henüz incelenmiş kaynak eşleşmesi yok. Şarkıyı isteyebilir veya notaları yapıştırabilirsin.",
    converted: "Notalar parmak pozisyonlarına dönüştürüldü",
    invalidNotes: "Geçerli nota bulunamadı. Örnek: D4 E4 F#4 G4 | A4 B4",
    guide: "Parmak rehberi",
    closed: "Kapalı",
    half: "Yarım",
    open: "Açık",
    print: "Yazdır / PDF",
    practice: "Pratik modu",
    play: "Çal",
    pause: "Duraklat",
    stop: "Durdur",
    tempo: "Tempo",
    tempoSearching: "Orijinal BPM aranıyor…",
    originalTempo: "Orijinal tempo · BPM veritabanı",
    scoreTempo: "Nota kaynağındaki tempo",
    defaultTempo: "90 BPM pratik varsayılanı · orijinal tempo bulunamadı",
    bpmCredit: "BPM verisi",
    metronome: "Metronom",
    followNotes: "Aktif notayı takip et",
    loopPhrase: "Cümleyi döngüle",
    selectPhrase: "Döngülenecek cümle",
    loadingSound: "Tin whistle sesi yükleniyor…",
    whistleSound: "Tin whistle sesi",
    referenceSound: "Yedek referans sesi",
    sampleCredit: "Irish tin whistle sesi",
    soundBank: "GeneralUser GS ses bankası",
    soundConversion: "WebAudioFont dönüşümü",
    fallbackSamples: "CC yedek örnekler",
    scoreRhythm: "Nota kaynağındaki ritim",
    textRhythm: "Kaynağın ritim işaretleri",
    estimatedRhythm: "Tahmini eşit vuruşlar",
    transcribedRhythm: "Sesten çıkarılan zamanlama",
    progress: "İlerleme",
    warningStart: "nota desteklenen D whistle aralığının dışında.",
    warningEnd: "Soluk gösterilen notalar için farklı oktav veya düzenleme gerekir.",
    phrase: "Cümle",
    note: "nota",
    notes: "nota",
    phrases: "cümle",
    noRhythm: "Ritim bilgisi bu MVP’ye dahil değildir",
    mvpScope: "MVP sınırı",
    howTitle: "Doğru parmakları kendi temponda çalış.",
    step1Title: "Notayı al",
    step1Body: "Yerel katalogdan seç veya basit bir nota dizisi yapıştır.",
    step2Title: "Uygunluğu kontrol et",
    step2Body: "Kromatik ve yarım delik parmaklarını kullan, desteklenen aralığın dışındaki sesleri işaretle.",
    step3Title: "Melodiyi çalış",
    step3Body: "Çal, duraklat, aktif notayı takip et ve BPM’i ayarla.",
    footer: "Türkçe tin whistle repertuvarını erişilebilir kılmak için ilk adım.",
    customTitle: "Benim ezgim",
    customSubtitle: "Elle girilen nota dizisi",
    customDifficulty: "Özel",
    verified: "Karşılaştırıldı",
    liveSource: "Canlı API kaynağı",
    omrUnreviewed: "Makineyle okunan nota · kontrol bekliyor",
    textEstimated: "Metin notası · ilk register varsayıldı",
    sourcedMelody: "Kaynaklı ezgi",
    qualitySummary: "Kaynak kalitesi",
    qualityMelody: "Ezgi",
    qualityRhythm: "Ritim",
    qualityTempo: "Tempo",
    knownTempo: "Orijinal BPM bulundu",
    defaultTempoShort: "Pratik varsayılanı",
    omrCaveat: "Otomatik nota okuma hatalı notalar içerebilir. Başka bir kaynakla karşılaştırılana kadar bunu çalışma taslağı olarak kullan.",
    sources: "Kaynaklar",
    primarySource: "nota kaynağı",
    crossCheck: "karşılaştırma",
    requestSong: "Bu şarkıyı iste",
    processSource: "Bu notayı oku",
    textSource: "Metin notası · hızlı",
    scoreSource: "PDF / görsel nota · OMR",
    reviewSource: "Aç ve kontrol et",
    webSource: "Web keşfi · doğrulanmadı",
    emptyTitle: "Nota sayfası seçilmedi",
    emptyBody: "Önceki şarkıyı ekranda bırakmadık. Burada yalnızca incelenmiş kaynak eşleşmeleri gösterilir.",
    sourceCaveat: "Ses dizisi kaynaklıdır; ritim ve nota süreleri henüz dahil değildir.",
    arrangementTitle: "D-whistle düzeni",
    arrangementOriginal: "Kaynak, D whistle’ın standart iki registerına sığıyor; tonu değiştirilmedi.",
    arrangementDown: "Aşağı aktarıldı",
    arrangementUp: "Yukarı aktarıldı",
    semitones: "yarım ses",
    intervalsPreserved: "Bütün notalara aynı aktarım uygulandığı için ezginin aralıkları korunur.",
    arrangementOctaveAdjusted: "Sınırdaki notalar en yakın çalınabilir oktava taşındı.",
    whistleOctaveHelp: "Whistle notası duyulan sesten bir oktav aşağı yazılır: yazılı Mi4, ince D whistle’da Mi5 olarak duyulur.",
    lowRegister: "alt register",
    highRegister: "üst register",
    writtenPitch: "yazılı",
  },
} as const;

const FALLBACK_SONGS: Song[] = [
  {
    id: "duman-bu-aksam",
    title: "Bu Akşam",
    artist: "Duman",
    aliases: ["Duman Bu Akşam", "İçerim Ben Bu Akşam", "Duman İçerim Ben Bu Akşam"],
    subtitle: { en: "Web-sourced melody · independently cross-checked", tr: "İnternetten alınan ezgi · bağımsız kaynakla karşılaştırıldı" },
    difficulty: { en: "Intermediate", tr: "Orta" },
    notes: "A4 E5 D5 C5 D5 | B4 C5 D5 B4 A4 | A4 E5 D5 C5 D5 | B4 C5 D5 D5 | A4 E5 D5 C5 D5 | B4 C5 D5 B4 A4 | C5 B4 A4 C5 | B4 A4 A4",
    rhythm: {
      bpm: 149,
      source: "estimated",
      tempoSource: "database",
      tempoConfidence: 100,
      tempoUrl: "https://getsongbpm.com/song/bu-aksam/kZOKKY",
      durations: [],
    },
    sourceStatus: "cross-checked",
    sources: [
      { name: "Notalar.net", url: "https://www.notalar.net/icerim-ben-aksam-melodika-notalari/", role: "note-source" },
      { name: "HKLPS Müzik · YouTube", url: "https://www.youtube.com/watch?v=LWWKiIJ9RD0", role: "cross-check" },
    ],
  },
];

const REMOTE_CATALOG_URL = "https://raw.githubusercontent.com/ozguregemen/tin-whistle-note-creator/main/catalog/catalog.json";
const THE_SESSION_SEARCH_URL = "https://thesession.org/tunes/search?format=json&q=";

function sourceApiUrl() {
  if (typeof window === "undefined") return "";
  const configured = (window as typeof window & { __TWNC_SOURCE_API_URL__?: string }).__TWNC_SOURCE_API_URL__ ?? "";
  return configured.startsWith("http") ? configured.replace(/\/$/, "") : "";
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function waitForSourceJob(api: string, requestId: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await wait(5000);
    const response = await fetch(`${api}/api/jobs/${requestId}`, { cache: "no-store" });
    if (!response.ok && response.status !== 202) throw new Error(`Source job status returned ${response.status}`);
    const job = await response.json() as SourceJob;
    if (job.status === "completed" || job.status === "needs-review") return job;
  }
  return null;
}

const SOLFEGE: Record<string, string> = { DO: "C", RE: "D", RÉ: "D", MI: "E", FA: "F", SOL: "G", LA: "A", SI: "B" };
const NOTE_NAMES: Record<string, string> = {
  C: "Do", "C#": "Do♯", D: "Re", "D#": "Re♯", E: "Mi", F: "Fa",
  "F#": "Fa♯", G: "Sol", "G#": "Sol♯", A: "La", "A#": "La♯", B: "Si",
};

function normalizeNote(raw: string): ParsedNote | null {
  const cleaned = raw.trim().replaceAll("♯", "#").replaceAll("♭", "b");
  const match = cleaned.match(/^([A-Ga-g]|do|re|ré|mi|fa|sol|la|si)([#b]?)([3-6]|['′+])?$/i);
  if (!match) return null;
  let pitch = SOLFEGE[match[1].toUpperCase()] ?? match[1].toUpperCase();
  if (match[2] === "#") pitch += "#";
  if (match[2] === "b") {
    const flatToSharp: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
    pitch = flatToSharp[`${pitch}b`] ?? pitch;
  }
  const octaveMarker = match[3];
  const upperRegister = octaveMarker === "'" || octaveMarker === "′" || octaveMarker === "+";
  const octave = /^\d$/.test(octaveMarker ?? "")
    ? Number(octaveMarker)
    : upperRegister
      ? (pitch === "C" || pitch === "C#" ? 6 : 5)
      : (pitch === "C" || pitch === "C#" ? 5 : 4);
  return { token: raw, pitch, octave, display: NOTE_NAMES[pitch] ?? pitch };
}

function parseArrangement(source: string, estimateRegisters = false): WhistleArrangement {
  let phrases = source.split("|")
    .map((phrase) => phrase.split(/[\s,;]+/).map(normalizeNote).filter((note): note is ParsedNote => note !== null))
    .filter((phrase) => phrase.length > 0);
  if (estimateRegisters) phrases = estimateDWhistleRegisters(phrases) as ParsedNote[][];
  return arrangePhrasesForDWhistle(phrases) as WhistleArrangement;
}

function parsePhrases(source: string, estimateRegisters = false): ParsedNote[][] {
  return parseArrangement(source, estimateRegisters).phrases;
}

function Fingering({ note, index, globalIndex, active, language }: { note: ParsedNote; index: number; globalIndex: number; active: boolean; language: Language }) {
  const playable = Boolean(note.holes);
  const upperRegister = isUpperWhistleRegister(note.pitch, note.octave);
  const register = language === "en" ? (upperRegister ? "high register" : "low register") : (upperRegister ? "üst register" : "alt register");
  // Transposition changes pitch but the source-facing display label is retained for provenance.
  // Always derive the visible localized name from the arranged pitch so labels cannot go stale.
  const displayPitch = language === "en" ? note.pitch : NOTE_NAMES[note.pitch] ?? note.pitch;
  const writtenPitch = `${displayPitch}${note.octave}`;
  return (
    <div className={`fingering ${playable ? "" : "unsupported"} ${active ? "active" : ""}`} aria-current={active ? "step" : undefined} data-note-index={globalIndex} aria-label={`${displayPitch} ${note.octave}`}>
      {upperRegister && <span className="octave-mark" title={register}>•</span>}
      <span className="note-order">{String(index + 1).padStart(2, "0")}</span>
      <div className="whistle-holes" aria-hidden="true">
        {(note.holes ?? "??????").split("").map((state, holeIndex) => (
          <span className={`hole ${state === "1" ? "closed" : state === "0" ? "open" : state === "h" ? "half" : "unknown"}`} key={holeIndex} />
        ))}
      </div>
      <strong>{displayPitch}</strong>
      <small>{writtenPitch} · {register}</small>
    </div>
  );
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  const [mode, setMode] = useState<"search" | "paste" | "audio">("search");
  const [catalog, setCatalog] = useState<Song[]>(FALLBACK_SONGS);
  const [query, setQuery] = useState("Duman İçerim Ben Bu Akşam");
  const [manualNotes, setManualNotes] = useState("D4 E4 F#4 G4 | A4 B4 C#5 D5 | D5 C#5 B4 A4 | G4 F#4 E4 D4");
  const [song, setSong] = useState<Song | null>(FALLBACK_SONGS[0]);
  const [sourceCandidates, setSourceCandidates] = useState<SourceCandidate[]>([]);
  const [status, setStatus] = useState<StatusKey>("catalogPrepared");
  const [bpm, setBpm] = useState(FALLBACK_SONGS[0].rhythm?.bpm ?? 90);
  const [tempoStatus, setTempoStatus] = useState<TempoStatus>("idle");
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundStatus, setSoundStatus] = useState<SoundStatus>("idle");
  const [activeNoteIndex, setActiveNoteIndex] = useState(-1);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [followEnabled, setFollowEnabled] = useState(true);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [selectedPhraseIndex, setSelectedPhraseIndex] = useState(0);
  const playbackCursorRef = useRef(0);
  const playbackTimerRef = useRef<number | null>(null);
  const playbackPhaseRef = useRef<PlaybackPhase | null>(null);
  const metronomeTimerRef = useRef<number | null>(null);
  const metronomePhaseRef = useRef<MetronomePhase | null>(null);
  const metronomeEnabledRef = useRef(false);
  const loopEnabledRef = useRef(false);
  const selectedPhraseRef = useRef(0);
  const bpmRef = useRef(90);
  const isPlayingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioScheduledSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const whistleSoundfontZonesRef = useRef<WhistleSoundfontZone[]>([]);
  const whistleBuffersRef = useRef<Map<number, AudioBuffer>>(new Map());
  const whistleLoadPromiseRef = useRef<Promise<boolean> | null>(null);
  const t = COPY[language];
  const songQuality = useMemo(() => song ? assessSongQuality(song) : null, [song]);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    const saved = window.localStorage.getItem("twnc-language");
    // The saved preference only exists in the browser; applying it after hydration is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "tr" || saved === "en") setLanguage(saved);

    const controller = new AbortController();
    const api = sourceApiUrl();
    fetch(api ? `${api}/api/catalog` : REMOTE_CATALOG_URL, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Catalog returned ${response.status}`);
        return response.json() as Promise<Catalog>;
      })
      .then((remoteCatalog) => {
        if (!Array.isArray(remoteCatalog.songs) || remoteCatalog.songs.length === 0) return;
        setCatalog(remoteCatalog.songs);
        setSong((current) => remoteCatalog.songs.find((item) => item.id === current?.id) ?? current);
        setStatus("catalogUpdated");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const api = sourceApiUrl();
    const requestId = window.localStorage.getItem("twnc-pending-source-job");
    if (!api || !requestId) return;
    let active = true;
    // Resuming a user-started background conversion after reload is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("processing");
    waitForSourceJob(api, requestId).then((job) => {
      if (!active || !job) return;
      if (job.status === "completed" && job.song) {
        setSong(job.song);
        setStatus("liveFound");
      } else {
        setStatus("needsReview");
      }
      window.localStorage.removeItem("twnc-pending-source-job");
    }).catch(() => {
      if (active) setStatus("sourceUnavailable");
    });
    return () => { active = false; };
  }, []);

  const arrangement = useMemo(
    () => parseArrangement(song?.notes ?? "", song?.sourceConfidence === "estimated"),
    [song],
  );
  const phrases = arrangement.phrases;
  const allNotes = phrases.flat();
  const unsupported = allNotes.filter((note) => !note.holes);
  const playbackPlan = useMemo(() => buildPlaybackPlan(phrases, song?.rhythm, bpm), [phrases, song?.rhythm, bpm]);
  const playbackPlanRef = useRef(playbackPlan);
  playbackPlanRef.current = playbackPlan;
  const phraseOffsets = useMemo(() => phrases.map((_, index) => phrases.slice(0, index).reduce((sum, phrase) => sum + phrase.length, 0)), [phrases]);
  const phraseRanges = useMemo(() => buildPhraseRanges(phrases), [phrases]);
  const phraseRangesRef = useRef(phraseRanges);
  phraseRangesRef.current = phraseRanges;
  const visibleLoopRange = loopEnabled ? phraseRanges[selectedPhraseIndex] : null;
  const progressCurrent = activeNoteIndex < 0 ? 0 : visibleLoopRange ? activeNoteIndex - visibleLoopRange.start + 1 : activeNoteIndex + 1;
  const progressTotal = visibleLoopRange ? visibleLoopRange.end - visibleLoopRange.start : allNotes.length;

  useEffect(() => {
    if (!followEnabled || !isPlaying || activeNoteIndex < 0) return;
    const frame = window.requestAnimationFrame(() => {
      const activeNote = document.querySelector<HTMLElement>(`[data-note-index="${activeNoteIndex}"]`);
      if (!activeNote) return;
      const noteRect = activeNote.getBoundingClientRect();
      const panelRect = document.querySelector<HTMLElement>(".practice-panel")?.getBoundingClientRect();
      if (noteNeedsFollowing(noteRect.top, noteRect.bottom, panelRect?.bottom ?? 0, window.innerHeight)) {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        activeNote.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeNoteIndex, followEnabled, isPlaying]);

  useEffect(() => {
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    if (metronomeTimerRef.current !== null) window.clearTimeout(metronomeTimerRef.current);
    audioSourceRef.current?.stop();
    audioSourceRef.current = null;
    gainRef.current = null;
    playbackCursorRef.current = 0;
    playbackPhaseRef.current = null;
    metronomeTimerRef.current = null;
    metronomePhaseRef.current = null;
    loopEnabledRef.current = false;
    selectedPhraseRef.current = 0;
    // Resetting transport state when a different score is selected is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveNoteIndex(-1);
    setIsPlaying(false);
    setLoopEnabled(false);
    setSelectedPhraseIndex(0);
    const initialBpm = song?.rhythm?.bpm ?? 90;
    bpmRef.current = initialBpm;
    setBpm(initialBpm);
    // Tempo discovery updates the current song in place and must not restart transport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id]);

  useEffect(() => {
    const api = sourceApiUrl();
    const tempoSource = song?.rhythm?.tempoSource;
    const alreadyResolved = tempoSource === "score" || tempoSource === "curated" || tempoSource === "database";
    if (!song || song.sourceStatus === "manual" || alreadyResolved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTempoStatus(alreadyResolved ? "resolved" : "idle");
      return;
    }
    if (!api) {
      setTempoStatus("unavailable");
      return;
    }

    const controller = new AbortController();
    const selectedSongId = song.id;
    setTempoStatus("loading");
    const params = new URLSearchParams({ title: song.title });
    if (song.artist) params.set("artist", song.artist);
    fetch(`${api}/api/tempo?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Tempo API returned ${response.status}`);
        return response.json() as Promise<{ bpm: number; confidence: number; sourceUrl?: string }>;
      })
      .then((tempo) => {
        if (!tempo) { setTempoStatus("unavailable"); return; }
        const resolvedBpm = Math.min(220, Math.max(40, Math.round(Number(tempo.bpm))));
        if (!Number.isFinite(resolvedBpm)) { setTempoStatus("unavailable"); return; }
        setSong((current) => current?.id === selectedSongId ? {
          ...current,
          rhythm: {
            bpm: resolvedBpm,
            source: current.rhythm?.source ?? "estimated",
            tempoSource: "database",
            tempoConfidence: Number(tempo.confidence) || 0,
            ...(tempo.sourceUrl ? { tempoUrl: tempo.sourceUrl } : {}),
            durations: current.rhythm?.durations ?? [],
            ...(current.rhythm?.gaps ? { gaps: current.rhythm.gaps } : {}),
          },
        } : current);
        changeTempo(resolvedBpm);
        setTempoStatus("resolved");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTempoStatus("unavailable");
      });
    return () => controller.abort();
    // BPM lookup is keyed by stable song identity; query text edits must not retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.artist, song?.id, song?.rhythm?.tempoSource, song?.sourceStatus, song?.title]);

  useEffect(() => () => {
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    if (metronomeTimerRef.current !== null) window.clearTimeout(metronomeTimerRef.current);
    audioSourceRef.current?.stop();
    void audioContextRef.current?.close();
  }, []);

  function stopTone() {
    if (!audioSourceRef.current) return;
    const source = audioSourceRef.current;
    const gain = gainRef.current;
    const context = audioContextRef.current;
    try {
      if (gain && context) {
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
        source.stop(now + 0.04);
      } else {
        source.stop();
      }
    } catch { /* The oscillator may already have stopped. */ }
    audioSourceRef.current = null;
    gainRef.current = null;
  }

  function ensureAudioContext() {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return null;
    const context = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = context;
    void context.resume();
    return context;
  }

  function loadedWhistleSoundfont() {
    const globals = window as unknown as Record<string, WhistleSoundfontPreset | undefined>;
    return globals[WHISTLE_SOUNDFONT.globalName];
  }

  function loadWhistleSoundfont() {
    const loaded = loadedWhistleSoundfont();
    if (loaded) return Promise.resolve(loaded);
    const source = new URL(WHISTLE_SOUNDFONT.file, document.baseURI).href;
    return new Promise<WhistleSoundfontPreset>((resolve, reject) => {
      const finish = () => {
        const preset = loadedWhistleSoundfont();
        if (preset?.zones?.length) resolve(preset);
        else reject(new Error("Whistle soundfont did not register its preset"));
      };
      const existing = Array.from(document.scripts).find((script) => script.src === source);
      if (existing) {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("Whistle soundfont failed to load")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = source;
      script.async = true;
      script.dataset.twncWhistleSoundfont = "true";
      script.addEventListener("load", finish, { once: true });
      script.addEventListener("error", () => reject(new Error("Whistle soundfont failed to load")), { once: true });
      document.head.append(script);
    });
  }

  async function prepareWhistleSamples() {
    const context = ensureAudioContext();
    if (!context) { setSoundStatus("fallback"); return false; }
    if (whistleSoundfontZonesRef.current.length > 0 || whistleBuffersRef.current.size === WHISTLE_SAMPLE_ZONES.length) {
      setSoundStatus("ready");
      return true;
    }
    if (whistleLoadPromiseRef.current) return whistleLoadPromiseRef.current;

    setSoundStatus("loading");
    const loadPromise = loadWhistleSoundfont().then(async (preset) => {
      const zones = await Promise.all(preset.zones.map(async (zone) => {
        const encoded = base64AudioBuffer(zone.file);
        if (!encoded) throw new Error("Whistle soundfont zone is empty");
        return { ...zone, buffer: await context.decodeAudioData(encoded) };
      }));
      whistleSoundfontZonesRef.current = zones;
      setSoundStatus("ready");
      return true;
    }).catch(async () => {
      try {
        const entries = await Promise.all(WHISTLE_SAMPLE_ZONES.map(async (zone) => {
          const response = await fetch(new URL(zone.file, document.baseURI));
          if (!response.ok) throw new Error(`Whistle sample returned ${response.status}`);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          return [zone.rootMidi, buffer] as const;
        }));
        whistleBuffersRef.current = new Map(entries);
        setSoundStatus("ready");
        return true;
      } catch {
        setSoundStatus("fallback");
        return false;
      }
    }).finally(() => {
      whistleLoadPromiseRef.current = null;
    });
    whistleLoadPromiseRef.current = loadPromise;
    return loadPromise;
  }

  function playTone(note: ParsedNote) {
    const context = ensureAudioContext();
    if (!context) return;
    stopTone();
    const gain = context.createGain();
    const now = context.currentTime;

    const audibleMidi = midiForWhistleNote(note.pitch, note.octave);
    const soundfontTriggerMidi = soundfontTriggerMidiForAudibleMidi(
      audibleMidi,
      WHISTLE_SOUNDFONT.soundingOffsetSemitones,
    );
    const soundfontZone = soundfontZoneForMidi(soundfontTriggerMidi, whistleSoundfontZonesRef.current) as WhistleSoundfontZone | null;
    const legacyZone = sampleZoneForMidi(audibleMidi);
    const legacyBuffer = legacyZone ? whistleBuffersRef.current.get(legacyZone.rootMidi) : undefined;
    let source: AudioScheduledSourceNode;
    if (soundfontZone?.buffer && soundfontTriggerMidi !== null) {
      const sampleSource = context.createBufferSource();
      const loop = soundfontLoopForZone(soundfontZone);
      sampleSource.buffer = soundfontZone.buffer;
      sampleSource.playbackRate.setValueAtTime(playbackRateForMidi(soundfontTriggerMidi, soundfontZone), now);
      if (loop) {
        sampleSource.loop = true;
        sampleSource.loopStart = loop.start;
        sampleSource.loopEnd = loop.end;
      }
      sampleSource.connect(gain);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.58, now + 0.018);
      source = sampleSource;
    } else if (legacyBuffer && legacyZone && audibleMidi !== null) {
      const sampleSource = context.createBufferSource();
      sampleSource.buffer = legacyBuffer;
      sampleSource.playbackRate.setValueAtTime(playbackRateForMidi(audibleMidi, legacyZone.rootMidi), now);
      sampleSource.connect(gain);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.72, now + 0.025);
      source = sampleSource;
    } else {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequencyForWhistleNote(note.pitch, note.octave), now);
      oscillator.connect(gain);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
      source = oscillator;
    }
    gain.connect(context.destination);
    source.start(now);
    audioSourceRef.current = source;
    gainRef.current = gain;
    source.addEventListener("ended", () => {
      if (audioSourceRef.current === source) {
        audioSourceRef.current = null;
        gainRef.current = null;
      }
    }, { once: true });
  }

  function playMetronomeClick() {
    const context = ensureAudioContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const clickGain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(1500, now);
    clickGain.gain.setValueAtTime(0.08, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    oscillator.connect(clickGain);
    clickGain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.05);
  }

  function scheduleMetronomePhase(remainingBeats = 1) {
    if (!metronomeEnabledRef.current) return;
    const phaseBpm = bpmRef.current;
    metronomePhaseRef.current = {
      remainingBeats,
      startedAt: window.performance.now(),
      bpm: phaseBpm,
    };
    metronomeTimerRef.current = window.setTimeout(() => {
      metronomeTimerRef.current = null;
      if (!metronomeEnabledRef.current) return;
      playMetronomeClick();
      scheduleMetronomePhase(1);
    }, remainingBeats * 60000 / phaseBpm);
  }

  function startMetronome() {
    if (!metronomeEnabledRef.current) return;
    const pausedPhase = metronomePhaseRef.current;
    if (pausedPhase) {
      scheduleMetronomePhase(pausedPhase.remainingBeats);
      return;
    }
    playMetronomeClick();
    scheduleMetronomePhase(1);
  }

  function pauseMetronome() {
    if (metronomeTimerRef.current !== null) window.clearTimeout(metronomeTimerRef.current);
    metronomeTimerRef.current = null;
    const phase = metronomePhaseRef.current;
    if (!phase) return;
    metronomePhaseRef.current = {
      remainingBeats: remainingBeatsAfterElapsed(
        phase.remainingBeats,
        window.performance.now() - phase.startedAt,
        phase.bpm,
      ),
      startedAt: window.performance.now(),
      bpm: bpmRef.current,
    };
  }

  function stopMetronome() {
    if (metronomeTimerRef.current !== null) window.clearTimeout(metronomeTimerRef.current);
    metronomeTimerRef.current = null;
    metronomePhaseRef.current = null;
  }

  function activeLoopRange() {
    return loopEnabledRef.current ? phraseRangesRef.current[selectedPhraseRef.current] ?? null : null;
  }

  function finishPlayback() {
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    playbackTimerRef.current = null;
    stopTone();
    stopMetronome();
    playbackCursorRef.current = activeLoopRange()?.start ?? 0;
    playbackPhaseRef.current = null;
    setActiveNoteIndex(-1);
    setIsPlaying(false);
  }

  function schedulePlaybackPhase(index: number, kind: PlaybackPhase["kind"], remainingBeats?: number, keepCurrentTone = false) {
    const event = playbackPlanRef.current[index];
    if (!event) { finishPlayback(); return; }
    playbackCursorRef.current = index;
    const beats = remainingBeats ?? (kind === "delay" ? event.delayBeats : event.durationBeats);

    if (kind === "delay" && beats <= 0) {
      schedulePlaybackPhase(index, "note");
      return;
    }

    const phaseBpm = bpmRef.current;
    const durationMs = beats * 60000 / phaseBpm;
    playbackPhaseRef.current = {
      index,
      kind,
      remainingBeats: beats,
      startedAt: window.performance.now(),
      bpm: phaseBpm,
    };

    if (kind === "delay") {
      setActiveNoteIndex(-1);
      playbackTimerRef.current = window.setTimeout(() => {
        playbackTimerRef.current = null;
        schedulePlaybackPhase(index, "note");
      }, durationMs);
    } else {
      setActiveNoteIndex(event.globalIndex);
      if (!keepCurrentTone) playTone(event.note as ParsedNote);
      playbackTimerRef.current = window.setTimeout(() => {
        playbackTimerRef.current = null;
        const nextIndex = nextPlaybackIndex(index, playbackPlanRef.current.length, activeLoopRange());
        if (nextIndex < 0) finishPlayback();
        else schedulePlaybackPhase(nextIndex, "delay");
      }, durationMs);
    }
  }

  function playStep(index: number) {
    schedulePlaybackPhase(index, "delay");
  }

  function remainingPhaseBeats(phase: PlaybackPhase) {
    return remainingBeatsAfterElapsed(
      phase.remainingBeats,
      window.performance.now() - phase.startedAt,
      phase.bpm,
    );
  }

  async function togglePractice() {
    if (isPlaying) {
      if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
      const phase = playbackPhaseRef.current;
      if (phase) {
        playbackPhaseRef.current = {
          ...phase,
          remainingBeats: remainingPhaseBeats(phase),
          startedAt: window.performance.now(),
          bpm: bpmRef.current,
        };
      }
      stopTone();
      pauseMetronome();
      setIsPlaying(false);
      return;
    }
    await prepareWhistleSamples();
    setIsPlaying(true);
    startMetronome();
    const pausedPhase = playbackPhaseRef.current;
    if (pausedPhase) {
      schedulePlaybackPhase(pausedPhase.index, pausedPhase.kind, pausedPhase.remainingBeats);
    } else {
      if (loopEnabledRef.current) playbackCursorRef.current = activeLoopRange()?.start ?? 0;
      playStep(playbackCursorRef.current);
    }
  }

  function stopPractice() {
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    playbackTimerRef.current = null;
    finishPlayback();
  }

  function changeTempo(nextBpm: number) {
    const phase = playbackPhaseRef.current;
    const playing = isPlayingRef.current;
    const remainingBeats = phase && playing ? remainingPhaseBeats(phase) : 0;
    const metronomePhase = metronomePhaseRef.current;
    const remainingMetronomeBeats = metronomePhase && playing
      ? remainingBeatsAfterElapsed(metronomePhase.remainingBeats, window.performance.now() - metronomePhase.startedAt, metronomePhase.bpm)
      : 0;
    bpmRef.current = nextBpm;
    setBpm(nextBpm);

    if (!phase || !playing) return;
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    playbackTimerRef.current = null;
    schedulePlaybackPhase(phase.index, phase.kind, remainingBeats, phase.kind === "note");
    if (metronomeEnabledRef.current && metronomePhase) {
      if (metronomeTimerRef.current !== null) window.clearTimeout(metronomeTimerRef.current);
      metronomeTimerRef.current = null;
      scheduleMetronomePhase(remainingMetronomeBeats);
    }
  }

  function changeMetronome(enabled: boolean) {
    metronomeEnabledRef.current = enabled;
    setMetronomeEnabled(enabled);
    stopMetronome();
    if (enabled && isPlaying) startMetronome();
  }

  function restartAtSelectedPhrase() {
    const start = phraseRangesRef.current[selectedPhraseRef.current]?.start ?? 0;
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    playbackTimerRef.current = null;
    stopTone();
    playbackPhaseRef.current = null;
    playbackCursorRef.current = start;
    setActiveNoteIndex(-1);
    if (isPlaying) schedulePlaybackPhase(start, "delay");
  }

  function changeLoop(enabled: boolean) {
    loopEnabledRef.current = enabled;
    setLoopEnabled(enabled);
    if (enabled) restartAtSelectedPhrase();
    else if (!isPlaying) {
      playbackCursorRef.current = 0;
      playbackPhaseRef.current = null;
      setActiveNoteIndex(-1);
    }
  }

  function changeSelectedPhrase(index: number) {
    selectedPhraseRef.current = index;
    setSelectedPhraseIndex(index);
    if (loopEnabledRef.current) restartAtSelectedPhrase();
  }

  function toggleLanguage() {
    const next = language === "en" ? "tr" : "en";
    setLanguage(next);
    window.localStorage.setItem("twnc-language", next);
  }

  async function findSong(event?: FormEvent) {
    event?.preventDefault();
    setSourceCandidates([]);
    const normalized = normalizeSearchText(query);
    const match = normalized ? catalog
      .map((item) => ({ item, score: searchMatchScore(query, [item.title, item.artist ?? "", item.artist ? `${item.artist} ${item.title}` : "", ...item.aliases]) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.item : undefined;
    if (match) { setSong(match); setStatus("catalogFound"); return; }
    if (!normalized) { setSong(null); setStatus("notFound"); return; }

    setSong(null);
    setStatus("searching");
    try {
      const api = sourceApiUrl();
      if (api) {
        const sourceResponse = await fetch(`${api}/api/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
        if (!sourceResponse.ok) throw new Error(`Source API returned ${sourceResponse.status}`);
        const sourceData = await sourceResponse.json() as { results?: SourceCandidate[]; discoveryOnly?: boolean };
        if (sourceData.results?.length) {
          setSourceCandidates(sourceData.results);
          setStatus(sourceData.discoveryOnly ? "discoveryFound" : "sourceFound");
          return;
        }
      }

      const searchResponse = await fetch(`${THE_SESSION_SEARCH_URL}${encodeURIComponent(query.trim())}`);
      if (!searchResponse.ok) throw new Error(`The Session search returned ${searchResponse.status}`);
      const searchData = await searchResponse.json() as { tunes?: Array<{ id: number; name: string; alias?: string; url: string; type?: string }> };
      const result = searchData.tunes
        ?.map((item) => ({ item, score: searchMatchScore(query, [item.name, item.alias ?? "", `${item.name} ${item.type ?? ""}`]) }))
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score)[0]?.item;
      if (!result) { setStatus("notFound"); return; }

      const tuneResponse = await fetch(`https://thesession.org/tunes/${result.id}?format=json`);
      if (!tuneResponse.ok) throw new Error(`The Session tune returned ${tuneResponse.status}`);
      const tune = await tuneResponse.json() as { aliases?: string[]; settings?: Array<{ key: string; abc: string }> };
      const setting = tune.settings?.find((item) => /^(d|g|e(minor|dorian)|a(dorian)?)/i.test(item.key)) ?? tune.settings?.[0];
      const parsedScore = setting ? parseAbcScore(setting.abc, setting.key) : null;
      const notes = parsedScore?.notes ?? "";
      if (!notes) { setStatus("notFound"); return; }

      setSong({
        id: `thesession-${result.id}`,
        title: result.name,
        aliases: [result.alias ?? "", ...(tune.aliases ?? [])].filter(Boolean),
        subtitle: {
          en: `${result.type ?? "Traditional tune"} · live ABC setting in ${setting?.key ?? "unknown key"}`,
          tr: `${result.type ?? "Geleneksel ezgi"} · ${setting?.key ?? "bilinmeyen ton"} tonunda canlı ABC düzeni`,
        },
        difficulty: { en: "Source arrangement", tr: "Kaynak düzeni" },
        notes,
        rhythm: parsedScore?.rhythm as Song["rhythm"],
        sourceStatus: "live",
        sources: [{ name: "The Session", url: result.url, role: "note-source" }],
      });
      setStatus("liveFound");
    } catch {
      setStatus("sourceUnavailable");
    }
  }

  async function processSource(candidate: SourceCandidate) {
    if (candidate.processingMode === "review" || (candidate.postId === undefined && candidate.documentId === undefined)) return;
    const api = sourceApiUrl();
    if (!api) { setStatus("sourceUnavailable"); return; }
    setStatus("queueing");
    try {
      const response = await fetch(`${api}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: candidate.sourceId,
          ...(candidate.postId !== undefined ? { postId: candidate.postId } : {}),
          ...(candidate.documentId !== undefined ? { documentId: candidate.documentId } : {}),
          query,
          title: candidate.title,
        }),
      });
      if (!response.ok) throw new Error(`Source job returned ${response.status}`);
      const queued = await response.json() as SourceJob;
      setStatus("processing");
      window.localStorage.setItem("twnc-pending-source-job", queued.requestId);

      const job = await waitForSourceJob(api, queued.requestId);
      if (job?.status === "completed" && job.song) {
        setSong(job.song);
        setSourceCandidates([]);
        setStatus("liveFound");
        window.localStorage.removeItem("twnc-pending-source-job");
        return;
      }
      if (job?.status === "needs-review") {
        setStatus("needsReview");
        window.localStorage.removeItem("twnc-pending-source-job");
        return;
      }
      setStatus("sourceUnavailable");
    } catch {
      setStatus("sourceUnavailable");
    }
  }

  function convertManual(event?: FormEvent) {
    event?.preventDefault();
    if (!parsePhrases(manualNotes).flat().length) { setStatus("invalidNotes"); return; }
    setSong({
      id: "manual",
      title: t.customTitle,
      aliases: [],
      subtitle: { en: COPY.en.customSubtitle, tr: COPY.tr.customSubtitle },
      difficulty: { en: COPY.en.customDifficulty, tr: COPY.tr.customDifficulty },
      notes: manualNotes,
      sourceStatus: "manual",
      sources: [],
    });
    setStatus("converted");
  }

  async function convertAudio(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatus("audioTranscribing");
    setTranscriptionProgress(0);
    try {
      const result = await transcribeAudioFile(file, (progress: number) => setTranscriptionProgress(Math.round(progress * 100)));
      if (!result.noteCount || !result.notes) {
        setStatus("audioUnavailable");
        return;
      }
      const title = file.name.replace(/\.[^.]+$/, "").replaceAll(/[_-]+/g, " ").trim() || t.customTitle;
      setSong({
        id: `audio-${Date.now()}`,
        title,
        aliases: [],
        subtitle: { en: "Locally transcribed audio melody", tr: "Tarayıcıda sesten çıkarılan melodi" },
        difficulty: { en: "Machine transcription", tr: "Makine transkripsiyonu" },
        notes: result.notes,
        rhythm: result.rhythm,
        sourceStatus: "manual",
        sources: [],
      });
      setBpm(result.rhythm.bpm);
      setStatus("audioConverted");
    } catch {
      setStatus("audioUnavailable");
    } finally {
      setTranscriptionProgress(0);
    }
  }

  function chooseSuggestion(selected: Song) {
    setQuery(selected.title); setSong(selected); setStatus("catalogFound"); setMode("search");
  }

  return (
    <main lang={language}>
      <nav className="nav shell" aria-label="Main navigation">
        <a className="brand" href="#top">Tin Whistle Note Creator</a>
        <div className="nav-actions">
          <a href="#how-it-works">{t.navHow}</a>
          <button className="language-toggle" type="button" onClick={toggleLanguage} aria-label={t.languageLabel}>{t.languageAction}</button>
          <span className="mvp-badge">{t.badge}</span>
        </div>
      </nav>

      <section className="hero shell" id="top">
        <div className="eyebrow"><span /> {t.eyebrow}</div>
        <h1>{t.heroTop}<br /><em>{t.heroAccent}</em></h1>
        <p>{t.intro}</p>

        <div className="converter-card">
          <div className="mode-tabs" role="tablist" aria-label="Note source">
            <button type="button" role="tab" aria-selected={mode === "search"} onClick={() => setMode("search")}>{t.catalogTab}</button>
            <button type="button" role="tab" aria-selected={mode === "paste"} onClick={() => setMode("paste")}>{t.pasteTab}</button>
            <button type="button" role="tab" aria-selected={mode === "audio"} onClick={() => setMode("audio")}>{t.audioTab}</button>
          </div>
          {mode === "search" ? (
            <form onSubmit={findSong}>
              <label htmlFor="song-search">{t.searchLabel}</label>
              <div className="search-row">
                <span aria-hidden="true">⌕</span>
                <input id="song-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} />
                <button type="submit" disabled={status === "searching"}>{status === "searching" ? "…" : t.find} <span aria-hidden="true">→</span></button>
              </div>
              <div className="suggestions">
                <span>{t.suggested}</span>
                {catalog.slice(0, 4).map((item) => <button type="button" onClick={() => chooseSuggestion(item)} key={item.id}>{item.artist ? `${item.artist} · ` : ""}{item.title}</button>)}
              </div>
              {sourceCandidates.length > 0 && <div className="source-results" aria-label={t.sourceFound}>
                {sourceCandidates.map((candidate) => <article className="source-result" key={candidate.id}>
                  <div>
                    <strong>{candidate.title}</strong>
                    <span>{candidate.sourceName} · {candidate.processingMode === "text" ? t.textSource : candidate.processingMode === "review" ? t.webSource : t.scoreSource}</span>
                  </div>
                  <div>
                    <a href={candidate.url} target="_blank" rel="noreferrer">{t.primarySource}</a>
                    {candidate.processingMode === "review" ? <span className="source-review">{t.reviewSource}</span> : <button type="button" onClick={() => processSource(candidate)}>{t.processSource} →</button>}
                  </div>
                </article>)}
              </div>}
            </form>
          ) : mode === "paste" ? (
            <form onSubmit={convertManual}>
              <label htmlFor="notes-input">{t.pasteLabel}</label>
              <textarea id="notes-input" value={manualNotes} onChange={(event) => setManualNotes(event.target.value)} rows={3} />
              <div className="paste-actions"><span>{t.pasteHint}</span><button type="submit">{t.convert} <span aria-hidden="true">→</span></button></div>
            </form>
          ) : (
            <div className="audio-import">
              <label htmlFor="audio-input">{t.audioLabel}</label>
              <label className={`audio-picker${status === "audioTranscribing" ? " disabled" : ""}`} htmlFor="audio-input">
                <span aria-hidden="true">♪</span>
                <strong>{status === "audioTranscribing" ? `${t.audioTranscribing} ${transcriptionProgress}%` : t.audioChoose}</strong>
                <small>{t.audioHint}</small>
              </label>
              <input id="audio-input" type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/flac,.mp3,.wav,.ogg,.flac" onChange={convertAudio} disabled={status === "audioTranscribing"} />
              {status === "audioTranscribing" && <progress max="100" value={transcriptionProgress}>{transcriptionProgress}%</progress>}
            </div>
          )}
          <p className="status" role="status"><span /> {t[status]}</p>
        </div>
      </section>

      {song ? <section className="workspace shell" aria-labelledby="preview-title">
        <div className="workspace-heading">
          <div><span className="section-kicker">{t.guide}</span><h2 id="preview-title">{song.artist ? `${song.artist} — ` : ""}{song.title}</h2><p>{song.sourceConfidence === "estimated" ? t.textEstimated : song.subtitle[language]} · {song.difficulty[language]} · D tin whistle</p></div>
          <div className="workspace-actions">
            <div className="legend"><span className="hole closed" /> {t.closed} <span className="hole half" /> {t.half} <span className="hole open" /> {t.open}</div>
            <button type="button" className="print-button" onClick={() => window.print()}>{t.print}</button>
          </div>
        </div>
        {song.sourceStatus !== "manual" && songQuality && <div className={`source-panel quality-${songQuality.tone}`}>
          <div>
            <strong>{songQuality.tone === "verified" ? "✓" : songQuality.tone === "warning" ? "!" : "i"} {songQuality.melody === "cross-checked" ? t.verified : songQuality.melody === "omr-unreviewed" ? t.omrUnreviewed : songQuality.melody === "text-estimated" ? t.textEstimated : t.sourcedMelody}</strong>
            <span>{songQuality.melody === "omr-unreviewed" ? t.omrCaveat : songQuality.rhythm === "score" ? t.scoreRhythm : songQuality.rhythm === "text" ? t.textRhythm : t.sourceCaveat}</span>
            <div className="quality-facts" aria-label={t.qualitySummary}>
              <span><b>{t.qualityMelody}:</b> {songQuality.melody === "cross-checked" ? t.verified : songQuality.melody === "omr-unreviewed" ? t.omrUnreviewed : songQuality.melody === "text-estimated" ? t.textEstimated : t.sourcedMelody}</span>
              <span><b>{t.qualityRhythm}:</b> {songQuality.rhythm === "score" ? t.scoreRhythm : songQuality.rhythm === "text" ? t.textRhythm : t.estimatedRhythm}</span>
              <span><b>{t.qualityTempo}:</b> {songQuality.tempo === "known" ? t.knownTempo : t.defaultTempoShort}</span>
            </div>
          </div>
          <div className="source-links"><span>{t.sources}:</span>{song.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.name} <small>({source.role === "note-source" ? t.primarySource : t.crossCheck})</small></a>)}</div>
        </div>}
        <div className="arrangement-panel">
          <strong>{t.arrangementTitle}</strong>
          <span>{arrangement.semitoneShift === 0
            ? (arrangement.octaveAdjustments > 0 ? t.arrangementOctaveAdjusted : t.arrangementOriginal)
            : `${arrangement.semitoneShift < 0 ? t.arrangementDown : t.arrangementUp} ${Math.abs(arrangement.semitoneShift)} ${t.semitones}. ${t.intervalsPreserved}${arrangement.octaveAdjustments > 0 ? ` ${t.arrangementOctaveAdjusted}` : ""}`}</span>
          <small>{t.whistleOctaveHelp}</small>
        </div>
        <section className={`practice-panel${isPlaying ? " playing" : ""}`} aria-label={t.practice}>
          <div className="practice-title"><span className="section-kicker">{t.practice}</span><strong>{song.rhythm?.source === "score" ? t.scoreRhythm : song.rhythm?.source === "text" ? t.textRhythm : song.rhythm?.source === "transcribed" ? t.transcribedRhythm : t.estimatedRhythm}</strong></div>
          <div className="practice-controls">
            <button type="button" className="practice-play" onClick={togglePractice} disabled={!playbackPlan.length || soundStatus === "loading"} aria-pressed={isPlaying}><span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span> {soundStatus === "loading" ? "…" : isPlaying ? t.pause : t.play}</button>
            <button type="button" className="practice-stop" onClick={stopPractice} disabled={!isPlaying && activeNoteIndex < 0}><span aria-hidden="true">■</span> {t.stop}</button>
            <label htmlFor="practice-bpm">{t.tempo}</label>
            <input id="practice-bpm" type="range" min="40" max="220" step="1" value={bpm} onChange={(event) => changeTempo(Number(event.target.value))} />
            <output htmlFor="practice-bpm">{bpm} BPM</output>
            <span className={`tempo-origin ${tempoStatus}`}>
              {tempoStatus === "loading"
                ? t.tempoSearching
                : song.rhythm?.tempoSource === "database"
                  ? song.rhythm.tempoUrl
                    ? <a href={song.rhythm.tempoUrl} target="_blank" rel="noreferrer">{t.originalTempo}</a>
                    : t.originalTempo
                  : song.rhythm?.tempoSource === "score" || song.rhythm?.tempoSource === "curated"
                    ? t.scoreTempo
                    : t.defaultTempo}
            </span>
          </div>
          <div className="practice-progress" aria-live="polite"><span>{soundStatus === "loading" ? t.loadingSound : soundStatus === "fallback" ? t.referenceSound : t.whistleSound}</span><strong>{progressCurrent} / {progressTotal}</strong></div>
          <div className="practice-options">
            <label className="practice-toggle"><input type="checkbox" checked={metronomeEnabled} onChange={(event) => changeMetronome(event.target.checked)} /> <span>{t.metronome}</span></label>
            <label className="practice-toggle"><input type="checkbox" checked={followEnabled} onChange={(event) => setFollowEnabled(event.target.checked)} /> <span>{t.followNotes}</span></label>
            <label className="practice-toggle"><input type="checkbox" checked={loopEnabled} onChange={(event) => changeLoop(event.target.checked)} /> <span>{t.loopPhrase}</span></label>
            <label className="phrase-select" htmlFor="loop-phrase"><span>{t.selectPhrase}</span><select id="loop-phrase" value={selectedPhraseIndex} onChange={(event) => changeSelectedPhrase(Number(event.target.value))} disabled={!loopEnabled}>{phrases.map((_, index) => <option value={index} key={index}>{t.phrase} {String(index + 1).padStart(2, "0")}</option>)}</select></label>
          </div>
        </section>
        <p className="audio-credit">{t.sampleCredit}: <a href="https://github.com/mrbumpy409/GeneralUser-GS" target="_blank" rel="noreferrer">{t.soundBank}</a> · <a href="https://github.com/surikov/webaudiofontdata" target="_blank" rel="noreferrer">{t.soundConversion}</a> · <a href="https://huggingface.co/AEmotionStudio/windstudio-tin-whistle-samples" target="_blank" rel="noreferrer">{t.fallbackSamples}</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a> · Audio transcription: <a href="https://github.com/spotify/basic-pitch-ts" target="_blank" rel="noreferrer">Spotify Basic Pitch</a> · {t.bpmCredit}: <a href="https://getsongbpm.com" target="_blank" rel="noreferrer">GetSongBPM.com</a></p>
        {unsupported.length > 0 && <div className="warning" role="alert"><strong>{unsupported.length} {t.warningStart}</strong> {t.warningEnd}</div>}
        <div className="phrases">
          {phrases.map((phrase, phraseIndex) => (
            <article className={`phrase-card${loopEnabled && phraseIndex === selectedPhraseIndex ? " selected" : ""}`} key={phraseIndex}>
              <div className="phrase-meta"><span>{t.phrase} {String(phraseIndex + 1).padStart(2, "0")}</span><span>{phrase.length} {phrase.length === 1 ? t.note : t.notes}</span></div>
              <div className="notes-grid">{phrase.map((note, index) => {
                const globalIndex = phraseOffsets[phraseIndex] + index;
                return <Fingering note={note} index={index} globalIndex={globalIndex} active={activeNoteIndex === globalIndex} language={language} key={`${note.pitch}-${note.octave}-${index}`} />;
              })}</div>
            </article>
          ))}
        </div>
        <footer className="score-footer"><span>{allNotes.length} {t.notes} · {phrases.length} {t.phrases}</span><span>Tin Whistle Note Creator MVP · {song.rhythm?.source === "score" ? t.scoreRhythm : song.rhythm?.source === "text" ? t.textRhythm : song.rhythm?.source === "transcribed" ? t.transcribedRhythm : t.estimatedRhythm}</span></footer>
      </section> : <section className="workspace empty-workspace shell" aria-live="polite">
        <span className="section-kicker">{t.guide}</span>
        <h2>{t.emptyTitle}</h2>
        <p>{t.emptyBody}</p>
        <a className="request-button" href={`https://github.com/ozguregemen/tin-whistle-note-creator/issues/new?title=${encodeURIComponent(`Song request: ${query}`)}`} target="_blank" rel="noreferrer">{t.requestSong} →</a>
      </section>}

      <section className="how shell" id="how-it-works">
        <div><span className="section-kicker">{t.mvpScope}</span><h2>{t.howTitle}</h2></div>
        <ol>
          <li><span>01</span><div><strong>{t.step1Title}</strong><p>{t.step1Body}</p></div></li>
          <li><span>02</span><div><strong>{t.step2Title}</strong><p>{t.step2Body}</p></div></li>
          <li><span>03</span><div><strong>{t.step3Title}</strong><p>{t.step3Body}</p></div></li>
        </ol>
      </section>
      <footer className="site-footer shell"><span>Tin Whistle Note Creator</span><p>{t.footer}</p></footer>
    </main>
  );
}
