import assert from "node:assert/strict";
import test from "node:test";
import { transcribeAudioFile } from "../app/audio-transcription.mjs";
import { transcribeAudioInput } from "../app/media-import.mjs";
import { audioApiUrl, detectAudioCapabilities, readMuscriptorEvents } from "../app/muscriptor.mjs";
import { downloadYoutubeAudio, youtubeVideoId } from "../app/youtube-audio.mjs";
import { handleAudioTranscription, handleYoutubeAudio } from "../worker/muscriptor.mjs";

test("GitHub Pages audio routes target the configured Worker and Sites uses the current origin", (t) => {
  const original = { document: globalThis.document, window: globalThis.window };
  t.after(() => Object.assign(globalThis, original));
  globalThis.document = { baseURI: "https://ozguregemen.github.io/tin-whistle-note-creator/" };
  globalThis.window = { __TWNC_AUDIO_API_URL__: "https://worker.example/" };
  assert.equal(audioApiUrl("api/youtube-audio").href, "https://worker.example/api/youtube-audio");
  globalThis.document = { baseURI: "https://site.example/" };
  globalThis.window = {};
  assert.equal(audioApiUrl("api/audio-transcription").href, "https://site.example/api/audio-transcription");
});

test("MuScriptor yapılandırıldığında ses isteğini iletir ve notaları parmak rehberine dönüştürür", async (t) => {
  const baseURI = "https://site.example/";
  const serviceUrl = "https://inference.example/";
  const env = { AUDIO_SERVICE_URL: serviceUrl, AUDIO_SERVICE_TOKEN: "test-token" };
  const audio = new File(["audio bytes"], "my-recording.wav", { type: "audio/wav" });
  const stream = [
    { type: "progress", completed: 1, total: 2 },
    { type: "start", index: 1, pitch: 74, start_time: 0, instrument: "pipe" },
    { type: "start", index: 2, pitch: 95, start_time: 0.04, instrument: "drums" },
    { type: "end", start_event_index: 2, end_time: 0.25 },
    { type: "end", start_event_index: 1, end_time: 0.5 },
    { type: "start", index: 3, pitch: 74, start_time: 0.5, instrument: "pipe" },
    { type: "end", start_event_index: 3, end_time: 0.51 },
    { type: "transcription_complete", data: "midi" },
  ].map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("");

  const originalDocument = globalThis.document;
  const originalAudioContext = globalThis.AudioContext;
  globalThis.document = { baseURI };
  globalThis.AudioContext = class {
    async decodeAudioData() { return { duration: 1 }; }
    async close() {}
  };
  t.after(() => {
    globalThis.document = originalDocument;
    globalThis.AudioContext = originalAudioContext;
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith(baseURI)) {
      const request = new Request(url, options);
      if (request.method === "POST") {
        request.headers.set("Content-Length", String((await request.clone().blob()).size));
      }
      return handleAudioTranscription(request, env);
    }
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer test-token");
    assert.equal(options.redirect, "manual");
    if (String(url) === `${serviceUrl}capabilities`) {
      return Response.json({ model: "muscriptor-large", youtubeMp3: true });
    }
    assert.equal(String(url), `${serviceUrl}transcribe`);
    const form = await new Response(options.body, { headers: options.headers }).formData();
    assert.equal(form.get("file").name, "audio.wav");
    assert.equal(await form.get("file").text(), "audio bytes");
    assert.equal(form.get("detect_tempo"), "false");
    const bytes = new TextEncoder().encode(stream);
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 31));
        controller.enqueue(bytes.slice(31));
        controller.close();
      },
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream", "X-Audio-Model": "muscriptor-large" } });
  });

  const capabilities = await detectAudioCapabilities();
  assert.deepEqual(capabilities, { provider: "muscriptor-large", youtubeMp3: true });
  const progress = [];
  const result = await transcribeAudioFile(audio, (value) => progress.push(value), { model: capabilities.provider });
  assert.equal(result.notes, "D4 D4");
  assert.equal(result.melody.provider, "muscriptor-large");
  assert.deepEqual(result.melody.notes.map((note) => note.durationSeconds), [0.5, 0.01]);
  assert.deepEqual(progress, [0.5, 1]);
});

test("MuScriptor yapılandırılmadan yükleme yapılmaz ve yarım kalan transkripsiyon reddedilir", async () => {
  const url = "https://site.example/api/audio-transcription";
  const availability = await handleAudioTranscription(new Request(url), {});
  assert.deepEqual(await availability.json(), { provider: "basic-pitch", youtubeMp3: false });
  assert.equal((await handleAudioTranscription(new Request(url, { method: "POST" }), {})).status, 503);

  const body = new Response('data: {"type":"progress","completed":1,"total":2}\n\n').body;
  await assert.rejects(readMuscriptorEvents(body, () => {}), /ended before completing/);
});

