import { readFile, writeFile } from "node:fs/promises";
import { applyCuratedTempo } from "../app/curated-tempos.mjs";

const catalogUrl = new URL("../catalog/catalog.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
catalog.songs = (catalog.songs || []).map(applyCuratedTempo);
await writeFile(catalogUrl, `${JSON.stringify(catalog, null, 2)}\n`);
