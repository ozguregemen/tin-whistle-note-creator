import { normalizeSearchText } from "../app/search-relevance.mjs";

/**
 * Community safety rules shared by the app and the community Worker.
 * Titles, artists and usernames are the only free text members publish, so a
 * short whole-word list catches the most common abuse without blocking real
 * song titles. Reports and moderation handle everything the list misses.
 */

export const REPORT_REASONS = Object.freeze(["offensive", "harassment", "spam", "copyright", "other"]);
export const MAX_REPORT_NOTE = 500;
// A version reported by this many different members is hidden until a moderator reviews it.
export const AUTO_HIDE_REPORTS = 3;

// Whole words after Turkish/English normalization (lowercase, no diacritics).
const BLOCKED_WORDS = new Set([
  "fuck", "fucking", "motherfucker", "cunt", "nigger", "nigga", "faggot", "retard", "whore", "slut",
  "amk", "aq", "amina", "amcik", "orospu", "orospucocugu", "pic", "sikerim", "siktir", "sikik", "yarrak", "yarak", "gavat", "kahpe", "pezevenk",
]);

/** @param {string} text */
export function containsBlockedWord(text) {
  if (typeof text !== "string" || !text) return false;
  const normalized = normalizeSearchText(text);
  return normalized.split(" ").some(word => BLOCKED_WORDS.has(word))
    // Catch the same words hidden with separators, such as "f.u.c.k" or "s-i-k-t-i-r".
    || [...BLOCKED_WORDS].some(word => word.length >= 4 && normalized.replaceAll(" ", "") === word);
}

export const COMMUNITY_TERMS = Object.freeze({
  en: [
    "Share only arrangements you made yourself or are allowed to share. Do not post song lyrics.",
    "No hateful, harassing, sexual, violent or otherwise offensive titles, names or content.",
    "No spam, advertising or misleading versions.",
    "Members can report versions and users. Moderators may hide or remove content and suspend accounts that break these rules.",
    "You can delete your songs or your whole account at any time from My contributions.",
  ],
  tr: [
    "Yalnızca kendi hazırladığın ya da paylaşma iznin olan düzenlemeleri paylaş. Şarkı sözü paylaşma.",
    "Nefret söylemi, taciz, cinsel, şiddet içeren veya başka şekilde rahatsız edici başlık, ad ya da içerik paylaşma.",
    "Spam, reklam veya yanıltıcı sürüm paylaşma.",
    "Üyeler sürümleri ve kullanıcıları bildirebilir. Moderatörler bu kurallara uymayan içeriği gizleyebilir, kaldırabilir ve hesapları askıya alabilir.",
    "Şarkılarını veya hesabının tamamını istediğin zaman Katkılarım bölümünden silebilirsin.",
  ],
});
