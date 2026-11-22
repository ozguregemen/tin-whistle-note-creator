"use client";

import { useId, useState, type FormEvent } from "react";
import { MAX_REPORT_NOTE, REPORT_REASONS } from "../shared/community-moderation.mjs";
import { blockCommunityUser, communityIssue, reportCommunity, type CommunityReportReason, type CommunitySession } from "./community-client";

const copy = {
  en: {
    report: "Report", block: "Block member", cancel: "Cancel",
    reportTitle: "Report", reportWhat: "What are you reporting?",
    thisVersion: "This version", thisMember: (username: string) => `The member @${username}`,
    reason: "Reason", note: "Details (optional)", send: "Send report", sending: "Sending…",
    reasons: { offensive: "Offensive or hateful", harassment: "Harassment", spam: "Spam or advertising", copyright: "Copyright or lyrics", other: "Something else" },
    reported: "Thank you. Your report was sent to the moderators. Versions reported by several members are hidden until they are reviewed.",
    blockTitle: (username: string) => `Block @${username}?`,
    blockHelp: "You will no longer see this member's versions in the catalog or search. You can unblock them from My contributions.",
    blockConfirm: "Block", blocking: "Blocking…",
    blocked: (username: string) => `@${username} is blocked. Their versions are hidden for you.`,
    signInHelp: "Sign in to report or block.", signIn: "Sign in",
    failed: "This could not be sent. Try again in a moment.",
  },
  tr: {
    report: "Bildir", block: "Üyeyi engelle", cancel: "Vazgeç",
    reportTitle: "Bildir", reportWhat: "Neyi bildiriyorsun?",
    thisVersion: "Bu sürümü", thisMember: (username: string) => `@${username} üyesini`,
    reason: "Neden", note: "Ayrıntı (isteğe bağlı)", send: "Bildirimi gönder", sending: "Gönderiliyor…",
    reasons: { offensive: "Rahatsız edici veya nefret içerikli", harassment: "Taciz", spam: "Spam veya reklam", copyright: "Telif hakkı veya şarkı sözü", other: "Başka bir neden" },
    reported: "Teşekkürler. Bildirimin moderatörlere iletildi. Birden fazla üyenin bildirdiği sürümler incelenene kadar gizlenir.",
    blockTitle: (username: string) => `@${username} engellensin mi?`,
    blockHelp: "Bu üyenin sürümlerini artık katalogda ve aramada görmeyeceksin. Engeli Katkılarım bölümünden kaldırabilirsin.",
    blockConfirm: "Engelle", blocking: "Engelleniyor…",
    blocked: (username: string) => `@${username} engellendi. Sürümleri senin için gizlendi.`,
    signInHelp: "Bildirmek veya engellemek için giriş yap.", signIn: "Giriş yap",
    failed: "Gönderilemedi. Birazdan tekrar dene.",
  },
};

type Language = keyof typeof copy;

/** Report and block controls for a community version; hidden on the member's own versions. */
export function CommunitySafetyActions({ language, songId, contributor, session, onSignIn, onSessionExpired, onBlocked }: {
  language: Language;
  songId: string;
  contributor: string;
  session: CommunitySession | null | undefined;
  onSignIn: () => void;
  onSessionExpired: () => void;
  onBlocked: (username: string) => void;
}) {
  const t = copy[language];
  const id = useId();
  const [mode, setMode] = useState<"idle" | "report" | "block">("idle");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"reported" | "blocked" | "failed" | null>(null);
  const [target, setTarget] = useState<"song" | "user">("song");

  if (session?.username === contributor) return null;

  function open(next: "report" | "block") {
    setStatus(null);
    if (!session) { onSignIn(); return; }
    setMode(next);
  }

  async function sendReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const values = new FormData(event.currentTarget);
    const reason = String(values.get("reason")) as CommunityReportReason;
    const note = String(values.get("note") ?? "").trim();
    setBusy(true);
    try {
      await reportCommunity(session.token, target === "song"
        ? { target: "song", songId, reason, note }
        : { target: "user", username: contributor, reason, note });
      setStatus("reported");
      setMode("idle");
    } catch (error) {
      if (communityIssue(error).error === "sign_in_required") onSessionExpired();
      else setStatus("failed");
    } finally {
      setBusy(false);
    }
  }

  async function block() {
    if (!session) return;
    setBusy(true);
    try {
      await blockCommunityUser(session.token, contributor);
      setMode("idle");
      setStatus("blocked");
      onBlocked(contributor);
    } catch (error) {
      if (communityIssue(error).error === "sign_in_required") onSessionExpired();
      else setStatus("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="community-safety" aria-label={`${t.report} · ${t.block}`}>
      {mode === "idle" && status !== "blocked" && (
        <div className="community-row-actions">
          <button type="button" className="secondary-action" aria-haspopup={session ? undefined : "dialog"} onClick={() => open("report")}>⚑ {t.report}</button>
          <button type="button" className="secondary-action" aria-haspopup={session ? undefined : "dialog"} onClick={() => open("block")}>⊘ {t.block}</button>
          {!session && <small>{t.signInHelp}</small>}
        </div>
      )}
      {mode === "report" && (
        <form className="community-report" onSubmit={sendReport} aria-labelledby={`${id}-report`}>
          <h3 id={`${id}-report`}>{t.reportTitle}</h3>
          <fieldset>
            <legend>{t.reportWhat}</legend>
            <label className="community-check"><input type="radio" name="target" value="song" checked={target === "song"} onChange={() => setTarget("song")} /> <span>{t.thisVersion}</span></label>
            <label className="community-check"><input type="radio" name="target" value="user" checked={target === "user"} onChange={() => setTarget("user")} /> <span>{t.thisMember(contributor)}</span></label>
          </fieldset>
          <div className="community-field">
            <label htmlFor={`${id}-reason`}>{t.reason}</label>
            <select id={`${id}-reason`} name="reason" required defaultValue="offensive">
              {REPORT_REASONS.map(reason => <option key={reason} value={reason}>{t.reasons[reason as CommunityReportReason]}</option>)}
            </select>
          </div>
          <div className="community-field">
            <label htmlFor={`${id}-note`}>{t.note}</label>
            <textarea id={`${id}-note`} name="note" maxLength={MAX_REPORT_NOTE} rows={3} />
          </div>
          <div className="community-row-actions">
            <button type="button" className="secondary-action" disabled={busy} onClick={() => setMode("idle")}>{t.cancel}</button>
            <button type="submit" className="community-primary" disabled={busy}>{busy ? t.sending : t.send}</button>
          </div>
        </form>
      )}
      {mode === "block" && (
        <div className="community-block-confirm" role="group" aria-labelledby={`${id}-block`} aria-describedby={`${id}-block-help`}>
          <p id={`${id}-block`}><strong>{t.blockTitle(contributor)}</strong></p>
          <p id={`${id}-block-help`}>{t.blockHelp}</p>
          <div className="community-row-actions">
            <button type="button" className="secondary-action" disabled={busy} onClick={() => setMode("idle")}>{t.cancel}</button>
            <button type="button" className="community-primary community-delete-submit" disabled={busy} onClick={() => void block()}>{busy ? t.blocking : t.blockConfirm}</button>
          </div>
        </div>
      )}
      {status === "reported" && <p className="community-delete-status" role="status">✓ {t.reported}</p>}
      {status === "blocked" && <p className="community-delete-status" role="status">✓ {t.blocked(contributor)}</p>}
      {status === "failed" && <p className="community-error" role="alert">{t.failed}</p>}
    </section>
  );
}
