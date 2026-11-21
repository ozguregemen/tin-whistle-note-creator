"use client";

import { useEffect, useMemo, useState } from "react";
import { browseCatalogGroups, groupCatalogSongs, isApprovedCatalogSong, withBundledCatalogSongs } from "./catalog-browse.mjs";
import { assessSongQuality } from "./catalog-quality.mjs";
import { workspaceCopy } from "./workspace-navigation";

const labels = {
  en: {
    title: "Song catalog",
    intro: "Choose a song to hear it and see the notes.",
    approved: "Approved",
    all: "All songs",
    filter: "Search the song catalog",
    placeholder: "Song or artist",
    open: "Practise",
    openSong: "Open fingerings for",
    openPlayer: "Open player for",
    excerpt: "Short excerpt",
    moreVersions: (count: number) => `${count} other ${count === 1 ? "version" : "versions"}`,
    previous: "Previous",
    next: "Next",
    pages: "Catalog pages",
    noApproved: "There are no approved songs yet.",
    noMatches: "No songs match your search.",
    clear: "Clear search",
    verified: "Melody cross-checked",
    equalBeats: "Estimated rhythm",
    rhythmicDraft: "Rhythm included · draft",
    review: "Needs review",
    melodyOnly: "Melody draft",
    community: "Community version",
    moreCommunity: "Load more community songs",
  },
  tr: {
    title: "Şarkı kataloğu",
    intro: "Dinlemek ve notalarına bakmak için bir şarkı seç.",
    approved: "Onaylı",
    all: "Tüm şarkılar",
    filter: "Şarkı kataloğunda ara",
    placeholder: "Şarkı veya sanatçı",
    open: "Provaya geç",
    openSong: "Parmak dizilimini aç",
    openPlayer: "Dinleme ekranını aç",
    excerpt: "Kısa bölüm",
    moreVersions: (count: number) => `${count} diğer sürüm`,
    previous: "Önceki",
    next: "Sonraki",
    pages: "Katalog sayfaları",
    noApproved: "Henüz onaylı şarkı yok.",
    noMatches: "Aramana uyan şarkı yok.",
    clear: "Aramayı temizle",
    verified: "Ezgi karşılaştırıldı",
    equalBeats: "Ritim tahmini",
    rhythmicDraft: "Ritimli taslak",
    review: "Kontrol gerekli",
    melodyOnly: "Ezgi taslağı",
    community: "Topluluk sürümü",
    moreCommunity: "Daha fazla topluluk şarkısı",
  },
};

const PAGE_SIZE = 6;

type CatalogSong = {
  id: string;
  title: string;
  catalogTitle?: string;
  excerpt?: boolean;
  artist?: string;
  contributor?: string;
  aliases: string[];
  sources: { name: string; role: string }[];
};

type CommunityResults<Song> = { songs: Song[]; nextOffset: number | null };

