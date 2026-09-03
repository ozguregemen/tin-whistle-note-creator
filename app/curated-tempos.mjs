import { normalizeSearchText } from "./search-relevance.mjs";

const CURATED_TEMPOS = new Map([
  ["tame impala|dracula", { artist: "Tame Impala", title: "Dracula", bpm: 115 }],
]);

export function curatedTempoForIdentity({ artist = "", title = "" } = {}) {
  return CURATED_TEMPOS.get(`${normalizeSearchText(artist)}|${normalizeSearchText(title)}`) ?? null;
}

export function applyCuratedTempo(song) {
  const tempo = curatedTempoForIdentity(song);
  if (!tempo || !song?.rhythm) return song;
  return {
    ...song,
    rhythm: {
      ...song.rhythm,
      bpm: tempo.bpm,
      tempoSource: "curated",
      tempoConfidence: 100,
      tempoUrl: undefined,
    },
  };
}
