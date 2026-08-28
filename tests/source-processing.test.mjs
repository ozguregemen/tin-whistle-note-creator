import assert from "node:assert/strict";
import test from "node:test";
import {
  addEstimatedOctaves, extractScoreAssets, extractTextPhrases, extractTextTimedPhrases, mergeSongIntoCatalog, musicXmlToPhrases, musicXmlToTimedPhrases, phrasesToString,
  stripLeadingArtist,
} from "../scripts/source-processing.mjs";

test("kaynak başlığının başındaki sanatçıyı ayırır", () => {
  assert.equal(stripLeadingArtist("Ahmet Kaya Kum Gibi", "Ahmet Kaya"), "Kum Gibi");
  assert.equal(stripLeadingArtist("Tarkan – Dudu", "Tarkan"), "Dudu");
  assert.equal(stripLeadingArtist("Bir Derdim Var", "Mor ve Ötesi"), "Bir Derdim Var");
});

test("Notalar.net metin bloklarından yalnızca nota satırlarını çıkarır", () => {
  const html = `<h3>İçerim Ben Bu Akşam Melodika Notaları</h3><p>La mi re do re<br>Si do re si la</p><p>Bu açıklama nota değildir.</p>`;
  const phrases = extractTextPhrases(html);
  assert.deepEqual(phrases, [["A", "E", "D", "C", "D"], ["B", "C", "D", "B", "A"]]);
  assert.equal(phrasesToString(addEstimatedOctaves(phrases)), "A5 E5 D5 C5 D5 | B4 C5 D5 B4 A4");
});

test("alt çizgili metin notalarındaki süre ve esleri ritme aktarır", () => {
  const html = `<h3>Ölçü Birimi: 4/4 Açıklama: Her nota ismi ve alt tireyi yarım vuruş olarak düşünün.</h3><p>mi mi mi mi fa_ mi_ | es do___</p>`;
  const parsed = extractTextTimedPhrases(html);
  assert.deepEqual(parsed.phrases, [["E", "E", "E", "E", "F", "E", "C"]]);
  assert.deepEqual(parsed.durations, [[0.5, 0.5, 0.5, 0.5, 1, 1, 2]]);
  assert.deepEqual(parsed.gaps, [[0, 0, 0, 0, 0, 0, 0.5]]);
  assert.equal(parsed.hasRhythm, true);
  assert.equal(parsed.beatUnit, 0.5);
});

test("ritim işareti olmayan metin notaları eşit vuruş fallbackine bırakılır", () => {
  const parsed = extractTextTimedPhrases("<p>la si do re | mi fa sol la</p>");
  assert.equal(parsed.hasRhythm, false);
  assert.deepEqual(parsed.durations, []);
  assert.deepEqual(parsed.gaps, []);
});

test("Gitaregitim sayfasındaki PDF, görsel ve MuseScore varlıklarını tanır", () => {
  const html = `<a href="https://site.test/score.pdf"></a><img src="https://site.test/wp-content/uploads/score-1.jpg"><iframe src="https://musescore.com/user/1/scores/2/embed"></iframe>`;
  const assets = extractScoreAssets(html);
  assert.deepEqual(assets.preferred, ["https://site.test/score.pdf"]);
  assert.equal(assets.images.length, 1);
  assert.equal(assets.musescore.length, 1);
});

test("MusicXML içindeki üst porte melodisini ölçü gruplarıyla okur", () => {
  const xml = `<?xml version="1.0"?><score-partwise><part id="P1">
    <measure number="1"><attributes><divisions>2</divisions></attributes><direction><sound tempo="120"/></direction><note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note><note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure>
    <measure number="2"><note><rest/><duration>2</duration></note><note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note><note><chord/><pitch><step>F</step><octave>5</octave></pitch></note></measure>
    <measure number="3"><note><pitch><step>E</step><octave>3</octave></pitch><voice>1</voice><staff>2</staff></note></measure>
  </part></score-partwise>`;
  assert.deepEqual(musicXmlToPhrases(xml), [["A4", "C#5", "D5"]]);
  assert.deepEqual(musicXmlToTimedPhrases(xml), {
    phrases: [["A4", "C#5", "D5"]],
    durations: [[1, 0.5, 2]],
    gaps: [[0, 0, 1]],
    tempo: 120,
  });
});

test("MusicXML tempo içermiyorsa 90'ı kaynak temposu gibi üretmez", () => {
  const xml = `<?xml version="1.0"?><score-partwise><part id="P1"><measure number="1">
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
  </measure></part></score-partwise>`;
  assert.equal(musicXmlToTimedPhrases(xml).tempo, null);
});

test("güncellenen kaynak kaydı canlı katalogdaki diğer şarkıları silmez", () => {
  const catalog = { schemaVersion: 1, songs: [{ id: "live-song", title: "Live" }, { id: "reviewed-song", title: "Old" }] };
  const merged = mergeSongIntoCatalog(catalog, { id: "reviewed-song", title: "Refreshed" });
  assert.deepEqual(merged.songs, [{ id: "live-song", title: "Live" }, { id: "reviewed-song", title: "Refreshed" }]);
});
