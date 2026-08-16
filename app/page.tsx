"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Language = "en" | "tr";
type StatusKey = "catalogPrepared" | "catalogFound" | "notFound" | "converted" | "invalidNotes";

type Song = {
  title: string;
  subtitle: Record<Language, string>;
  difficulty: Record<Language, string>;
  notes: string;
};

type ParsedNote = {
  token: string;
  display: string;
  pitch: string;
  octave: number;
  holes?: string;
};

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
    searchLabel: "What song would you like to play?",
    searchPlaceholder: "Song or folk tune name",
    find: "Find notes",
    suggested: "Try:",
    pasteLabel: "Separate notes with spaces and phrases with a “|”",
    pasteHint: "Use Do/Re/Mi or C/D/E · Add # for sharps · Example: F#4",
    convert: "Convert",
    catalogPrepared: "Ready from the local MVP catalog",
    catalogFound: "Found in the local MVP catalog",
    notFound: "That song is not in the catalog yet. Paste its notes to continue.",
    converted: "Notes converted into fingering diagrams",
    invalidNotes: "No valid notes found. Example: D4 E4 F#4 G4 | A4 B4",
    guide: "Fingering guide",
    closed: "Closed",
    open: "Open",
    print: "Print / PDF",
    warningStart: "note(s) sit outside the standard D scale.",
    warningEnd: "Faded notes need an alternate fingering or transposition.",
    phrase: "Phrase",
    note: "note",
    notes: "notes",
    phrases: "phrases",
    noRhythm: "Rhythm is not included in this MVP",
    mvpScope: "MVP scope",
    howTitle: "First the right fingers, then the right tempo.",
    step1Title: "Bring in the notes",
    step1Body: "Choose from the local catalog or paste a simple note sequence.",
    step2Title: "Check playability",
    step2Body: "Clearly flag notes that fall outside a standard D tin whistle scale.",
    step3Title: "Build the fingering sheet",
    step3Body: "Create a readable guide for screen, print, and PDF.",
    footer: "A first step toward a more accessible Turkish tin whistle repertoire.",
    customTitle: "My melody",
    customSubtitle: "Manually entered note sequence",
    customDifficulty: "Custom",
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
    searchLabel: "Hangi şarkıyı çalmak istiyorsun?",
    searchPlaceholder: "Şarkı veya türkü adı",
    find: "Notaları bul",
    suggested: "Önerilen:",
    pasteLabel: "Notaları boşlukla, cümleleri “|” işaretiyle ayır",
    pasteHint: "Do/Re/Mi veya C/D/E kullan · Diyez için # ekle · Örnek: F#4",
    convert: "Dönüştür",
    catalogPrepared: "Yerel MVP kataloğundan hazırlandı",
    catalogFound: "Yerel MVP kataloğunda bulundu",
    notFound: "Bu şarkı henüz katalogda yok. Notaları yapıştırarak devam edebilirsin.",
    converted: "Notalar parmak pozisyonlarına dönüştürüldü",
    invalidNotes: "Geçerli nota bulunamadı. Örnek: D4 E4 F#4 G4 | A4 B4",
    guide: "Parmak rehberi",
    closed: "Kapalı",
    open: "Açık",
    print: "Yazdır / PDF",
    warningStart: "nota standart D dizisinin dışında.",
    warningEnd: "Soluk gösterilen notalar için alternatif parmak veya transpoze gerekir.",
    phrase: "Cümle",
    note: "nota",
    notes: "nota",
    phrases: "cümle",
    noRhythm: "Ritim bilgisi bu MVP’ye dahil değildir",
    mvpScope: "MVP sınırı",
    howTitle: "Önce doğru parmak, sonra doğru tempo.",
    step1Title: "Notayı al",
    step1Body: "Yerel katalogdan seç veya basit bir nota dizisi yapıştır.",
    step2Title: "Uygunluğu kontrol et",
    step2Body: "Standart D tin whistle dizisinin dışındaki sesleri açıkça işaretle.",
    step3Title: "Parmak rehberini üret",
    step3Body: "Ekran, yazıcı ve PDF için okunaklı bir çıktı oluştur.",
    footer: "Türkçe tin whistle repertuvarını erişilebilir kılmak için ilk adım.",
    customTitle: "Benim ezgim",
    customSubtitle: "Elle girilen nota dizisi",
    customDifficulty: "Özel",
  },
} as const;

