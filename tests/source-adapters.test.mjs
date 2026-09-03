import assert from "node:assert/strict";
import test from "node:test";
import { compareSourceCandidates, searchAllSources, sourceQualityForMode } from "../worker/source-adapters.mjs";

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

test("iki WordPress adaptörünü paralel arar ve ilgili sonuçları sıralar", async () => {
  const fetchMock = async (input) => {
    const url = new URL(input);
    if (url.hostname === "www.gitaregitim.net") {
      return response([
        { id: 22205, title: "Tarkan &#8211; Dudu &#8211; Gitar Tab", url: "https://www.gitaregitim.net/tarkan-dudu-gitar-tab/" },
        { id: 100, title: "Drama Queen Gitar Tab", url: "https://www.gitaregitim.net/drama-queen/" },
      ]);
    }
    return response([]);
  };
  const result = await searchAllSources("Tarkan Dudu", fetchMock);
  assert.equal(result.results[0].postId, 22205);
  assert.equal(result.results[0].sourceId, "gitaregitim");
  assert.equal(result.results.some((item) => /Drama Queen/.test(item.title)), false);
});

test("uzun kelimelerdeki yazım hatasını kaynak sonuçlarında tolere eder", async () => {
  const fetchMock = async (input) => {
    const url = new URL(input);
    return url.hostname === "www.gitaregitim.net" && url.searchParams.get("search") === "Rüzgar"
      ? response([{ id: 7352, title: "Çok Uzaklarda Caddelerde Rüzgar Nota Tab", url: "https://www.gitaregitim.net/cok-uzaklarda-caddelerde-ruzgar-nota-tab/" }])
      : response([]);
  };
  const result = await searchAllSources("Caddelrde Rüzgar", fetchMock);
  assert.equal(result.results[0].postId, 7352);
});

test("son harfi eksik kısa kelimeyi kaynak sonucuyla güvenli biçimde eşleştirir", async () => {
  const fetchMock = async (input) => {
    const url = new URL(input);
    return url.hostname === "www.notalar.net"
      ? response([{ id: 1280, title: "Ahmet Kaya Kum Gibi Melodika Notaları", url: "https://www.notalar.net/ahmet-kaya-kum-gibi-melodika-notalari/" }])
      : response([]);
  };
  const result = await searchAllSources("Ahmet Kaya Kum Gib", fetchMock);
  assert.equal(result.results[0].postId, 1280);
  assert.equal(result.results[0].sourceId, "notalar");
});

test("sanatçı adı kaynak başlığında yoksa başlık ekiyle eşleşir", async () => {
  const fetchMock = async (input) => {
    const url = new URL(input);
    return url.hostname === "www.notalar.net"
      ? response([{ id: 4800, title: "Caddelerde Rüzgar Notaları", url: "https://www.notalar.net/caddelerde-ruzgar-notalari/" }])
      : response([]);
  };
  const result = await searchAllSources("Nilüfer Caddelerde Rüzgar", fetchMock);
  assert.equal(result.results[0].postId, 4800);
  assert.equal(result.results[0].sourceId, "notalar");
});

test("bir kaynak bozulduğunda diğer kaynak sonuç vermeye devam eder", async () => {
  const fetchMock = async (input) => {
    const url = new URL(input);
    if (url.hostname === "www.gitaregitim.net") throw new Error("offline");
    return response([{ id: 1871, title: "İçerim Ben Bu Akşam Melodika Notaları", url: "https://www.notalar.net/icerim-ben-aksam-melodika-notalari/" }]);
  };
  const result = await searchAllSources("İçerim Ben Bu Akşam", fetchMock);
  assert.equal(result.results[0].sourceId, "notalar");
  assert.deepEqual(result.unavailableSources, ["gitaregitim"]);
});

test("küratörlü akademik PDF kaynağını sanatçı olmadan da bulur", async () => {
  const fetchMock = async () => response([]);
  const result = await searchAllSources("Kuzu Kuzu", fetchMock);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].sourceId, "academic-pdf");
  assert.equal(result.results[0].documentId, "ohu-tarkan-kuzu-kuzu");
  assert.equal(result.results[0].processingMode, "omr");
  assert.equal(result.results[0].quality, "machine-read");
});

test("eşit ilgide ritim taşıyan kaynakları metin ve OMR taslaklarından önce gösterir", async () => {
  const fetchMock = async (input) => {
    const url = new URL(input);
    if (url.hostname === "www.notalar.net") {
      return response([{ id: 101, title: "Tarkan Kuzu Kuzu Notaları", url: "https://www.notalar.net/tarkan-kuzu-kuzu/" }]);
    }
    if (url.hostname === "www.songsterr.com") {
      return response([{
        songId: 202,
        artist: "Tarkan",
        title: "Kuzu Kuzu",
        hasPlayer: true,
        isJunk: false,
        tracks: [{ instrument: "Lead Guitar" }],
      }]);
    }
    return response([]);
  };
  const result = await searchAllSources("Tarkan Kuzu Kuzu", fetchMock);
  assert.equal(result.results[0].sourceId, "songsterr");
  assert.equal(result.results[0].quality, "rhythmic-score");
  assert.deepEqual(sourceQualityForMode("text"), { key: "melody-only", rank: 2 });
});

