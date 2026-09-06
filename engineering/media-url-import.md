# Audio URL ingestion

## Boundary

`Transcribe audio` accepts either a local file or a direct audio link. The new
`app/media-import.mjs` orchestrator obtains a `Blob`, then calls the **same existing
`transcribeAudioFile()`** for both inputs. That function still delegates to
`transcribeAudioToMelody()` and the existing instrument adapter. Acquisition knows
nothing about MIDI, melody selection, whistle registers or fingerings.

```
file ────────────────────────────────────────────────┐
URL → provider → Worker → validated stream → Blob ────┤
                                                     ↓
                              existing decode / melody / adapter
```

The only change inside `audio-transcription.mjs` is importing the existing **30 MiB**
and **600-second** limits from a shared module instead of duplicating literals.
No inference, simplification, rhythm, fingering, arrangement or playback changes.

## Supported sources and deliberate restrictions

- Direct **HTTPS** URLs on exact operator-approved hosts, default:
  **`upload.wikimedia.org`**. This is not arbitrary-URL fetching. HTTP downgrade,
  credentials and nondefault ports are rejected.
- MP3 (`audio/mpeg`), WAV (`audio/wav`, `audio/x-wav`, `audio/wave`), Ogg
  Vorbis/Opus (`audio/ogg`, `application/ogg`), FLAC (`audio/flac`, `audio/x-flac`).
  `audio/mp3` is normalized to `audio/mpeg`.
- Extensionless URLs work. `application/octet-stream` is accepted only with a
  positively recognized audio signature. The extension never establishes support.
- Header type and bytes must agree. HTML, playlists, Ogg video, empty responses,
  compressed HTTP envelopes, MP4/AAC and other formats are rejected in this phase.
  Browser decoding is the final validator, not the lightweight signature check.
- MP3 ID3 metadata plus the first frame header must fit inside the **64 KiB** sniff
  window. Some otherwise valid MP3s with embedded cover art will require file
  upload instead. No transcoder or new model/dependency is added.
- YouTube (including `youtu.be`, `music.youtube.com`) and Spotify (including
  `spotify:` URIs) have explicit adapters that return `provider_restricted` without
  fetching media. There is no preview substitution, ripping or DRM bypass.
- Source adapters can be extended without touching the transcription engine.
  Do not mark a platform supported until an authorized full-audio path exists.

## Worker deployment

The existing `worker/source-api.mjs` delegates **POST `/api/media/resolve`** to
`worker/media-ingestion.mjs`. Input: `{"url":"https://…"}`. Success returns the
validated audio body directly, streamed with backpressure. Pre-response failures
return `{supported:false,provider,error,reason}` with a suitable HTTP status.

The existing frontend runtime API URL is reused. No new server, storage, secret,
API key or database table is required. File upload works without the Worker.

After merging the GitHub Pages build, deploy the updated Worker separately:

```sh
npm run worker:check
npm run worker:deploy
```

`wrangler.source-api.jsonc` adds:

- `AUDIO_ALLOWED_HOSTS`: comma-separated **exact hostnames**, no wildcards.
- `AUDIO_RATE_LIMITER`: 6 requests per 60 seconds, keyed by client address and
  route. The namespace `2026090601` must be unique to this limiter in the account;
  change it if already used elsewhere. Missing configuration fails closed.

Only enable domains whose DNS and HTTP service are controlled by trusted operators.
Do **not** add arbitrary user-controlled domains, redirect services or generic
proxies. Every redirected host must also be explicitly allowed. Update the small
EN/TR helper text if the deployment's approved-host policy changes.

The limiter is a per-Cloudflare-location, eventually consistent abuse guard, not
authentication or a hard worldwide spending cap. Users sharing an IP can share a
limit. Watch traffic/billing before broadening access; heavier usage may need
authenticated quotas or Turnstile. CORS alone is not authentication.

## Security and privacy

- Only the JSON URL is accepted; the body is capped at 4096 bytes while reading.
- Origins use the app's existing allowlist (plus its localhost development rule);
  media requests without Origin are denied. Requests cannot change host policy.
- URL canonicalization rejects **all IP literals**, including encoded IPv4 and
  mapped IPv6, plus localhost/internal/single-label names and lookalike hosts.
- Exact trusted-host matching is the SSRF boundary. Workers resolve DNS themselves;
  this implementation does **not** claim to pin or validate final resolved IPs.
  A separate DNS preflight would still have a rebinding/TOCTOU gap. Trust and monitor
  the allowlisted operators' DNS; arbitrary hosts require stronger egress isolation.
- Manual redirects: maximum 3, each destination revalidated before fetching.
- Fixed outbound headers only; no user Cookie, Authorization, Range or arbitrary
  custom headers. No upstream cookies/internal headers returned to the client.