const SONGS: Song[] = [
  {
    title: "Üsküdar’a Gider İken",
    subtitle: { en: "Traditional Istanbul folk tune · demo arrangement", tr: "Geleneksel İstanbul türküsü · demo düzenleme" },
    difficulty: { en: "Beginner", tr: "Başlangıç" },
    notes: "D4 E4 F#4 G4 | A4 G4 F#4 E4 | D4 F#4 A4 B4 | A4 G4 F#4 E4",
  },
  {
    title: "Çanakkale Türküsü",
    subtitle: { en: "Traditional folk tune · demo arrangement", tr: "Geleneksel halk ezgisi · demo düzenleme" },
    difficulty: { en: "Beginner", tr: "Başlangıç" },
    notes: "A4 A4 B4 A4 | G4 F#4 E4 F#4 | G4 A4 B4 A4 | G4 F#4 E4 D4",
  },
  {
    title: "Drama Köprüsü",
    subtitle: { en: "Rumelian folk tune · demo arrangement", tr: "Rumeli türküsü · demo düzenleme" },
    difficulty: { en: "Intermediate", tr: "Orta" },
    notes: "B4 A4 G4 F#4 | G4 A4 B4 D5 | C#5 B4 A4 G4 | F#4 E4 D4 D4",
  },
];

const FINGERINGS: Record<string, string> = {
  D: "111111", E: "111110", "F#": "111100", G: "111000",
  A: "110000", B: "100000", "C#": "000000",
};

const SOLFEGE: Record<string, string> = { DO: "C", RE: "D", RÉ: "D", MI: "E", FA: "F", SOL: "G", LA: "A", SI: "B" };
const NOTE_NAMES: Record<string, string> = {
  C: "Do", "C#": "Do♯", D: "Re", "D#": "Re♯", E: "Mi", F: "Fa",
  "F#": "Fa♯", G: "Sol", "G#": "Sol♯", A: "La", "A#": "La♯", B: "Si",
};

