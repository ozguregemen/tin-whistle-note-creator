import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as alphaTab from "@coderline/alphatab";
import {
  addEstimatedOctaves, extractScoreAssets, extractTextTimedPhrases, mergeSongIntoCatalog,
  musicXmlToTimedPhrases, phrasesToString, plainTitle, slugify, stripLeadingArtist,
} from "./source-processing.mjs";
import {
  guitarProScoreToTimedPhrases, rankSongsterrTrackIndices, selectBestSongsterrParsedTrack,
  songsterrTrackJsonToTimedPhrases,
} from "./songsterr-processing.mjs";
import { documentNoteCountIsPlausible, getDocumentSource } from "../worker/document-sources.mjs";

const CATALOG_FILE = new URL("../catalog/catalog.json", import.meta.url);
const JOB_DIRECTORY = new URL("../catalog/jobs/", import.meta.url);
const WORK_DIRECTORY = new URL("../.source-job/", import.meta.url);

const SOURCES = {
  notalar: { name: "Notalar.net", kind: "wordpress", origin: "https://www.notalar.net", mode: "text" },
  gitaregitim: { name: "Gitaregitim.net", kind: "wordpress", origin: "https://www.gitaregitim.net", mode: "omr" },
  songsterr: { name: "Songsterr", kind: "guitarpro", origin: "https://www.songsterr.com", mode: "gp" },
  "academic-pdf": { name: "Academic score PDF", kind: "document", mode: "omr" },
};

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_METADATA_BYTES = 512 * 1024;
const SOURCE_REQUEST_TIMEOUT_MS = 15_000;
const LARGE_DOWNLOAD_TIMEOUT_MS = 45_000;
const SOURCE_PROCESSING_VERSION = 2;
const SONGSTERR_TRACK_CDNS = Object.freeze([
  "https://dqsljvtekg760.cloudfront.net",
  "https://d34shlm8p2ums2.cloudfront.net",
  "https://d3cqchs6g3b5ew.cloudfront.net",
  "https://d3d3l6a6rcgkaf.cloudfront.net",
]);

function fetchWithTimeout(input, init = {}, timeout = SOURCE_REQUEST_TIMEOUT_MS) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeout),
  });
}

function requestPayload() {
  const sourceId = process.env.SOURCE_ID;
  const postId = Number(process.env.POST_ID);
  const songId = Number(process.env.SONG_ID);
  const trackIndex = /^\d+$/.test(process.env.TRACK_INDEX || "") ? Number(process.env.TRACK_INDEX) : null;
  const documentId = (process.env.DOCUMENT_ID || "").slice(0, 120);
  const source = SOURCES[sourceId];
  const document = source?.kind === "document" ? getDocumentSource(documentId) : null;
  const validWordPressPost = source?.kind === "wordpress" && Number.isInteger(postId) && postId > 0;
  const validGuitarProSong = source?.kind === "guitarpro" && Number.isInteger(songId) && songId > 0;
  const validDocument = source?.kind === "document" && document?.sourceId === sourceId;
  const resolvedBpm = Number(process.env.SOURCE_BPM);
  const tempo = Number.isFinite(resolvedBpm) && resolvedBpm >= 40 && resolvedBpm <= 220 ? {
    bpm: Math.round(resolvedBpm),
    provider: (process.env.SOURCE_BPM_PROVIDER || "database").slice(0, 40),
    sourceUrl: (process.env.SOURCE_BPM_URL || "").slice(0, 500),
    confidence: Math.min(100, Math.max(0, Number(process.env.SOURCE_BPM_CONFIDENCE) || 0)),
    artist: (process.env.SOURCE_ARTIST || "").slice(0, 120),
  } : null;
  if (!source || (!validWordPressPost && !validGuitarProSong && !validDocument)) throw new Error("Invalid source job payload");
  return {
    requestId: /^[0-9a-f-]{36}$/i.test(process.env.REQUEST_ID || "") ? process.env.REQUEST_ID : randomUUID(),
    sourceId,
    ...(validWordPressPost ? { postId } : {}),
    ...(validGuitarProSong ? { songId, ...(Number.isInteger(trackIndex) && trackIndex >= 0 ? { trackIndex } : {}) } : {}),
    ...(validDocument ? { documentId, document } : {}),
    query: (process.env.SOURCE_QUERY || "").slice(0, 160),
    requestedTitle: (process.env.SOURCE_TITLE || "").slice(0, 200),
    requestedArtist: (process.env.SOURCE_ARTIST || "").slice(0, 120),
    ...(tempo ? { tempo } : {}),
    source,
  };
}

