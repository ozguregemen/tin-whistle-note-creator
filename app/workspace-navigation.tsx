"use client";

export type WorkArea = "catalog" | "web" | "import" | "practice";

export const workspaceCopy = {
  en: {
    navigation: "Work areas",
    catalog: "Catalog",
    import: "Import",
    practice: "Practice",
    importTitle: "Import a melody",
    importHint: "Choose how you want to turn a melody into fingerings.",
    online: "Search online",
    onlineTitle: "Find sheet music online",
    onlineHint: "Search external music sources by song or artist.",
    back: "Back to catalog",
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
    import: "İçe aktar",
    practice: "Prova",
    importTitle: "Melodi içe aktar",
    importHint: "Melodiyi parmak dizilimine çevirmek için bir giriş yöntemi seç.",
    online: "İnternette ara",
    onlineTitle: "İnternette nota bul",
    onlineHint: "Şarkı veya sanatçı adıyla harici nota kaynaklarını ara.",
    back: "Kataloğa dön",
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
  const selected = area === "web" ? "catalog" : area;
  return (
    <header className="app-header" id="top">
      <div className="app-bar shell">
        <a className="app-brand" href="#song-catalog" onClick={(event) => { event.preventDefault(); onNavigate("catalog"); }}>
          <span className="app-mark" aria-hidden="true">♪</span>
          <span>Tin Whistle Note Creator</span>
        </a>
        <nav className="app-nav" aria-label={t.navigation}>
          {(["catalog", "import", "practice"] as const).map((view) => (
            <button key={view} type="button" aria-current={selected === view ? "page" : undefined} onClick={() => onNavigate(view)}>
              {t[view]}
            </button>
          ))}
        </nav>
        <button className="app-language" type="button" onClick={onLanguage} aria-label={languageLabel}>{languageAction}</button>
      </div>
    </header>
  );
}
