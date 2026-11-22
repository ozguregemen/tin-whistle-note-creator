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
const run = Date.now().toString(36);

async function call(origin, path, { method = "GET", token, body } = {}) {
  const headers = { Origin: origin, Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}/api/community/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
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
const owner = await call(origin, "register", { method: "POST", body: { username: `mobowner${run}`, password } });
const voter = await call(origin, "register", { method: "POST", body: { username: `mobvoter${run}`, password } });
check("register two test accounts", owner.status === 201 && voter.status === 201, `${owner.status}/${voter.status}`);

const song = await call(origin, "songs", { method: "POST", token: owner.data.token, body: { title: `Mobile test ${run}`, bpm: 90, notes: "D4 E4 F#4 G4" } });
check("owner adds a song", song.status === 201, String(song.status));
const path = `songs/${song.data?.id}`;

const half = await call(origin, `${path}/rating`, { method: "PUT", token: voter.data.token, body: { score: 3.5 } });
check("half-star rating 3.5 saved", half.status === 200 && half.data.score === 3.5 && half.data.count === 1, JSON.stringify(half.data));
const ownVote = await call(origin, `${path}/rating`, { method: "PUT", token: owner.data.token, body: { score: 5 } });
check("average and vote count update", ownVote.data?.count === 2 && ownVote.data?.average === 4.3, JSON.stringify(ownVote.data));

const voterDelete = await call(origin, path, { method: "DELETE", token: voter.data.token });
check("non-owner cannot delete", voterDelete.status === 404, String(voterDelete.status));
const ownerDelete = await call(origin, path, { method: "DELETE", token: owner.data.token });
check("owner deletes own song", ownerDelete.status === 204, String(ownerDelete.status));

console.log(results.join("\n"));
process.exitCode = results.some(line => line.startsWith("FAIL")) ? 1 : 0;
