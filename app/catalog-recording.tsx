"use client";

import { useState } from "react";

export type CatalogRecording = {
  kind: "recording";
  id: string;
  title: string;
  artist: string;
  series: string;
  aliases: string[];
  video: { id: string; start?: number; end?: number };
  sheet: { publisher: string; url: string };
};

export const CATALOG_RECORDINGS: CatalogRecording[] = [
  {
    kind: "recording",
    id: "recording-binks-sake",
    title: "Binks’ Sake",
    artist: "Ado",
    series: "One Piece Film: Red",
    aliases: ["Binks no Sake", "Binkusu no Sake", "Binks Brew", "Kohei Tanaka", "One Piece", "anime"],
    video: { id: "Z-WdGYi9Pv4" },
    sheet: {
      publisher: "Yamaha",
      url: "https://www.print-gakufu.com/score/detail/494990/?type=cvs",
    },
  },
  {
    kind: "recording",
    id: "recording-zeldas-lullaby",
    title: "Zelda’s Lullaby",
    artist: "Koji Kondo",
    series: "The Legend of Zelda",
    aliases: ["Zeldas Lullaby", "Ocarina of Time", "Nintendo", "video game", "oyun müziği"],
    video: { id: "xuXHrHRZzLk", start: 371, end: 553 },
    sheet: {
      publisher: "Alfred Music",
      url: "https://www.alfred.com/products/the-legend-of-zeldatm-series-for-easy-piano-00-38634",
    },
  },
  {
    kind: "recording",
    id: "recording-frieren-main-theme",
    title: "Journey of a Lifetime",
    artist: "Evan Call",
    series: "Frieren: Beyond Journey’s End",
    aliases: ["Frieren Main Theme", "Sousou no Frieren", "Frieren ana tema", "anime"],
    video: { id: "nOn0pDmrGco" },
    sheet: {
      publisher: "Doremi",
      url: "https://frieren-anime.jp/goods/books/3050/",
    },
  },
];

const copy = {
  en: {
    play: "Play official recording",
    close: "Close player",
    watch: "Open on YouTube",
    sheet: "Licensed sheet music",
  },
  tr: {
    play: "Resmî kaydı çal",
    close: "Oynatıcıyı kapat",
    watch: "YouTube’da aç",
    sheet: "Lisanslı nota",
  },
};

export function CatalogRecordingPlayer({ track, language, importLabel, onImport }: {
  track: CatalogRecording;
  language: keyof typeof copy;
  importLabel: string;
  onImport: () => void;
}) {
  const [playerOpen, setPlayerOpen] = useState(false);
  const t = copy[language];
  const videoUrl = new URL("https://www.youtube.com/watch");
  videoUrl.searchParams.set("v", track.video.id);
  const playerUrl = new URL(`https://www.youtube-nocookie.com/embed/${track.video.id}`);
  playerUrl.searchParams.set("autoplay", "1");
  playerUrl.searchParams.set("rel", "0");
  if (track.video.start !== undefined) {
    videoUrl.searchParams.set("t", `${track.video.start}s`);
    playerUrl.searchParams.set("start", String(track.video.start));
  }
  if (track.video.end !== undefined) playerUrl.searchParams.set("end", String(track.video.end));

  return (
    <article className="workspace" aria-labelledby="preview-title">
      <div className="workspace-heading">
        <div>
          <h1 id="preview-title" tabIndex={-1}>{track.title}</h1>
          <p>{track.series} · {track.artist}</p>
        </div>
      </div>
      <div className="catalog-recording-actions">
        <button className="secondary-action recording-play" type="button" aria-expanded={playerOpen}
          aria-controls={playerOpen ? "catalog-recording-player" : undefined} onClick={() => setPlayerOpen(open => !open)}>
          {playerOpen ? t.close : t.play}
        </button>
        <a className="secondary-action" href={track.sheet.url} target="_blank" rel="noreferrer">{t.sheet} · {track.sheet.publisher}</a>
        <button className="secondary-action" type="button" onClick={onImport}>{importLabel}</button>
        <a className="secondary-action" href={videoUrl.href} target="_blank" rel="noreferrer">{t.watch}</a>
      </div>
      {playerOpen && <iframe id="catalog-recording-player" className="catalog-recording-player" title={track.title}
        src={playerUrl.href} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin" />}
    </article>
  );
}
