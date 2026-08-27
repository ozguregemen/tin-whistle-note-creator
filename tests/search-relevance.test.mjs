import assert from "node:assert/strict";
import test from "node:test";
import { meaningfulSearchText, normalizeSearchText, searchMatchScore } from "../app/search-relevance.mjs";

test("Türkçe karakterleri arama için güvenli biçimde normalleştirir", () => {
  assert.equal(normalizeSearchText("Drama Köprüsü"), "drama koprusu");
  assert.equal(normalizeSearchText("İçerim Ben Bu Akşam"), "icerim ben bu aksam");
});

test("çok kelimeli ilgisiz dış kaynak sonucunu reddeder", () => {
  assert.equal(searchMatchScore("Drama Köprüsü", ["Drama Queen", "Drama Queen reel"]), 0);
  assert.ok(searchMatchScore("Drama Köprüsü", ["Drama Köprüsü"]));
});

test("yazım hatalarını ve komşu harflerin yer değiştirmesini tolere eder", () => {
  assert.ok(searchMatchScore("Drma Koprusu", ["Drama Köprüsü"]));
  assert.ok(searchMatchScore("Dumna Bu Aksam", ["Duman Bu Akşam"]));
  assert.ok(searchMatchScore("Colley", ["Cooley's"]));
  assert.ok(searchMatchScore("Ahmet Kaya Kum Gib", ["Ahmet Kaya Kum Gibi Melodika Notaları"]));
});

test("kısa kelimelerde gürültülü fuzzy eşleşme yapmaz", () => {
  assert.equal(searchMatchScore("bu", ["su"]), 0);
  assert.equal(searchMatchScore("bir", ["sir"]), 0);
});

test("tek kelimeli ve sanatçı-artı-başlık aramalarını korur", () => {
  assert.ok(searchMatchScore("Cooley", ["Cooley's"]));
  assert.ok(searchMatchScore("Duman Bu Akşam", ["Duman Bu Akşam"]));
});

test("nota ve enstrüman niteleyicilerini şarkı aramasından ayırır", () => {
  assert.equal(meaningfulSearchText("Tarkan Kuzu Kuzu notaları"), "tarkan kuzu kuzu");
  assert.ok(searchMatchScore("Tarkan Dudu notaları", ["Tarkan – Dudu – Gitar Tab"]));
  assert.ok(searchMatchScore("Kuzu Kuzu", ["Kuzu Kuzu Notaları ve Akorları"]));
});
