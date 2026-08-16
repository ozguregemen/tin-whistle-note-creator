import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearchText, searchMatchScore } from "../app/search-relevance.mjs";

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
});

test("kısa kelimelerde gürültülü fuzzy eşleşme yapmaz", () => {
  assert.equal(searchMatchScore("bu", ["su"]), 0);
  assert.equal(searchMatchScore("bir", ["sir"]), 0);
});

test("tek kelimeli ve sanatçı-artı-başlık aramalarını korur", () => {
  assert.ok(searchMatchScore("Cooley", ["Cooley's"]));
  assert.ok(searchMatchScore("Duman Bu Akşam", ["Duman Bu Akşam"]));
});
