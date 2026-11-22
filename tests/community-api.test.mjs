import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { noteChoicesForPattern, noteForPattern } from "../app/note-notation.mjs";
import { COMMUNITY_TERMS_VERSION as TERMS } from "../shared/community-auth.mjs";
import { parseCommunityNotation } from "../shared/community-song.mjs";
import { handleCommunity, initializeCommunityStorage } from "../worker/community-api.mjs";

test("editor notation checks every note and the hole chart distinguishes registers", () => {
  assert.equal(parseCommunityNotation("Re Mi Fa diyez\nRe+ Si bemol Do").notes, "D4 E4 F#4 | D5 A#4 C5");
  assert.equal(parseCommunityNotation("D4 words E4").error, "invalid_note");
  assert.equal(parseCommunityNotation("C2").error, "invalid_note");
  assert.equal(parseCommunityNotation("Fa bemol").error, "invalid_note");
  assert.equal(noteForPattern("111110", 1).octave, 4);
  assert.equal(noteForPattern("111110", 2).octave, 5);
  assert.equal(noteForPattern("011111", 2).pitch, "D");
  assert.equal(noteForPattern("011111", 1), null);
  assert.deepEqual(noteChoicesForPattern("011111").map(({ register, note }) => [register, note.token]), [[2, "D5"], [3, "D6"]]);
  assert.equal(noteForPattern("010101", 1), null);
});

