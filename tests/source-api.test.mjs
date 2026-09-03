import assert from "node:assert/strict";
import test from "node:test";
import { createSourceApi } from "../worker/source-api.mjs";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function repositoryJson(data) {
  return jsonResponse({ encoding: "base64", content: Buffer.from(JSON.stringify(data)).toString("base64") });
}

test("Worker sağlık ve CORS uç noktalarını sunar", async () => {
  const handle = createSourceApi({ ALLOWED_ORIGINS: "https://ozguregemen.github.io" }, async () => jsonResponse([]));
  const response = await handle(new Request("https://worker.test/health", { headers: { Origin: "https://ozguregemen.github.io" } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://ozguregemen.github.io");
  assert.deepEqual((await response.json()).adapters, ["notalar", "gitaregitim", "songsterr", "academic-pdf"]);
});

test("Worker yalnızca desteklenen kaynakları GitHub Actions kuyruğuna gönderir", async () => {
  let dispatchBody;
  const fetchMock = async (input, init) => {
    const url = String(input);
    if (url.includes("/contents/catalog/catalog.json")) return jsonResponse(null, 404);
    if (url.includes("/dispatches")) {
      dispatchBody = JSON.parse(init.body);
      return new Response(null, { status: 204 });
    }
    return jsonResponse([]);
  };
  const handle = createSourceApi({ GITHUB_TOKEN: "secret", GITHUB_REPOSITORY: "owner/repo" }, fetchMock);
  const response = await handle(new Request("https://worker.test/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId: "gitaregitim", postId: 22205, query: "Tarkan Dudu", title: "Dudu" }),
  }));
  assert.equal(response.status, 202);
  assert.equal(dispatchBody.event_type, "source-conversion-request");
  assert.equal(dispatchBody.client_payload.postId, 22205);

  const documentResponse = await handle(new Request("https://worker.test/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceId: "academic-pdf",
      documentId: "ohu-tarkan-kuzu-kuzu",
      query: "Kuzu Kuzu",
      title: "Tarkan – Kuzu Kuzu",
    }),
  }));
  assert.equal(documentResponse.status, 202);
  assert.equal(dispatchBody.client_payload.documentId, "ohu-tarkan-kuzu-kuzu");
  assert.equal("postId" in dispatchBody.client_payload, false);

  const songsterrResponse = await handle(new Request("https://worker.test/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceId: "songsterr",
      songId: 1144964,
      trackIndex: 0,
      query: "The Mayan Factor Warflower",
      title: "The Mayan Factor — Warflower",
      artist: "The Mayan Factor",
    }),
  }));
  assert.equal(songsterrResponse.status, 202);
  assert.equal(dispatchBody.client_payload.songId, 1144964);
  assert.equal(dispatchBody.client_payload.trackIndex, 0);
  assert.equal(dispatchBody.client_payload.artist, "The Mayan Factor");

  const rejected = await handle(new Request("https://worker.test/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId: "evil", postId: 1 }),
  }));
  assert.equal(rejected.status, 400);

  const unknownDocument = await handle(new Request("https://worker.test/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId: "academic-pdf", documentId: "unknown" }),
  }));
  assert.equal(unknownDocument.status, 400);
});

test("Worker BPM sonucunu sunar ve kaynak işine aktarır", async () => {
  let dispatchBody;
  const fetchMock = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/contents/catalog/catalog.json")) return jsonResponse(null, 404);
    if (url.startsWith("https://api.getsong.co/")) {
      return jsonResponse({ search: [{
        title: "Dudu", tempo: "90", uri: "https://getsongbpm.com/song/dudu/example", artist: { name: "Tarkan" },
      }] });
    }
    if (url.includes("/dispatches")) {
      dispatchBody = JSON.parse(init.body);
      return new Response(null, { status: 204 });
    }
    return jsonResponse([]);
  };
  const env = { GITHUB_TOKEN: "secret", GITHUB_REPOSITORY: "owner/repo", GETSONGBPM_API_KEY: "bpm-key" };
  const handle = createSourceApi(env, fetchMock);

  const tempoResponse = await handle(new Request("https://worker.test/api/tempo?title=Dudu&artist=Tarkan"));
  assert.equal(tempoResponse.status, 200);
  assert.deepEqual(await tempoResponse.json(), {
    found: true,
    bpm: 90,
    artist: "Tarkan",
    title: "Dudu",
    provider: "getsongbpm",
    sourceUrl: "https://getsongbpm.com/song/dudu/example",
    confidence: 100,
    cached: false,
  });

  const jobResponse = await handle(new Request("https://worker.test/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId: "gitaregitim", postId: 22205, query: "Tarkan Dudu", title: "Tarkan – Dudu – Gitar Tab" }),
  }));
  assert.equal(jobResponse.status, 202);
  assert.equal(dispatchBody.client_payload.tempo.bpm, 90);
  assert.equal(dispatchBody.client_payload.tempo.provider, "getsongbpm");
  assert.equal(dispatchBody.client_payload.artist, "Tarkan");
});

