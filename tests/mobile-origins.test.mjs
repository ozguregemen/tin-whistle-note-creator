import assert from "node:assert/strict";
import test from "node:test";
import { communityOriginAllowed } from "../worker/community-api.mjs";
import { createSourceApi } from "../worker/source-api.mjs";

const MOBILE = "https://localhost,capacitor://localhost";
const PAGES = "https://ozguregemen.github.io";

function health(env, origin) {
  const handle = createSourceApi(env, async () => new Response("[]"));
  return handle(new Request("https://worker.test/health", { headers: origin ? { Origin: origin } : {} }));
}

test("the source API rejects the installed app until its origins are configured", async () => {
  const response = await health({ ALLOWED_ORIGINS: PAGES }, "https://localhost");
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("configured mobile origins reach the source API on Android and iOS", async () => {
  for (const origin of ["https://localhost", "capacitor://localhost"]) {
    const response = await health({ ALLOWED_ORIGINS: PAGES, MOBILE_APP_ORIGINS: MOBILE }, origin);
    assert.equal(response.status, 200, origin);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  }
  // GitHub Pages and other origins keep their previous treatment.
  assert.equal((await health({ ALLOWED_ORIGINS: PAGES, MOBILE_APP_ORIGINS: MOBILE }, PAGES)).status, 200);
  assert.equal((await health({ ALLOWED_ORIGINS: PAGES, MOBILE_APP_ORIGINS: MOBILE }, "https://localhost:8443")).status, 403);
  assert.equal((await health({ ALLOWED_ORIGINS: PAGES, MOBILE_APP_ORIGINS: MOBILE }, "https://evil.example")).status, 403);
});

test("mobile origins may preflight the audio transcription route", async () => {
  const handle = createSourceApi({ ALLOWED_ORIGINS: PAGES, MOBILE_APP_ORIGINS: MOBILE }, async () => new Response("{}"));
  const response = await handle(new Request("https://worker.test/api/audio-transcription", {
    method: "OPTIONS",
    headers: { Origin: "https://localhost", "Access-Control-Request-Method": "POST" },
  }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://localhost");
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /X-Transcription-Provider/);
});

test("the community API allows mobile origins only when configured", () => {
  const production = { ALLOWED_ORIGINS: `${PAGES},https://nefes-tin-whistle.ozguregemenbusiness.chatgpt.site` };
  assert.equal(communityOriginAllowed("https://localhost", production), false);
  assert.equal(communityOriginAllowed("capacitor://localhost", production), false);
  assert.equal(communityOriginAllowed(PAGES, production), true);
  assert.equal(communityOriginAllowed("http://127.0.0.1:8787", production), true);
  assert.equal(communityOriginAllowed(null, production), true);

  const withMobile = { ...production, MOBILE_APP_ORIGINS: MOBILE };
  assert.equal(communityOriginAllowed("https://localhost", withMobile), true);
  assert.equal(communityOriginAllowed("capacitor://localhost", withMobile), true);
  assert.equal(communityOriginAllowed("https://evil.example", withMobile), false);
});
