import { normalizeSearchText } from "./search-relevance.mjs";

export function isApprovedCatalogSong(song) {
  return song.sourceStatus === "cross-checked"
    && song.sourceConfidence !== "omr-unreviewed"
    && song.rhythm?.source !== "transcribed";
}

/**
 * @template {{ title: string, artist?: string, aliases: string[] }} T
 * @param {T[]} songs
 * @param {string} query
 * @param {boolean} approvedOnly
 * @param {"en" | "tr"} language
 * @returns {T[]}
 */
export function browseCatalogSongs(songs, query, approvedOnly, language) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  const compare = new Intl.Collator(language, { numeric: true, sensitivity: "base" }).compare;

  return songs.filter((song) => {
    if (approvedOnly && !isApprovedCatalogSong(song)) return false;
    if (tokens.length === 0) return true;
    const searchable = normalizeSearchText([song.title, song.artist, ...song.aliases].filter(Boolean).join(" "));
    return tokens.every((token) => searchable.includes(token));
  }).sort((left, right) => compare(left.title, right.title) || compare(left.artist ?? "", right.artist ?? ""));
}
