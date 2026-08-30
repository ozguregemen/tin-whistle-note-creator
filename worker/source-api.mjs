import { getSourceAdapter, searchAllSources, SOURCE_ADAPTERS } from "./source-adapters.mjs";
import { getDocumentSource } from "./document-sources.mjs";
import { resolveTempo } from "./bpm-resolver.mjs";

const DEFAULT_REPOSITORY = "ozguregemen/tin-whistle-note-creator";

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return "*";
  const configured = (env.ALLOWED_ORIGINS || "https://ozguregemen.github.io")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (configured.includes(origin)) return origin;
  if (/^http:\/\/localhost:\d+$/.test(origin)) return origin;
  return null;
}

function corsHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  return origin ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  } : {};
}

async function githubRequest(path, env, fetchFn, init = {}) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not configured");
  const response = await fetchFn(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "tin-whistle-note-source-api",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  return response;
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function readRepositoryJson(path, env, fetchFn) {
  const repository = env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const ref = env.GITHUB_RESULT_REF || "main";
  const response = await githubRequest(
    `/repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
    env,
    fetchFn,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub contents returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.encoding !== "base64" || typeof payload.content !== "string") throw new Error("Unexpected GitHub content response");
  return JSON.parse(decodeBase64(payload.content));
}

async function queueJob(request, env, fetchFn) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 4096) return { response: { error: "Request body is too large" }, status: 413 };
  const body = await request.json().catch(() => null);
  const adapter = getSourceAdapter(body?.sourceId);
  const postId = Number.isInteger(body?.postId) && body.postId > 0 ? body.postId : null;
  const songId = Number.isInteger(body?.songId) && body.songId > 0 ? body.songId : null;
  const trackIndex = Number.isInteger(body?.trackIndex) && body.trackIndex >= 0 ? body.trackIndex : null;
  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  const document = adapter?.kind === "document" ? getDocumentSource(documentId) : null;
  const candidateIsValid = adapter?.kind === "wordpress"
    ? postId !== null
    : adapter?.kind === "guitarpro"
      ? songId !== null
      : Boolean(document && document.sourceId === adapter?.id);
  if (!adapter || !candidateIsValid) {
    return { response: { error: "Invalid or unsupported source candidate" }, status: 400 };
  }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 160) : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const artist = typeof body.artist === "string" ? body.artist.trim().slice(0, 120) : "";
  const tempo = await resolveTempo({ title, artist, query }, env, fetchFn);
  const resolvedArtist = artist || tempo?.artist || "";
  const requestId = crypto.randomUUID();
  const repository = env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const dispatch = await githubRequest(`/repos/${repository}/dispatches`, env, fetchFn, {
    method: "POST",
    body: JSON.stringify({
      event_type: "source-conversion-request",
      client_payload: {
        requestId,
        sourceId: adapter.id,
        ...(postId !== null ? { postId } : {}),
        ...(songId !== null ? { songId } : {}),
        ...(trackIndex !== null ? { trackIndex } : {}),
        ...(document ? { documentId: document.id } : {}),
        query,
        title,
        ...(resolvedArtist ? { artist: resolvedArtist } : {}),
        ...(tempo ? { tempo } : {}),
      },
    }),
  });
  if (!dispatch.ok) throw new Error(`GitHub dispatch returned HTTP ${dispatch.status}`);
  return { response: { requestId, status: "queued" }, status: 202 };
}

export function createSourceApi(env, fetchFn = fetch) {
  return async function handle(request) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.headers.get("Origin") && !allowedOrigin(request, env)) return json({ error: "Origin is not allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({
          ok: true,
          adapters: Object.values(SOURCE_ADAPTERS).map((adapter) => adapter.id),
          bpm: { cache: Boolean(env.BPM_DB), provider: Boolean(env.GETSONGBPM_API_KEY) },
        }, 200, cors);
      }
      if (request.method === "GET" && url.pathname === "/api/tempo") {
        const title = (url.searchParams.get("title") || "").trim().slice(0, 200);
        const artist = (url.searchParams.get("artist") || "").trim().slice(0, 120);
        const query = (url.searchParams.get("q") || "").trim().slice(0, 160);
        if (title.length < 2) return json({ error: "Title must contain at least 2 characters" }, 400, cors);
        const tempo = await resolveTempo({ title, artist, query }, env, fetchFn);
        return tempo
          ? json(tempo, 200, { ...cors, "Cache-Control": "no-store" })
          : json({ found: false }, 404, { ...cors, "Cache-Control": "no-store" });
      }
      if (request.method === "GET" && url.pathname === "/api/search") {
        const query = (url.searchParams.get("q") || "").trim();
        if (query.length < 2 || query.length > 160) return json({ error: "Query must contain 2 to 160 characters" }, 400, cors);
        const result = await searchAllSources(query, fetchFn);
        return json({ query, ...result }, 200, { ...cors, "Cache-Control": "public, max-age=60" });
      }
      if (request.method === "POST" && url.pathname === "/api/jobs") {
        const result = await queueJob(request, env, fetchFn);
        return json(result.response, result.status, cors);
      }
      if (request.method === "GET" && url.pathname === "/api/catalog") {
        const catalog = await readRepositoryJson("catalog/catalog.json", env, fetchFn);
        return json(catalog || { schemaVersion: 1, songs: [] }, 200, { ...cors, "Cache-Control": "public, max-age=60" });
      }
      const jobMatch = url.pathname.match(/^\/api\/jobs\/([0-9a-f-]{36})$/i);
      if (request.method === "GET" && jobMatch) {
        const job = await readRepositoryJson(`catalog/jobs/${jobMatch[1]}.json`, env, fetchFn);
        return json(job || { requestId: jobMatch[1], status: "queued" }, job ? 200 : 202, { ...cors, "Cache-Control": "no-store" });
      }
      return json({ error: "Not found" }, 404, cors);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error(JSON.stringify({ event: "source_api_error", path: url.pathname, message }));
      return json({ error: message }, /not configured/i.test(message) ? 503 : 502, cors);
    }
  };
}

export default {
  async fetch(request, env) {
    return createSourceApi(env)(request);
  },
};