test("Worker daha önce çevrilen kaynağı yeniden kuyruğa göndermeden katalogdan döndürür", async () => {
  let dispatchCount = 0;
  const cachedSong = {
    id: "songsterr-2206954-loser",
    sourceProcessingVersion: 2,
    title: "Loser",
    artist: "Tame Impala",
    notes: "D4 E4 F4 G4",
  };
  const fetchMock = async (input) => {
    const url = String(input);
    if (url.includes("/contents/catalog/catalog.json")) {
      return repositoryJson({ schemaVersion: 1, songs: [cachedSong] });
    }
    if (url.includes("/dispatches")) {
      dispatchCount += 1;
      return new Response(null, { status: 204 });
    }
    return jsonResponse([]);
  };
  const handle = createSourceApi({ GITHUB_TOKEN: "secret", GITHUB_REPOSITORY: "owner/repo" }, fetchMock);

  const response = await handle(new Request("https://worker.test/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceId: "songsterr",
      songId: 2206954,
      trackIndex: 4,
      query: "Tame Impala Loser",
      title: "Tame Impala — Loser",
      artist: "Tame Impala",
    }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "completed", cached: true, song: cachedSong });
  assert.equal(dispatchCount, 0);
});

test("Worker önbellekteki Dracula kaydını incelenmiş 115 BPM ile döndürür", async () => {
  const cachedSong = {
    id: "songsterr-2413330-dracula",
    sourceProcessingVersion: 2,
    title: "Dracula",
    artist: "Tame Impala",
    notes: "D4 E4 F#4 G4",
    rhythm: { bpm: 90, source: "score", tempoSource: "default", durations: [[1, 1, 1, 1]] },
  };
  const fetchMock = async (input) => {
    if (String(input).includes("/contents/catalog/catalog.json")) {
      return repositoryJson({ schemaVersion: 1, songs: [cachedSong] });
    }
    throw new Error("A cached song must not dispatch a new job");
  };
  const handle = createSourceApi({ GITHUB_TOKEN: "secret", GITHUB_REPOSITORY: "owner/repo" }, fetchMock);
  const response = await handle(new Request("https://worker.test/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceId: "songsterr",
      songId: 2413330,
      query: "Tame Impala Dracula",
      title: "Dracula",
      artist: "Tame Impala",
    }),
  }));

  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.song.rhythm.bpm, 115);
  assert.equal(payload.song.rhythm.tempoSource, "curated");
});

test("Worker eski işleme sürümüyle üretilen sonucu yeni algoritma için tekrar kuyruğa alır", async () => {
  let dispatchCount = 0;
  const fetchMock = async (input) => {
    const url = String(input);
    if (url.includes("/contents/catalog/catalog.json")) {
      return repositoryJson({
        schemaVersion: 1,
        songs: [{ id: "songsterr-2206954-loser", title: "Loser", notes: "D4 E4" }],
      });
    }
    if (url.includes("/dispatches")) {
      dispatchCount += 1;
      return new Response(null, { status: 204 });
    }
    return jsonResponse([]);
  };
  const handle = createSourceApi({ GITHUB_TOKEN: "secret", GITHUB_REPOSITORY: "owner/repo" }, fetchMock);

  const response = await handle(new Request("https://worker.test/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceId: "songsterr",
      songId: 2206954,
      query: "Tame Impala Loser",
      title: "Tame Impala — Loser",
      artist: "Tame Impala",
    }),
  }));

  assert.equal(response.status, 202);
  assert.equal(dispatchCount, 1);
});
