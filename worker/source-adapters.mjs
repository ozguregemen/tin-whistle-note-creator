import { meaningfulSearchText, meaningfulSearchTokens, normalizeSearchText, SEARCH_QUALIFIERS, searchMatchScore } from "../app/search-relevance.mjs";

const GENERIC_TITLE_WORDS = new Set([
  "akor", "akorlari", "do", "gitar", "gitari", "jpg", "melodika", "mi", "nota", "notasi", "notalari",
  "pdf", "re", "sarki", "sarkisi", "tab", "tabs", "ve",
]);

const DISCOVERY_SOURCES = new Map([
  ["musescore.com", { name: "MuseScore", role: "score" }],
  ["kolaynota.com", { name: "Kolay Nota", role: "text" }],
  ["sarkinotalari.com", { name: "Şarkı Notaları", role: "text" }],
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
  const meaningfulWords = words.filter((word) => !SEARCH_QUALIFIERS.has(normalizeSearchText(word)));
  const normalizedMeaningfulWords = meaningfulSearchTokens(query);
  const variants = [meaningfulWords.join(" "), words.join(" ")];
  if (normalizedMeaningfulWords.length >= 3) {
    variants.push(meaningfulWords.slice(1).join(" "));
    variants.push(meaningfulWords.slice(0, -1).join(" "));
  } else if (normalizedMeaningfulWords.length >= 2) {
    variants.push(meaningfulWords.slice(1).join(" "));
  }
  variants.push(...[...meaningfulWords].sort((left, right) => right.length - left.length));
  return [...new Set(variants.filter((value) => normalizeSearchText(value).length >= 3))].slice(0, 5);
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

function decodeDiscoveryUrl(value) {
  const decoded = decodeHtml(value);
  try {
    const url = new URL(decoded.startsWith("//") ? `https:${decoded}` : decoded, "https://duckduckgo.com");
    return url.searchParams.get("uddg") || url.toString();
  } catch {
    return null;
  }
}

function parseDiscoveryResults(html) {
  const results = [];
  const anchorPattern = /<a\b(?=[^>]*\bclass=["'][^"']*result__a)[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const attributes = match[0].slice(0, match[0].indexOf(">"));
    const href = attributes.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const url = href ? decodeDiscoveryUrl(href) : null;
    if (!url) continue;
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    const domain = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const source = DISCOVERY_SOURCES.get(domain);
    if (!source || !/^https?:$/.test(parsed.protocol)) continue;
    const title = decodeHtml(match[1]);
    if (!title) continue;
    results.push({ title, url: parsed.toString(), source });
  }
  return results;
}

async function searchWebDiscovery(query, fetchFn) {
  const meaningfulTokens = meaningfulSearchTokens(query);
  const searchTerms = meaningfulSearchText(query);
  if (!searchTerms) return [];
  // Search the complete phrase first, then retry without a likely artist name.
  // The second query matters for pages whose title contains only the song name.
  const discoveryQueries = [searchTerms];
  if (meaningfulTokens.length >= 3) discoveryQueries.push(meaningfulTokens.slice(1).join(" "));
  const responses = await Promise.allSettled(discoveryQueries.map(async (terms) => {
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", `${terms} nota`);
    const response = await fetchFn(url, {
      headers: { Accept: "text/html", "User-Agent": "tin-whistle-note-creator/0.2" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Web discovery returned HTTP ${response.status}`);
    return response.text();
  }));
  const htmlDocuments = responses.filter((result) => result.status === "fulfilled").map((result) => result.value);
  if (htmlDocuments.length === 0) throw new Error("Web discovery returned no usable response");
  const unique = new Map();
  for (const html of htmlDocuments) {
    for (const item of parseDiscoveryResults(html)) {
      const score = Math.max(
        searchMatchScore(query, [item.title, item.url]),
        meaningfulTokens.length >= 3 ? searchMatchScore(meaningfulTokens.slice(1).join(" "), [item.title, item.url]) : 0,
      );
      if (score < 58) continue;
      const sourceId = `web:${new URL(item.url).hostname.replace(/^www\./i, "")}`;
      const candidate = {
        id: `${sourceId}:${item.url}`,
        sourceId: "web",
        sourceName: item.source.name,
        title: item.title,
        url: item.url,
        processingMode: "review",
        score: Math.max(1, score - 25),
      };
      const existing = unique.get(candidate.id);
      if (!existing || existing.score < candidate.score) unique.set(candidate.id, candidate);
    }
  }
  return [...unique.values()].sort((left, right) => right.score - left.score).slice(0, 5);
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
  const approvedResults = results.sort((left, right) => right.score - left.score).slice(0, 8);
  if (approvedResults.length > 0) return { results: approvedResults, unavailableSources };

  try {
    const discoveryResults = await searchWebDiscovery(query, fetchFn);
    return { results: discoveryResults, unavailableSources, discoveryOnly: discoveryResults.length > 0 };
  } catch {
    return { results: [], unavailableSources: [...unavailableSources, "web"] };
  }
}

export function getSourceAdapter(sourceId) {
  return SOURCE_ADAPTERS[sourceId];
}
