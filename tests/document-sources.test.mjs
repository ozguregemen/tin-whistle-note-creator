import assert from "node:assert/strict";
import test from "node:test";
import { documentNoteCountIsPlausible, getDocumentSource } from "../worker/document-sources.mjs";

test("Kuzu Kuzu akademik kaynağı yalnızca nota sayfalarını işler", () => {
  const document = getDocumentSource("ohu-tarkan-kuzu-kuzu");
  assert.equal(document.pageStart, 74);
  assert.equal(document.pageEnd, 75);
  assert.equal(document.bpm, 94);
  assert.equal(documentNoteCountIsPlausible(document, 282), true);
  assert.equal(documentNoteCountIsPlausible(document, 100), false);
});
