import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  addEstimatedOctaves, extractScoreAssets, extractTextPhrases, mergeSongIntoCatalog,
  musicXmlToTimedPhrases, phrasesToString, plainTitle, slugify,
} from "./source-processing.mjs";
import { documentNoteCountIsPlausible, getDocumentSource } from "../worker/document-sources.mjs";

const CATALOG_FILE = new URL("../catalog/catalog.json", import.meta.url);
const JOB_DIRECTORY = new URL("../catalog/jobs/", import.meta.url);
const WORK_DIRECTORY = new URL("../.source-job/", import.meta.url);

const SOURCES = {
  notalar: { name: "Notalar.net", kind: "wordpress", origin: "https://www.notalar.net", mode: "text" },
  gitaregitim: { name: "Gitaregitim.net", kind: "wordpress", origin: "https://www.gitaregitim.net", mode: "omr" },
  "academic-pdf": { name: "Academic score PDF", kind: "document", mode: "omr" },
};

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

function requestPayload() {
  const sourceId = process.env.SOURCE_ID;
  const postId = Number(process.env.POST_ID);
  const documentId = (process.env.DOCUMENT_ID || "").slice(0, 120);
  const source = SOURCES[sourceId];
  const document = source?.kind === "document" ? getDocumentSource(documentId) : null;
  const validWordPressPost = source?.kind === "wordpress" && Number.isInteger(postId) && postId > 0;
  const validDocument = source?.kind === "document" && document?.sourceId === sourceId;
  if (!source || (!validWordPressPost && !validDocument)) throw new Error("Invalid source job payload");
  return {
    requestId: /^[0-9a-f-]{36}$/i.test(process.env.REQUEST_ID || "") ? process.env.REQUEST_ID : randomUUID(),
    sourceId,
    ...(validWordPressPost ? { postId } : {}),
    ...(validDocument ? { documentId, document } : {}),
    query: (process.env.SOURCE_QUERY || "").slice(0, 160),
    requestedTitle: (process.env.SOURCE_TITLE || "").slice(0, 200),
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
  const title = plainTitle(post.title?.rendered || post.title || payload.requestedTitle || `Source ${payload.postId}`)
    .replace(/\s+(?:do\s+re\s+mi|melodika|gitar|nota|tab).*$/i, "").trim();
  return {
    id: `${payload.sourceId}-${payload.documentId || payload.postId}-${slugify(title)}`,
    title,
    aliases: [payload.query, payload.requestedTitle].filter(Boolean),
    subtitle: {
      en: confidence === "estimated" ? "Live text source · octave register estimated" : "Live score source · machine-read notation",
      tr: confidence === "estimated" ? "Canlı metin kaynağı · oktav bölgesi tahmini" : "Canlı nota kaynağı · makineyle okunan notasyon",
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
    const response = await fetch(sourceUrl, { headers: { "User-Agent": "tin-whistle-note-creator/0.2" } });
    if (!response.ok) throw new Error(`Score asset returned HTTP ${response.status}`);
    await writeFile(new URL(`input/${filename}`, WORK_DIRECTORY), new Uint8Array(await response.arrayBuffer()));
    files.push(filename);
  }
  return files;
}

async function downloadDocument(document) {
  const response = await fetch(document.url, {
    headers: { Accept: "application/pdf", "User-Agent": "tin-whistle-note-creator/0.2" },
  });
  if (!response.ok) throw new Error(`Academic score PDF returned HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_DOCUMENT_BYTES) throw new Error("Academic score PDF is too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error("Academic score PDF is too large");
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Academic score source did not return a PDF");
  await writeFile(new URL("document.pdf", WORK_DIRECTORY), bytes);
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
  } else {
    const postUrl = new URL(`/wp-json/wp/v2/posts/${payload.postId}`, payload.source.origin);
    postUrl.searchParams.set("_fields", "title,link,content,modified");
    const response = await fetch(postUrl, { headers: { Accept: "application/json", "User-Agent": "tin-whistle-note-creator/0.2" } });
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
    const pitchPhrases = extractTextPhrases(post.content?.rendered || "");
    await complete(payload, post, addEstimatedOctaves(pitchPhrases), "estimated");
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
  let bestScore = { phrases: [], durations: [], gaps: [], tempo: 90 };
  for (const path of xmlFiles) {
    const score = musicXmlToTimedPhrases(await readFile(path, "utf8"));
    if (score.phrases.flat().length > bestScore.phrases.flat().length) bestScore = score;
  }
  const noteCount = bestScore.phrases.flat().length;
  if (documentNoteCountIsPlausible(payload.document, noteCount)) {
    await complete(payload, post, bestScore.phrases, "omr-unreviewed", {
      bpm: payload.document?.bpm || bestScore.tempo,
      source: "score",
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

const command = process.argv[2];
if (command === "prepare") await prepare();
else if (command === "finalize") await finalize();
else throw new Error(`Unknown command: ${command || "(missing)"}`);
