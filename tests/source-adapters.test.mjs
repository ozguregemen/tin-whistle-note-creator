import assert from "node:assert/strict";
import test from "node:test";
import { searchAllSources } from "../worker/source-adapters.mjs";

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

test("onaylı kaynaklarda sonuç yoksa nota odaklı web keşfi sunar", async () => {
  const discoveryQueries = [];
  const fetchMock = async (input) => {
    const url = new URL(input);
    if (url.hostname === "html.duckduckgo.com") {
      discoveryQueries.push(url.searchParams.get("q"));
      if (url.searchParams.get("q")?.startsWith("tarkan kuzu kuzu")) return new Response("", { status: 200 });
      return new Response(`
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.sarkinotalari.com%2Fkuzu-kuzu-notalari-ve-akorlari%2F&amp;rut=test">Kuzu Kuzu Notaları ve Akorları - Şarkı Notaları</a>
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.repertuarim.com%2Fakor%2Ftarkan-kuzu-kuzu&amp;rut=test">Tarkan - Kuzu Kuzu Akor</a>
      `, { status: 200, headers: { "Content-Type": "text/html" } });
    }
    return response([]);
  };
  const result = await searchAllSources("Tarkan Kuzu Kuzu notaları", fetchMock);
  assert.equal(result.discoveryOnly, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].sourceId, "web");
  assert.equal(result.results[0].processingMode, "review");
  assert.match(result.results[0].url, /sarkinotalari\.com/);
  assert.deepEqual(discoveryQueries, ["tarkan kuzu kuzu nota", "kuzu kuzu nota"]);
});