export function CommunitySearchResults<Song extends CatalogSong>({ songs, language, onOpen }: {
  songs: Song[];
  language: keyof typeof labels;
  onOpen: (song: Song) => void;
}) {
  if (!songs.length) return null;
  const t = workspaceCopy[language];
  return (
    <section className="community-search-results" aria-label={t.communityResults}>
      <h2>{t.communityResults}</h2>
      <ul>{songs.map(song => (
        <li key={song.id}>
          <button className="catalog-song" type="button" onClick={() => onOpen(song)}>
            <span className="catalog-song-name">
              <strong>{song.title}</strong>
              <span className="catalog-song-artist">{[song.artist, song.contributor && t.addedBy(song.contributor)].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="catalog-song-open">{t.listen}</span>
          </button>
        </li>
      ))}</ul>
    </section>
  );
}

export function CatalogBrowser<Song extends CatalogSong>({
  songs, language, activeId, busy, onOpen, onSearchOnline, onAddSong, compact = false, loadCommunity, communityRevision = 0,
}: {
  songs: Song[];
  language: keyof typeof labels;
  activeId?: string;
  busy: boolean;
  onOpen: (song: Song) => void;
  onSearchOnline?: (query: string) => void;
  onAddSong?: () => void;
  compact?: boolean;
  loadCommunity?: (query: string, offset: number, signal?: AbortSignal) => Promise<CommunityResults<Song>>;
  communityRevision?: number;
}) {
  const [query, setQuery] = useState("");
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [remote, setRemote] = useState<(CommunityResults<Song> & { query: string; revision: number }) | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const t = labels[language];
  const idPrefix = compact ? "practice-catalog" : "catalog";
  const currentRemote = remote?.query === query && remote.revision === communityRevision ? remote : null;
  useEffect(() => {
    if (!loadCommunity || approvedOnly) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadCommunity(query, 0, controller.signal)
        .then(result => { if (!controller.signal.aborted) setRemote({ ...result, query, revision: communityRevision }); })
        .catch(() => { /* The built-in catalog is still available. */ });
    }, query ? 180 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadCommunity, query, approvedOnly, communityRevision]);

  async function loadMore() {
    if (!loadCommunity || !currentRemote || currentRemote.nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await loadCommunity(currentRemote.query, currentRemote.nextOffset);
      setRemote(previous => {
        if (previous !== currentRemote) return previous;
        const merged = [...new Map([...currentRemote.songs, ...result.songs].map(song => [song.id, song])).values()];
        return { ...currentRemote, songs: merged, nextOffset: result.nextOffset };
      });
    } catch { /* Keep the current page available for retry. */ }
    finally { setLoadingMore(false); }
  }

  const groups = useMemo(() => groupCatalogSongs(withBundledCatalogSongs(songs, currentRemote?.songs ?? [])), [songs, currentRemote]);
  const approvedCount = groups.filter(({ song }) => isApprovedCatalogSong(song)).length;
  const results = useMemo(
    () => browseCatalogGroups(groups, query, approvedOnly, language),
    [groups, query, approvedOnly, language],
  );
  const lastPage = Math.max(0, Math.ceil(results.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, results.length);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(0);
  }

  function updateFilter(approved: boolean) {
    setApprovedOnly(approved);
    setPage(0);
  }

  function renderSong(song: Song, title: string, alternative = false) {
    const approved = isApprovedCatalogSong(song);
    const { rhythm, readiness } = assessSongQuality(song);
    const source = song.sources?.find(entry => entry.role === "note-source")?.name;
    const contributor = song.contributor ? workspaceCopy[language].addedBy(song.contributor) : "";
    const status = song.contributor ? t.community : approved ? t.verified : readiness === "review-required" ? t.review : readiness === "rhythmic-draft" ? t.rhythmicDraft : t.melodyOnly;
    const statusId = `${idPrefix}-status-${song.id}`;
    const descriptiveTitle = [song.artist ? `${song.artist} — ${title}` : title, contributor || (alternative && source)].filter(Boolean).join(" · ");
    return (
      <button className="catalog-song" type="button" disabled={busy} aria-current={activeId === song.id ? "true" : undefined}
        aria-label={`${compact ? t.openSong : t.openPlayer} · ${descriptiveTitle}`} aria-describedby={statusId}
        onClick={() => onOpen(song)}>
        <span className="catalog-song-name">
          <strong>{title}</strong>
          {(song.artist || source || contributor) && <span className="catalog-song-artist">{[song.artist, contributor || source].filter(Boolean).join(" · ")}</span>}
        </span>
        <span id={statusId} className="catalog-song-status">
          <span className={approved ? "approved" : undefined}>{status}</span>
          {song.excerpt && <small>{t.excerpt}</small>}
          {approved && rhythm === "equal-beats" && <small>{t.equalBeats}</small>}
        </span>
        <span className="catalog-song-open" aria-hidden="true">{compact ? t.open : workspaceCopy[language].listen}</span>
      </button>
    );
  }

  return (
    <section id={compact ? undefined : "song-catalog"} aria-labelledby={compact ? undefined : "catalog-title"} aria-label={compact ? t.title : undefined}>
      {!compact && <div className="screen-heading">
        <div><h1 id="catalog-title" tabIndex={-1}>{t.title}</h1><p>{t.intro}</p></div>
        <div className="catalog-heading-actions">
          {onSearchOnline && <button className="secondary-action" type="button" onClick={() => onSearchOnline(query)}>
            {workspaceCopy[language].online}
          </button>}
          {onAddSong && <button className="community-primary" type="button" aria-haspopup="dialog" onClick={onAddSong}>
            <span aria-hidden="true">+</span> {workspaceCopy[language].addSong}
          </button>}
        </div>
      </div>}
      <div className="catalog-browser">
        <div className="catalog-tools">
          <label className="sr-only" htmlFor={`${idPrefix}-filter`}>{t.filter}</label>
          <input id={`${idPrefix}-filter`} type="search" value={query} placeholder={t.placeholder} onChange={(event) => updateQuery(event.target.value)} />
          <div className="catalog-filters">
            <button type="button" aria-pressed={!approvedOnly} onClick={() => updateFilter(false)}>
              {t.all} <span>{groups.length}</span>
            </button>
            <button type="button" aria-pressed={approvedOnly} onClick={() => updateFilter(true)}>
              {t.approved} <span>{approvedCount}</span>
            </button>
          </div>
        </div>
      {results.length ? (
        <ul className="catalog-songs" aria-labelledby={compact ? undefined : "catalog-title"} aria-label={compact ? t.title : undefined}>
          {results.slice(start, end).map(({ title, song, alternatives }) => {
            const versions = approvedOnly ? alternatives.filter(isApprovedCatalogSong) : alternatives;
            return (
              <li key={song.id}>
                {renderSong(song, title)}
                {versions.length > 0 && (
                  <details className="catalog-versions" open={versions.some(version => version.id === activeId
                    || Boolean(query.trim() && version.contributor)) || undefined}>
                    <summary>{t.moreVersions(versions.length)}<span className="sr-only"> · {title}</span></summary>
                    <ul>
                      {versions.map(version => <li key={version.id}>{renderSong(version, version.title, true)}</li>)}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="catalog-empty">
          <p role="status">{query.trim() ? t.noMatches : t.noApproved}</p>
          {query.trim() && <button type="button" onClick={() => updateQuery("")}>{t.clear}</button>}
        </div>
      )}
      {lastPage > 0 && (
        <div className="catalog-pagination" role="group" aria-label={t.pages}>
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t.previous}</button>
          <span aria-live="polite">{start + 1}–{end} / {results.length}</span>
          <button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>{t.next}</button>
        </div>
      )}
      {!approvedOnly && currentRemote?.nextOffset != null && (
        <div className="catalog-community-more">
          <button className="secondary-action" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{t.moreCommunity}</button>
        </div>
      )}
      </div>
    </section>
  );
}
