import { meaningfulSearchText, meaningfulSearchTokens, normalizeSearchText, SEARCH_QUALIFIERS, searchMatchScore } from "../app/search-relevance.mjs";
import { DOCUMENT_SOURCE_ADAPTER, DOCUMENT_SOURCES } from "./document-sources.mjs";

const GENERIC_TITLE_WORDS = new Set([
  "akor", "akorlari", "do", "gitar", "gitari", "jpg", "melodika", "mi", "nota", "notasi", "notalari",
  "pdf", "re", "sarki", "sarkisi", "tab", "tabs", "ve",
]);

const DISCOVERY_SOURCES = new Map([
  ["musescore.com", { name: "MuseScore", role: "score" }],
  ["kolaynota.com", { name: "Kolay Nota", role: "text" }],
]);

const MAX_WORDPRESS_BYTES = 256 * 1024;
const MAX_SONGSTERR_BYTES = 512 * 1024;
const MAX_DISCOVERY_BYTES = 512 * 1024;

export const SOURCE_ADAPTERS = {
  notalar: {
    id: "notalar",
    name: "Notalar.net",
    kind: "wordpress",
    origin: "https://www.notalar.net",
    processingMode: "text",
  },
  gitaregitim: {
    id: "gitaregitim",
    name: "Gitaregitim.net",
    kind: "wordpress",
    origin: "https://www.gitaregitim.net",
    processingMode: "omr",
  },
  songsterr: {
    id: "songsterr",
    name: "Songsterr",
    kind: "guitarpro",
    origin: "https://www.songsterr.com",
    processingMode: "gp",
  },
  academicPdf: DOCUMENT_SOURCE_ADAPTER,
};

async function readLimitedText(response, maxBytes) {
  const declaredLength = Number(response.headers.get("Content-Length") || 0);
  if (declaredLength > maxBytes) throw new Error(`Source response exceeds ${maxBytes} bytes`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Source response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

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

function titleQueryVariants(query) {
  const variants = [query];
  const meaningfulWords = meaningfulSearchTokens(query);
  // A source often omits the artist from its page title. For a query with at
  // least three meaningful words, also score title-only suffixes containing
  // two or more words (for example, “Nilüfer Caddelerde Rüzgar” →
  // “Caddelerde Rüzgar”). Single-word suffixes are intentionally excluded so
  // an artist + one-word title cannot turn into a noisy title-only match.
  for (let start = 1; start <= meaningfulWords.length - 2; start += 1) {
    variants.push(meaningfulWords.slice(start).join(" "));
  }
  return [...new Set(variants)];
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
    const items = JSON.parse(await readLimitedText(response, MAX_WORDPRESS_BYTES));
    return Array.isArray(items) ? items.map((item) => ({ item, variant })) : [];
  }));

  const unique = new Map();
  for (const { item } of responses.flat()) {
    if (!Number.isInteger(item?.id) || typeof item?.title !== "string" || typeof item?.url !== "string") continue;
    const title = decodeHtml(item.title);
    const cleanedTitle = usefulTitle(title);
    const score = titleQueryVariants(query)
      .reduce((best, variant) => Math.max(best, searchMatchScore(variant, [title, cleanedTitle])), 0);
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

function songsterrUrl(item) {
  const slug = normalizeSearchText(`${item.artist || ""} ${item.title || ""}`)
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `https://www.songsterr.com/a/wsa/${slug || "song"}-sheet-s${item.songId}`;
}

function songsterrMelodyTrack(item) {
  const tracks = Array.isArray(item?.tracks) ? item.tracks : [];
  const usable = (index) => Number.isInteger(index)
    && index >= 0
    && index < tracks.length
    && !/drum|percussion|bass/i.test(String(tracks[index]?.instrument || ""));
  const vocal = Number(item?.popularTrackVocals);
  if (usable(vocal)) return vocal;
  const guitar = Number(item?.popularTrackGuitar);
  if (usable(guitar)) return guitar;
  return tracks.findIndex((track) => !/drum|percussion|bass/i.test(String(track?.instrument || "")));
}

async function fetchSongsterrResults(adapter, query, fetchFn) {
  const searchTerms = meaningfulSearchText(query);
  if (!searchTerms) return [];
  const url = new URL("/api/songs", adapter.origin);
  url.searchParams.set("pattern", searchTerms);
  url.searchParams.set("size", "10");
  const response = await fetchFn(url, {
    headers: { Accept: "application/json", "User-Agent": "tin-whistle-note-creator/0.2" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`${adapter.name} returned HTTP ${response.status}`);
  const items = JSON.parse(await readLimitedText(response, MAX_SONGSTERR_BYTES));
  if (!Array.isArray(items)) return [];

  const unique = new Map();
  for (const item of items) {
    if (!Number.isInteger(item?.songId) || typeof item?.artist !== "string" || typeof item?.title !== "string") continue;
    if (item.isJunk || item.hasPlayer === false) continue;
    const score = searchMatchScore(query, [item.title, item.artist, `${item.artist} ${item.title}`]);
    if (score < 58) continue;
    const candidate = {
      id: `${adapter.id}:${item.songId}`,
      sourceId: adapter.id,
      sourceName: adapter.name,
      songId: item.songId,
      artist: item.artist,
      trackIndex: songsterrMelodyTrack(item),
      title: `${item.artist} — ${item.title}`,
      url: songsterrUrl(item),
      processingMode: adapter.processingMode,
      score,
    };
    const existing = unique.get(candidate.id);
    if (!existing || existing.score < score) unique.set(candidate.id, candidate);
  }
  return [...unique.values()];
}

function searchDocumentSources(query) {
  return Object.values(DOCUMENT_SOURCES).flatMap((document) => {
    const score = searchMatchScore(query, [document.title, ...document.aliases]);
    if (score < 58) return [];
    return [{
      id: `${document.sourceId}:${document.id}`,
      sourceId: document.sourceId,
      sourceName: document.sourceName,
      documentId: document.id,
      title: document.title,
      url: document.url,
      processingMode: document.processingMode,
      score,
    }];
  });
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
    return readLimitedText(response, MAX_DISCOVERY_BYTES);
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
  const wordpressAdapters = Object.values(SOURCE_ADAPTERS).filter((adapter) => adapter.kind === "wordpress");
  const songsterrAdapter = SOURCE_ADAPTERS.songsterr;
  const searchers = [
    ...wordpressAdapters.map((adapter) => ({ adapter, search: () => fetchWordPressResults(adapter, query, fetchFn) })),
    { adapter: songsterrAdapter, search: () => fetchSongsterrResults(songsterrAdapter, query, fetchFn) },
  ];
  const settled = await Promise.allSettled(
    searchers.map(({ search }) => search()),
  );
  const results = searchDocumentSources(query);
  const unavailableSources = [];
  settled.forEach((result, index) => {
    const adapter = searchers[index].adapter;
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
  return Object.values(SOURCE_ADAPTERS).find((adapter) => adapter.id === sourceId);
}
