export const MUSCRIPTOR_API_PATH = "api/audio-transcription";
export const MUSCRIPTOR_LARGE = "muscriptor-large";

/** @returns {Promise<{provider: "basic-pitch" | "muscriptor-large", youtubeMp3: boolean}>} */
export async function detectAudioCapabilities() {
  try {
    const response = await fetch(new URL(MUSCRIPTOR_API_PATH, document.baseURI), {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) {
      const capabilities = await response.json();
      return {
        provider: capabilities.provider === MUSCRIPTOR_LARGE ? MUSCRIPTOR_LARGE : "basic-pitch",
        youtubeMp3: capabilities.youtubeMp3 === true,
      };
    }
  } catch {
    // Static builds and unreachable server routes can still transcribe locally.
  }
  return { provider: "basic-pitch", youtubeMp3: false };
}

/** @param {Blob} file @param {(progress: number) => void} onProgress @param {{signal?: AbortSignal}} [options] */
export async function transcribeWithMuscriptor(file, onProgress, { signal } = {}) {
  const form = new FormData();
  const extension = (file instanceof File ? file.name.match(/\.(mp3|wav|ogg|flac)$/i)?.[0] : "") ?? "";
  form.set("file", file, `audio${extension}`);
  form.set("detect_tempo", "false");

  const timeout = AbortSignal.timeout(15 * 60 * 1000);
  const response = await fetch(new URL(MUSCRIPTOR_API_PATH, document.baseURI), {
    method: "POST",
    headers: { "X-Transcription-Provider": MUSCRIPTOR_LARGE },
    body: form,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (response.status === 413) throw new RangeError("Audio file must be 30 MB or smaller");
  if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
    throw new Error("MuScriptor transcription is unavailable");
  }
  return readMuscriptorEvents(response.body, onProgress);
}

export async function readMuscriptorEvents(body, onProgress) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const openNotes = new Map();
  const notes = [];
  let pending = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw new Error("MuScriptor ended before completing the transcription");

      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop();
      // MuScriptor emits one JSON object per SSE data line.
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const event = JSON.parse(line.slice(5));
        switch (event.type) {
          case "start":
            if (event.instrument !== "drums" && Number.isInteger(event.pitch) && Number.isFinite(event.start_time)) {
              openNotes.set(event.index, event);
            }
            break;
          case "end": {
            const start = openNotes.get(event.start_event_index);
            if (!start) break;
            openNotes.delete(event.start_event_index);
            const durationSeconds = event.end_time - start.start_time;
            if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
              notes.push({
                pitchMidi: start.pitch,
                // MuScriptor's note events have no amplitude or confidence field.
                amplitude: 1,
                explicitOnset: true,
                startTimeSeconds: start.start_time,
                durationSeconds,
              });
            }
            break;
          }
          case "progress":
            if (event.total > 0) onProgress(Math.min(0.99, Math.max(0, event.completed / event.total)));
            break;
          case "transcription_complete":
            onProgress(1);
            return notes;
          case "error":
            throw new Error("MuScriptor could not transcribe this file");
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