test("küçük ilgi farkında makine-okunabilir kaynağı, büyük farkta doğru eşleşmeyi seçer", () => {
  const exactText = { score: 100, processingMode: "text" };
  const closeScore = { score: 90, processingMode: "gp" };
  const weakScore = { score: 70, processingMode: "gp" };

  assert.equal([exactText, closeScore].sort(compareSourceCandidates)[0], closeScore);
  assert.equal([exactText, weakScore].sort(compareSourceCandidates)[0], exactText);
});

test("yabancı şarkıyı Songsterr kataloğunda sanatçı ve başlıkla bulur", async () => {
  const fetchMock = async (input) => {
    const url = new URL(input);
    if (url.hostname !== "www.songsterr.com") return response([]);
    assert.equal(url.pathname, "/api/songs");
    assert.equal(url.searchParams.get("pattern"), "the mayan factor warflower");
    return response([{
      songId: 1144964,
      artist: "The Mayan Factor",
      title: "Warflower",
      hasPlayer: true,
      isJunk: false,
      tracks: [{ instrument: "Acoustic Guitar (steel)" }],
    }]);
  };
  const result = await searchAllSources("The Mayan Factor Warflower", fetchMock);
  assert.equal(result.results[0].sourceId, "songsterr");
  assert.equal(result.results[0].songId, 1144964);
  assert.equal(result.results[0].artist, "The Mayan Factor");
  assert.equal(result.results[0].trackIndex, 0);
  assert.equal(result.results[0].title, "The Mayan Factor — Warflower");
  assert.equal(result.results[0].processingMode, "gp");
  assert.match(result.results[0].url, /songsterr\.com\/a\/wsa\/the-mayan-factor-warflower-sheet-s1144964$/);
});

test("Songsterr vokal bilgisi null olduğunda ritim gitarı yerine adlandırılmış melodiyi seçer", async () => {
  const fetchMock = async (input) => {
    const url = new URL(input);
    if (url.hostname !== "www.songsterr.com") return response([]);
    return response([{
      songId: 2206954,
      artist: "Tame Impala",
      title: "Loser",
      hasPlayer: true,
      isJunk: false,
      popularTrackVocals: null,
      popularTrackGuitar: 0,
      tracks: [
        { name: "Rhythm Guitar", instrument: "Distortion Guitar" },
        { name: "Lead Guitar", instrument: "Overdriven Guitar" },
      ],
    }]);
  };

  const result = await searchAllSources("Tame Impala Loser", fetchMock);
  assert.equal(result.results[0].sourceId, "songsterr");
  assert.equal(result.results[0].trackIndex, 1);
});

test("Songsterr açıkça verdiği vokal kanalını gitarın önünde seçer", async () => {
  const fetchMock = async (input) => {
    const url = new URL(input);
    if (url.hostname !== "www.songsterr.com") return response([]);
    return response([{
      songId: 2206954,
      artist: "Tame Impala",
      title: "Loser",
      hasPlayer: true,
      isJunk: false,
      popularTrackVocals: 4,
      popularTrackGuitar: 0,
      tracks: [
        { name: "Guitar", instrument: "Distortion Guitar" },
        { name: "Guitar 2", instrument: "Overdriven Guitar" },
        { name: "Bass", instrument: "Electric Bass" },
        { name: "Drums", instrument: "Drum Kit" },
        { name: "Vocals", instrument: "Tenor Sax" },
      ],
    }]);
  };

  const result = await searchAllSources("Tame Impala Loser", fetchMock);
  assert.equal(result.results[0].trackIndex, 4);
});

test("yabancı şarkıyı yalnızca başlığıyla da Songsterr kataloğunda bulur", async () => {
  const fetchMock = async (input) => {
    const url = new URL(input);
    if (url.hostname !== "www.songsterr.com") return response([]);
    assert.equal(url.searchParams.get("pattern"), "warflower");
    return response([{
      songId: 1144964,
      artist: "The Mayan Factor",
      title: "Warflower",
      hasPlayer: true,
      isJunk: false,
    }]);
  };
  const result = await searchAllSources("Warflower", fetchMock);
  assert.equal(result.results[0].sourceId, "songsterr");
  assert.equal(result.results[0].score, 100);
});

test("onaylı kaynaklarda sonuç yoksa nota odaklı web keşfi sunar", async () => {
  const discoveryQueries = [];
  const fetchMock = async (input) => {
    const url = new URL(input);
    if (url.hostname === "html.duckduckgo.com") {
      discoveryQueries.push(url.searchParams.get("q"));
      return new Response(`
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fmusescore.com%2Fsong%2Fbilinmeyen_melodi-123&amp;rut=test">Bilinmeyen Melodi sheet music | MuseScore.com</a>
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.repertuarim.com%2Fakor%2Fbilinmeyen-melodi&amp;rut=test">Bilinmeyen Melodi Akor</a>
      `, { status: 200, headers: { "Content-Type": "text/html" } });
    }
    return response([]);
  };
  const result = await searchAllSources("Bilinmeyen Melodi notaları", fetchMock);
  assert.equal(result.discoveryOnly, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].sourceId, "web");
  assert.equal(result.results[0].processingMode, "review");
  assert.match(result.results[0].url, /musescore\.com/);
  assert.deepEqual(discoveryQueries, ["bilinmeyen melodi nota"]);
});
