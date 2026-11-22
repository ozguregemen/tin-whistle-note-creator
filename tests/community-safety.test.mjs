import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { COMMUNITY_TERMS_VERSION as TERMS } from "../shared/community-auth.mjs";
import { AUTO_HIDE_REPORTS, containsBlockedWord } from "../shared/community-moderation.mjs";
import { validateCommunitySong } from "../shared/community-song.mjs";
import { handleCommunity, initializeCommunityStorage } from "../worker/community-api.mjs";

const PASSWORD = "Bee%5R7u";
const DRAFT = { title: "Safety tune", artist: "Traditional", bpm: 120, notes: "D4 E4 F#4" };

function community(context, options = {}) {
  const database = new DatabaseSync(":memory:");
  context.after(() => database.close());
  const storage = {
    sql: {
      exec(query, ...bindings) {
        if (/^\s*CREATE TABLE/.test(query)) {
          database.exec(query);
          return { toArray: () => [] };
        }
        // Durable Object SQL runs the statement immediately; toArray only reads the rows.
        const rows = database.prepare(query).all(...bindings);
        return { toArray: () => rows };
      },
    },
    transactionSync(operation) {
      database.exec("BEGIN");
      try {
        const result = operation();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  initializeCommunityStorage(storage);
  const request = async (path, { method = "GET", body, token, headers = {} } = {}) => {
    const response = await handleCommunity(new Request(`https://community.test/api/community/${path}`, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }), storage, options);
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  };
  const member = async (username, acceptTerms = TERMS) => {
    const result = await request("register", { method: "POST", body: { username, password: PASSWORD, acceptTerms } });
    assert.equal(result.status, 201, `register ${username}`);
    return result.data;
  };
  const count = (query, ...bindings) => database.prepare(query).get(...bindings).count;
  return { request, member, count, database };
}

test("members accept the current terms before they can post", async context => {
  const { request, member } = community(context);
  const old = await member("OldMember", null);
  assert.equal(old.termsAccepted, false);
  assert.deepEqual(await request("songs", { method: "POST", token: old.token, body: DRAFT }),
    { status: 403, data: { error: "terms_required", version: TERMS } });
  assert.equal((await request("session", { token: old.token })).data.termsAccepted, false);
  assert.equal((await request("terms", { method: "POST", token: old.token, body: { version: "2020-01-01" } })).status, 400);
  assert.deepEqual((await request("terms", { method: "POST", token: old.token, body: { version: TERMS } })).data, { termsAccepted: true });
  assert.equal((await request("songs", { method: "POST", token: old.token, body: DRAFT })).status, 201);

  const fresh = await member("NewMember");
  assert.equal(fresh.termsAccepted, true);
  assert.equal((await request("songs", { method: "POST", token: fresh.token, body: DRAFT })).status, 201);
});

test("offensive usernames and titles are refused without blocking ordinary titles", async context => {
  const { request, member } = community(context);
  assert.equal(containsBlockedWord("Bu Akşam"), false);
  assert.equal(containsBlockedWord("Picnic Song"), false);
  assert.equal(containsBlockedWord("Siktir git"), true);
  assert.equal(containsBlockedWord("f.u.c.k"), true);
  assert.deepEqual(validateCommunitySong({ ...DRAFT, title: "You f*** idiot fuck" }), { error: "content_not_allowed" });
  const blocked = await request("register", { method: "POST", body: { username: "big.fuck", password: PASSWORD, acceptTerms: TERMS } });
  assert.deepEqual(blocked, { status: 400, data: { error: "content_not_allowed" } });
  const alice = await member("Alice");
  assert.equal((await request("songs", { method: "POST", token: alice.token, body: { ...DRAFT, artist: "Orospu" } })).data.error, "content_not_allowed");
});

test("reports from enough different members hide a version from everyone but its author", async context => {
  const { request, member, count } = community(context);
  const author = await member("Author");
  const song = (await request("songs", { method: "POST", token: author.token, body: DRAFT })).data;
  assert.deepEqual(await request("reports", { method: "POST", token: author.token, body: { target: "song", songId: song.id, reason: "spam" } }),
    { status: 400, data: { error: "cannot_report_self" } });

  const reporters = [];
  for (let index = 0; index < AUTO_HIDE_REPORTS; index += 1) reporters.push(await member(`Reporter${index}`));
  assert.equal((await request("reports", { method: "POST", token: reporters[0].token, body: { target: "song", songId: song.id, reason: "rude" } })).status, 400);
  assert.equal((await request("reports", { method: "POST", body: { target: "song", songId: song.id, reason: "spam" } })).status, 401);

  // Repeating a report updates it instead of counting twice.
  for (let attempt = 0; attempt < AUTO_HIDE_REPORTS; attempt += 1) {
    assert.deepEqual(await request("reports", { method: "POST", token: reporters[0].token, body: { target: "song", songId: song.id, reason: "offensive", note: "Rude title" } }),
      { status: 201, data: { received: true } });
  }
  assert.equal(count("SELECT COUNT(*) AS count FROM community_reports"), 1);
  assert.equal((await request("songs?q=")).data.songs.length, 1);

  for (const reporter of reporters.slice(1)) {
    await request("reports", { method: "POST", token: reporter.token, body: { target: "song", songId: song.id, reason: "offensive" } });
  }
  assert.deepEqual((await request("songs?q=")).data.songs, []);
  const own = (await request("mine", { token: author.token })).data.songs;
  assert.deepEqual(own.map(item => [item.id, item.hidden]), [[song.id, true]]);

  const userReport = await request("reports", { method: "POST", token: reporters[1].token, body: { target: "user", username: "author", reason: "harassment" } });
  assert.equal(userReport.status, 201);
  assert.equal((await request("reports", { method: "POST", token: reporters[1].token, body: { target: "user", username: "nobody", reason: "spam" } })).status, 404);
});

test("blocking hides an author's versions only for the member who blocked them", async context => {
  const { request, member } = community(context);
  const author = await member("Author");
  const viewer = await member("Viewer");
  const other = await member("Other");
  await request("songs", { method: "POST", token: author.token, body: DRAFT });
  await request("songs", { method: "POST", token: other.token, body: { ...DRAFT, title: "Other tune" } });

  assert.deepEqual(await request("blocks", { method: "POST", token: viewer.token, body: { username: "viewer" } }),
    { status: 400, data: { error: "cannot_block_self" } });
  assert.deepEqual(await request("blocks", { method: "POST", token: viewer.token, body: { username: "AUTHOR" } }),
    { status: 201, data: { blocked: "Author" } });
  assert.deepEqual((await request("blocks", { token: viewer.token })).data, { users: ["Author"] });
  assert.deepEqual((await request("songs?q=", { token: viewer.token })).data.songs.map(song => song.contributor), ["Other"]);
  assert.equal((await request("songs?q=")).data.songs.length, 2);
  assert.equal((await request("songs?q=", { token: other.token })).data.songs.length, 2);

  assert.equal((await request("blocks/Author", { method: "DELETE", token: viewer.token })).status, 204);
  assert.equal((await request("songs?q=", { token: viewer.token })).data.songs.length, 2);
});

test("deleting an account removes the member's songs, ratings, reports and blocks after the password is confirmed", async context => {
  const { request, member, count } = community(context);
  const leaving = await member("Leaving");
  const staying = await member("Staying");
  const ownSong = (await request("songs", { method: "POST", token: leaving.token, body: DRAFT })).data;
  const otherSong = (await request("songs", { method: "POST", token: staying.token, body: { ...DRAFT, title: "Staying tune" } })).data;
  await request(`songs/${otherSong.id}/rating`, { method: "PUT", token: leaving.token, body: { score: 4.5 } });
  await request(`songs/${ownSong.id}/rating`, { method: "PUT", token: staying.token, body: { score: 3 } });
  await request("reports", { method: "POST", token: leaving.token, body: { target: "song", songId: otherSong.id, reason: "spam" } });
  await request("reports", { method: "POST", token: staying.token, body: { target: "user", username: "Leaving", reason: "spam" } });
  await request("blocks", { method: "POST", token: staying.token, body: { username: "Leaving" } });

  assert.equal((await request("account", { method: "DELETE", body: { password: PASSWORD } })).status, 401);
  assert.deepEqual(await request("account", { method: "DELETE", token: leaving.token, body: { password: "wrong password" } }),
    { status: 401, data: { error: "incorrect_credentials" } });
  assert.equal(count("SELECT COUNT(*) AS count FROM community_users"), 2);

  assert.deepEqual(await request("account", { method: "DELETE", token: leaving.token, body: { password: PASSWORD } }), { status: 204, data: null });
  assert.equal(count("SELECT COUNT(*) AS count FROM community_users WHERE username = 'Leaving'"), 0);
  assert.equal(count("SELECT COUNT(*) AS count FROM community_songs"), 1);
  assert.equal(count("SELECT COUNT(*) AS count FROM community_song_ratings"), 0);
  assert.equal(count("SELECT COUNT(*) AS count FROM community_reports"), 0);
  assert.equal(count("SELECT COUNT(*) AS count FROM community_blocks"), 0);
  assert.equal(count("SELECT COUNT(*) AS count FROM community_sessions WHERE token_hash IS NOT NULL"), 1);
  assert.equal((await request("session", { token: leaving.token })).status, 401);
  assert.deepEqual((await request(`songs/${otherSong.id}/rating`)).data, { average: null, count: 0, score: null });
  assert.equal((await request("login", { method: "POST", body: { username: "Leaving", password: PASSWORD } })).status, 401);
  // The username is free again.
  assert.equal((await request("register", { method: "POST", body: { username: "Leaving", password: PASSWORD, acceptTerms: TERMS } })).status, 201);
});

test("moderator tools need the server token and can restore, remove and suspend", async context => {
  const closed = community(context);
  assert.equal((await closed.request("moderation/reports", { headers: { "X-Moderator-Token": "anything" } })).status, 404);

  const { request, member } = community(context, { moderatorToken: "moderator-secret" });
  const asModerator = { headers: { "X-Moderator-Token": "moderator-secret" } };
  assert.equal((await request("moderation/reports", { headers: { "X-Moderator-Token": "wrong" } })).status, 404);

  const author = await member("Author");
  const reporter = await member("Reporter");
  const song = (await request("songs", { method: "POST", token: author.token, body: DRAFT })).data;
  await request("reports", { method: "POST", token: reporter.token, body: { target: "song", songId: song.id, reason: "offensive", note: "Check this" } });

  const { reports } = (await request("moderation/reports", asModerator)).data;
  assert.equal(reports.length, 1);
  assert.equal(reports[0].song_title, "Safety tune");
  assert.equal(reports[0].reported_user, "Author");
  assert.equal(reports[0].reporter, "Reporter");

  assert.equal((await request(`moderation/songs/${song.id}/hide`, { method: "POST", ...asModerator })).status, 204);
  assert.deepEqual((await request("songs?q=")).data.songs, []);
  assert.equal((await request(`moderation/songs/${song.id}/restore`, { method: "POST", ...asModerator })).status, 204);
  assert.equal((await request("songs?q=")).data.songs.length, 1);
  assert.deepEqual((await request("moderation/reports", asModerator)).data.reports, []);

  assert.equal((await request("moderation/users/Author/suspend", { method: "POST", ...asModerator })).status, 204);
  assert.equal((await request("session", { token: author.token })).status, 401);
  assert.deepEqual(await request("login", { method: "POST", body: { username: "Author", password: PASSWORD } }),
    { status: 403, data: { error: "account_suspended" } });
  assert.equal((await request("moderation/users/Author/unsuspend", { method: "POST", ...asModerator })).status, 204);
  assert.equal((await request("login", { method: "POST", body: { username: "Author", password: PASSWORD } })).status, 200);

  assert.equal((await request(`moderation/songs/${song.id}`, { method: "DELETE", ...asModerator })).status, 204);
  assert.deepEqual((await request("songs?q=")).data.songs, []);
});
