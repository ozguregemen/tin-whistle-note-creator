const TERMINAL_JOB_STATUSES = new Set(["completed", "needs-review", "failed"]);
const PROCESSING_PRIORITY = Object.freeze({ gp: 3, text: 2, omr: 1 });

function processableCandidate(candidate) {
  if (!candidate || candidate.processingMode === "review") return false;
  return candidate.postId !== undefined
    || candidate.songId !== undefined
    || candidate.documentId !== undefined;
}

export function buildSourceAttemptOrder(selected, candidates, maximumAttempts = 3) {
  const unique = new Map();
  for (const candidate of [selected, ...(Array.isArray(candidates) ? candidates : [])]) {
    if (!processableCandidate(candidate) || unique.has(candidate.id)) continue;
    unique.set(candidate.id, candidate);
  }
  const [first, ...fallbacks] = [...unique.values()];
  if (!first) return [];
  fallbacks.sort((left, right) => {
    const modeDifference = (PROCESSING_PRIORITY[right.processingMode] || 0)
      - (PROCESSING_PRIORITY[left.processingMode] || 0);
    return modeDifference || Number(right.score || 0) - Number(left.score || 0);
  });
  return [first, ...fallbacks].slice(0, Math.max(1, maximumAttempts));
}

const defaultWait = (milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

export async function waitForSourceJob(api, requestId, options = {}) {
  const fetchFn = options.fetchFn ?? fetch;
  const waitFn = options.waitFn ?? defaultWait;
  const pollIntervalMs = Math.max(250, Number(options.pollIntervalMs) || 3_000);
  const timeoutMs = Math.max(pollIntervalMs, Number(options.timeoutMs) || 180_000);
  const maximumPolls = Math.max(1, Math.ceil(timeoutMs / pollIntervalMs));

  for (let poll = 0; poll < maximumPolls; poll += 1) {
    if (poll > 0) await waitFn(pollIntervalMs);
    const response = await fetchFn(`${api}/api/jobs/${requestId}`, { cache: "no-store" });
    if (response.status === 202) continue;
    if (response.ok) {
      const job = await response.json();
      if (TERMINAL_JOB_STATUSES.has(job?.status)) return job;
      continue;
    }
    if (response.status >= 500) continue;
    throw new Error(`Source job status returned ${response.status}`);
  }
  return { requestId, status: "timeout" };
}