function normalizeNote(raw: string): ParsedNote | null {
  const cleaned = raw.trim().replaceAll("♯", "#").replaceAll("♭", "b");
  const match = cleaned.match(/^([A-Ga-g]|do|re|ré|mi|fa|sol|la|si)([#b]?)([3-6])?$/i);
  if (!match) return null;
  let pitch = SOLFEGE[match[1].toUpperCase()] ?? match[1].toUpperCase();
  if (match[2] === "#") pitch += "#";
  if (match[2] === "b") {
    const flatToSharp: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
    pitch = flatToSharp[`${pitch}b`] ?? pitch;
  }
  const octave = Number(match[3] ?? (pitch === "C" || pitch === "C#" ? 5 : 4));
  return { token: raw, pitch, octave, display: NOTE_NAMES[pitch] ?? pitch, holes: FINGERINGS[pitch] };
}

function parsePhrases(source: string): ParsedNote[][] {
  return source.split("|")
    .map((phrase) => phrase.split(/[\s,;]+/).map(normalizeNote).filter((note): note is ParsedNote => note !== null))
    .filter((phrase) => phrase.length > 0);
}

function Fingering({ note, index, language }: { note: ParsedNote; index: number; language: Language }) {
  const playable = Boolean(note.holes);
  return (
    <div className={`fingering ${playable ? "" : "unsupported"}`} aria-label={`${language === "en" ? note.pitch : note.display} ${note.octave}`}>
      {note.octave >= 5 && <span className="octave-mark" title="Upper octave">•</span>}
      <span className="note-order">{String(index + 1).padStart(2, "0")}</span>
      <div className="whistle-holes" aria-hidden="true">
        {(note.holes ?? "??????").split("").map((closed, holeIndex) => (
          <span className={`hole ${closed === "1" ? "closed" : ""} ${closed === "?" ? "unknown" : ""}`} key={holeIndex} />
        ))}
      </div>
      <strong>{language === "en" ? note.pitch : note.display}</strong>
      <small>{language === "en" ? `${note.pitch}${note.octave}` : `${note.display}${note.octave}`}</small>
    </div>
  );
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  const [mode, setMode] = useState<"search" | "paste">("search");
  const [query, setQuery] = useState("Üsküdar’a Gider İken");
  const [manualNotes, setManualNotes] = useState("D4 E4 F#4 G4 | A4 B4 C#5 D5 | D5 C#5 B4 A4 | G4 F#4 E4 D4");
  const [song, setSong] = useState<Song>(SONGS[0]);
  const [status, setStatus] = useState<StatusKey>("catalogPrepared");
  const t = COPY[language];

  useEffect(() => {
    const saved = window.localStorage.getItem("twnc-language");
    if (saved === "tr" || saved === "en") setLanguage(saved);
  }, []);

  const phrases = useMemo(() => parsePhrases(song.notes), [song]);
  const allNotes = phrases.flat();
  const unsupported = allNotes.filter((note) => !note.holes);

  function toggleLanguage() {
    const next = language === "en" ? "tr" : "en";
    setLanguage(next);
    window.localStorage.setItem("twnc-language", next);
  }

  function findSong(event?: FormEvent) {
    event?.preventDefault();
    const normalized = query.toLocaleLowerCase("tr-TR").trim();
    const match = SONGS.find((item) => item.title.toLocaleLowerCase("tr-TR").includes(normalized) || normalized.includes(item.title.toLocaleLowerCase("tr-TR")));
    if (match) { setSong(match); setStatus("catalogFound"); }
    else { setStatus("notFound"); setMode("paste"); }
  }

  function convertManual(event?: FormEvent) {
    event?.preventDefault();
    if (!parsePhrases(manualNotes).flat().length) { setStatus("invalidNotes"); return; }
    setSong({
      title: t.customTitle,
      subtitle: { en: COPY.en.customSubtitle, tr: COPY.tr.customSubtitle },
      difficulty: { en: COPY.en.customDifficulty, tr: COPY.tr.customDifficulty },
      notes: manualNotes,
    });
    setStatus("converted");
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
          </div>
          {mode === "search" ? (
            <form onSubmit={findSong}>
              <label htmlFor="song-search">{t.searchLabel}</label>
              <div className="search-row">
                <span aria-hidden="true">⌕</span>
                <input id="song-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} />
                <button type="submit">{t.find} <span aria-hidden="true">→</span></button>
              </div>
              <div className="suggestions">
                <span>{t.suggested}</span>
                {SONGS.map((item) => <button type="button" onClick={() => chooseSuggestion(item)} key={item.title}>{item.title}</button>)}
              </div>
            </form>
          ) : (
            <form onSubmit={convertManual}>
              <label htmlFor="notes-input">{t.pasteLabel}</label>
              <textarea id="notes-input" value={manualNotes} onChange={(event) => setManualNotes(event.target.value)} rows={3} />
              <div className="paste-actions"><span>{t.pasteHint}</span><button type="submit">{t.convert} <span aria-hidden="true">→</span></button></div>
            </form>
          )}
          <p className="status" role="status"><span /> {t[status]}</p>
        </div>
      </section>

      <section className="workspace shell" aria-labelledby="preview-title">
        <div className="workspace-heading">
          <div><span className="section-kicker">{t.guide}</span><h2 id="preview-title">{song.title}</h2><p>{song.subtitle[language]} · {song.difficulty[language]} · D tin whistle</p></div>
          <div className="workspace-actions">
            <div className="legend"><span className="hole closed" /> {t.closed} <span className="hole" /> {t.open}</div>
            <button type="button" className="print-button" onClick={() => window.print()}>{t.print}</button>
          </div>
        </div>
        {unsupported.length > 0 && <div className="warning" role="alert"><strong>{unsupported.length} {t.warningStart}</strong> {t.warningEnd}</div>}
        <div className="phrases">
          {phrases.map((phrase, phraseIndex) => (
            <article className="phrase-card" key={phraseIndex}>
              <div className="phrase-meta"><span>{t.phrase} {String(phraseIndex + 1).padStart(2, "0")}</span><span>{phrase.length} {phrase.length === 1 ? t.note : t.notes}</span></div>
              <div className="notes-grid">{phrase.map((note, index) => <Fingering note={note} index={index} language={language} key={`${note.pitch}-${note.octave}-${index}`} />)}</div>
            </article>
          ))}
        </div>
        <footer className="score-footer"><span>{allNotes.length} {t.notes} · {phrases.length} {t.phrases}</span><span>Tin Whistle Note Creator MVP · {t.noRhythm}</span></footer>
      </section>

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
