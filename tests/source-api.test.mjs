import assert from "node:assert/strict";
import test from "node:test";
import { createSourceApi } from "../worker/source-api.mjs";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

test("Worker sağlık ve CORS uç noktalarını sunar", async () => {
  const handle = createSourceApi({ ALLOWED_ORIGINS: "https://ozguregemen.github.io" }, async () => jsonResponse([]));
  const response = await handle(new Request("https://worker.test/health", { headers: { Origin: "https://ozguregemen.github.io" } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://ozguregemen.github.io");
  assert.deepEqual((await response.json()).adapters, ["notalar", "gitaregitim", "academic-pdf"]);
});

test("Worker yalnızca desteklenen kaynakları GitHub Actions kuyruğuna gönderir", async () => {
  let dispatchBody;
  const fetchMock = async (input, init) => {
    const url = String(input);
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
