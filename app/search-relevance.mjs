export const SEARCH_QUALIFIERS = new Set([
  "akor", "akorlar", "akorlari", "akorlarini", "do", "gitar", "gitari", "gitarini",
  "lyrics", "melodika", "music", "nota", "notalar", "notasi", "notalari", "notalarini", "piano",
  "piyano", "re", "sheet", "sarki", "sarkinin", "sarkisi", "tab", "tabs",
]);

/** @param {string} value */
export function normalizeSearchText(value) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** @param {string} value */
export function meaningfulSearchTokens(value) {
  return normalizeSearchText(value).split(" ").filter((token) => token && !SEARCH_QUALIFIERS.has(token));
}

/** @param {string} value */
export function meaningfulSearchText(value) {
  return meaningfulSearchTokens(value).join(" ");
}

/** @param {string} left @param {string} right */
function editDistance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) rows[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) rows[0][column] = column;

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + substitutionCost,
      );
      if (
        row > 1 && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]
      ) {
        rows[row][column] = Math.min(rows[row][column], rows[row - 2][column - 2] + 1);
      }
    }
  }
  return rows[left.length][right.length];
}

/** @param {string} queryToken @param {string} candidateToken */
function tokenSimilarity(queryToken, candidateToken) {
  if (queryToken === candidateToken) return 1;
  const longest = Math.max(queryToken.length, candidateToken.length);
  const shortest = Math.min(queryToken.length, candidateToken.length);
  if (shortest <= 3 || Math.abs(queryToken.length - candidateToken.length) > 2) return 0;

  const distance = editDistance(queryToken, candidateToken);
  const allowedDistance = longest <= 5 ? 1 : 2;
  if (distance > allowedDistance) return 0;
  const similarity = 1 - distance / longest;
  return similarity >= 0.7 ? similarity : 0;
}

/** @param {string[]} queryTokens @param {string[]} candidateTokens */
function fuzzyTokenScore(queryTokens, candidateTokens) {
  const orderedQueries = [...queryTokens].sort((left, right) => right.length - left.length);
  const availableCandidates = [...candidateTokens];
  let similarityTotal = 0;

  for (const queryToken of orderedQueries) {
    let bestIndex = -1;
    let bestSimilarity = 0;
    for (let index = 0; index < availableCandidates.length; index += 1) {
      const similarity = tokenSimilarity(queryToken, availableCandidates[index]);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestIndex = index;
      }
    }
    if (bestIndex === -1) return 0;
    similarityTotal += bestSimilarity;
    availableCandidates.splice(bestIndex, 1);
  }
  return similarityTotal / queryTokens.length;
}

/**
 * Every query token must match a distinct title token. Longer words tolerate
 * one or two edits, while short words stay exact to avoid noisy suggestions.
 * @param {string} query
 * @param {string[]} candidates
 */
export function searchMatchScore(query, candidates) {
  const normalizedQuery = meaningfulSearchText(query);
  if (!normalizedQuery) return 0;
  const queryTokens = normalizedQuery.split(" ");

  return candidates.reduce((best, candidate) => {
    const normalizedCandidate = normalizeSearchText(candidate);
    if (!normalizedCandidate) return best;
    if (normalizedCandidate === normalizedQuery) return Math.max(best, 100);

    const candidateTokens = normalizedCandidate.split(" ");
    const allQueryTokensMatch = queryTokens.every((token) => candidateTokens.includes(token));
    if (allQueryTokensMatch) return Math.max(best, 90 + Math.min(queryTokens.length, 9));

    const fuzzySimilarity = fuzzyTokenScore(queryTokens, candidateTokens);
    if (fuzzySimilarity > 0) return Math.max(best, Math.round(60 + fuzzySimilarity * 30));
    return best;
  }, 0);
}