async function emitOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}

async function readCatalog() {
  return JSON.parse(await readFile(CATALOG_FILE, "utf8"));
}

async function writeJob(job) {
  await mkdir(JOB_DIRECTORY, { recursive: true });
  await writeFile(new URL(`${job.requestId}.json`, JOB_DIRECTORY), `${JSON.stringify(job, null, 2)}\n`);
}

function buildSong(payload, post, notes, confidence, rhythm) {
  const artist = payload.requestedArtist || payload.tempo?.artist || "";
  let title = plainTitle(post.title?.rendered || post.title || payload.requestedTitle || `Source ${payload.postId}`)
    .replace(/\s+(?:do\s+re\s+mi|melodika|gitar|nota|tab).*$/i, "")
    .replace(/\s+[–—-]\s*$/u, "")
    .trim();
  title = stripLeadingArtist(title, artist);
  return {
    id: `${payload.sourceId}-${payload.documentId || payload.songId || payload.postId}-${slugify(title)}`,
    sourceProcessingVersion: SOURCE_PROCESSING_VERSION,
    title,
    ...(artist ? { artist } : {}),
    aliases: [payload.query, payload.requestedTitle].filter(Boolean),
    subtitle: {
      en: confidence === "estimated"
        ? "Live text source · first register assumed"
        : confidence === "score-imported"
          ? "Live Guitar Pro source · melody track imported"
          : "Live score source · machine-read notation",
      tr: confidence === "estimated"
        ? "Canlı metin kaynağı · ilk register varsayıldı"
        : confidence === "score-imported"
          ? "Canlı Guitar Pro kaynağı · melodi kanalı içe aktarıldı"
          : "Canlı nota kaynağı · makineyle okunan notasyon",
    },
    difficulty: { en: "Source arrangement", tr: "Kaynak düzeni" },
    notes,
    ...(rhythm ? { rhythm } : {}),
    sourceStatus: "live",
    sourceConfidence: confidence,
    sources: [{ name: payload.source.name, url: post.link, role: "note-source" }],
  };
}

async function complete(payload, post, phrases, confidence, rhythm) {
  const notes = phrasesToString(phrases);
  if (!notes) throw new Error("No notes were extracted from the source");
  const song = buildSong(payload, post, notes, confidence, rhythm);
  const catalog = mergeSongIntoCatalog(await readCatalog(), song);
  await writeFile(CATALOG_FILE, `${JSON.stringify(catalog, null, 2)}\n`);
  await writeJob({ requestId: payload.requestId, status: "completed", confidence, song });
}

async function downloadAssets(urls) {
  const inputDirectory = new URL("input/", WORK_DIRECTORY);
  await mkdir(inputDirectory, { recursive: true });
  const files = [];
  for (let index = 0; index < urls.length; index += 1) {
    const sourceUrl = new URL(urls[index]);
    const extension = extname(sourceUrl.pathname).toLowerCase() || ".jpg";
    const filename = `${String(index + 1).padStart(2, "0")}${extension}`;
    const response = await fetchWithTimeout(sourceUrl, { headers: { "User-Agent": "tin-whistle-note-creator/0.3" } }, LARGE_DOWNLOAD_TIMEOUT_MS);
    if (!response.ok) throw new Error(`Score asset returned HTTP ${response.status}`);
    await writeFile(new URL(`input/${filename}`, WORK_DIRECTORY), new Uint8Array(await response.arrayBuffer()));
    files.push(filename);
  }
  return files;
}

