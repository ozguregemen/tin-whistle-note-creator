"use client";

import { useMemo, useState } from "react";
import { browseCatalogSongs, isApprovedCatalogSong } from "./catalog-browse.mjs";
import { assessSongQuality } from "./catalog-quality.mjs";

export const catalogNavLabel = { en: "Approved songs", tr: "Onaylı şarkılar" };

const labels = {
  en: {
    title: "Song catalog",
    approved: "Approved",
    all: "All songs",
    filter: "Search the song catalog",
    placeholder: "Song or artist",
    open: "Open",
    openSong: "Open fingerings for",
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
    approved: "Onaylı",
    all: "Tüm şarkılar",
    filter: "Şarkı kataloğunda ara",
    placeholder: "Şarkı veya sanatçı",
    open: "Aç",
    openSong: "Parmak dizilimini aç",
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

const PAGE_SIZE = 4;

type CatalogSong = {
  id: string;
  title: string;
  artist?: string;
  aliases: string[];
};

export function CatalogBrowser<Song extends CatalogSong>({ songs, language, activeId, busy, onOpen }: {
  songs: Song[];
  language: keyof typeof labels;
  activeId?: string;
  busy: boolean;
  onOpen: (song: Song) => void;
}) {
  const [query, setQuery] = useState("");
  const [approvedOnly, setApprovedOnly] = useState(true);
  const [page, setPage] = useState(0);
  const t = labels[language];
  const approvedCount = useMemo(() => songs.filter(isApprovedCatalogSong).length, [songs]);
  const results = useMemo(() => browseCatalogSongs(songs, query, approvedOnly, language), [songs, query, approvedOnly, language]);
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

  return (
    <aside className="catalog-browser" id="song-catalog" aria-labelledby="catalog-title">
      <h2 id="catalog-title">{t.title}</h2>
      <div className="catalog-filters">
        <button type="button" aria-pressed={approvedOnly} onClick={() => updateFilter(true)}>
          {t.approved} <span>{approvedCount}</span>
        </button>
        <button type="button" aria-pressed={!approvedOnly} onClick={() => updateFilter(false)}>
          {t.all} <span>{songs.length}</span>
        </button>
      </div>
      <label className="sr-only" htmlFor="catalog-filter">{t.filter}</label>
      <input id="catalog-filter" type="search" value={query} placeholder={t.placeholder} onChange={(event) => updateQuery(event.target.value)} />
      {results.length ? (
        <ul className="catalog-songs" aria-labelledby="catalog-title">
          {results.slice(start, end).map((song) => {
            const approved = isApprovedCatalogSong(song);
            const { rhythm, readiness } = assessSongQuality(song);
            const title = song.artist ? `${song.artist} — ${song.title}` : song.title;
            const status = approved ? t.verified : readiness === "review-required" ? t.review : readiness === "rhythmic-draft" ? t.rhythmicDraft : t.melodyOnly;
            return (
              <li key={song.id}>
                <button className="catalog-song" type="button" disabled={busy} aria-current={activeId === song.id ? "true" : undefined}
                  aria-label={`${t.openSong} · ${title}`} aria-describedby={`catalog-status-${song.id}`} onClick={() => onOpen(song)}>
                  <span className="catalog-song-name">
                    <strong>{song.title}</strong>
                    {song.artist && <span className="catalog-song-artist">{song.artist}</span>}
                    <span id={`catalog-status-${song.id}`} className={approved ? "catalog-song-status approved" : "catalog-song-status"}>
                      {status}{approved && rhythm === "equal-beats" ? ` · ${t.equalBeats}` : ""}
                    </span>
                  </span>
                  <span className="catalog-song-open" aria-hidden="true">{t.open}</span>
                </button>
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
    </aside>
  );
}
