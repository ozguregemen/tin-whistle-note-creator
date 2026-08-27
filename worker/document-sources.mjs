export const DOCUMENT_SOURCE_ADAPTER = Object.freeze({
  id: "academic-pdf",
  name: "Academic score PDF",
  kind: "document",
  processingMode: "omr",
});

export const DOCUMENT_SOURCES = Object.freeze({
  "ohu-tarkan-kuzu-kuzu": Object.freeze({
    id: "ohu-tarkan-kuzu-kuzu",
    sourceId: DOCUMENT_SOURCE_ADAPTER.id,
    sourceName: "Niğde Ömer Halisdemir University Open Archive",
    title: "Tarkan – Kuzu Kuzu",
    aliases: ["Tarkan Kuzu Kuzu", "Kuzu Kuzu"],
    url: "https://acikerisim.ohu.edu.tr/server/api/core/bitstreams/646d2b87-1550-4267-b033-2d1b87677d79/content",
    pageStart: 74,
    pageEnd: 75,
    bpm: 94,
    expectedNotes: Object.freeze({ min: 240, max: 320 }),
    processingMode: "omr",
  }),
});

export function getDocumentSource(documentId) {
  return DOCUMENT_SOURCES[documentId];
}

export function documentNoteCountIsPlausible(document, noteCount) {
  const range = document?.expectedNotes;
  if (!range) return noteCount >= 4;
  return Number.isInteger(noteCount) && noteCount >= range.min && noteCount <= range.max;
}