async function downloadDocument(document) {
  const response = await fetchWithTimeout(document.url, {
    headers: { Accept: "application/pdf", "User-Agent": "tin-whistle-note-creator/0.2" },
  }, LARGE_DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) throw new Error(`Academic score PDF returned HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_DOCUMENT_BYTES) throw new Error("Academic score PDF is too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error("Academic score PDF is too large");
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Academic score source did not return a PDF");
  await writeFile(new URL("document.pdf", WORK_DIRECTORY), bytes);
}

async function limitedResponseBytes(response, maximumBytes, label) {
  const declaredLength = Number(response.headers.get("Content-Length") || 0);
  if (declaredLength > maximumBytes) throw new Error(`${label} is too large`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw new Error(`${label} is too large`);
  return bytes;
}

async function limitedJson(response, maximumBytes, label) {
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return JSON.parse(new TextDecoder().decode(await limitedResponseBytes(response, maximumBytes, label)));
}

async function loadSongsterrTrackJson(payload, meta, trackIndex) {
  const image = String(meta.image || "").trim();
  const path = image
    ? `/${payload.songId}/${meta.revisionId}/${encodeURIComponent(image)}/${trackIndex}.json`
    : `/part/${meta.revisionId}/${trackIndex}`;
  let lastStatus = 0;
  for (const cdn of SONGSTERR_TRACK_CDNS) {
    const response = await fetchWithTimeout(`${cdn}${path}`, {
      headers: { Accept: "application/json", "User-Agent": "tin-whistle-note-creator/0.3" },
    });
    if (response.ok) return limitedJson(response, MAX_DOCUMENT_BYTES, "Songsterr track data");
    lastStatus = response.status;
    if (response.status !== 403 && response.status !== 404) break;
  }
  throw new Error(`Songsterr track data returned HTTP ${lastStatus || 502}`);
}

async function loadSongsterrScore(payload) {
  const metaResponse = await fetchWithTimeout(new URL(`/api/meta/${payload.songId}`, payload.source.origin), {
    headers: { Accept: "application/json", "User-Agent": "tin-whistle-note-creator/0.3" },
  });
  const meta = await limitedJson(metaResponse, MAX_METADATA_BYTES, "Songsterr metadata");
  if (meta?.songId !== payload.songId || !meta.hasPlayer || meta.isJunk || meta.isBlocked || meta.isDeleted) {
    throw new Error("Songsterr song is not available for score import");
  }

  const revisionId = Number(meta.revisionId || meta.latestRevisionId);
  if (!Number.isInteger(revisionId) || revisionId <= 0) throw new Error("Songsterr did not return a score revision");
  const revisionResponse = await fetchWithTimeout(new URL(`/api/revision/${revisionId}`, payload.source.origin), {
    headers: { Accept: "application/json", "User-Agent": "tin-whistle-note-creator/0.3" },
  });
  const revision = await limitedJson(revisionResponse, MAX_METADATA_BYTES, "Songsterr revision");
  if (revision?.songId !== payload.songId || revision?.revisionId !== revisionId) {
    throw new Error("Songsterr returned a mismatched score revision");
  }

  const resolvedMeta = { ...revision, ...meta, popularTrackGuitar: meta.popularTrackGuitar, popularTrackVocals: meta.popularTrackVocals };
  if (!revision.source) {
    const trackIndices = rankSongsterrTrackIndices(meta, null, payload.trackIndex).slice(0, 5);
    if (!trackIndices.length) throw new Error("Songsterr did not return a melodic track");
    const settled = await Promise.allSettled(trackIndices.map(async (trackIndex) => {
      const track = await loadSongsterrTrackJson(payload, meta, trackIndex);
      return { trackIndex, parsed: songsterrTrackJsonToTimedPhrases(track, meta, trackIndex) };
    }));
    const candidates = settled
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    const selected = selectBestSongsterrParsedTrack(candidates, meta, payload.trackIndex);
    if (!selected) {
      const failure = settled.find((result) => result.status === "rejected");
      throw failure?.reason instanceof Error
        ? failure.reason
        : new Error("Songsterr did not return a usable melodic track");
    }
    return {
      meta: resolvedMeta,
      parsed: { ...selected.parsed, trackIndex: selected.trackIndex, selectionScore: selected.selectionScore },
      format: "track-json",
    };
  }
  const sourceUrl = new URL(String(revision.source));
  if (sourceUrl.protocol !== "https:" || sourceUrl.hostname !== "gp.songsterr.com") {
    throw new Error("Songsterr returned an unsupported score source");
  }
  const scoreResponse = await fetchWithTimeout(sourceUrl, {
    headers: { Accept: "application/octet-stream", "User-Agent": "tin-whistle-note-creator/0.3" },
  }, LARGE_DOWNLOAD_TIMEOUT_MS);
  if (!scoreResponse.ok) throw new Error(`Songsterr score returned HTTP ${scoreResponse.status}`);
  const scoreBytes = await limitedResponseBytes(scoreResponse, MAX_DOCUMENT_BYTES, "Songsterr score");
  const settings = new alphaTab.Settings();
  settings.importer.maxDecodingBufferSize = MAX_DOCUMENT_BYTES;
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(scoreBytes, settings);
  return { meta: resolvedMeta, score, format: "guitar-pro" };
}

function songsterrPageUrl(meta) {
  const slug = slugify(`${meta.artist || ""} ${meta.title || ""}`) || "song";
  return `https://www.songsterr.com/a/wsa/${slug}-sheet-s${meta.songId}`;
}

async function prepare() {
  const payload = requestPayload();
  await mkdir(WORK_DIRECTORY, { recursive: true });
  let post;
  if (payload.source.kind === "document") {
    await downloadDocument(payload.document);
    post = {
      title: { rendered: payload.document.title },
      link: payload.document.url,
      content: { rendered: "" },
      modified: null,
    };
  } else if (payload.source.kind === "guitarpro") {
    const loaded = await loadSongsterrScore(payload);
    const { meta, score } = loaded;
    payload.requestedArtist ||= String(meta.artist || "").slice(0, 120);
    post = {
      title: { rendered: String(meta.title || payload.requestedTitle || `Song ${payload.songId}`) },
      link: songsterrPageUrl(meta),
      content: { rendered: "" },
      modified: meta.createdAt || null,
    };
    const parsed = loaded.format === "track-json"
      ? loaded.parsed
      : guitarProScoreToTimedPhrases(score, meta, payload.trackIndex);
    const noteCount = parsed.phrases.flat().length;
    if (noteCount < 8) {
      await writeJob({
        requestId: payload.requestId,
        status: "needs-review",
        reason: "The Guitar Pro source did not contain a usable melodic track",
        sourceUrl: post.link,
      });
      await emitOutput("mode", "needs-review");
      await emitOutput("request_id", payload.requestId);
      return;
    }
    await complete(payload, post, parsed.phrases, "score-imported", {
      bpm: parsed.tempo || payload.tempo?.bpm || 90,
      source: "score",
      tempoSource: parsed.tempo ? "score" : payload.tempo ? "database" : "default",
      tempoConfidence: parsed.tempo ? 100 : payload.tempo?.confidence || 0,
      ...(payload.tempo?.sourceUrl && !parsed.tempo ? { tempoUrl: payload.tempo.sourceUrl } : {}),
      durations: parsed.durations,
      gaps: parsed.gaps,
    });
    await emitOutput("mode", "complete");
    await emitOutput("request_id", payload.requestId);
    return;
  } else {
    const postUrl = new URL(`/wp-json/wp/v2/posts/${payload.postId}`, payload.source.origin);
    postUrl.searchParams.set("_fields", "title,link,content,modified");
    const response = await fetchWithTimeout(postUrl, { headers: { Accept: "application/json", "User-Agent": "tin-whistle-note-creator/0.3" } });
    if (!response.ok) throw new Error(`${payload.source.name} returned HTTP ${response.status}`);
    post = await response.json();
  }
  const context = { payload, post };
  await writeFile(new URL("context.json", WORK_DIRECTORY), `${JSON.stringify(context, null, 2)}\n`);

  if (payload.source.kind === "document") {
    await emitOutput("mode", "pdf-pages");
    await emitOutput("page_start", payload.document.pageStart);
    await emitOutput("page_end", payload.document.pageEnd);
    await emitOutput("request_id", payload.requestId);
    return;
  }

  if (payload.source.mode === "text") {
    const parsedText = extractTextTimedPhrases(post.content?.rendered || "");
    const rhythm = parsedText.hasRhythm || payload.tempo ? {
      bpm: payload.tempo?.bpm || 90,
      source: parsedText.hasRhythm ? "text" : "estimated",
      ...(payload.tempo ? {
        tempoSource: "database",
        tempoConfidence: payload.tempo.confidence,
        ...(payload.tempo.sourceUrl ? { tempoUrl: payload.tempo.sourceUrl } : {}),
      } : {
        tempoSource: "default",
        tempoConfidence: 0,
      }),
      durations: parsedText.hasRhythm ? parsedText.durations : [],
      ...(parsedText.hasRhythm ? { gaps: parsedText.gaps } : {}),
    } : undefined;
    await complete(payload, post, addEstimatedOctaves(parsedText.phrases), "estimated", rhythm);
    await emitOutput("mode", "complete");
    await emitOutput("request_id", payload.requestId);
    return;
  }

  const assets = extractScoreAssets(post.content?.rendered || "");
  if (!assets.preferred.length) {
    await writeJob({ requestId: payload.requestId, status: "needs-review", reason: "No downloadable PDF or score image was found", sourceUrl: post.link });
    await emitOutput("mode", "needs-review");
    await emitOutput("request_id", payload.requestId);
    return;
  }
  const files = await downloadAssets(assets.preferred.slice(0, 6));
  await writeFile(new URL("assets.json", WORK_DIRECTORY), `${JSON.stringify({ ...assets, files }, null, 2)}\n`);
  await emitOutput("mode", "omr");
  await emitOutput("request_id", payload.requestId);
}

async function findFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findFiles(path));
    else files.push(path);
  }
  return files;
}

