"use client";

import { FormEvent, useMemo, useState } from "react";

type Song = {
  title: string;
  subtitle: string;
  difficulty: string;
  notes: string;
};

type ParsedNote = {
  token: string;
  display: string;
  pitch: string;
  octave: number;
  holes?: string;
};

const SONGS: Song[] = [
  {
    title: "Üsküdar’a Gider İken",
    subtitle: "Geleneksel İstanbul türküsü",
    difficulty: "Başlangıç",
    notes: "D4 E4 F#4 G4 | A4 G4 F#4 E4 | D4 F#4 A4 B4 | A4 G4 F#4 E4",
  },
  {
    title: "Çanakkale Türküsü",
    subtitle: "Geleneksel halk ezgisi · demo düzenleme",
    difficulty: "Başlangıç",
    notes: "A4 A4 B4 A4 | G4 F#4 E4 F#4 | G4 A4 B4 A4 | G4 F#4 E4 D4",
  },
  {
    title: "Drama Köprüsü",
    subtitle: "Rumeli türküsü · demo düzenleme",
    difficulty: "Orta",
    notes: "B4 A4 G4 F#4 | G4 A4 B4 D5 | C#5 B4 A4 G4 | F#4 E4 D4 D4",
  },
];

const FINGERINGS: Record<string, string> = {
  D: "111111",
  E: "111110",
  "F#": "111100",
  G: "111000",
  A: "110000",
  B: "100000",
  "C#": "000000",
};

const SOLFEGE: Record<string, string> = {
  DO: "C",
  RE: "D",
  RÉ: "D",
  MI: "E",
  FA: "F",
  SOL: "G",
  LA: "A",
  SI: "B",
};

const NOTE_NAMES: Record<string, string> = {
  C: "Do", "C#": "Do♯", D: "Re", "D#": "Re♯", E: "Mi", F: "Fa",
  "F#": "Fa♯", G: "Sol", "G#": "Sol♯", A: "La", "A#": "La♯", B: "Si",
};

