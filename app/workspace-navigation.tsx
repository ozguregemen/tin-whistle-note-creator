"use client";

export type WorkArea = "catalog" | "listen" | "convert" | "practice";

export const workspaceCopy = {
  en: {
    navigation: "Work areas",
    catalog: "Catalog",
    listen: "Listen",
    playback: "Playback",
    backToCatalog: "Back to catalog",
    practiseSong: "Practise this song",
    convert: "Convert to notes",
    practice: "Practice",
    addEditSongs: "Add or edit songs",
    editSong: "Edit song",
    communityResults: "Community arrangements",
    communityTempo: "User-set tempo",
    addedBy: (username: string) => `Added by @${username}`,
    convertHint: "Find a song online or turn your own melody into tin whistle fingerings.",
    online: "Search online",
    practiceEmpty: "Choose a melody to practise",
    practiceEmptyHint: "Open a song from the catalog or import a melody of your own.",
    example: "Use example",
    manualLabel: "Your notes",
    manualAction: "Create fingerings",
    audioSource: "Audio recording",
    pasteSource: "Paste notes",
    scoreSource: "MIDI / MusicXML",
  },
  tr: {
    navigation: "Çalışma alanları",
    catalog: "Katalog",
    listen: "Dinle",
    playback: "Şarkıyı dinle",
    backToCatalog: "Kataloğa dön",
    practiseSong: "Bu şarkıyı prova et",
    convert: "Notaya çevir",
    practice: "Prova",
    addEditSongs: "Şarkı ekle veya düzenle",
    editSong: "Şarkıyı düzenle",
    communityResults: "Topluluk düzenlemeleri",
    communityTempo: "Kullanıcının belirlediği tempo",
    addedBy: (username: string) => `@${username} ekledi`,
    convertHint: "İnternetten bir şarkı bul veya kendi melodini tin whistle parmak dizilimine çevir.",
    online: "İnternette ara",
    practiceEmpty: "Prova için bir melodi seç",
    practiceEmptyHint: "Katalogdan bir şarkı aç veya kendi melodini içe aktar.",
    example: "Örneği kullan",
    manualLabel: "Notaların",
    manualAction: "Parmak dizilimi oluştur",
    audioSource: "Ses kaydı",
    pasteSource: "Nota yapıştır",
    scoreSource: "MIDI / MusicXML",
  },
};

export function WorkspaceNavigation({ language, area, languageLabel, languageAction, onLanguage, onNavigate }: {
  language: keyof typeof workspaceCopy;
  area: WorkArea;
  languageLabel: string;
  languageAction: string;
  onLanguage: () => void;
  onNavigate: (area: WorkArea) => void;
}) {
  const t = workspaceCopy[language];
  const activeArea = area === "listen" ? "catalog" : area;
  return (
    <header className="app-header" id="top">
      <div className="app-bar shell">
        <a className="app-brand" href="#song-catalog" onClick={(event) => { event.preventDefault(); onNavigate("catalog"); }}>
          <span className="app-mark" aria-hidden="true">♪</span>
          <span>Tin Whistle Note Creator</span>
        </a>
        <nav className="app-nav" aria-label={t.navigation}>
          {(["catalog", "convert", "practice"] as const).map((view) => (
            <button key={view} type="button" aria-current={activeArea === view ? "page" : undefined} onClick={() => onNavigate(view)}>
              {t[view]}
            </button>
          ))}
        </nav>
        <button className="app-language" type="button" onClick={onLanguage} aria-label={languageLabel}>{languageAction}</button>
      </div>
    </header>
  );
}
