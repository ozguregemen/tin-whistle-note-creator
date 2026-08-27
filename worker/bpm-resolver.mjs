import { normalizeSearchText, searchMatchScore } from "../app/search-relevance.mjs";

const DEFAULT_BPM = 90;
const MIN_BPM = 40;
const MAX_BPM = 220;
const MAX_PROVIDER_BYTES = 256 * 1024;
const TITLE_QUALIFIERS = /\b(?:akor(?:ları|lari)?|do\s*re\s*mi|gitar(?:ı|i)?|melodika|nota(?:ları|lari|sı|si)?|pdf|tab(?:ları|lari)?|tabs?)\b.*$/iu;

function compact(value, maxLength = 200) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

export function validBpm(value) {
  const bpm = Number(value);
  return Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM ? Math.round(bpm) : null;
}

export function parseSongIdentity({ title = "", artist = "", query = "" } = {}) {
  const requestedArtist = compact(artist, 120);
  const requestedTitle = compact(title || query).replace(TITLE_QUALIFIERS, "").trim().replace(/[–—-]+$/u, "").trim();
  const parts = requestedTitle.split(/\s+[–—-]\s+/u).map((part) => part.trim()).filter(Boolean);

  if (!requestedArtist && parts.length >= 2) {
    return { artist: parts[0], title: parts[1], query: compact(query, 160) };
  }

  const normalizedTitle = normalizeSearchText(requestedTitle);
  const normalizedQuery = normalizeSearchText(query);
  if (!requestedArtist && normalizedTitle && normalizedQuery.endsWith(` ${normalizedTitle}`)) {
    const queryWords = compact(query, 160).split(/\s+/);
    const titleWordCount = requestedTitle.split(/\s+/).length;
    const inferredArtist = queryWords.slice(0, -titleWordCount).join(" ");
    if (normalizeSearchText(inferredArtist).length >= 2) {
      return { artist: inferredArtist, title: requestedTitle, query: compact(query, 160) };
    }
  }

  return { artist: requestedArtist, title: requestedTitle, query: compact(query, 160) };
}

export function tempoLookupKey({ artist = "", title = "" }) {
  return `${normalizeSearchText(artist)}|${normalizeSearchText(title)}`;
}

function candidateArtistNames(candidate) {
  const artists = Array.isArray(candidate?.artist) ? candidate.artist : candidate?.artist ? [candidate.artist] : [];
  return artists.flatMap((item) => {
    if (typeof item === "string") return [item];
    return typeof item?.name === "string" ? [item.name] : [];
  }).filter(Boolean);
}

function candidateScore(identity, candidate) {
  const titleScore = searchMatchScore(identity.title, [candidate?.title || candidate?.song_title || ""]);
  const artistNames = candidateArtistNames(candidate);
  const artistScore = identity.artist ? searchMatchScore(identity.artist, artistNames) : 100;
  const combinedCandidates = artistNames.map((name) => `${name} ${candidate?.title || candidate?.song_title || ""}`);
  const queryScore = identity.query ? searchMatchScore(identity.query, [...combinedCandidates, candidate?.title || ""]) : 100;
  if (titleScore < 78 || artistScore < 78 || (identity.artist && identity.query && queryScore < 58)) return null;
  return Math.round(titleScore * 0.58 + artistScore * 0.32 + queryScore * 0.1);
}

async function readLimitedJson(response) {
  const declaredLength = Number(response.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_PROVIDER_BYTES) throw new Error("BPM provider response is too large");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_PROVIDER_BYTES) throw new Error("BPM provider response is too large");
  return JSON.parse(text);
}

async function readCachedTempo(db, lookupKey) {
  if (!db || !lookupKey || lookupKey === "|") return null;
  try {
    const row = await db.prepare(
      "SELECT artist, title, bpm, provider, provider_url AS providerUrl, confidence FROM song_tempos WHERE lookup_key = ?1 LIMIT 1",
    ).bind(lookupKey).first();
    const bpm = validBpm(row?.bpm);
    if (!row || bpm === null) return null;
    return {
      found: true,
      bpm,
      artist: row.artist || "",
      title: row.title,
      provider: row.provider,
      sourceUrl: row.providerUrl || "",
      confidence: Number(row.confidence) || 0,
      cached: true,
    };
  } catch (error) {
    console.warn(JSON.stringify({ event: "bpm_cache_read_failed", message: error instanceof Error ? error.message : String(error) }));
    return null;
  }
}

async function writeCachedTempo(db, lookupKey, result) {
  if (!db || !lookupKey || lookupKey === "|") return;
  try {
    await db.prepare(`
      INSERT INTO song_tempos (lookup_key, artist, title, bpm, provider, provider_url, confidence, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
      ON CONFLICT(lookup_key) DO UPDATE SET
        artist = excluded.artist,
        title = excluded.title,
        bpm = excluded.bpm,
        provider = excluded.provider,
        provider_url = excluded.provider_url,
        confidence = excluded.confidence,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      lookupKey,
      result.artist || "",
      result.title,
      result.bpm,
      result.provider,
      result.sourceUrl || "",
      result.confidence,
    ).run();
  } catch (error) {
    console.warn(JSON.stringify({ event: "bpm_cache_write_failed", message: error instanceof Error ? error.message : String(error) }));
  }
}

async function searchGetSongBpm(identity, apiKey, fetchFn) {
  if (!apiKey || !identity.title) return null;
  const url = new URL("https://api.getsong.co/search/");
  url.searchParams.set("type", identity.artist ? "both" : "song");
  url.searchParams.set("lookup", identity.artist
    ? `song:${identity.title} artist:${identity.artist}`
    : identity.title);
  url.searchParams.set("limit", "10");
  const response = await fetchFn(url, {
    headers: { Accept: "application/json", "User-Agent": "tin-whistle-note-creator/0.3", "X-API-KEY": apiKey },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`GetSongBPM returned HTTP ${response.status}`);
  const payload = await readLimitedJson(response);
  const candidates = Array.isArray(payload?.search) ? payload.search : [];
  const ranked = candidates.flatMap((candidate) => {
    const bpm = validBpm(candidate?.tempo);
    const score = candidateScore(identity, candidate);
    return bpm !== null && score !== null ? [{ candidate, bpm, score }] : [];
  }).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) return null;
  const artists = candidateArtistNames(best.candidate);
  return {
    found: true,
    bpm: best.bpm,
    artist: artists[0] || identity.artist,
    title: best.candidate.title || identity.title,
    provider: "getsongbpm",
    sourceUrl: typeof best.candidate.uri === "string" ? best.candidate.uri : "https://getsongbpm.com",
    confidence: identity.artist ? Math.max(80, best.score) : Math.min(84, best.score),
    cached: false,
  };
}

export async function resolveTempo(input, env, fetchFn = fetch) {
  const identity = parseSongIdentity(input);
  if (!normalizeSearchText(identity.title)) return null;
  const lookupKey = tempoLookupKey(identity);
  const cached = await readCachedTempo(env?.BPM_DB, lookupKey);
  if (cached) return cached;

  let result = null;
  try {
    result = await searchGetSongBpm(identity, env?.GETSONGBPM_API_KEY, fetchFn);
  } catch (error) {
    console.warn(JSON.stringify({ event: "bpm_provider_failed", provider: "getsongbpm", message: error instanceof Error ? error.message : String(error) }));
  }
  if (!result) return null;
  await writeCachedTempo(env?.BPM_DB, lookupKey, result);
  return result;
}

export function defaultTempo() {
  return { bpm: DEFAULT_BPM, tempoSource: "default", tempoConfidence: 0 };
}
