"use client";

import { useMemo, useState } from "react";
import { browseCatalogGroups, groupCatalogSongs, isApprovedCatalogEntry } from "./catalog-browse.mjs";
import { assessSongQuality } from "./catalog-quality.mjs";
import type { CatalogRecording } from "./catalog-recording";
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
    official: "Official recording and score",
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
    official: "Resmî kayıt ve nota kaynağı",
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
  },
};

const PAGE_SIZE = 6;
const NO_RECORDINGS: CatalogRecording[] = [];

type CatalogSong = {
  id: string;
  title: string;
  catalogTitle?: string;
  artist?: string;
  aliases: string[];
  sources: { name: string; role: string }[];
};

function isRecording(entry: CatalogSong | CatalogRecording): entry is CatalogRecording {
  return "kind" in entry && entry.kind === "recording";
}

export function CatalogBrowser<Song extends CatalogSong>({
  songs, recordings = NO_RECORDINGS, language, activeId, busy, onOpen, onOpenRecording, onSearchOnline, compact = false,
}: {
  songs: Song[];
  recordings?: CatalogRecording[];
  language: keyof typeof labels;
  activeId?: string;
  busy: boolean;
  onOpen: (song: Song) => void;
  onOpenRecording?: (recording: CatalogRecording) => void;
  onSearchOnline?: (query: string) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const t = labels[language];
  const idPrefix = compact ? "practice-catalog" : "catalog";
  const groups = useMemo(() => groupCatalogSongs<Song | CatalogRecording>([...songs, ...recordings]), [songs, recordings]);
  const approvedCount = groups.filter(({ song }) => isApprovedCatalogEntry(song)).length;
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

  function renderSong(song: Song | CatalogRecording, title: string, alternative = false) {
    const recording = isRecording(song);
    const approved = isApprovedCatalogEntry(song);
    const quality = recording ? null : assessSongQuality(song);
    const source = recording ? song.series : song.sources?.find(entry => entry.role === "note-source")?.name;
    const status = recording ? t.official : approved ? t.verified : quality?.readiness === "review-required" ? t.review : quality?.readiness === "rhythmic-draft" ? t.rhythmicDraft : t.melodyOnly;
    const statusId = `${idPrefix}-status-${song.id}`;
    const descriptiveTitle = [song.artist ? `${song.artist} — ${title}` : title, alternative && source].filter(Boolean).join(" · ");
    return (
      <button className="catalog-song" type="button" disabled={busy} aria-current={activeId === song.id ? "true" : undefined}
        aria-label={`${compact ? t.openSong : t.openPlayer} · ${descriptiveTitle}`} aria-describedby={statusId}
        onClick={() => recording ? onOpenRecording?.(song) : onOpen(song)}>
        <span className="catalog-song-name">
          <strong>{title}</strong>
          {(song.artist || source) && <span className="catalog-song-artist">{[song.artist, source].filter(Boolean).join(" · ")}</span>}
        </span>
        <span id={statusId} className="catalog-song-status">
          <span className={approved ? "approved" : undefined}>{status}</span>
          {approved && quality?.rhythm === "equal-beats" && <small>{t.equalBeats}</small>}
        </span>
        <span className="catalog-song-open" aria-hidden="true">{compact ? t.open : workspaceCopy[language].listen}</span>
      </button>
    );
  }

  return (
    <section id={compact ? undefined : "song-catalog"} aria-labelledby={compact ? undefined : "catalog-title"} aria-label={compact ? t.title : undefined}>
      {!compact && <div className="screen-heading">
        <div><h1 id="catalog-title" tabIndex={-1}>{t.title}</h1><p>{t.intro}</p></div>
        {onSearchOnline && <button className="secondary-action" type="button" onClick={() => onSearchOnline(query)}>
          {workspaceCopy[language].online}
        </button>}
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
            const versions = approvedOnly ? alternatives.filter(isApprovedCatalogEntry) : alternatives;
            return (
              <li key={song.id}>
                {renderSong(song, title)}
                {versions.length > 0 && (
                  <details className="catalog-versions" open={versions.some(version => version.id === activeId) || undefined}>
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
      </div>
    </section>
  );
}
