import { normalizeSearchText } from "./search-relevance.mjs";
import { readinessRank } from "./catalog-quality.mjs";

export function isApprovedCatalogSong(song) {
  return song.sourceStatus === "cross-checked"
    && song.sourceConfidence !== "omr-unreviewed"
    && song.rhythm?.source !== "transcribed";
}

/** @template {{ id: string }} T @param {T[]} songs @param {T[]} bundled */
export function withBundledCatalogSongs(songs, bundled) {
  const ids = new Set(songs.map(song => song.id));
  return [...songs, ...bundled.filter(song => !ids.has(song.id))];
}

/** @typedef {{ title: string, catalogTitle?: string, artist?: string, aliases: string[], contributor?: string }} CatalogSong */
/** @template {CatalogSong} T
 * @typedef {{ title: string, song: T, alternatives: T[] }} CatalogGroup
 */

function identity(value) {
  return normalizeSearchText(value) || value.normalize("NFKC").toLowerCase().trim();
}

/** @template {CatalogSong} T
 * @param {T[]} songs
 * @returns {CatalogGroup<T>[]}
 */
export function groupCatalogSongs(songs) {
  /** @type {Map<string, T[]>} */
  const groups = new Map();
  for (const song of songs) {
    const key = JSON.stringify([identity(song.catalogTitle ?? song.title), identity(song.artist ?? "")]);
    const versions = groups.get(key);
    if (versions) versions.push(song);
    else groups.set(key, [song]);
  }
  return [...groups.values()].map(versions => {
    const [song, ...alternatives] = versions.sort((left, right) =>
      Number(isApprovedCatalogSong(right)) - Number(isApprovedCatalogSong(left))
      || readinessRank(right) - readinessRank(left));
    return { title: song.catalogTitle ?? song.title, song, alternatives };
  });
}

/** @template {CatalogSong} T
 * @param {CatalogGroup<T>[]} groups
 * @param {string} query
 * @param {boolean} approvedOnly
 * @param {"en" | "tr"} language
 */
export function browseCatalogGroups(groups, query, approvedOnly, language) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  const compare = new Intl.Collator(language, { numeric: true, sensitivity: "base" }).compare;

  return groups.filter(({ title, song, alternatives }) => {
    if (approvedOnly && !isApprovedCatalogSong(song)) return false;
    if (tokens.length === 0) return true;
    const versions = approvedOnly ? [song, ...alternatives.filter(isApprovedCatalogSong)] : [song, ...alternatives];
    return versions.some(version => {
      const searchable = normalizeSearchText([title, version.title, version.artist, version.contributor, ...version.aliases].filter(Boolean).join(" "));
      return tokens.every(token => searchable.includes(token));
    });
  }).sort((left, right) =>
    Number(isApprovedCatalogSong(right.song)) - Number(isApprovedCatalogSong(left.song))
    || compare(left.title, right.title)
    || compare(left.song.artist ?? "", right.song.artist ?? ""));
}
