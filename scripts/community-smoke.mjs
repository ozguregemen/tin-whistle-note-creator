// Smoke test of a community Worker through the installed app's origins.
// It creates throwaway accounts and a song, so it refuses the production Worker.
// Usage: npm run smoke:community -- https://tin-whistle-community-staging.<account>.workers.dev
const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Pass the local or staging community Worker URL.");
  process.exit(2);
}
if (/\/\/tin-whistle-community\./.test(base)) {
  console.error("Refusing to create test accounts on the production community Worker.");
  process.exit(2);
}
const { COMMUNITY_TERMS_VERSION } = await import("../shared/community-auth.mjs");
const run = Date.now().toString(36);

async function call(origin, path, { method = "GET", token, body } = {}) {
  const headers = { Origin: origin, Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let response = await fetch(`${base}/api/community/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  // The Worker allows a few writes per minute per address; wait out the window instead of failing.
  for (let attempt = 0; response.status === 429 && attempt < 3; attempt += 1) {
    console.log(`rate limited on ${method} ${path.split("?")[0]}, waiting 61 s…`);
    await new Promise(resolve => setTimeout(resolve, 61_000));
    response = await fetch(`${base}/api/community/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  }
  const text = await response.text();
  return { status: response.status, acao: response.headers.get("access-control-allow-origin"), data: text ? JSON.parse(text) : null };
}

const results = [];
const check = (label, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);

for (const origin of ["https://localhost", "capacitor://localhost"]) {
  const list = await call(origin, "songs?q=&offset=0");
  check(`GET songs from ${origin}`, list.status === 200 && list.acao === origin, `${list.status}, ACAO=${list.acao}`);
}
const blocked = await call("https://evil.example", "songs?q=&offset=0");
check("unknown origin blocked", blocked.status === 403, String(blocked.status));

const origin = "https://localhost";
const password = `Test-${run}-pass`;
const owner = await call(origin, "register", { method: "POST", body: { username: `mobowner${run}`, password, acceptTerms: COMMUNITY_TERMS_VERSION } });
const voter = await call(origin, "register", { method: "POST", body: { username: `mobvoter${run}`, password, acceptTerms: COMMUNITY_TERMS_VERSION } });
check("register two test accounts with the rules accepted", owner.status === 201 && voter.status === 201 && owner.data.termsAccepted === true,
  `${owner.status}/${voter.status}`);
const rulesMissing = await call(origin, "register", { method: "POST", body: { username: `mobnoterms${run}`, password } });
const blockedPost = await call(origin, "songs", { method: "POST", token: rulesMissing.data?.token, body: { title: `No rules ${run}`, bpm: 90, notes: "D4" } });
check("posting needs the community rules", blockedPost.status === 403 && blockedPost.data?.error === "terms_required", String(blockedPost.status));
const rude = await call(origin, "songs", { method: "POST", token: owner.data.token, body: { title: "Siktir song", bpm: 90, notes: "D4" } });
check("offensive title refused", rude.status === 400 && rude.data?.error === "content_not_allowed", String(rude.status));

const song = await call(origin, "songs", { method: "POST", token: owner.data.token, body: { title: `Mobile test ${run}`, bpm: 90, notes: "D4 E4 F#4 G4" } });
check("owner adds a song", song.status === 201, String(song.status));
const path = `songs/${song.data?.id}`;

const half = await call(origin, `${path}/rating`, { method: "PUT", token: voter.data.token, body: { score: 3.5 } });
check("half-star rating 3.5 saved", half.status === 200 && half.data.score === 3.5 && half.data.count === 1, JSON.stringify(half.data));
const ownVote = await call(origin, `${path}/rating`, { method: "PUT", token: owner.data.token, body: { score: 5 } });
check("average and vote count update", ownVote.data?.count === 2 && ownVote.data?.average === 4.3, JSON.stringify(ownVote.data));

const report = await call(origin, "reports", { method: "POST", token: voter.data.token, body: { target: "song", songId: song.data?.id, reason: "spam", note: "Smoke test report" } });
check("member reports a version", report.status === 201, String(report.status));
const userReport = await call(origin, "reports", { method: "POST", token: voter.data.token, body: { target: "user", username: owner.data.username, reason: "other" } });
check("member reports a member", userReport.status === 201, String(userReport.status));
const block = await call(origin, "blocks", { method: "POST", token: voter.data.token, body: { username: owner.data.username } });
const hiddenForVoter = await call(origin, `songs?q=${encodeURIComponent(`Mobile test ${run}`)}`, { token: voter.data.token });
const visibleForGuest = await call(origin, `songs?q=${encodeURIComponent(`Mobile test ${run}`)}`);
check("blocking hides the member's versions only for the blocker",
  block.status === 201 && hiddenForVoter.data?.songs.length === 0 && visibleForGuest.data?.songs.length === 1,
  `${block.status}, blocker sees ${hiddenForVoter.data?.songs.length}, guest sees ${visibleForGuest.data?.songs.length}`);

const voterDelete = await call(origin, path, { method: "DELETE", token: voter.data.token });
check("non-owner cannot delete", voterDelete.status === 404, String(voterDelete.status));
const ownerDelete = await call(origin, path, { method: "DELETE", token: owner.data.token });
check("owner deletes own song", ownerDelete.status === 204, String(ownerDelete.status));

const wrongPassword = await call(origin, "account", { method: "DELETE", token: voter.data.token, body: { password: "not the password" } });
const accountDeletes = await Promise.all([owner, voter, rulesMissing].map(account =>
  call(origin, "account", { method: "DELETE", token: account.data?.token, body: { password } })));
const loginAfter = await call(origin, "login", { method: "POST", body: { username: voter.data.username, password } });
check("account deletion needs the password and removes the account",
  wrongPassword.status === 401 && accountDeletes.every(result => result.status === 204) && loginAfter.status === 401,
  `${wrongPassword.status}, ${accountDeletes.map(result => result.status).join("/")}, login ${loginAfter.status}`);

console.log(results.join("\n"));
process.exitCode = results.some(line => line.startsWith("FAIL")) ? 1 : 0;
