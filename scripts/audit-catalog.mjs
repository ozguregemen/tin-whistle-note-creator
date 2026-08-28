import { readFile } from "node:fs/promises";

import { auditCatalogQuality } from "../app/catalog-quality.mjs";

const catalog = JSON.parse(await readFile(new URL("../catalog/catalog.json", import.meta.url), "utf8"));
const audit = auditCatalogQuality(catalog);

console.log(`Catalog: ${audit.summary.songs} song(s)`);
console.log(`Melody: ${audit.summary.crossChecked} cross-checked, ${audit.summary.unreviewedOmr} unreviewed OMR`);
console.log(`Rhythm: ${audit.summary.withRhythm} sourced, ${audit.summary.equalBeatFallback} equal-beat fallback`);
console.log(`Tempo: ${audit.summary.withKnownTempo} known, ${audit.summary.defaultTempo} practice default`);

for (const warning of audit.warnings) console.warn(`WARN ${warning.id}: ${warning.message}`);
for (const error of audit.errors) console.error(`ERROR ${error.id}: ${error.message}`);

if (audit.errors.length > 0) process.exitCode = 1;