async function finalize() {
  const { payload, post } = JSON.parse(await readFile(new URL("context.json", WORK_DIRECTORY), "utf8"));
  const workPath = fileURLToPath(WORK_DIRECTORY);
  const xmlFiles = (await findFiles(workPath)).filter((path) => /\.(?:musicxml|xml)$/i.test(path) && !/container\.xml$/i.test(path));
  let bestScore = { phrases: [], durations: [], gaps: [], tempo: null };
  for (const path of xmlFiles) {
    const score = musicXmlToTimedPhrases(await readFile(path, "utf8"));
    if (score.phrases.flat().length > bestScore.phrases.flat().length) bestScore = score;
  }
  const noteCount = bestScore.phrases.flat().length;
  if (documentNoteCountIsPlausible(payload.document, noteCount)) {
    const bpm = payload.document?.bpm || bestScore.tempo || payload.tempo?.bpm || 90;
    const tempoSource = payload.document?.bpm
      ? "curated"
      : bestScore.tempo
        ? "score"
        : payload.tempo?.bpm
          ? "database"
          : "default";
    await complete(payload, post, bestScore.phrases, "omr-unreviewed", {
      bpm,
      source: "score",
      tempoSource,
      tempoConfidence: payload.document?.bpm || bestScore.tempo ? 100 : payload.tempo?.confidence || 0,
      ...(payload.tempo?.sourceUrl && tempoSource === "database" ? { tempoUrl: payload.tempo.sourceUrl } : {}),
      durations: bestScore.durations,
      gaps: bestScore.gaps,
    });
  } else {
    const assets = payload.document
      ? { pdfs: [post.link], images: [], musescore: [] }
      : JSON.parse(await readFile(new URL("assets.json", WORK_DIRECTORY), "utf8"));
    await writeJob({
      requestId: payload.requestId,
      status: "needs-review",
      reason: payload.document
        ? `The academic score contains about ${payload.document.expectedNotes.min}-${payload.document.expectedNotes.max} notes, but OMR read ${noteCount}`
        : "The score was found, but OMR did not produce a usable melody",
      sourceUrl: post.link,
      assets: { pdfs: assets.pdfs, images: assets.images, musescore: assets.musescore },
    });
  }
  await emitOutput("request_id", payload.requestId);
}

function publicFailureReason(error) {
  const message = error instanceof Error ? error.message : String(error || "Unexpected source error");
  if (/timeout|timed out|abort/i.test(`${error?.name || ""} ${message}`)) {
    return "The selected source timed out before returning a usable score";
  }
  return message.replace(/\s+/g, " ").trim().slice(0, 240) || "The selected source could not be processed";
}

async function recordFailure(error) {
  const requestId = process.env.REQUEST_ID || "";
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw error;
  const reason = publicFailureReason(error);
  console.error(JSON.stringify({ event: "source_processing_failed", requestId, sourceId: process.env.SOURCE_ID || "", reason }));
  await writeJob({
    requestId,
    status: "failed",
    reason,
    retryable: true,
    sourceId: process.env.SOURCE_ID || "",
  });
  await emitOutput("mode", "failed");
  await emitOutput("request_id", requestId);
}

const command = process.argv[2];
try {
  if (command === "prepare") await prepare();
  else if (command === "finalize") await finalize();
  else throw new Error(`Unknown command: ${command || "(missing)"}`);
} catch (error) {
  await recordFailure(error);
}
