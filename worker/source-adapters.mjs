import { normalizeSearchText, searchMatchScore } from "../app/search-relevance.mjs";

const GENERIC_TITLE_WORDS = new Set([
  "akor", "do", "gitar", "jpg", "melodika", "mi", "nota", "notalari",
  "pdf", "re", "tab", "tabs", "ve",
]);

export const SOURCE_ADAPTERS = {
  notalar: {
    id: "notalar",
    name: "Notalar.net",
    origin: "https://www.notalar.net",
    processingMode: "text",
  },
  gitaregitim: {
    id: "gitaregitim",
    name: "Gitaregitim.net",
    origin: "https://www.gitaregitim.net",
    processingMode: "omr",
  },
};

export function decodeHtml(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function usefulTitle(value) {
  return normalizeSearchText(value)
    .split(" ")
    .filter((token) => !GENERIC_TITLE_WORDS.has(token))
    .join(" ");
}

function queryVariants(query) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const variants = [words.join(" ")];
  if (words.length >= 3) {
    variants.push(words.slice(1).join(" "));
    variants.push(words.slice(0, -1).join(" "));
  }
  variants.push(...[...words].sort((left, right) => right.length - left.length).filter((word) => normalizeSearchText(word).length >= 5));
  return [...new Set(variants.filter((value) => normalizeSearchText(value).length >= 3))].slice(0, 4);
}

async function fetchWordPressResults(adapter, query, fetchFn) {
  const variants = queryVariants(query);
  const responses = await Promise.all(variants.map(async (variant) => {
    const url = new URL("/wp-json/wp/v2/search", adapter.origin);
    url.searchParams.set("search", variant);
    url.searchParams.set("per_page", "10");
    url.searchParams.set("subtype", "post");
    const response = await fetchFn(url, {
      headers: { Accept: "application/json", "User-Agent": "tin-whistle-note-creator/0.2" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`${adapter.name} returned HTTP ${response.status}`);
    const items = await response.json();
    return Array.isArray(items) ? items.map((item) => ({ item, variant })) : [];
  }));

  const unique = new Map();
  for (const { item } of responses.flat()) {
    if (!Number.isInteger(item?.id) || typeof item?.title !== "string" || typeof item?.url !== "string") continue;
    const title = decodeHtml(item.title);
    const cleanedTitle = usefulTitle(title);
    const fullScore = searchMatchScore(query, [title, cleanedTitle]);
    const score = fullScore;
    if (score < 58) continue;

    const candidate = {
      id: `${adapter.id}:${item.id}`,
      sourceId: adapter.id,
      sourceName: adapter.name,
      postId: item.id,
      title,
      url: item.url,
      processingMode: adapter.processingMode,
      score,
    };
    const existing = unique.get(candidate.id);
    if (!existing || existing.score < score) unique.set(candidate.id, candidate);
  }
  return [...unique.values()];
}

export async function searchAllSources(query, fetchFn = fetch) {
  if (!normalizeSearchText(query)) return { results: [], unavailableSources: [] };
  const settled = await Promise.allSettled(
    Object.values(SOURCE_ADAPTERS).map((adapter) => fetchWordPressResults(adapter, query, fetchFn)),
  );
  const results = [];
  const unavailableSources = [];
  settled.forEach((result, index) => {
    const adapter = Object.values(SOURCE_ADAPTERS)[index];
    if (result.status === "fulfilled") results.push(...result.value);
    else unavailableSources.push(adapter.id);
  });
  return {
    results: results.sort((left, right) => right.score - left.score).slice(0, 8),
    unavailableSources,
  };
}

export function getSourceAdapter(sourceId) {
  return SOURCE_ADAPTERS[sourceId];
}
