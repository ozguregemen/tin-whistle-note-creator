import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { normalizeSearchText } from "../app/search-relevance.mjs";
import { COMMUNITY_TERMS_VERSION, MAX_COMMUNITY_PASSWORD_LENGTH, MIN_COMMUNITY_PASSWORD_LENGTH } from "../shared/community-auth.mjs";
import { AUTO_HIDE_REPORTS, containsBlockedWord, MAX_REPORT_NOTE, REPORT_REASONS } from "../shared/community-moderation.mjs";
import { COMMUNITY_PAGE_SIZE, COMMUNITY_PATH, validateCommunitySong } from "../shared/community-song.mjs";

const deriveKey = promisify(scrypt);
const PASSWORD_COST = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const SESSION_DURATION = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;
const SONG_ID = /^community-[a-f0-9-]{36}$/;
const RATING_COLUMNS = `(
  song_id TEXT NOT NULL REFERENCES community_songs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  score REAL NOT NULL CHECK (score BETWEEN 1 AND 5 AND score * 2 = CAST(score * 2 AS INTEGER)),
  PRIMARY KEY (song_id, user_id)
)`;
const RATING_FIELDS = `
  (SELECT ROUND(AVG(score), 1) FROM community_song_ratings WHERE song_id = s.id) AS rating_average,
  (SELECT COUNT(*) FROM community_song_ratings WHERE song_id = s.id) AS rating_count`;
const SELECT_SONG = `SELECT s.id, s.title, s.artist, s.notes, s.bpm, s.hidden_at, u.username, ${RATING_FIELDS}
  FROM community_songs s JOIN community_users u ON u.id = s.author_id`;
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{2,23}$/;

/**
 * Browser origins that may call the community API. Requests without an Origin
 * (server-side tools) keep working; sign-in still requires the user's token.
 * @param {string | null} origin
 * @param {{ ALLOWED_ORIGINS?: string, MOBILE_APP_ORIGINS?: string }} env
 */
export function communityOriginAllowed(origin, env) {
  if (!origin) return true;
  const allowed = `${env.ALLOWED_ORIGINS || ""},${env.MOBILE_APP_ORIGINS || ""}`
    .split(",").map(value => value.trim()).filter(Boolean);
  return allowed.includes(origin) || /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
}

