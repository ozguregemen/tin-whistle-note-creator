import { findYoutubeScoreMatches } from "./youtube-score-match.mjs";

export type SourceCandidate = {
  id: string;
  sourceId: "notalar" | "gitaregitim" | "songsterr" | "academic-pdf" | "web";
  sourceName: string;
  postId?: number;
  songId?: number;
  trackIndex?: number;
  documentId?: string;
  artist?: string;
  title: string;
  url: string;
  processingMode: "text" | "omr" | "gp" | "review";
  quality?: "rhythmic-score" | "melody-only" | "machine-read" | "review-only";
  score: number;
};

export type SessionTune = { id: number; name: string; alias?: string; url: string; type?: string };
export type VideoSong = { title: string; artist?: string };
export type ScoreMatches<T> = { catalog: T[]; sources: SourceCandidate[]; tunes: SessionTune[] };

const THE_SESSION_SEARCH_URL = "https://thesession.org/tunes/search?format=json&q=";

export async function searchSessionTunes(query: string, signal?: AbortSignal) {
  const response = await fetch(`${THE_SESSION_SEARCH_URL}${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error(`The Session search returned ${response.status}`);
  const data = await response.json() as { tunes?: SessionTune[] };
  return (Array.isArray(data.tunes) ? data.tunes : []).filter(tune => Number.isInteger(tune?.id) && typeof tune.name === "string");
}

export async function searchYoutubeScores<T extends VideoSong & { id: string; notes: string; aliases: string[] }>(
  song: VideoSong, catalog: T[], api: string, signal: AbortSignal,
): Promise<ScoreMatches<T>> {
  const sourceDeadline = AbortSignal.any([signal, AbortSignal.timeout(18_000)]);
  const sessionDeadline = AbortSignal.any([signal, AbortSignal.timeout(7_000)]);
  return findYoutubeScoreMatches(song, catalog, {
    signal,
    searchSession: query => searchSessionTunes(query, sessionDeadline),
    searchSources: async query => {
      if (!api) return [];
      const params = new URLSearchParams({ q: query, matchTitle: song.title });
      if (song.artist) params.set("matchArtist", song.artist);
      const response = await fetch(`${api}/api/search?${params}`, { signal: sourceDeadline });
      if (!response.ok) throw new Error(`Source API returned ${response.status}`);
      const data = await response.json() as { results?: SourceCandidate[] };
      return Array.isArray(data.results) ? data.results : [];
    },
  });
}
