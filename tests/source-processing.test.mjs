import assert from "node:assert/strict";
import test from "node:test";
import {
  addEstimatedOctaves, extractScoreAssets, extractTextPhrases, musicXmlToPhrases, musicXmlToTimedPhrases, phrasesToString,
} from "../scripts/source-processing.mjs";

test("Notalar.net metin bloklarından yalnızca nota satırlarını çıkarır", () => {
  const html = `<h3>İçerim Ben Bu Akşam Melodika Notaları</h3><p>La mi re do re<br>Si do re si la</p><p>Bu açıklama nota değildir.</p>`;
  const phrases = extractTextPhrases(html);
  assert.deepEqual(phrases, [["A", "E", "D", "C", "D"], ["B", "C", "D", "B", "A"]]);
  assert.equal(phrasesToString(addEstimatedOctaves(phrases)), "A4 E5 D5 C5 D5 | B4 C5 D5 B4 A4");
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
