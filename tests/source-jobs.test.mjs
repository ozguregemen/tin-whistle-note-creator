import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceAttemptOrder, waitForSourceJob } from "../app/source-jobs.mjs";

function candidate(id, processingMode, score, extra = {}) {
  return { id, sourceId: id.split(":")[0], processingMode, score, postId: 1, ...extra };
}

test("makine-okunabilir kaynağı seçilen metin/OMR kaynağından önce dener", () => {
  const selected = candidate("notalar:1", "text", 95);
  const attempts = buildSourceAttemptOrder(selected, [
    candidate("web:1", "review", 100),
    candidate("academic-pdf:1", "omr", 99, { postId: undefined, documentId: "doc" }),
    candidate("songsterr:1", "gp", 90, { postId: undefined, songId: 12 }),
    selected,
  ]);

  assert.deepEqual(attempts.map((item) => item.id), ["songsterr:1", "notalar:1", "academic-pdf:1"]);
});

test("aynı dönüştürme türündeki kaynaklarda kullanıcının seçimini korur", () => {
  const selected = candidate("songsterr:2", "gp", 82, { postId: undefined, songId: 2 });
  const attempts = buildSourceAttemptOrder(selected, [
    candidate("songsterr:1", "gp", 99, { postId: undefined, songId: 1 }),
    selected,
  ]);

  assert.deepEqual(attempts.map((item) => item.id), ["songsterr:2", "songsterr:1"]);
});

test("iş durumu geçici hatalardan sonra tamamlanana kadar izlenir", async () => {
  const responses = [
    new Response(null, { status: 202 }),
    new Response(null, { status: 502 }),
    new Response(JSON.stringify({ requestId: "job", status: "completed", song: { id: "song" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ];
  let waits = 0;
  const result = await waitForSourceJob("https://worker.test", "job", {
    fetchFn: async () => responses.shift(),
    waitFn: async () => { waits += 1; },
    pollIntervalMs: 250,
    timeoutMs: 750,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.song.id, "song");
  assert.equal(waits, 2);
});

test("başarısız iş durumunu hemen sonlandırır", async () => {
  const result = await waitForSourceJob("https://worker.test", "job", {
    fetchFn: async () => new Response(JSON.stringify({ requestId: "job", status: "failed", retryable: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    waitFn: async () => {},
    pollIntervalMs: 250,
    timeoutMs: 1_000,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.retryable, true);
});

test("iş süresi dolduğunda sonsuza kadar beklemez", async () => {
  const result = await waitForSourceJob("https://worker.test", "job", {
    fetchFn: async () => new Response(null, { status: 202 }),
    waitFn: async () => {},
    pollIntervalMs: 250,
    timeoutMs: 500,
  });

  assert.deepEqual(result, { requestId: "job", status: "timeout" });
});
