import assert from "node:assert/strict";
import test from "node:test";
import { curatedTempo, parseSongIdentity, resolveTempo, tempoLookupKey, validBpm } from "../worker/bpm-resolver.mjs";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function memoryD1(initialRows = []) {
  const rows = new Map(initialRows.map((row) => [row.lookup_key, row]));
  return {
    rows,
    prepare() {
      return {
        bind(...values) {
          return {
            async first() { return rows.get(values[0]) ?? null; },
            async run() {
              rows.set(values[0], {
                lookup_key: values[0], artist: values[1], title: values[2], bpm: values[3],
                provider: values[4], providerUrl: values[5], confidence: values[6],
              });
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test("şarkı kimliğini kaynak başlığından ve sorgudan çıkarır", () => {
  assert.deepEqual(parseSongIdentity({ title: "Tarkan – Dudu – Gitar Tab", query: "Tarkan Dudu" }), {
    artist: "Tarkan", title: "Dudu", query: "Tarkan Dudu",
  });
  assert.deepEqual(parseSongIdentity({ title: "Kuzu Kuzu", query: "Tarkan Kuzu Kuzu" }), {
    artist: "Tarkan", title: "Kuzu Kuzu", query: "Tarkan Kuzu Kuzu",
  });
  assert.equal(tempoLookupKey({ artist: "Yıldız Tilbe", title: "Delikanlım" }), "yildiz tilbe|delikanlim");
  assert.equal(validBpm(39), null);
  assert.equal(validBpm("149"), 149);
});

test("D1 önbelleği varsa harici sağlayıcıya gitmez", async () => {
  const db = memoryD1([{
    lookup_key: "duman|bu aksam", artist: "Duman", title: "Bu Akşam", bpm: 149,
    provider: "getsongbpm", providerUrl: "https://getsongbpm.com/song/example", confidence: 100,
  }]);
  let fetched = false;
  const result = await resolveTempo(
    { artist: "Duman", title: "Bu Akşam" },
    { BPM_DB: db, GETSONGBPM_API_KEY: "secret" },
    async () => { fetched = true; return jsonResponse({ search: [] }); },
  );
  assert.equal(result.bpm, 149);
  assert.equal(result.cached, true);
  assert.equal(fetched, false);
});

test("incelenmiş tempo düzeltmesi eski D1 değerinden önce uygulanır", async () => {
  const db = memoryD1([{
    lookup_key: "tame impala|dracula", artist: "Tame Impala", title: "Dracula", bpm: 90,
    provider: "getsongbpm", providerUrl: "", confidence: 70,
  }]);
  let fetched = false;
  const result = await resolveTempo(
    { artist: "Tame Impala", title: "Dracula" },
    { BPM_DB: db, GETSONGBPM_API_KEY: "secret" },
    async () => { fetched = true; return jsonResponse({ search: [] }); },
  );
  assert.deepEqual(curatedTempo({ artist: "Tame Impala", title: "Dracula" }), result);
  assert.equal(result.bpm, 115);
  assert.equal(result.provider, "curated");
  assert.equal(fetched, false);
});

test("GetSongBPM sonucunu katı sanatçı ve başlık eşleşmesiyle kabul edip önbelleğe alır", async () => {
  const db = memoryD1();
  const result = await resolveTempo(
    { artist: "Tarkan", title: "Dudu", query: "Tarkan Dudu" },
    { BPM_DB: db, GETSONGBPM_API_KEY: "secret" },
    async (url, init) => {
      assert.equal(init.headers["X-API-KEY"], "secret");
      assert.equal(new URL(url).searchParams.get("type"), "both");
      return jsonResponse({ search: [
        { title: "Dudu", tempo: "90", uri: "https://getsongbpm.com/song/dudu/example", artist: { name: "Tarkan" } },
        { title: "Dudu", tempo: "120", uri: "https://getsongbpm.com/song/dudu/wrong", artist: { name: "Another Artist" } },
      ] });
    },
  );
  assert.equal(result.bpm, 90);
  assert.equal(result.provider, "getsongbpm");
  assert.equal(db.rows.get("tarkan|dudu").bpm, 90);
});

test("sanatçıyla birleşik kaynak başlığını kontrollü bölerek BPM bulur", async () => {
  const lookups = [];
  const db = memoryD1();
  const result = await resolveTempo(
    { title: "Ahmet Kaya Kum Gibi", query: "Ahmet Kaya Kum Gibi" },
    { BPM_DB: db, GETSONGBPM_API_KEY: "secret" },
    async (url) => {
      const parsed = new URL(url);
      lookups.push(parsed.searchParams.get("lookup"));
      if (parsed.searchParams.get("lookup") === "song:Kum Gibi artist:Ahmet Kaya") {
        return jsonResponse({ search: [{
          title: "Kum Gibi", tempo: "92", uri: "https://getsongbpm.com/song/kum-gibi/R6LmNV", artist: { name: "Ahmet Kaya" },
        }] });
      }
      return jsonResponse({ search: [] });
    },
  );
  assert.equal(result.bpm, 92);
  assert.equal(result.artist, "Ahmet Kaya");
  assert.deepEqual(lookups, ["Ahmet Kaya Kum Gibi", "song:Kum Gibi artist:Ahmet Kaya"]);
  assert.equal(db.rows.get("|ahmet kaya kum gibi").bpm, 92);
  assert.equal(db.rows.get("ahmet kaya|kum gibi").bpm, 92);
});

test("yanlış sanatçı eşleşmesini BPM diye kullanmaz", async () => {
  const result = await resolveTempo(
    { artist: "Tarkan", title: "Kuzu Kuzu" },
    { GETSONGBPM_API_KEY: "secret" },
    async () => jsonResponse({ search: [
      { title: "Kuzu Kuzu", tempo: "128", artist: { name: "Wrong Artist" } },
    ] }),
  );
  assert.equal(result, null);
});
