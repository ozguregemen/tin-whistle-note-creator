"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  communityIssue, communityRequest, type CommunityRating, type CommunityRatingDetails, type CommunitySession,
} from "./community-client";

const copy = {
  en: {
    heading: "Version rating", signIn: "Sign in to rate", scale: "Your rating out of 5",
    stars: (value: number) => `${value} ${value === 1 ? "star" : "stars"}`,
    voteCount: (count: number, formatted: string) => `${formatted} ${count === 1 ? "vote" : "votes"}`,
    vote: (score: number) => `Your saved rating is ${score}/5`,
    save: "Save rating", saving: "Saving…", saved: "Rating saved.", loading: "Loading rating…",
    loadError: "The latest rating could not be loaded.", error: "Your rating could not be saved. Try again.",
    rateLimit: "Wait a moment and try again.",
  },
  tr: {
    heading: "Sürüm puanı", signIn: "Puan vermek için giriş yap", scale: "5 üzerinden puanın",
    stars: (value: number) => `${value} yıldız`,
    voteCount: (_count: number, formatted: string) => `${formatted} oy`,
    vote: (score: number) => `Kayıtlı puanın ${score}/5`,
    save: "Puanı kaydet", saving: "Kaydediliyor…", saved: "Puanın kaydedildi.", loading: "Puan yükleniyor…",
    loadError: "Güncel puan yüklenemedi.", error: "Puanın kaydedilemedi. Tekrar dene.",
    rateLimit: "Biraz bekleyip tekrar dene.",
  },
};

type Language = keyof typeof copy;

export function CommunityRatingSummary({ rating, language }: { rating?: CommunityRating; language: Language }) {
  const count = rating?.count ?? 0;
  const t = copy[language];
  const votes = t.voteCount(count, new Intl.NumberFormat(language).format(count));
  const average = rating?.average == null ? null : new Intl.NumberFormat(language, {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(rating.average);

  return (
    <span className="version-rating-summary">
      <span className="version-rating-symbol" aria-hidden="true">★</span>
      {average !== null && <strong>{average}<span className="sr-only">/5</span></strong>}
      <span className="version-rating-count">{average !== null ? `(${votes})` : votes}</span>
    </span>
  );
}

export function SongRating({ songId, rating, language, session, onSignIn, onSessionExpired, onSaved }: {
  songId: string;
  rating?: CommunityRating;
  language: Language;
  session: CommunitySession | null | undefined;
  onSignIn: () => void;
  onSessionExpired: () => void;
  onSaved: (songId: string, rating: CommunityRating) => void;
}) {
  const t = copy[language];
  const [detail, setDetail] = useState<CommunityRatingDetails | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"saved" | "error" | "loadError" | "rateLimit" | null>(null);
  const selected = draft ?? detail?.score ?? null;
  const path = `songs/${songId}/rating`;
  const feedback = loading ? t.loading : notice === "saved" ? t.saved : detail?.score == null ? "" : t.vote(detail.score);

  useEffect(() => {
    if (session === undefined) return;
    const controller = new AbortController();
    void communityRequest<CommunityRatingDetails>(path, { token: session?.token, signal: controller.signal })
      .then(rating => { if (!controller.signal.aborted) setDetail(rating); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (communityIssue(error).error === "sign_in_required") onSessionExpired();
        else setNotice("loadError");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, session, onSessionExpired]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || selected === null || selected === detail?.score || saving || loading) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await communityRequest<CommunityRatingDetails>(path, {
        method: "PUT", token: session.token, body: { score: selected },
      });
      setDetail(result);
      setDraft(null);
      setNotice("saved");
      onSaved(songId, { average: result.average, count: result.count });
    } catch (error) {
      const { error: code } = communityIssue(error);
      if (code === "sign_in_required") onSessionExpired();
      else setNotice(code === "try_later" ? "rateLimit" : "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="version-rating" aria-labelledby="version-rating-title">
      <div className="version-rating-overview">
        <h2 id="version-rating-title">{t.heading}</h2>
        <CommunityRatingSummary rating={detail ?? rating} language={language} />
      </div>
      {session ? (
        <form className="version-rating-form" onSubmit={save}>
          <fieldset className="version-rating-stars" disabled={saving || loading}>
            <legend className="sr-only">{t.scale}</legend>
            {[1, 2, 3, 4, 5].map(value => {
              const filled = value <= (selected ?? 0);
              return (
                <label key={value} className="version-rating-star" data-filled={filled}>
                  <input type="radio" name="version-rating" value={value} aria-label={t.stars(value)}
                    checked={value === selected} onChange={() => { setDraft(value); setNotice(null); }} />
                  <span aria-hidden="true">{filled ? "★" : "☆"}</span>
                </label>
              );
            })}
          </fieldset>
          <button className="community-primary" type="submit" disabled={saving || loading || selected === null || selected === detail?.score}>
            {saving ? t.saving : t.save}
          </button>
        </form>
      ) : session === null ? (
        <button className="secondary-action" type="button" aria-haspopup="dialog" onClick={onSignIn}>{t.signIn}</button>
      ) : null}
      {session && feedback && <p className="version-rating-feedback" role="status">{feedback}</p>}
      {notice && notice !== "saved" && <p className="version-rating-feedback" role="alert">{t[notice]}</p>}
    </section>
  );
}