test("Large dışındaki modeli normal MP3 yüklemeleri için etkinleştirmez", async (t) => {
  const env = { AUDIO_SERVICE_URL: "https://inference.example", AUDIO_SERVICE_TOKEN: "test-token" };
  const endpoint = "https://site.example/api/audio-transcription";
  t.mock.method(globalThis, "fetch", async (url) => {
    if (new URL(url).pathname === "/capabilities") return Response.json({ model: "muscriptor-medium" });
    return new Response("data: {}\n\n", {
      headers: { "Content-Type": "text/event-stream", "X-Audio-Model": "muscriptor-medium" },
    });
  });
  assert.deepEqual(await (await handleAudioTranscription(new Request(endpoint), env)).json(), {
    provider: "basic-pitch", youtubeMp3: false,
  });
  const request = new Request(endpoint, {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=a", "Content-Length": "4", "X-Transcription-Provider": "muscriptor-large" },
    body: "test",
  });
  assert.equal((await handleAudioTranscription(request, env)).status, 502);
});

test("geçici tünelde MuScriptor olay baytlarını tarayıcıya SSE olarak döndürür", async (t) => {
  const env = { AUDIO_SERVICE_URL: "https://example.trycloudflare.com", AUDIO_SERVICE_TOKEN: "test-token" };
  const events = 'data: {"type":"transcription_complete"}\n\n';
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(new URL(url).pathname, "/transcribe");
    assert.equal(options.headers.get("X-Audio-Transport"), "sse-bytes");
    return new Response(events, { headers: {
      "Content-Type": "application/octet-stream",
      "X-Audio-Model": "muscriptor-large",
      "X-Audio-Transport": "sse-bytes",
    } });
  });
  const request = new Request("https://site.example/api/audio-transcription", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=a", "Content-Length": "4", "X-Transcription-Provider": "muscriptor-large" },
    body: "test",
  });
  const result = await handleAudioTranscription(request, env);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("Content-Type"), "text/event-stream");
  assert.equal(await result.text(), events);
});

test("YouTube video bağlantılarını kabul eder ve diğer adresleri reddeder", () => {
  const id = "abcdefghijk";
  for (const url of [
    `www.youtube.com/watch?v=${id}&list=example`,
    `https://youtu.be/${id}?t=20`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtube.com/shorts/${id}`,
  ]) assert.equal(youtubeVideoId(url), id);
  for (const url of [
    `https://youtu.be.example.com/${id}`,
    `https://youtube.com@localhost/watch?v=${id}`,
    "https://www.youtube.com/playlist?list=example",
    "https://www.youtube.com/watch?v=too_short",
  ]) assert.equal(youtubeVideoId(url), null);
});

test("YouTube isteğinde yalnızca video kimliğini iletir ve MP3 dosyasını döndürür", async (t) => {
  const baseURI = "https://site.example/";
  const env = { AUDIO_SERVICE_URL: "https://audio.example/private", AUDIO_SERVICE_TOKEN: "test-token" };
  const id = "abcdefghijk";
  const mp3Frame = new Uint8Array(417);
  mp3Frame.set([0xff, 0xfb, 0x90, 0xc4]);
  const originalDocument = globalThis.document;
  globalThis.document = { baseURI };
  t.after(() => { globalThis.document = originalDocument; });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith(baseURI)) {
      const request = new Request(url, options);
      request.headers.set("Content-Length", String(options.body.length));
      return handleYoutubeAudio(request, env);
    }
    assert.equal(String(url), `https://audio.example/private/youtube/${id}/mp3`);
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    return new Response(mp3Frame, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(mp3Frame.length) } });
  });
  const mp3 = await downloadYoutubeAudio(id);
  assert.equal(mp3.name, `youtube-${id}.mp3`);
  assert.equal(mp3.type, "audio/mpeg");
  assert.deepEqual(new Uint8Array(await mp3.arrayBuffer()), mp3Frame);
  const route = new Request(`${baseURI}api/youtube-audio`, { method: "POST" });
  assert.equal((await handleYoutubeAudio(route, {})).status, 503);
});

test("YouTube MP3 remains available when melody transcription fails", async () => {
  const id = "abcdefghijk";
  const mp3 = new File(["test"], "test.mp3", { type: "audio/mpeg" });
  const stages = [];
  const failure = new Error("inference failed");
  let download;
  await assert.rejects(() => transcribeAudioInput(`https://youtu.be/${id}`, {
    model: "muscriptor-large",
    youtubeEnabled: true,
    resolve: () => assert.fail("YouTube should use the MP3 service"),
    resolveYoutube: async (videoId) => { assert.equal(videoId, id); return mp3; },
    onYoutubeFile: (file) => { download = file; },
    onStage: (stage) => stages.push(stage),
    transcribe: async (file, progress, options) => {
      assert.equal(file, mp3);
      assert.equal(download, mp3);
      assert.equal(options.model, "muscriptor-large");
      progress(0.5);
      throw failure;
    },
  }), failure);
  assert.deepEqual(stages, ["audioConverting", "audioPreparing", "audioTranscribing"]);
});
