import type { ScoreMatches, SessionTune, SourceCandidate } from "./youtube-score-sources";

export const youtubeScoreCopy = {
  en: {
    search: "Find notes from YouTube",
    checking: "Checking the catalog and online note sources…",
    found: "Matching scores",
    catalog: "Song catalog",
    open: "Open score",
    review: "View source",
    audio: "Use the video audio instead",
  },
  tr: {
    search: "YouTube bağlantısından nota bul",
    checking: "Katalog ve internetteki nota kaynakları taranıyor…",
    found: "Eşleşen notalar",
    catalog: "Şarkı kataloğu",
    open: "Notayı aç",
    review: "Kaynağı incele",
    audio: "Videonun sesini kullan",
  },
};

export function YoutubeScoreOptions<T extends { id: string; title: string; artist?: string }>({
  language, title, matches, busy, audioAvailable, onCatalog, onSource, onTune, onAudio,
}: {
  language: "en" | "tr";
  title: string;
  matches: ScoreMatches<T>;
  busy: boolean;
  audioAvailable: boolean;
  onCatalog: (song: T) => void;
  onSource: (source: SourceCandidate) => void;
  onTune: (tune: SessionTune) => void;
  onAudio: () => void;
}) {
  const copy = youtubeScoreCopy[language];
  const actionableSources = matches.sources.filter(item => item.processingMode !== "review");
  const links = matches.sources.filter(item => item.processingMode === "review" && item.url.startsWith("https://"));
  return (
    <section className="youtube-score-options" aria-label={copy.found}>
      <h3 role="status">{copy.found} · {title}</h3>
      <div className="source-results">
        {matches.catalog.map(song => (
          <article className="source-result" key={song.id}>
            <div><strong>{song.title}</strong><span>{[song.artist, copy.catalog].filter(Boolean).join(" · ")}</span></div>
            <button type="button" disabled={busy} onClick={() => onCatalog(song)}>{copy.open}</button>
          </article>
        ))}
        {actionableSources.map(source => (
          <article className="source-result" key={source.id}>
            <div><strong>{source.title}</strong><span>{source.sourceName}</span></div>
            <button type="button" disabled={busy} onClick={() => onSource(source)}>{copy.open}</button>
          </article>
        ))}
        {matches.tunes.map(tune => (
          <article className="source-result" key={tune.id}>
            <div><strong>{tune.name}</strong><span>The Session</span></div>
            <button type="button" disabled={busy} onClick={() => onTune(tune)}>{copy.open}</button>
          </article>
        ))}
        {links.map(source => (
          <article className="source-result" key={source.id}>
            <div><strong>{source.title}</strong><span>{source.sourceName}</span></div>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{copy.review}</a>
          </article>
        ))}
      </div>
      {audioAvailable && <button type="button" className="secondary-action" disabled={busy} onClick={onAudio}>{copy.audio}</button>}
    </section>
  );
}