- Declared length is checked early; actual bytes are counted regardless of length.
  Worker aborts a transfer exceeding 30 MiB, browser independently enforces 30 MiB.
- One 60-second deadline spans request body, redirects, headers, sniff and stream.
  Browser deadline is 65 seconds. Cancellation cleanup has at most 100 ms grace
  per cancellation attempt, even if the remote cancellation promise never settles.
- After headers are sent, an oversize/stalled/broken stream cannot change HTTP 200
  to a JSON 413/504. The browser discards partial data and shows a transfer-failure
  message, explicitly mentioning possible size limits. It never transcribes a
  truncated partial Blob. Early failures retain specific localized error codes.
- `no-store`, `nosniff`, no persistent media storage, no signed URLs in logs/errors,
  no URL query used as a song title. The Worker buffers a bounded sniff prefix plus
  incoming transport chunks, **not the whole song**. The browser necessarily holds
  a complete compressed Blob before existing decoding/inference.
- Local uploads remain entirely browser-local. URL downloads pass through the
  Worker; inference still runs locally. The UI explicitly explains the distinction.
- The existing browser decoder enforces duration (600 s); the Worker does not
  pretend it can infer duration from compressed download length.

## UI lifecycle

Fetching → preparing audio/model → transcribing with existing inference progress.
Both input controls lock for the whole operation, independently of catalog status.
Tab changes cancel/invalidate audio callbacks; the lock remains until cooperative
model cleanup finishes, preventing simultaneous inference. Errors are EN/TR and
never display raw remote messages. The URL field supports paste/Enter, has a label
and helper descriptions, and uses the existing compact moss-green controls.

Older source-conversion jobs retain their existing completion behavior; this task
does not redesign cross-feature job arbitration. Audio's own stale callbacks are
guarded. No browser visual/listening accuracy claim is made by unit tests.

## Verification

Final check: **181/181 tests pass (35 new)**; lint, normal build, GitHub Pages
static build and Worker deployment dry-run all pass. No dependency was added.
Standalone `tsc --noEmit` still reports the pre-existing missing
`cloudflare:workers`, `Fetcher`, and `D1Database` declarations in `db/index.ts` /
`worker/index.ts`; those unrelated deployment types were not changed. Wrangler's
types generation separately verified the new `RateLimit` binding. Builds retain
the existing large-model-chunk warning. No live deployment or GitHub push was made.

- `tests/media-ingestion.test.mjs`: MIME/signatures, direct/extensionless URLs,
  provider restrictions, private/encoded IPs, exact hosts, redirects, credentials,
  CORS/config/rate guard, early/streamed size limits, exact boundary, missing/lying
  length, timeouts, cancellation (including stalled cancellation), error sanitation.
- `tests/media-import.test.mjs`: Blob bytes, shared file/URL decoder→engine→adapter
  flow with deterministic decoder/evidence mocks, 600 s limit, stages, errors,
  cancellation, localization and markup wiring. These do not measure real-song
  melody quality; existing melody tests remain unchanged.
- `npm test` (includes normal build), `npm run lint`, `npm run build:pages`,
  `npm run worker:check`.
- A real network smoke check used the existing attribution source:
  [Whistle.wav](https://upload.wikimedia.org/wikipedia/commons/6/65/Whistle.wav).
  The actual Worker handler + client resolver produced an `audio/wav` Blob of
  **2,696,466 bytes** without persistent storage. This used the handler in Node
  with a test limiter, not the deployed Cloudflare account or real-browser model.
- To test after deployment: open Transcribe audio, paste that direct WAV URL and
  choose Import audio. Compare with uploading the same file. A YouTube or Spotify
  link should instead produce the provider-specific explanation immediately.

## Changed files

- Client: `app/media-import.mjs`, `app/page.tsx`, `app/globals.css`.
- Shared contract: `shared/audio-media.mjs`, `shared/audio-limits.mjs`.
- Existing decoder: `app/audio-transcription.mjs` (shared limit constants only).
- Worker: `worker/media-ingestion.mjs`, `worker/source-api.mjs`,
  `wrangler.source-api.jsonc`.
- Tests: `tests/media-import.test.mjs`, `tests/media-ingestion.test.mjs`.
- Documentation: `README.md`, this document.
- Generated GitHub Pages artifacts: `docs/index.html`, hashed `docs/assets/*`.

### Primary references

- [Cloudflare rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Request / redirect and resolveOverride behavior](https://developers.cloudflare.com/workers/runtime-apis/request/)
- [Cloudflare streaming best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Cloudflare known issues / fetch DNS](https://developers.cloudflare.com/workers/platform/known-issues/)
- [OWASP SSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
