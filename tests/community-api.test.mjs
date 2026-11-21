import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { noteForPattern } from "../app/note-notation.mjs";
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
  assert.equal(noteForPattern("010101", 1), null);
});

test("community requires an account, attributes each version, and restricts edits to its author", async () => {
  const database = new DatabaseSync(":memory:");
  try {
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
    async function request(path, { method = "GET", body, token } = {}) {
      const response = await handleCommunity(new Request(`https://community.test/api/community/${path}`, {
        method,
        headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }), storage);
      return { status: response.status, data: response.status === 204 ? null : await response.json() };
    }
    const draft = { title: "Practice tune", artist: "Traditional", bpm: 168, notes: "Re Mi Fa# | Sol" };
    assert.equal((await request("songs", { method: "POST", body: draft })).status, 401);
    const password = "a dedicated fixture password";
    const alice = await request("register", { method: "POST", body: { username: "Alice", password } });
    assert.equal(alice.status, 201);
    assert.equal((await request("register", { method: "POST", body: { username: "alice", password } })).status, 409);
    const bob = await request("register", { method: "POST", body: { username: "Bob", password } });
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
  } finally {
    database.close();
  }
});
