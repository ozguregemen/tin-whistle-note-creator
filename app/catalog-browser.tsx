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
  const t = labels[language];
  const approvedCount = useMemo(() => songs.filter(isApprovedCatalogSong).length, [songs]);
  const results = useMemo(() => browseCatalogSongs(songs, query, approvedOnly, language), [songs, query, approvedOnly, language]);

  return (
    <aside className="catalog-browser" id="song-catalog" aria-labelledby="catalog-title">
      <h2 id="catalog-title">{t.title}</h2>
      <div className="catalog-filters">
        <button type="button" aria-pressed={approvedOnly} onClick={() => setApprovedOnly(true)}>
          {t.approved} <span>{approvedCount}</span>
        </button>
        <button type="button" aria-pressed={!approvedOnly} onClick={() => setApprovedOnly(false)}>
          {t.all} <span>{songs.length}</span>
        </button>
      </div>
      <label className="sr-only" htmlFor="catalog-filter">{t.filter}</label>
      <input id="catalog-filter" type="search" value={query} placeholder={t.placeholder} onChange={(event) => setQuery(event.target.value)} />
      {results.length ? (
        <ul className="catalog-songs" aria-labelledby="catalog-title">
          {results.map((song) => {
            const approved = isApprovedCatalogSong(song);
            const { rhythm, readiness } = assessSongQuality(song);
            const title = song.artist ? `${song.artist} — ${song.title}` : song.title;
            const status = approved ? t.verified : readiness === "review-required" ? t.review : readiness === "rhythmic-draft" ? t.rhythmicDraft : t.melodyOnly;
            return (
              <li key={song.id}>
                <button className="catalog-song" type="button" disabled={busy} aria-current={activeId === song.id ? "true" : undefined}
                  aria-label={`${t.openSong} · ${title}`} aria-describedby={`catalog-status-${song.id}`} onClick={() => onOpen(song)}>
                  <span className="catalog-song-name"><strong>{song.title}</strong>{song.artist && <span>{song.artist}</span>}</span>
                  <span className="catalog-song-open" aria-hidden="true">{t.open}</span>
                </button>
                <p id={`catalog-status-${song.id}`} className={approved ? "catalog-song-status approved" : "catalog-song-status"}>
                  {status}{approved && rhythm === "equal-beats" ? ` · ${t.equalBeats}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="catalog-empty">
          <p role="status">{query.trim() ? t.noMatches : t.noApproved}</p>
          {query.trim() && <button type="button" onClick={() => setQuery("")}>{t.clear}</button>}
        </div>
      )}
    </aside>
  );
}