function communityRequests(context, options = {}) {
  const database = new DatabaseSync(":memory:");
  context.after(() => database.close());
  const storage = {
    sql: {
      exec(query, ...bindings) {
        if (/^\s*CREATE TABLE/.test(query)) {
          database.exec(query);
          return { toArray: () => [] };
        }
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
  return { request, database, storage };
}

test("community requires an account, attributes each version, and restricts edits to its author", async context => {
  const { request } = communityRequests(context);
  const draft = { title: "Practice tune", artist: "Traditional", bpm: 168, notes: "Re Mi Fa# | Sol" };
  assert.equal((await request("songs", { method: "POST", body: draft })).status, 401);
  const password = "Bee%5R7u";
  const tooShort = await request("register", { method: "POST", body: { username: "Alice", password: password.slice(1) } });
  assert.equal(tooShort.status, 400);
  assert.equal(tooShort.data.error, "invalid_password");
  const alice = await request("register", { method: "POST", body: { username: "Alice", password, acceptTerms: TERMS } });
  assert.equal(alice.status, 201);
  assert.equal((await request("register", { method: "POST", body: { username: "alice", password } })).status, 409);
  const bob = await request("register", { method: "POST", body: { username: "Bob", password: "a dedicated fixture password", acceptTerms: TERMS } });
  assert.equal(bob.status, 201);
  assert.equal((await request("login", { method: "POST", body: { username: "Alice", password: password + " wrong" } })).status, 401);
  const login = await request("login", { method: "POST", body: { username: "ALICE", password } });
  assert.equal(login.status, 200);

  const saved = await request("songs", { method: "POST", token: login.data.token, body: { ...draft, contributor: "Bob" } });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.contributor, "Alice");
  assert.equal(saved.data.notes, "D4 E4 F#4 | G4");
  const updatedTitle = { ...draft, title: "Practice tune revised" };
  assert.equal((await request(`songs/${saved.data.id}`, { method: "PUT", body: updatedTitle, token: bob.data.token })).status, 404);
  assert.equal((await request(`songs/${saved.data.id}`, { method: "PUT", body: updatedTitle, token: login.data.token })).status, 200);
  const found = await request("songs?q=alice%20revised");
  assert.deepEqual(found.data.songs.map(song => [song.title, song.contributor]), [[updatedTitle.title, "Alice"]]);
  assert.deepEqual((await request("mine", { token: bob.data.token })).data.songs, []);
  assert.equal((await request("logout", { method: "POST", token: login.data.token })).status, 204);
  assert.equal((await request("session", { token: login.data.token })).status, 401);
});

test("only the author can delete a version and its ratings are removed with it", async context => {
  const { request, database } = communityRequests(context);
  const [alice, bob] = await Promise.all(["Alice", "Bob"].map(username =>
    request("register", { method: "POST", body: { username, password: "Bee%5R7u", acceptTerms: TERMS } })));
  const aliceToken = alice.data.token;
  const bobToken = bob.data.token;
  const draft = { title: "Two contributions", bpm: 96, notes: "D4 E4" };
  const aliceSong = await request("songs", { method: "POST", token: aliceToken, body: draft });
  const bobSong = await request("songs", { method: "POST", token: bobToken, body: draft });
  const path = `songs/${aliceSong.data.id}`;
  const ratingPath = `${path}/rating`;
  assert.equal((await request(ratingPath, { method: "PUT", token: bobToken, body: { score: 4.5 } })).status, 200);
  assert.equal((await request(path, { method: "DELETE" })).status, 401);
  assert.deepEqual(await request(path, { method: "DELETE", token: bobToken }), { status: 404, data: { error: "song_not_found" } });
  assert.equal((await request(ratingPath)).data.count, 1);
  assert.deepEqual(await request(path, { method: "DELETE", token: aliceToken }), { status: 204, data: null });
  assert.equal((await request(path, { method: "DELETE", token: aliceToken })).status, 404);
  assert.equal((await request(ratingPath)).status, 404);
  assert.deepEqual((await request("mine", { token: aliceToken })).data.songs, []);
  assert.deepEqual((await request("songs?q=two")).data.songs.map(song => song.id), [bobSong.data.id]);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM community_song_ratings WHERE song_id = ?")
    .get(aliceSong.data.id).count, 0);
});

test("community ratings are per version, update one vote per member, and rank by average then count", async context => {
  const { request } = communityRequests(context);
  const [alice, bob] = await Promise.all(["Alice", "Bob"].map(username =>
    request("register", { method: "POST", body: { username, password: "Bee%5R7u", acceptTerms: TERMS } })));
  const draft = { title: "Two versions", artist: "Traditional", bpm: 96, notes: "D4 E4" };
  const aliceToken = alice.data.token;
  const bobToken = bob.data.token;
  const first = await request("songs", { method: "POST", token: aliceToken, body: draft });
  const second = await request("songs", { method: "POST", token: bobToken, body: draft });
  const firstRating = `songs/${first.data.id}/rating`;
  const secondRating = `songs/${second.data.id}/rating`;
  const vote = (path, score, token) => request(path, { method: "PUT", token, body: { score } });

  assert.deepEqual(first.data.rating, { average: null, count: 0 });
  assert.deepEqual((await request(firstRating)).data, { average: null, count: 0, score: null });
  assert.equal((await vote(firstRating, 4)).status, 401);
  for (const invalid of [0, 0.5, 5.5, 6, 2.25, "4", "2.5", null]) {
    assert.deepEqual(await vote(firstRating, invalid, aliceToken), { status: 400, data: { error: "invalid_rating" } });
  }
  assert.deepEqual((await vote(firstRating, 4, aliceToken)).data, { average: 4, count: 1, score: 4 });
  assert.deepEqual((await vote(firstRating, 4.5, bobToken)).data, { average: 4.3, count: 2, score: 4.5 });
  assert.deepEqual((await request(firstRating, { token: aliceToken })).data, { average: 4.3, count: 2, score: 4 });
  assert.deepEqual((await request(firstRating)).data, { average: 4.3, count: 2, score: null });
  assert.deepEqual((await vote(secondRating, 5, aliceToken)).data, { average: 5, count: 1, score: 5 });
  const ranked = await request("songs?q=versions");
  assert.deepEqual(ranked.data.songs.map(song => [song.id, song.rating]), [
    [second.data.id, { average: 5, count: 1 }], [first.data.id, { average: 4.3, count: 2 }],
  ]);

  assert.deepEqual((await vote(firstRating, 4.5, aliceToken)).data, { average: 4.5, count: 2, score: 4.5 });
  assert.deepEqual((await vote(firstRating, 5, bobToken)).data, { average: 4.8, count: 2, score: 5 });
  assert.deepEqual((await vote(firstRating, 5, aliceToken)).data, { average: 5, count: 2, score: 5 });
  assert.deepEqual((await vote(firstRating, 5, aliceToken)).data, { average: 5, count: 2, score: 5 });
  const edited = await request(`songs/${first.data.id}`, { method: "PUT", token: aliceToken, body: { ...draft, bpm: 110 } });
  assert.deepEqual(edited.data.rating, { average: 5, count: 2 });
  assert.deepEqual((await request("songs?q=versions")).data.songs.map(song => song.id), [first.data.id, second.data.id]);
  assert.equal((await vote(`songs/community-${crypto.randomUUID()}/rating`, 4, aliceToken)).status, 404);
});

test("half-star storage migrates existing votes and keeps them across restarts", async context => {
  const { request, database, storage } = communityRequests(context);
  const member = await request("register", { method: "POST", body: { username: "Alice", password: "Bee%5R7u", acceptTerms: TERMS } });
  const token = member.data.token;
  const song = await request("songs", {
    method: "POST", token, body: { title: "Legacy tune", artist: "Traditional", bpm: 96, notes: "D4 E4" },
  });
  const path = `songs/${song.data.id}/rating`;
  database.exec(`
    DROP TABLE community_song_ratings;
    CREATE TABLE community_song_ratings (
      song_id TEXT NOT NULL REFERENCES community_songs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
      score INTEGER NOT NULL CHECK (score IN (1, 2, 3, 4, 5)),
      PRIMARY KEY (song_id, user_id)
    );
    INSERT INTO community_song_ratings (song_id, user_id, score)
      SELECT id, author_id, 4 FROM community_songs;
  `);

  initializeCommunityStorage(storage);
  assert.deepEqual((await request(path, { token })).data, { average: 4, count: 1, score: 4 });
  const saved = await request(path, { method: "PUT", token, body: { score: 3.5 } });
  assert.deepEqual(saved, { status: 200, data: { average: 3.5, count: 1, score: 3.5 } });
  initializeCommunityStorage(storage);
  assert.deepEqual((await request(path, { token })).data, saved.data);
});
