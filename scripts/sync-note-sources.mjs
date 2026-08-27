import { readFile, writeFile } from "node:fs/promises";
import { extractTextTimedPhrases } from "./source-processing.mjs";

const SOURCE_FILE = new URL("../catalog/sources.json", import.meta.url);
const OUTPUT_FILE = new URL("../catalog/catalog.json", import.meta.url);

function applyOctaves(phrases, octaves) {
  const notes = phrases.flat();
  if (notes.length !== octaves.length) {
    throw new Error(`Source changed: expected ${octaves.length} notes, received ${notes.length}. Manual review required.`);
  }

  let cursor = 0;
  return phrases.map((phrase) => phrase.map((note) => `${note}${octaves[cursor++]}`).join(" ")).join(" | ");
}

async function syncSong(config) {
  const response = await fetch(config.source.apiUrl, {
    headers: { "User-Agent": "tin-whistle-note-creator/0.1 (+https://github.com/ozguregemen/tin-whistle-note-creator)" },
  });
  if (!response.ok) throw new Error(`${config.source.name} returned HTTP ${response.status}`);

  const posts = await response.json();
  if (!Array.isArray(posts) || posts.length !== 1) throw new Error(`Expected one source post for ${config.id}`);

  const parsed = extractTextTimedPhrases(posts[0].content.rendered);
  const phrases = parsed.phrases;
  const lengths = phrases.map((phrase) => phrase.length);
  if (JSON.stringify(lengths) !== JSON.stringify(config.phraseLengths)) {
    throw new Error(`Phrase structure changed for ${config.id}: ${lengths.join(", ")}`);
  }

  const rhythm = parsed.hasRhythm ? {
    bpm: 90,
    source: "text",
    tempoSource: "default",
    tempoConfidence: 0,
    durations: parsed.durations,
    gaps: parsed.gaps,
  } : undefined;

  return {
    id: config.id,
    title: config.title,
    artist: config.artist,
    aliases: config.aliases,
    subtitle: {
      en: "Web-sourced melody · independently cross-checked",
      tr: "İnternetten alınan ezgi · bağımsız kaynakla karşılaştırıldı",
    },
    difficulty: config.difficulty,
    notes: applyOctaves(phrases, config.octaves),
    ...(rhythm ? { rhythm } : {}),
    sourceStatus: "cross-checked",
    sourceModifiedAt: posts[0].modified,
    sources: [
      { name: config.source.name, url: posts[0].link || config.source.pageUrl, role: "note-source" },
      ...config.verificationSources.map((source) => ({ ...source, role: "cross-check" })),
    ],
  };
}

const manifest = JSON.parse(await readFile(SOURCE_FILE, "utf8"));
const songs = [];
for (const song of manifest.songs) songs.push(await syncSong(song));

let previousCatalog = null;
try {
  previousCatalog = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (previousCatalog && JSON.stringify(previousCatalog.songs) === JSON.stringify(songs)) {
  console.log(`Checked ${songs.length} web-sourced song(s); no changes.`);
} else {
  await writeFile(OUTPUT_FILE, `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), songs }, null, 2)}\n`);
  console.log(`Synced ${songs.length} web-sourced song(s).`);
}
