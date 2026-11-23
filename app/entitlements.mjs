/**
 * Free limits and premium access for the installed app (engineering/monetization.md).
 * Pure logic over a Storage-like object so it runs in Node tests and in the app.
 * The web build never creates it: without a monetization provider nothing is gated.
 *
 * @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} KeyValueStore
 * @typedef {"monthly" | "yearly" | "lifetime"} PremiumPlan
 * @typedef {{ plan: PremiumPlan, productId: string, expiresAt: number | null, checkedAt: number }} PremiumGrant
 * @typedef {{ allowed: boolean, used: number, limit: number }} QuotaResult
 */

export const ENTITLEMENTS_KEY = "twnc-entitlements";

export const FREE_LIMITS = Object.freeze({
  /** Units 1 and 2 of the course. */
  freeLessons: 8,
  songFollowsPerDay: 3,
  transcriptionsPerMonth: 3,
  /** A rewarded ad opens one locked lesson for this long. */
  lessonUnlockHours: 24,
  /** Fair-use ceiling for premium transcriptions on the audio server. */
  premiumTranscriptionsPerMonth: 100,
  /** How long a verified subscription stays usable without reaching the store. */
  offlineGraceDays: 7,
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MAX_SONG_KEYS = 200;

function pad(value) {
  return String(value).padStart(2, "0");
}

/** Local calendar day, so the daily allowance resets at the user's midnight. */
export function dayKey(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthKey(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function emptyState() {
  return {
    premium: null,
    lessonUnlocks: {},
    follows: { day: "", songs: [], bonus: 0 },
    transcriptions: { month: "", used: 0, bonus: 0 },
  };
}

function isPlan(value) {
  return value === "monthly" || value === "yearly" || value === "lifetime";
}

/** Reads saved state defensively: anything malformed falls back to the free defaults. */
function parseState(raw) {
  const state = emptyState();
  if (!raw) return state;
  let saved;
  try { saved = JSON.parse(raw); } catch { return state; }
  if (!saved || typeof saved !== "object") return state;
  const premium = saved.premium;
  if (premium && isPlan(premium.plan) && typeof premium.productId === "string"
    && (premium.expiresAt === null || Number.isFinite(premium.expiresAt)) && Number.isFinite(premium.checkedAt)) {
    state.premium = { plan: premium.plan, productId: premium.productId, expiresAt: premium.expiresAt, checkedAt: premium.checkedAt };
  }
  if (saved.lessonUnlocks && typeof saved.lessonUnlocks === "object") {
    for (const [id, until] of Object.entries(saved.lessonUnlocks)) {
      if (Number.isFinite(until)) state.lessonUnlocks[id] = until;
    }
  }
  const follows = saved.follows;
  if (follows && typeof follows.day === "string" && Array.isArray(follows.songs)) {
    state.follows = {
      day: follows.day,
      songs: follows.songs.filter(song => typeof song === "string").slice(-MAX_SONG_KEYS),
      bonus: Number.isInteger(follows.bonus) && follows.bonus > 0 ? follows.bonus : 0,
    };
  }
  const transcriptions = saved.transcriptions;
  if (transcriptions && typeof transcriptions.month === "string") {
    state.transcriptions = {
      month: transcriptions.month,
      used: Number.isInteger(transcriptions.used) && transcriptions.used > 0 ? transcriptions.used : 0,
      bonus: Number.isInteger(transcriptions.bonus) && transcriptions.bonus > 0 ? transcriptions.bonus : 0,
    };
  }
  return state;
}

/**
 * @param {{ storage: KeyValueStore, now?: () => number, limits?: Partial<typeof FREE_LIMITS> }} options
 */
export function createEntitlements({ storage, now = () => Date.now(), limits = {} }) {
  const settings = { ...FREE_LIMITS, ...limits };
  const listeners = new Set();
  let cache = null;

  function read() {
    if (!cache) {
      let raw = null;
      try { raw = storage.getItem(ENTITLEMENTS_KEY); } catch { /* Fall back to defaults. */ }
      cache = parseState(raw);
    }
    return cache;
  }

  function write(state) {
    cache = state;
    try { storage.setItem(ENTITLEMENTS_KEY, JSON.stringify(state)); } catch { /* Keep this session's state. */ }
    for (const listener of listeners) listener();
  }

  function followsToday(state, time) {
    const day = dayKey(time);
    return state.follows.day === day ? state.follows : { day, songs: [], bonus: 0 };
  }

  function transcriptionsThisMonth(state, time) {
    const month = monthKey(time);
    return state.transcriptions.month === month ? state.transcriptions : { month, used: 0, bonus: 0 };
  }

  function isPremium() {
    const grant = read().premium;
    if (!grant) return false;
    if (grant.expiresAt === null) return true;
    const time = now();
    // A subscription usually renews on its expiry date. Until the store can be
    // asked again, the last confirmation stays good for the grace period.
    return grant.expiresAt > time || time < grant.checkedAt + settings.offlineGraceDays * DAY;
  }

  function followQuota(songKey) {
    const state = read();
    const time = now();
    const today = followsToday(state, time);
    const limit = settings.songFollowsPerDay + today.bonus;
    const used = today.songs.length;
    if (isPremium()) return { allowed: true, used, limit: Infinity, today };
    // Following the same song again the same day is free.
    const allowed = today.songs.includes(songKey) || used < limit;
    return { allowed, used, limit, today };
  }

  function transcriptionQuota() {
    const month = transcriptionsThisMonth(read(), now());
    const limit = isPremium() ? settings.premiumTranscriptionsPerMonth : settings.transcriptionsPerMonth + month.bonus;
    return { allowed: month.used < limit, used: month.used, limit, month };
  }

  return {
    limits: settings,

    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** A cheap value that changes whenever anything visible changes; for useSyncExternalStore. */
    snapshot() {
      return cache ?? read();
    },

    isPremium,

    /** @returns {PremiumGrant | null} */
    premium() {
      return read().premium;
    },

    /**
     * Records a purchase the store (or the verification Worker) confirmed.
     * @param {{ plan: PremiumPlan, productId: string, expiresAt?: number | null }} grant
     */
    grantPremium({ plan, productId, expiresAt = null }) {
      if (!isPlan(plan)) throw new Error(`Unknown plan: ${plan}`);
      if (expiresAt !== null && !Number.isFinite(expiresAt)) throw new Error("expiresAt must be a time or null");
      write({ ...read(), premium: { plan, productId, expiresAt: plan === "lifetime" ? null : expiresAt, checkedAt: now() } });
    },

    /** The store no longer reports an active purchase (cancelled, refunded or expired). */
    revokePremium() {
      if (read().premium) write({ ...read(), premium: null });
    },

    /**
     * @param {number} index Position of the lesson in the whole course (0-based).
     * @param {string} id
     * @returns {"free" | "premium" | "unlocked" | "locked"}
     */
    lessonAccess(index, id) {
      if (index < settings.freeLessons) return "free";
      if (isPremium()) return "premium";
      const until = read().lessonUnlocks[id];
      return until && until > now() ? "unlocked" : "locked";
    },

    /** Reward for watching an ad: opens one locked lesson for a day. */
    unlockLesson(id) {
      const time = now();
      const lessonUnlocks = Object.fromEntries(Object.entries(read().lessonUnlocks).filter(([, until]) => until > time));
      lessonUnlocks[id] = time + settings.lessonUnlockHours * HOUR;
      write({ ...read(), lessonUnlocks });
    },

    /** @returns {QuotaResult} */
    peekSongFollow(songKey) {
      const { allowed, used, limit } = followQuota(songKey);
      return { allowed, used, limit };
    },

    /** Counts a new song for today when following starts. Repeats of the same song are free. */
    useSongFollow(songKey) {
      const { allowed, used, limit, today } = followQuota(songKey);
      if (!allowed) return { allowed, used, limit };
      if (today.songs.includes(songKey)) {
        if (read().follows !== today) write({ ...read(), follows: today });
        return { allowed, used, limit };
      }
      write({ ...read(), follows: { ...today, songs: [...today.songs, songKey].slice(-MAX_SONG_KEYS) } });
      return { allowed, used: used + 1, limit };
    },

    /** Reward for watching an ad: one more song today. */
    grantSongFollow() {
      const today = followsToday(read(), now());
      write({ ...read(), follows: { ...today, bonus: today.bonus + 1 } });
    },

    /** @returns {QuotaResult} */
    peekTranscription() {
      const { allowed, used, limit } = transcriptionQuota();
      return { allowed, used, limit };
    },

    /** Counts a transcription once it has produced notes; failed attempts are free. */
    recordTranscription() {
      const { month } = transcriptionQuota();
      write({ ...read(), transcriptions: { ...month, used: month.used + 1 } });
    },

    /** Reward for watching an ad: one more transcription this month. */
    grantTranscription() {
      const { month } = transcriptionQuota();
      write({ ...read(), transcriptions: { ...month, bonus: month.bonus + 1 } });
    },
  };
}
