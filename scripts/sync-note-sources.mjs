import { readFile, writeFile } from "node:fs/promises";
import { extractTextTimedPhrases, mergeSongIntoCatalog } from "./source-processing.mjs";

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

  const configuredBpm = Number(config.tempo?.bpm);
  const hasConfiguredTempo = Number.isFinite(configuredBpm) && configuredBpm >= 40 && configuredBpm <= 220;
  const rhythm = parsed.hasRhythm || hasConfiguredTempo ? {
    bpm: hasConfiguredTempo ? Math.round(configuredBpm) : 90,
    source: parsed.hasRhythm ? "text" : "estimated",
    tempoSource: hasConfiguredTempo ? config.tempo.source : "default",
    tempoConfidence: hasConfiguredTempo ? config.tempo.confidence : 0,
    ...(hasConfiguredTempo && config.tempo.url ? { tempoUrl: config.tempo.url } : {}),
    durations: parsed.hasRhythm ? parsed.durations : [],
    ...(parsed.hasRhythm ? { gaps: parsed.gaps } : {}),
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
const refreshedSongs = [];
for (const song of manifest.songs) refreshedSongs.push(await syncSong(song));

let previousCatalog = null;
try {
  previousCatalog = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

let nextCatalog = previousCatalog || { schemaVersion: 1, songs: [] };
for (const song of refreshedSongs) nextCatalog = mergeSongIntoCatalog(nextCatalog, song);

if (previousCatalog && JSON.stringify(previousCatalog.songs) === JSON.stringify(nextCatalog.songs)) {
  console.log(`Checked ${refreshedSongs.length} web-sourced song(s); no changes.`);
} else {
  await writeFile(OUTPUT_FILE, `${JSON.stringify(nextCatalog, null, 2)}\n`);
  console.log(`Synced ${refreshedSongs.length} web-sourced song(s) without removing live catalog entries.`);
}
