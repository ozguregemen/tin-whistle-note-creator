import { rankCatalogMatches } from "./catalog-quality.mjs";
import { editDistance, normalizeSearchText } from "./search-relevance.mjs";
import { stripYoutubeTitleLabels } from "./youtube-song.mjs";

const THEME_SUFFIX = /(?:\s+|\s*[-–—|]\s*)(?:(?:main |opening |ending )?theme(?: song)?|(?:original )?soundtrack|ost)$/i;
const THEME_PART = /(?:^|\s)(opening|ending) theme(?: song)?$/i;
const SCORE_SUFFIX = /\s+(?:şarkısının notaları|şarkı notaları|(?:flüt |melodika |piyano |gitar )?nota(?:ları|sı)?(?: ve (?:tab|akorları))?|sheet music|(?:guitar |piano )?tabs?|chords)$/iu;
const MATCH_LIMIT = 4;

/** @typedef {{ title: string, artist?: string, aliases?: string[] }} SongIdentity */

/** @param {string} title */
export function youtubeScoreQueries(title) {
  const heading = stripYoutubeTitleLabels(title).slice(0, 160).trim();
  const specific = heading.replace(/\s*[([]\s*((?:(?:main |opening |ending )?theme(?: song)?|soundtrack|ost))\s*[)\]]$/i, " $1");
  const shorter = specific.replace(THEME_SUFFIX, "").trim();
  const queries = [specific];
  if (shorter !== specific && normalizeSearchText(shorter).length >= 4) queries.push(shorter);
  return queries.filter(term => normalizeSearchText(term).length >= 2);
}

/** @param {string} title */
function scoreNames(title) {
  const name = stripYoutubeTitleLabels(title);
  // Source headings often append an instrument or a score format.
  const withoutFormat = name.replace(/\s+[-–—|]\s+(?=[^-–—|]+$)/, " ").replace(SCORE_SUFFIX, "").trim();
  return youtubeScoreQueries(withoutFormat).map(variant => normalizeSearchText(variant).replace(/^the /, ""));
}

/** @param {string} left @param {string} right @param {boolean} artistMatches */
function closeTitle(left, right, artistMatches) {
  const query = left.split(" ");
  const candidate = right.split(" ");
  if (query.length !== candidate.length) return false;
  const changed = query.flatMap((token, index) => token === candidate[index] ? [] : [[token, candidate[index]]]);
  if (changed.length !== 1) return false;
  const [[from, to]] = changed;
  const minimumLength = query.length === 1 ? 7 : 4;
  return (query.length > 1 || artistMatches)
    && Math.min(from.length, to.length) >= minimumLength && editDistance(from, to) === 1;
}

/** @param {SongIdentity} video @param {SongIdentity} score */
export function youtubeScoreMatch(video, score) {
  const videoArtist = normalizeSearchText(video.artist ?? "");
  const scoreArtist = normalizeSearchText(score.artist ?? "");
  if (videoArtist && scoreArtist && videoArtist !== scoreArtist) return 0;
  const artistMatches = Boolean(videoArtist && videoArtist === scoreArtist);
  const expected = scoreNames(video.title);
  const videoPart = expected[0]?.match(THEME_PART)?.[1];
  const names = [score.title, ...(score.aliases ?? [])].flatMap(title => {
    const parts = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    const track = parts && [scoreArtist, videoArtist].includes(normalizeSearchText(parts[1])) ? parts[2] : title;
    const variants = scoreNames(track);
    const scorePart = variants[0]?.match(THEME_PART)?.[1];
    return videoPart && scorePart && videoPart !== scorePart ? [] : variants;
  });
  let rank = 0;
  for (const [index, title] of expected.entries()) {
    for (const [position, name] of names.entries()) {
      if (name === title) rank = Math.max(rank, index === 0 && position === 0 ? 100 : 92);
      else if (closeTitle(title, name, artistMatches)) rank = Math.max(rank, 78);
    }
  }
  return rank && rank + (artistMatches ? 8 : 0);
}