export function initializeCommunityStorage(storage) {
  const { sql } = storage;
  storage.transactionSync(() => {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS community_users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
        password_salt TEXT NOT NULL, password_hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS community_sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS community_session_expiry ON community_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS community_songs (
        id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES community_users(id),
        title TEXT NOT NULL, artist TEXT NOT NULL, notes TEXT NOT NULL,
        bpm INTEGER NOT NULL CHECK (bpm BETWEEN 40 AND 220), search_text TEXT NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS community_songs_by_update ON community_songs(updated_at DESC, id);
      CREATE INDEX IF NOT EXISTS community_songs_by_author ON community_songs(author_id, updated_at DESC, id);
      CREATE TABLE IF NOT EXISTS community_song_ratings ${RATING_COLUMNS};
    `);
    sql.exec(`
      CREATE TABLE IF NOT EXISTS community_reports (
        id TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
        target TEXT NOT NULL,
        song_id TEXT REFERENCES community_songs(id) ON DELETE CASCADE,
        reported_user_id TEXT REFERENCES community_users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL,
        UNIQUE (reporter_id, target)
      );
      CREATE INDEX IF NOT EXISTS community_reports_by_status ON community_reports(status, created_at);
      CREATE TABLE IF NOT EXISTS community_blocks (
        blocker_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
        blocked_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (blocker_id, blocked_id)
      );
    `);
    addColumn(sql, "community_users", "terms_version", "TEXT");
    addColumn(sql, "community_users", "suspended_at", "INTEGER");
    addColumn(sql, "community_songs", "hidden_at", "INTEGER");

    const columns = sql.exec("PRAGMA table_info(community_song_ratings)").toArray();
    if (!columns.some(column => column.name === "score" && column.type === "INTEGER")) return;
    sql.exec(`
      CREATE TABLE community_song_ratings_next ${RATING_COLUMNS};
      INSERT INTO community_song_ratings_next (song_id, user_id, score)
        SELECT song_id, user_id, score FROM community_song_ratings;
      DROP TABLE community_song_ratings;
      ALTER TABLE community_song_ratings_next RENAME TO community_song_ratings;
    `);
  });
}

function addColumn(sql, table, column, type) {
  const columns = sql.exec(`PRAGMA table_info(${table})`).toArray();
  if (!columns.some(existing => existing.name === column)) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

class CommunityError extends Error {
  constructor(status, code, details = {}) {
    super(code);
    this.status = status;
    this.payload = { error: code, ...details };
  }
}

async function requestBody(request) {
  const mime = request.headers.get("Content-Type")?.split(";")[0].trim();
  if (mime !== "application/json" || !request.body) throw new CommunityError(400, "invalid_request");
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) throw new CommunityError(413, "request_too_large");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new CommunityError(413, "request_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error instanceof CommunityError) throw error;
    throw new CommunityError(400, "invalid_request");
  } finally {
    reader.releaseLock();
  }
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function requestSession(request) {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  return token ? tokenHash(token) : null;
}

function requireAccount(sql, request) {
  const hash = requestSession(request);
  if (!hash) throw new CommunityError(401, "sign_in_required");
  const [user] = sql.exec(`SELECT u.id, u.username, u.terms_version, u.suspended_at FROM community_sessions s
    JOIN community_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`, hash, Date.now()).toArray();
  if (!user) throw new CommunityError(401, "sign_in_required");
  if (user.suspended_at) throw new CommunityError(403, "account_suspended");
  return user;
}

/** The signed-in member when a valid token is sent, otherwise a guest (null). */
function optionalAccount(sql, request) {
  if (!request.headers.has("Authorization")) return null;
  try {
    return requireAccount(sql, request);
  } catch {
    return null;
  }
}

function termsAccepted(user) {
  return user?.terms_version === COMMUNITY_TERMS_VERSION;
}

function findUser(sql, username) {
  if (typeof username !== "string" || !USERNAME.test(username.trim())) throw new CommunityError(404, "user_not_found");
  const [user] = sql.exec("SELECT id, username FROM community_users WHERE username_key = ?", username.trim().toLowerCase()).toArray();
  if (!user) throw new CommunityError(404, "user_not_found");
  return user;
}

async function passwordHash(password, salt) {
  return deriveKey(password, Buffer.from(salt, "hex"), 32, PASSWORD_COST);
}

function createSession(sql, user) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_DURATION;
  sql.exec("DELETE FROM community_sessions WHERE expires_at <= ?", Date.now());
  sql.exec("INSERT INTO community_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", tokenHash(token), user.id, expiresAt);
  return { username: user.username, token, expiresAt, termsAccepted: termsAccepted(user) };
}

async function verifyPassword(user, password) {
  const actual = await passwordHash(typeof password === "string" ? password : "", user?.password_salt ?? "0".repeat(32));
  const matches = timingSafeEqual(actual, Buffer.from(user?.password_hash ?? "0".repeat(64), "hex"));
  return Boolean(user) && matches;
}

async function signIn(request, storage, register) {
  const { sql } = storage;
  const body = await requestBody(request);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = body?.password;
  const userKey = username.toLowerCase();
  const passwordLength = typeof password === "string" ? [...password].length : 0;
  if (!USERNAME.test(username)) throw new CommunityError(400, "invalid_username");
  if (passwordLength < MIN_COMMUNITY_PASSWORD_LENGTH || passwordLength > MAX_COMMUNITY_PASSWORD_LENGTH) {
    throw new CommunityError(400, "invalid_password");
  }
  if (register) {
    if (containsBlockedWord(username)) throw new CommunityError(400, "content_not_allowed");
    // Accepting the terms is part of sign-up in the app; the version is stored so later changes can ask again.
    const acceptedTerms = body?.acceptTerms === COMMUNITY_TERMS_VERSION ? COMMUNITY_TERMS_VERSION : null;
    const user = { id: crypto.randomUUID(), username, terms_version: acceptedTerms };
    const salt = randomBytes(16).toString("hex");
    const hash = (await passwordHash(password, salt)).toString("hex");
    return storage.transactionSync(() => {
      const [created] = sql.exec(`INSERT INTO community_users (id, username, username_key, password_salt, password_hash, terms_version)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(username_key) DO NOTHING RETURNING id`, user.id, username, userKey, salt, hash, acceptedTerms).toArray();
      if (!created) throw new CommunityError(409, "username_taken");
      return createSession(sql, user);
    });
  }

  const [user] = sql.exec(`SELECT id, username, password_salt, password_hash, terms_version, suspended_at
    FROM community_users WHERE username_key = ?`, userKey).toArray();
  if (!(await verifyPassword(user, password))) throw new CommunityError(401, "incorrect_credentials");
  if (user.suspended_at) throw new CommunityError(403, "account_suspended");
  return storage.transactionSync(() => createSession(sql, user));
}

/** Deletes the member and everything tied to them: sessions, songs, ratings, reports and blocks. */
async function deleteAccount(storage, request) {
  const { sql } = storage;
  const { password } = (await requestBody(request)) ?? {};
  const session = requireAccount(sql, request);
  const [user] = sql.exec("SELECT id, username, password_salt, password_hash FROM community_users WHERE id = ?", session.id).toArray();
  if (!(await verifyPassword(user, password))) throw new CommunityError(401, "incorrect_credentials");
  removeMember(storage, user.id);
}

/** One transaction that leaves nothing tied to the member behind. */
function removeMember(storage, userId) {
  const { sql } = storage;
  storage.transactionSync(() => {
    const ownSongs = "SELECT id FROM community_songs WHERE author_id = ?";
    sql.exec(`DELETE FROM community_song_ratings WHERE user_id = ? OR song_id IN (${ownSongs})`, userId, userId);
    sql.exec(`DELETE FROM community_reports WHERE reporter_id = ? OR reported_user_id = ? OR song_id IN (${ownSongs})`, userId, userId, userId);
    sql.exec("DELETE FROM community_blocks WHERE blocker_id = ? OR blocked_id = ?", userId, userId);
    sql.exec("DELETE FROM community_songs WHERE author_id = ?", userId);
    sql.exec("DELETE FROM community_sessions WHERE user_id = ?", userId);
    sql.exec("DELETE FROM community_users WHERE id = ?", userId);
  });
}

async function acceptTerms(storage, request) {
  const { sql } = storage;
  const { version } = (await requestBody(request)) ?? {};
  const user = requireAccount(sql, request);
  if (version !== COMMUNITY_TERMS_VERSION) throw new CommunityError(400, "terms_outdated", { version: COMMUNITY_TERMS_VERSION });
  sql.exec("UPDATE community_users SET terms_version = ? WHERE id = ?", COMMUNITY_TERMS_VERSION, user.id);
  return { termsAccepted: true };
}

async function report(storage, request) {
  const { sql } = storage;
  const body = (await requestBody(request)) ?? {};
  const user = requireAccount(sql, request);
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const hasControlCharacters = [...note].some(character => {
    const code = character.codePointAt(0) ?? 0;
    return (code < 32 && character !== "\n" && character !== "\t") || code === 127;
  });
  if (!REPORT_REASONS.includes(body.reason) || note.length > MAX_REPORT_NOTE || hasControlCharacters) {
    throw new CommunityError(400, "invalid_report");
  }
  let target;
  let songId = null;
  let reportedId;
  if (body.target === "song") {
    const [song] = SONG_ID.test(body.songId ?? "")
      ? sql.exec("SELECT id, author_id FROM community_songs WHERE id = ?", body.songId).toArray() : [];
    if (!song) throw new CommunityError(404, "song_not_found");
    target = `song:${song.id}`;
    songId = song.id;
    reportedId = song.author_id;
  } else if (body.target === "user") {
    const reported = findUser(sql, body.username);
    target = `user:${reported.id}`;
    reportedId = reported.id;
  } else {
    throw new CommunityError(400, "invalid_report");
  }
  if (reportedId === user.id) throw new CommunityError(400, "cannot_report_self");

  storage.transactionSync(() => {
    sql.exec(`INSERT INTO community_reports (id, reporter_id, target, song_id, reported_user_id, reason, note, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
      ON CONFLICT(reporter_id, target) DO UPDATE SET reason = excluded.reason, note = excluded.note, status = 'open', created_at = excluded.created_at`,
    crypto.randomUUID(), user.id, target, songId, reportedId, body.reason, note, Date.now());
    if (!songId) return;
    const [{ reporters }] = sql.exec(`SELECT COUNT(DISTINCT reporter_id) AS reporters FROM community_reports
      WHERE song_id = ? AND status = 'open'`, songId).toArray();
    if (reporters >= AUTO_HIDE_REPORTS) sql.exec("UPDATE community_songs SET hidden_at = ? WHERE id = ? AND hidden_at IS NULL", Date.now(), songId);
  });
  return { received: true };
}

async function block(storage, request) {
  const { sql } = storage;
  const { username } = (await requestBody(request)) ?? {};
  const user = requireAccount(sql, request);
  const blocked = findUser(sql, username);
  if (blocked.id === user.id) throw new CommunityError(400, "cannot_block_self");
  sql.exec(`INSERT INTO community_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)
    ON CONFLICT(blocker_id, blocked_id) DO NOTHING`, user.id, blocked.id, Date.now());
  return { blocked: blocked.username };
}

function listBlocks(sql, user) {
  const rows = sql.exec(`SELECT u.username FROM community_blocks b JOIN community_users u ON u.id = b.blocked_id
    WHERE b.blocker_id = ? ORDER BY b.created_at DESC`, user.id).toArray();
  return { users: rows.map(row => row.username) };
}

function ratingSummary(row) {
  return { average: row.rating_average, count: row.rating_count };
}

function songResponse(row) {
  return {
    id: row.id,
    title: row.title,
    ...(row.artist ? { artist: row.artist } : {}),
    contributor: row.username,
    aliases: [],
    subtitle: { en: "Community arrangement", tr: "Topluluk düzenlemesi" },
    difficulty: { en: "", tr: "" },
    notes: row.notes,
    rhythm: { bpm: row.bpm, source: "estimated", tempoSource: "user", durations: [] },
    rating: ratingSummary(row),
    sourceStatus: "live",
    sources: [],
    // Only the author sees their own hidden versions, so they know review is pending.
    ...(row.hidden_at ? { hidden: true } : {}),
  };
}

/**
 * @param {{ authorId?: string, viewerId?: string }} scope
 * Public listings leave out versions hidden for review and authors the viewer blocked.
 */
function listSongs(sql, url, { authorId, viewerId } = {}) {
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new CommunityError(400, "invalid_request");
  const query = normalizeSearchText((url.searchParams.get("q") ?? "").slice(0, 160));
  const tokens = query.split(" ").filter(Boolean).slice(0, 10);
  const filters = tokens.map(() => "instr(s.search_text, ?) > 0");
  const bindings = [...tokens];
  if (authorId) {
    filters.push("s.author_id = ?");
    bindings.push(authorId);
  } else {
    filters.push("s.hidden_at IS NULL");
    if (viewerId) {
      filters.push("s.author_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id = ?)");
      bindings.push(viewerId);
    }
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const order = authorId ? "s.updated_at DESC, s.id" : "rating_average DESC, rating_count DESC, s.updated_at DESC, s.id";
  const results = sql.exec(`${SELECT_SONG} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ...bindings, COMMUNITY_PAGE_SIZE + 1, offset).toArray();
  return {
    songs: results.slice(0, COMMUNITY_PAGE_SIZE).map(songResponse),
    nextOffset: results.length > COMMUNITY_PAGE_SIZE ? offset + COMMUNITY_PAGE_SIZE : null,
  };
}

async function writeSong(storage, request, existingId) {
  const { sql } = storage;
  const song = validateCommunitySong(await requestBody(request));
  if ("error" in song) throw new CommunityError(400, song.error, song.note ? { note: song.note } : {});
  const user = requireAccount(sql, request);
  if (!termsAccepted(user)) throw new CommunityError(403, "terms_required", { version: COMMUNITY_TERMS_VERSION });
  const searchText = normalizeSearchText([song.title, song.artist, user.username].join(" "));
  const id = existingId ?? `community-${crypto.randomUUID()}`;
  const values = [song.title, song.artist, song.notes, song.bpm, searchText, Date.now()];
  if (existingId) {
    const [updated] = sql.exec(`UPDATE community_songs SET title = ?, artist = ?, notes = ?, bpm = ?, search_text = ?, updated_at = ?
      WHERE id = ? AND author_id = ? RETURNING id`, ...values, id, user.id).toArray();
    if (!updated) throw new CommunityError(404, "song_not_found");
  } else {
    sql.exec(`INSERT INTO community_songs (title, artist, notes, bpm, search_text, updated_at, id, author_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, ...values, id, user.id);
  }
  const [saved] = sql.exec(`${SELECT_SONG} WHERE s.id = ?`, id).toArray();
  return songResponse(saved);
}

function songRating(sql, songId, userId = null) {
  const [row] = sql.exec(`SELECT ${RATING_FIELDS},
    (SELECT score FROM community_song_ratings WHERE song_id = s.id AND user_id = ?) AS own_score
    FROM community_songs s WHERE s.id = ?`, userId, songId).toArray();
  if (!row) throw new CommunityError(404, "song_not_found");
  return { ...ratingSummary(row), score: row.own_score };
}

async function saveRating(storage, request, songId) {
  const { sql } = storage;
  const { score } = (await requestBody(request)) ?? {};
  const user = requireAccount(sql, request);
  if (typeof score !== "number" || score < 1 || score > 5 || !Number.isInteger(score * 2)) {
    throw new CommunityError(400, "invalid_rating");
  }
  return storage.transactionSync(() => {
    const [saved] = sql.exec(`INSERT INTO community_song_ratings (song_id, user_id, score)
      SELECT id, ?, ? FROM community_songs WHERE id = ?
      ON CONFLICT(song_id, user_id) DO UPDATE SET score = excluded.score RETURNING score`, user.id, score, songId).toArray();
    if (!saved) throw new CommunityError(404, "song_not_found");
    return songRating(sql, songId, user.id);
  });
}

function moderatorAllowed(request, moderatorToken) {
  const supplied = request.headers.get("X-Moderator-Token");
  if (!moderatorToken || !supplied) return false;
  const digest = value => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(supplied), digest(moderatorToken));
}

/**
 * Moderator tools for the operator's command line (scripts/community-moderate.mjs).
 * They need the MODERATOR_TOKEN Worker secret and are never part of the app.
 */
function moderate(storage, request, method, path) {
  const { sql } = storage;
  const parts = path.split("/").slice(1);
  if (method === "GET" && parts[0] === "reports") {
    const status = new URL(request.url).searchParams.get("status") === "resolved" ? "resolved" : "open";
    const reports = sql.exec(`SELECT r.id, r.target, r.reason, r.note, r.status, r.created_at,
        reporter.username AS reporter, reported.username AS reported_user, s.id AS song_id, s.title AS song_title, s.hidden_at
      FROM community_reports r
      JOIN community_users reporter ON reporter.id = r.reporter_id
      LEFT JOIN community_users reported ON reported.id = r.reported_user_id
      LEFT JOIN community_songs s ON s.id = r.song_id
      WHERE r.status = ? ORDER BY r.created_at LIMIT 200`, status).toArray();
    return Response.json({ reports });
  }
  if (method === "POST" && parts[0] === "reports" && parts[2] === "resolve") {
    const [resolved] = sql.exec("UPDATE community_reports SET status = 'resolved' WHERE id = ? RETURNING id", parts[1] ?? "").toArray();
    if (!resolved) throw new CommunityError(404, "report_not_found");
    return new Response(null, { status: 204 });
  }
  if (parts[0] === "songs" && SONG_ID.test(parts[1] ?? "")) {
    const songId = parts[1];
    if (method === "POST" && (parts[2] === "hide" || parts[2] === "restore")) {
      const [song] = sql.exec("UPDATE community_songs SET hidden_at = ? WHERE id = ? RETURNING id",
        parts[2] === "hide" ? Date.now() : null, songId).toArray();
      if (!song) throw new CommunityError(404, "song_not_found");
      if (parts[2] === "restore") sql.exec("UPDATE community_reports SET status = 'resolved' WHERE song_id = ?", songId);
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE" && parts.length === 2) {
      sql.exec("DELETE FROM community_song_ratings WHERE song_id = ?", songId);
      sql.exec("DELETE FROM community_reports WHERE song_id = ?", songId);
      const [removed] = sql.exec("DELETE FROM community_songs WHERE id = ? RETURNING id", songId).toArray();
      if (!removed) throw new CommunityError(404, "song_not_found");
      return new Response(null, { status: 204 });
    }
  }
  // Deletion requests sent by email (for example from members who forgot their password).
  if (method === "DELETE" && parts[0] === "users" && parts.length === 2) {
    const user = findUser(sql, decodeURIComponent(parts[1] ?? ""));
    removeMember(storage, user.id);
    return new Response(null, { status: 204 });
  }
  if (method === "POST" && parts[0] === "users" && (parts[2] === "suspend" || parts[2] === "unsuspend")) {
    const user = findUser(sql, decodeURIComponent(parts[1] ?? ""));
    sql.exec("UPDATE community_users SET suspended_at = ? WHERE id = ?", parts[2] === "suspend" ? Date.now() : null, user.id);
    if (parts[2] === "suspend") sql.exec("DELETE FROM community_sessions WHERE user_id = ?", user.id);
    return new Response(null, { status: 204 });
  }
  return Response.json({ error: "not_found" }, { status: 404 });
}

/** @param {{ moderatorToken?: string }} [options] */
export async function handleCommunity(request, storage, options = {}) {
  const { sql } = storage;
  const url = new URL(request.url);
  const path = url.pathname.slice(COMMUNITY_PATH.length + 1);
  const method = request.method;
  try {
    if (path.startsWith("moderation/")) {
      if (!moderatorAllowed(request, options.moderatorToken)) return Response.json({ error: "not_found" }, { status: 404 });
      return moderate(storage, request, method, path);
    }
    if (method === "GET" && path === "songs") {
      return Response.json(listSongs(sql, url, { viewerId: optionalAccount(sql, request)?.id }));
    }
    if (method === "GET" && path === "session") {
      const user = requireAccount(sql, request);
      return Response.json({ username: user.username, termsAccepted: termsAccepted(user) });
    }
    if (method === "GET" && path === "mine") {
      const user = requireAccount(sql, request);
      return Response.json(listSongs(sql, url, { authorId: user.id }));
    }
    if (method === "POST" && path === "terms") return Response.json(await acceptTerms(storage, request));
    if (method === "POST" && path === "reports") return Response.json(await report(storage, request), { status: 201 });
    if (method === "GET" && path === "blocks") return Response.json(listBlocks(sql, requireAccount(sql, request)));
    if (method === "POST" && path === "blocks") return Response.json(await block(storage, request), { status: 201 });
    if (method === "DELETE" && path.startsWith("blocks/")) {
      const user = requireAccount(sql, request);
      const blocked = findUser(sql, decodeURIComponent(path.slice("blocks/".length)));
      sql.exec("DELETE FROM community_blocks WHERE blocker_id = ? AND blocked_id = ?", user.id, blocked.id);
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE" && path === "account") {
      await deleteAccount(storage, request);
      return new Response(null, { status: 204 });
    }
    if (method === "POST" && (path === "register" || path === "login")) {
      const register = path === "register";
      return Response.json(await signIn(request, storage, register), { status: register ? 201 : 200 });
    }
    if (method === "POST" && path === "logout") {
      const hash = requestSession(request);
      if (hash) sql.exec("DELETE FROM community_sessions WHERE token_hash = ?", hash);
      return new Response(null, { status: 204 });
    }
    const updateId = path.startsWith("songs/") ? path.slice(6) : "";
    const ratingId = updateId.endsWith("/rating") ? updateId.slice(0, -"/rating".length) : "";
    if (SONG_ID.test(ratingId)) {
      if (method === "GET") {
        const user = request.headers.has("Authorization") ? requireAccount(sql, request) : null;
        return Response.json(songRating(sql, ratingId, user?.id));
      }
      if (method === "PUT") return Response.json(await saveRating(storage, request, ratingId));
    }
    if (method === "DELETE" && SONG_ID.test(updateId)) {
      const user = requireAccount(sql, request);
      const [removed] = sql.exec("DELETE FROM community_songs WHERE id = ? AND author_id = ? RETURNING id",
        updateId, user.id).toArray();
      if (!removed) throw new CommunityError(404, "song_not_found");
      return new Response(null, { status: 204 });
    }
    const create = method === "POST" && path === "songs";
    const update = method === "PUT" && SONG_ID.test(updateId);
    if (create || update) {
      return Response.json(await writeSong(storage, request, update ? updateId : null), { status: create ? 201 : 200 });
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    if (error instanceof CommunityError) return Response.json(error.payload, { status: error.status });
    console.error("Community request failed", { route: path.split("/")[0], error: error?.name });
    return Response.json({ error: "community_unavailable" }, { status: 503 });
  }
}
