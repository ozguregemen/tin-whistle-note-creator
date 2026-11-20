import { rankCatalogMatches } from "./catalog-quality.mjs";
import { editDistance, normalizeSearchText } from "./search-relevance.mjs";
import { stripYoutubeTitleLabels, YOUTUBE_THEME_LABEL } from "./youtube-song.mjs";

const OPENING_LABELS = new Set(["opening", "intro", "main title"]);
const ENDING_LABELS = new Set(["ending", "outro", "closing"]);
const SCORE_SUFFIX = /\s+(?:şarkısının notaları|şarkı notaları|(?:flüt |melodika |piyano |gitar )?nota(?:ları|sı)?(?: ve (?:tab|akorları))?|sheet music|(?:guitar |piano )?tabs?|chords)$/iu;
const SCORE_HEADING_SUFFIX = /\s+(?:free )?sheet music(?:\s+for\b.*)?$/iu;
const SCORE_FORMAT = /^(?:(?:easy|beginner|intermediate|advanced|solo|simple)\s+)*(?:piano|guitar|violin|flute|tin whistle|recorder|melodica|fingerstyle|solo|arrangement|sheet music|notes?|tabs?|tutorial|cover|piyano|gitar|flüt|melodika|nota(?:ları|sı)?)(?:[\s-]+(?:sheet music|solo|duet|arrangement|notation|notes?|tutorial|cover|tab(?:s)?))*$/iu;
const MATCH_LIMIT = 4;

/** @typedef {{ title: string, artist?: string, aliases?: string[] }} SongIdentity */

/** @param {string} title */
export function youtubeScoreQueries(title) {
  const heading = scoreHeading(title).slice(0, 160).trim();
  const { specific, stem: shorter } = themeTitle(heading);
  const queries = [specific];
  if (shorter !== specific && normalizeSearchText(shorter).length >= 4) queries.push(shorter);
  return queries.filter(term => normalizeSearchText(term).length >= 2);
}

/** @param {string} title */
function themeTitle(title) {
  const from = title.match(/^(.+?)\s*\(from (.+?)\)$/i);
  if (from && from[1].match(YOUTUBE_THEME_LABEL)?.index === 0) title = `${from[2]} ${from[1]}`;
  const bracket = title.match(/\s*[([]\s*([^)[\]]+)\s*[)\]]$/);
  const specific = bracket && bracket[1].trim().match(YOUTUBE_THEME_LABEL)?.index === 0
    ? `${title.slice(0, bracket.index).trim()} ${bracket[1].trim()}`.trim() : title;
  const label = specific.match(YOUTUBE_THEME_LABEL);
  const stem = label ? specific.slice(0, label.index).replace(/[\s|–—-]+$/u, "") : specific;
  // A single theme word can be a real song title.
  if (normalizeSearchText(stem).length < 4) return { specific, stem: specific, part: "" };
  const part = label?.[1]?.toLowerCase() ?? "";
  return { specific, stem, part: OPENING_LABELS.has(part) ? "opening" : ENDING_LABELS.has(part) ? "ending" : "" };
}

/** @param {string} title */
function scoreHeading(title) {
  const publisher = /\s+\|\s+MuseScore(?:\.com)?$/i;
  let heading = stripYoutubeTitleLabels(title);
  if (publisher.test(heading)) {
    heading = heading.replace(publisher, "");
    if (SCORE_HEADING_SUFFIX.test(heading)) {
      const name = heading.replace(SCORE_HEADING_SUFFIX, "");
      const credited = name.match(/^(.+?)\s+[-–—]\s+(.+)$/);
      if (credited && YOUTUBE_THEME_LABEL.test(credited[1]) && !YOUTUBE_THEME_LABEL.test(credited[2])) heading = credited[1];
    }
  }
  let previous;
  do {
    previous = heading;
    heading = heading.replace(SCORE_HEADING_SUFFIX, "").replace(SCORE_SUFFIX, "")
      .replace(/\s*[([]\s*([^)[\]]+)\s*[)\]]$/u, (suffix, label) => SCORE_FORMAT.test(label.trim()) ? "" : suffix)
      .replace(/\s+[-–—|]\s+([^–—|]+)$/u, (suffix, label) => SCORE_FORMAT.test(label.trim()) ? "" : suffix)
      .trim();
  } while (heading !== previous);
  return heading;
}

/** @param {string} heading */
function normalizedTheme(heading) {
  const { specific, stem, part } = themeTitle(heading);
  const normalize = (/** @type {string} */ text) => normalizeSearchText(text).replace(/^the /, "");
  return { specific: normalize(specific), stem: normalize(stem), part };
}

/** @param {SongIdentity} score @param {string} [videoArtist] */
function trackTitle(score, videoArtist = "") {
  const parts = score.title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  const artist = parts ? normalizeSearchText(parts[1]) : "";
  return parts && artist && [normalizeSearchText(score.artist ?? ""), videoArtist].includes(artist) ? parts[2] : score.title;
}

/** @param {SongIdentity} score */
export function youtubeScoreAlias(score) {
  const title = trackTitle(score);
  const { specific, stem, part } = themeTitle(scoreHeading(title));
  const alias = part ? `${stem} ${part} theme` : specific;
  return alias && normalizeSearchText(alias) !== normalizeSearchText(title) ? alias : "";
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
  const expected = normalizedTheme(scoreHeading(video.title));
  const names = [trackTitle(score, videoArtist), ...(score.aliases ?? [])].map(title => normalizedTheme(scoreHeading(title)));
  let rank = 0;
  for (const [index, name] of names.entries()) {
    if (!name.specific || (expected.part && name.part && expected.part !== name.part)) continue;
    if (expected.specific === name.specific) rank = Math.max(rank, index === 0 ? 100 : 92);
    else if (expected.stem && expected.stem === name.stem) {
      rank = Math.max(rank, expected.part && name.part ? 96 : 92);
    } else if (closeTitle(expected.stem, name.stem, artistMatches)) rank = Math.max(rank, 78);
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