/**
 * @template {SongIdentity & { id: string, notes: string }} CatalogSong
 * @template {SongIdentity & { id: string, processingMode: string }} OnlineScore
 * @template {{ id: number, name: string, alias?: string }} SessionTune
 * @param {SongIdentity} video
 * @param {CatalogSong[]} catalog
 * @param {{ searchSources: (query: string) => Promise<OnlineScore[]>,
 * searchSession: (query: string) => Promise<SessionTune[]>, signal?: AbortSignal }} options
 */
export async function findYoutubeScoreMatches(video, catalog, { searchSources, searchSession, signal }) {
  const queries = youtubeScoreQueries(video.title);
  const catalogMatches = rankCatalogMatches(catalog
    .filter(item => item.notes?.trim())
    .map(item => ({ item, score: youtubeScoreMatch(video, item) }))
    .filter(match => match.score > 0));

  const videoArtist = normalizeSearchText(video.artist ?? "");
  const strongCatalogMatch = catalogMatches.some(({ item, score }) => score >= 92
    && (!videoArtist || normalizeSearchText(item.artist ?? "") === videoArtist));
  if (strongCatalogMatch) {
    return { catalog: catalogMatches.slice(0, MATCH_LIMIT).map(match => match.item), sources: [], tunes: [] };
  }

  const results = await Promise.all(queries.map(async query => {
    const [sources, tunes] = await Promise.allSettled([searchSources(query), searchSession(query)]);
    return {
      sources: sources.status === "fulfilled" ? sources.value : [],
      tunes: tunes.status === "fulfilled" ? tunes.value : [],
    };
  }));
  signal?.throwIfAborted();
  const sources = new Map(results.flatMap(result => result.sources.map(item => [item.id, item])));
  const tunes = new Map(results.flatMap(result => result.tunes.map(item => [item.id, item])));
  const rankedSources = [...sources.values()]
    .map(item => ({ item, score: youtubeScoreMatch(video, item) }))
    .filter(match => match.score > 0)
    .sort((left, right) => Number(left.item.processingMode === "review") - Number(right.item.processingMode === "review")
      || right.score - left.score);
  const rankedTunes = [...tunes.values()]
    .map(item => ({ item, score: youtubeScoreMatch(video, { title: item.name, aliases: item.alias ? [item.alias] : [] }) }))
    .filter(match => match.score > 0)
    .sort((left, right) => right.score - left.score);
  return {
    catalog: catalogMatches.slice(0, MATCH_LIMIT).map(match => match.item),
    sources: rankedSources.slice(0, MATCH_LIMIT).map(match => match.item),
    tunes: rankedTunes.slice(0, MATCH_LIMIT).map(match => match.item),
  };
}

/**
 * @template {{ catalog: unknown[], sources: unknown[], tunes: unknown[] }} Matches
 * @template Audio
 * @param {{ song?: SongIdentity | null, skipScores?: boolean, signal?: AbortSignal,
 * resolveSong: () => Promise<SongIdentity | null>, findScores: (song: SongIdentity) => Promise<Matches>,
 * download: () => Promise<{ audio: Audio, song: SongIdentity | null }> }} options
 */
export async function prepareYoutubeSelection({ song, skipScores, signal, resolveSong, findScores, download }) {
  const find = async (/** @type {SongIdentity} */ identity) => {
    const matches = await findScores(identity);
    signal?.throwIfAborted();
    return matches.catalog.length || matches.sources.length || matches.tunes.length ? matches : null;
  };

  const identity = skipScores ? song : await resolveSong();
  signal?.throwIfAborted();
  if (!skipScores && identity) {
    const matches = await find(identity);
    if (matches) return { matches, song: identity, audio: null };
  }
  const downloaded = await download();
  signal?.throwIfAborted();
  if (!skipScores && !identity && downloaded.song) {
    const matches = await find(downloaded.song);
    if (matches) return { matches, ...downloaded };
  }
  return { matches: null, audio: downloaded.audio, song: downloaded.song ?? identity ?? null };
}
