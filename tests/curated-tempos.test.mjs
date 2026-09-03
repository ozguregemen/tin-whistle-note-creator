import assert from "node:assert/strict";
import test from "node:test";
import { applyCuratedTempo, curatedTempoForIdentity } from "../app/curated-tempos.mjs";

test("Dracula temposu uzak katalogdaki eski 90 BPM değerini düzeltir", () => {
  assert.equal(curatedTempoForIdentity({ artist: "Tame Impala", title: "Dracula" }).bpm, 115);
  const corrected = applyCuratedTempo({
    artist: "Tame Impala", title: "Dracula",
    rhythm: { bpm: 90, source: "score", tempoSource: "default", durations: [[1]] },
  });
  assert.equal(corrected.rhythm.bpm, 115);
  assert.equal(corrected.rhythm.tempoSource, "curated");
});
