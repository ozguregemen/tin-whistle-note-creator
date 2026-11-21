import { COMMUNITY_PATH } from "../shared/community-song.mjs";

export type CommunityRating = { average: number | null; count: number };
export type CommunityRatingDetails = CommunityRating & { score: number | null };

export type CommunitySong = {
  id: string;
  title: string;
  artist?: string;
  contributor: string;
  aliases: string[];
  subtitle: { en: string; tr: string };
  difficulty: { en: string; tr: string };
  notes: string;
  rhythm: { bpm: number; source: "estimated"; tempoSource: "user"; durations: number[][] };
  rating: CommunityRating;
  sourceStatus: "live";
  sources: [];
};

export type CommunitySession = { username: string; token: string; expiresAt: number };
export type CommunityPage = { songs: CommunitySong[]; nextOffset: number | null };
const SESSION_STORAGE_KEY = "twnc-community-session";
const COMMUNITY_API_URL = "https://tin-whistle-community.ozguregemenbusiness.workers.dev";

export class CommunityRequestError extends Error {
  constructor(public code: string, public detail?: string) { super(code); }
}

export type CommunityIssue = { error: string; note?: string };

export function communityIssue(error: unknown): CommunityIssue {
  return error instanceof CommunityRequestError
    ? { error: error.code, note: error.detail }
    : { error: "community_unavailable" };
}

export function readCommunitySession(): CommunitySession | null {
  try {
    const session = JSON.parse(window.sessionStorage.getItem(SESSION_STORAGE_KEY) ?? "null") as CommunitySession | null;
    if (session && session.expiresAt > Date.now() && /^[a-f0-9]{64}$/.test(session.token)) return session;
  } catch { /* Storage may be unavailable. */ }
  return null;
}

export function storeCommunitySession(session: CommunitySession | null) {
  try {
    if (session) window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch { /* The in-memory session still works. */ }
}

type RequestOptions = { method?: "GET" | "POST" | "PUT"; body?: object; token?: string; signal?: AbortSignal };

export async function communityRequest<T>(path: string, { method = "GET", body, token, signal }: RequestOptions = {}): Promise<T> {
  const config = window as Window & { __TWNC_COMMUNITY_API_URL__?: string };
  const base = (config.__TWNC_COMMUNITY_API_URL__ || COMMUNITY_API_URL).replace(/\/$/, "");
  const headers = new Headers({ Accept: "application/json" });
  if (body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${base}${COMMUNITY_PATH}/${path}`, {
      method, headers, signal, cache: "no-store", credentials: "omit", redirect: "error",
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new CommunityRequestError("community_unavailable");
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new CommunityRequestError(data?.error ?? "community_unavailable", data?.note);
  if (data === null) throw new CommunityRequestError("community_unavailable");
  return data as T;
}

export function listCommunitySongs(query: string, offset = 0, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query, offset: String(offset) });
  return communityRequest<CommunityPage>(`songs?${params}`, { signal });
}