function normalizeNote(raw: string): ParsedNote | null {
  const cleaned = raw.trim().replaceAll("♯", "#").replaceAll("♭", "b");
  const match = cleaned.match(/^([A-Ga-g]|do|re|ré|mi|fa|sol|la|si)([#b]?)([3-6])?$/i);
  if (!match) return null;
  let pitch = SOLFEGE[match[1].toUpperCase()] ?? match[1].toUpperCase();
  const accidental = match[2];
  if (accidental === "#") pitch += "#";
  if (accidental === "b") {
    const flatToSharp: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
    pitch = flatToSharp[`${pitch}b`] ?? pitch;
  }
  const octave = Number(match[3] ?? (pitch === "C" || pitch === "C#" ? 5 : 4));
  return {
    token: raw,
    pitch,
    octave,
    display: NOTE_NAMES[pitch] ?? pitch,
    holes: FINGERINGS[pitch],
  };
}

function parsePhrases(source: string): ParsedNote[][] {
  return source
    .split("|")
    .map((phrase) => phrase.split(/[\s,;]+/).map(normalizeNote).filter((note): note is ParsedNote => note !== null))
    .filter((phrase) => phrase.length > 0);
}

function Fingering({ note, index }: { note: ParsedNote; index: number }) {
  const playable = Boolean(note.holes);
  return (
    <div className={`fingering ${playable ? "" : "unsupported"}`} aria-label={`${note.display} ${note.octave}. oktav parmak pozisyonu`}>
      {note.octave >= 5 && <span className="octave-mark" title="Üst oktav">•</span>}
      <span className="note-order">{String(index + 1).padStart(2, "0")}</span>
      <div className="whistle-holes" aria-hidden="true">
        {(note.holes ?? "??????").split("").map((closed, holeIndex) => (
          <span className={`hole ${closed === "1" ? "closed" : ""} ${closed === "?" ? "unknown" : ""}`} key={holeIndex} />
        ))}
      </div>
      <strong>{note.display}</strong>
      <small>{note.pitch}{note.octave}</small>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<"search" | "paste">("search");
  const [query, setQuery] = useState("Üsküdar’a Gider İken");
  const [manualNotes, setManualNotes] = useState("D4 E4 F#4 G4 | A4 B4 C#5 D5 | D5 C#5 B4 A4 | G4 F#4 E4 D4");
  const [song, setSong] = useState<Song>(SONGS[0]);
  const [status, setStatus] = useState("Yerel MVP kataloğundan hazırlandı");

  const phrases = useMemo(() => parsePhrases(song.notes), [song]);
  const allNotes = phrases.flat();
  const unsupported = allNotes.filter((note) => !note.holes);

  function findSong(event?: FormEvent) {
    event?.preventDefault();
    const normalized = query.toLocaleLowerCase("tr-TR").trim();
    const match = SONGS.find((item) => item.title.toLocaleLowerCase("tr-TR").includes(normalized) || normalized.includes(item.title.toLocaleLowerCase("tr-TR")));
    if (match) {
      setSong(match);
      setStatus("Yerel MVP kataloğunda bulundu");
    } else {
      setStatus("Bu şarkı henüz katalogda yok. Notaları yapıştırarak deneyebilirsin.");
      setMode("paste");
    }
  }

  function convertManual(event?: FormEvent) {
    event?.preventDefault();
    const parsed = parsePhrases(manualNotes);
    if (!parsed.flat().length) {
      setStatus("Geçerli nota bulunamadı. Örnek: D4 E4 F#4 G4 | A4 B4");
      return;
    }
    setSong({ title: "Benim ezgim", subtitle: "Elle girilen nota dizisi", difficulty: "Özel", notes: manualNotes });
    setStatus("Notalar parmak pozisyonlarına dönüştürüldü");
  }

  function chooseSuggestion(title: string) {
    const selected = SONGS.find((item) => item.title === title);
    if (!selected) return;
    setQuery(title);
    setSong(selected);
    setStatus("Yerel MVP kataloğunda bulundu");
    setMode("search");
  }

  return (
    <main>
      <nav className="nav shell" aria-label="Ana menü">
        <a className="brand" href="#top" aria-label="Nefes ana sayfa">
          <span className="brand-mark">n</span><span>Nefes</span>
        </a>
        <div className="nav-actions">
          <a href="#nasil-calisir">Nasıl çalışır?</a>
          <span className="mvp-badge">MVP · D Tin Whistle</span>
        </div>
      </nav>

      <section className="hero shell" id="top">
        <div className="eyebrow"><span /> Türkçe ezgiler, tin whistle’a uyarlanmış</div>
        <h1>Aradığın şarkı,<br /><em>parmaklarının ucunda.</em></h1>
        <p>Bir şarkı seç veya notalarını yapıştır. Her sesi, altı deliğin açık ve kapalı durumunu gösteren kolay bir parmak şemasına çevirelim.</p>

        <div className="converter-card">
          <div className="mode-tabs" role="tablist" aria-label="Nota kaynağı seçimi">
            <button type="button" role="tab" aria-selected={mode === "search"} onClick={() => setMode("search")}>Katalogda ara</button>
            <button type="button" role="tab" aria-selected={mode === "paste"} onClick={() => setMode("paste")}>Notaları yapıştır</button>
          </div>

          {mode === "search" ? (
            <form onSubmit={findSong}>
              <label htmlFor="song-search">Hangi şarkıyı çalmak istiyorsun?</label>
              <div className="search-row">
                <span aria-hidden="true">⌕</span>
                <input id="song-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Şarkı veya türkü adı" />
                <button type="submit">Notaları bul <span aria-hidden="true">→</span></button>
              </div>
              <div className="suggestions">
                <span>Önerilen:</span>
                {SONGS.map((item) => <button type="button" onClick={() => chooseSuggestion(item.title)} key={item.title}>{item.title}</button>)}
              </div>
            </form>
          ) : (
            <form onSubmit={convertManual}>
              <label htmlFor="notes-input">Notaları boşlukla, cümleleri “|” işaretiyle ayır</label>
              <textarea id="notes-input" value={manualNotes} onChange={(event) => setManualNotes(event.target.value)} rows={3} />
              <div className="paste-actions">
                <span>Do/Re/Mi veya C/D/E · Diyez için # · Örnek: F#4</span>
                <button type="submit">Dönüştür <span aria-hidden="true">→</span></button>
              </div>
            </form>
          )}
          <p className="status" role="status"><span /> {status}</p>
        </div>
      </section>

      <section className="workspace shell" aria-labelledby="preview-title">
        <div className="workspace-heading">
          <div>
            <span className="section-kicker">Parmak rehberi</span>
            <h2 id="preview-title">{song.title}</h2>
            <p>{song.subtitle} · {song.difficulty} · D tin whistle</p>
          </div>
          <div className="workspace-actions">
            <div className="legend"><span className="hole closed" /> Kapalı <span className="hole" /> Açık</div>
            <button type="button" className="print-button" onClick={() => window.print()}>Yazdır / PDF</button>
          </div>
        </div>

        {unsupported.length > 0 && (
          <div className="warning" role="alert"><strong>{unsupported.length} nota standart D dizisinin dışında.</strong> Soluk gösterilen notalar için alternatif parmak veya transpoze gerekir.</div>
        )}

        <div className="phrases">
          {phrases.map((phrase, phraseIndex) => (
            <article className="phrase-card" key={phraseIndex}>
              <div className="phrase-meta"><span>Cümle {String(phraseIndex + 1).padStart(2, "0")}</span><span>{phrase.length} nota</span></div>
              <div className="notes-grid">
                {phrase.map((note, index) => <Fingering note={note} index={index} key={`${note.pitch}-${note.octave}-${index}`} />)}
              </div>
            </article>
          ))}
        </div>

        <footer className="score-footer">
          <span>{allNotes.length} nota · {phrases.length} cümle</span>
          <span>Nefes MVP · Ritim bilgisi bu sürüme dahil değildir</span>
        </footer>
      </section>

      <section className="how shell" id="nasil-calisir">
        <div>
          <span className="section-kicker">MVP sınırı</span>
          <h2>Önce doğru parmak,<br />sonra doğru tempo.</h2>
        </div>
        <ol>
          <li><span>01</span><div><strong>Notayı al</strong><p>Şimdilik yerel katalogdan seç veya metin olarak yapıştır.</p></div></li>
          <li><span>02</span><div><strong>Uygunluğu kontrol et</strong><p>D tin whistle dizisine uymayan sesleri açıkça işaretle.</p></div></li>
          <li><span>03</span><div><strong>Parmak şemasını üret</strong><p>Her notayı ekran, yazıcı ve PDF için okunaklı hale getir.</p></div></li>
        </ol>
      </section>

      <footer className="site-footer shell"><span>Nefes</span><p>Türkçe tin whistle repertuvarını erişilebilir kılmak için ilk adım.</p></footer>
    </main>
  );
}
