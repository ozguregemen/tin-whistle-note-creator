"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { COMMUNITY_TERMS_VERSION, MAX_COMMUNITY_PASSWORD_LENGTH, MIN_COMMUNITY_PASSWORD_LENGTH } from "../shared/community-auth.mjs";
import { COMMUNITY_TERMS } from "../shared/community-moderation.mjs";
import {
  acceptCommunityTerms, communityIssue, communityRequest, deleteCommunityAccount, listBlockedUsers, readCommunitySession,
  storeCommunitySession, unblockCommunityUser,
  type CommunityPage, type CommunitySession, type CommunitySong,
} from "./community-client";
import { LegalLinks } from "./legal-links";
import { SongEditor, type EditorSource } from "./song-editor";

const passwordLengthRange = `${MIN_COMMUNITY_PASSWORD_LENGTH}–${MAX_COMMUNITY_PASSWORD_LENGTH}`;

const copy = {
  en: {
    signIn: "Sign in", signUp: "Create account", close: "Close", checking: "Checking your session…",
    username: "Username", password: "Password", show: "Show", hide: "Hide", showPassword: "Show password", hidePassword: "Hide password",
    usernameHint: "Use 3–24 characters. Start with A–Z or a number. Dots, underscores and hyphens are also allowed.",
    passwordHint: `Use ${passwordLengthRange} characters.`, registered: "Already have an account?", newHere: "New here?",
    registerHelp: "Create a username and password to share your tin whistle arrangements.",
    signInHelp: "Sign in to manage your contributions.",
    addHelp: "An account lets you add songs to the catalog under your username.",
    editHelp: (title: string) => `Sign in or create an account to work on ${title}.`,
    ratingHelp: "Sign in or create an account to rate this version.",
    expired: "Your session ended. Sign in to keep working on this arrangement.",
    signingIn: "Signing in…", registering: "Creating account…", signingOut: "Signing out…", signOut: "Sign out",
    contributions: "My contributions", add: "Add song", listen: "Listen", edit: "Edit", arrange: "Create your version", editSong: "Edit song",
    delete: "Delete", cancelDelete: "Cancel", confirmDelete: "Delete song", deleting: "Deleting…",
    deleteTitle: (title: string) => `Delete “${title}”?`,
    deleteHelp: "This permanently removes your arrangement and its ratings from the catalog.",
    deleted: (title: string) => `“${title}” was deleted from the catalog.`,
    deleteFailed: "The song could not be deleted. Try again.",
    empty: "Your published arrangements will appear here.", loading: "Loading your contributions…", more: "Show more", retry: "Try again",
    hiddenForReview: "Hidden while reports are reviewed",
    termsTitle: "Community rules", acceptTerms: "I have read and accept the community rules.",
    termsGateTitle: "Accept the community rules to share", termsGateHelp: "Before you post or edit a version, read and accept these rules.",
    termsAccept: "Accept and continue", termsAccepting: "Saving…",
    blockedTitle: "Blocked members", blockedEmpty: "You have not blocked anyone.", unblock: "Unblock",
    unblockLabel: (username: string) => `Unblock @${username}`,
    deleteAccount: "Delete account", deleteAccountTitle: "Delete your account?",
    deleteAccountHelp: "This permanently deletes your account, all of your arrangements, the ratings you gave and received, your reports and your block list. It cannot be undone.",
    deleteAccountPassword: "Enter your password to confirm", deleteAccountConfirm: "Delete my account", deletingAccount: "Deleting account…",
    accountDeleted: "Your account and all of its data were deleted.",
    errors: {
      content_not_allowed: "This text is not allowed in the community. Choose different wording.",
      account_suspended: "This account is suspended because of reports. Contact support if you think this is a mistake.",
      terms_required: "Accept the community rules before posting.",
      invalid_username: "Enter a username of 3–24 characters using letters, numbers, dots, hyphens or underscores.",
      invalid_password: `Enter a password with ${passwordLengthRange} characters.`,
      username_taken: "This username is taken. Choose another one or sign in.",
      incorrect_credentials: "The username or password is incorrect.",
      try_later: "Too many attempts. Wait a moment and try again.",
      community_unavailable: "The account service is temporarily unavailable. Try again in a moment.",
    },
  },
  tr: {
    signIn: "Giriş yap", signUp: "Hesap oluştur", close: "Kapat", checking: "Oturum kontrol ediliyor…",
    username: "Kullanıcı adı", password: "Şifre", show: "Göster", hide: "Gizle", showPassword: "Şifreyi göster", hidePassword: "Şifreyi gizle",
    usernameHint: "3–24 karakter. A–Z arası bir harf veya rakamla başla. Nokta, alt çizgi ve kısa çizgi de kullanabilirsin.",
    passwordHint: `${passwordLengthRange} karakter kullan.`, registered: "Zaten hesabın var mı?", newHere: "Hesabın yok mu?",
    registerHelp: "Tin whistle düzenlemelerini paylaşmak için bir kullanıcı adı ve şifre oluştur.",
    signInHelp: "Katkılarını yönetmek için giriş yap.",
    addHelp: "Kataloğa kendi kullanıcı adınla şarkı eklemek için hesap oluştur veya giriş yap.",
    editHelp: (title: string) => `${title} üzerinde çalışmak için giriş yap veya hesap oluştur.`,
    ratingHelp: "Bu sürüme puan vermek için giriş yap veya hesap oluştur.",
    expired: "Oturumun sona erdi. Bu düzenlemeye devam etmek için giriş yap.",
    signingIn: "Giriş yapılıyor…", registering: "Hesap oluşturuluyor…", signingOut: "Çıkış yapılıyor…", signOut: "Çıkış yap",
    contributions: "Katkılarım", add: "Şarkı ekle", listen: "Dinle", edit: "Düzenle", arrange: "Kendi sürümünü oluştur", editSong: "Şarkıyı düzenle",
    delete: "Sil", cancelDelete: "Vazgeç", confirmDelete: "Şarkıyı sil", deleting: "Siliniyor…",
    deleteTitle: (title: string) => `“${title}” silinsin mi?`,
    deleteHelp: "Bu işlem düzenlemeni ve aldığı puanları katalogdan kalıcı olarak kaldırır.",
    deleted: (title: string) => `“${title}” katalogdan silindi.`,
    deleteFailed: "Şarkı silinemedi. Tekrar dene.",
    empty: "Yayımladığın düzenlemeler burada görünecek.", loading: "Katkıların yükleniyor…", more: "Daha fazla göster", retry: "Tekrar dene",
    hiddenForReview: "Bildirimler incelenirken gizlendi",
    termsTitle: "Topluluk kuralları", acceptTerms: "Topluluk kurallarını okudum ve kabul ediyorum.",
    termsGateTitle: "Paylaşmak için topluluk kurallarını kabul et", termsGateHelp: "Bir sürüm paylaşmadan veya düzenlemeden önce bu kuralları oku ve kabul et.",
    termsAccept: "Kabul et ve devam et", termsAccepting: "Kaydediliyor…",
    blockedTitle: "Engellenen üyeler", blockedEmpty: "Kimseyi engellemedin.", unblock: "Engeli kaldır",
    unblockLabel: (username: string) => `@${username} için engeli kaldır`,
    deleteAccount: "Hesabı sil", deleteAccountTitle: "Hesabın silinsin mi?",
    deleteAccountHelp: "Bu işlem hesabını, tüm düzenlemelerini, verdiğin ve aldığın puanları, bildirimlerini ve engelleme listeni kalıcı olarak siler. Geri alınamaz.",
    deleteAccountPassword: "Onaylamak için şifreni gir", deleteAccountConfirm: "Hesabımı sil", deletingAccount: "Hesap siliniyor…",
    accountDeleted: "Hesabın ve ona ait tüm veriler silindi.",
    errors: {
      content_not_allowed: "Bu ifade toplulukta kullanılamaz. Farklı bir ifade seç.",
      account_suspended: "Bu hesap bildirimler nedeniyle askıya alındı. Bir hata olduğunu düşünüyorsan destekle iletişime geç.",
      terms_required: "Paylaşmadan önce topluluk kurallarını kabul et.",
      invalid_username: "3–24 karakterlik bir kullanıcı adı gir. Harf, rakam, nokta, tire veya alt çizgi kullan.",
      invalid_password: `${passwordLengthRange} karakterlik bir şifre gir.`,
      username_taken: "Bu kullanıcı adı kullanılıyor. Başka bir ad seç veya giriş yap.",
      incorrect_credentials: "Kullanıcı adı veya şifre hatalı.",
      try_later: "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.",
      community_unavailable: "Hesap hizmetine şu anda ulaşılamıyor. Birazdan tekrar dene.",
    },
  },
};

type Language = keyof typeof copy;
type AuthMode = "login" | "register";
export type CommunityPanel = "account" | "editor" | "rating" | null;

export function useCommunityAccount() {
  const [account, setAccount] = useState<{ session: CommunitySession | null | undefined; draftOwner: string | null }>({
    session: undefined, draftOwner: null,
  });
  const updateSession = useCallback((session: CommunitySession | null, retainDraft = false) => {
    storeCommunitySession(session);
    setAccount(previous => ({ session, draftOwner: session?.username ?? (retainDraft ? previous.draftOwner : null) }));
  }, []);
  const expireSession = useCallback(() => updateSession(null, true), [updateSession]);

  useEffect(() => {
    const stored = readCommunitySession();
    if (!stored) { updateSession(null); return; }
    const controller = new AbortController();
    void communityRequest<{ username: string; termsAccepted?: boolean }>("session", { token: stored.token, signal: controller.signal })
      .then(({ username, termsAccepted }) => updateSession({ ...stored, username, termsAccepted }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        updateSession(communityIssue(error).error === "sign_in_required" ? null : stored);
      });
    return () => controller.abort();
  }, [updateSession]);

  const expiresAt = account.session?.expiresAt;
  useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = window.setTimeout(expireSession, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt, expireSession]);

  return { ...account, updateSession, expireSession };
}

function CommunityRules({ language, open = false }: { language: Language; open?: boolean }) {
  const t = copy[language];
  return (
    <details className="community-rules" open={open}>
      <summary>{t.termsTitle}</summary>
      <ul>{COMMUNITY_TERMS[language].map(rule => <li key={rule}>{rule}</li>)}</ul>
    </details>
  );
}

/** Shown before posting to members who joined before the rules existed or changed. */
function TermsGate({ language, session, onAccepted, onExpired }: {
  language: Language;
  session: CommunitySession;
  onAccepted: () => void;
  onExpired: () => void;
}) {
  const t = copy[language];
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState(false);

  async function accept() {
    setBusy(true);
    setIssue(false);
    try {
      await acceptCommunityTerms(session.token, COMMUNITY_TERMS_VERSION);
      onAccepted();
    } catch (error) {
      if (communityIssue(error).error === "sign_in_required") onExpired();
      else setIssue(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="community-body community-terms-gate">
      <h3>{t.termsGateTitle}</h3>
      <p>{t.termsGateHelp}</p>
      <CommunityRules language={language} open />
      {issue && <p className="community-error" role="alert">{t.errors.community_unavailable}</p>}
      <button className="community-primary" type="button" disabled={busy} onClick={() => void accept()}>
        {busy ? t.termsAccepting : t.termsAccept}
      </button>
    </div>
  );
}

function BlockedMembers({ language, session, onExpired }: { language: Language; session: CommunitySession; onExpired: () => void }) {
  const t = copy[language];
  const [users, setUsers] = useState<string[] | null>(null);
  const [issue, setIssue] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void listBlockedUsers(session.token, controller.signal)
      .then(result => setUsers(result.users))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (communityIssue(error).error === "sign_in_required") onExpired();
        else setIssue(true);
      });
    return () => controller.abort();
  }, [onExpired, session.token]);

  async function unblock(username: string) {
    try {
      await unblockCommunityUser(session.token, username);
      setUsers(current => current?.filter(user => user !== username) ?? null);
    } catch (error) {
      if (communityIssue(error).error === "sign_in_required") onExpired();
      else setIssue(true);
    }
  }

  return (
    <section className="community-blocked" aria-labelledby="community-blocked-title">
      <h3 id="community-blocked-title">{t.blockedTitle}</h3>
      {issue && <p className="community-error" role="alert">{t.errors.community_unavailable}</p>}
      {users?.length === 0 && <p>{t.blockedEmpty}</p>}
      {!!users?.length && <ul>
        {users.map(username => (
          <li key={username}>
            <span>@{username}</span>
            <button type="button" className="secondary-action" aria-label={t.unblockLabel(username)} onClick={() => void unblock(username)}>{t.unblock}</button>
          </li>
        ))}
      </ul>}
    </section>
  );
}

function DeleteAccount({ language, session, onDeleted, onExpired }: {
  language: Language;
  session: CommunitySession;
  onDeleted: () => void;
  onExpired: () => void;
}) {
  const t = copy[language];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (confirming) passwordRef.current?.focus({ preventScroll: true });
  }, [confirming]);

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = passwordRef.current?.value ?? "";
    setBusy(true);
    setIssue(null);
    try {
      await deleteCommunityAccount(session.token, password);
      onDeleted();
    } catch (error) {
      const code = communityIssue(error).error;
      if (code === "sign_in_required") onExpired();
      else setIssue(code);
      if (passwordRef.current && code === "incorrect_credentials") passwordRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="community-danger" aria-labelledby="community-delete-account-title">
      {!confirming ? (
        <button type="button" className="secondary-action community-delete-action" onClick={() => setConfirming(true)}>{t.deleteAccount}</button>
      ) : (
        <form onSubmit={remove}>
          <h3 id="community-delete-account-title">{t.deleteAccountTitle}</h3>
          <p id="community-delete-account-help">{t.deleteAccountHelp}</p>
          <div className="community-field">
            <label htmlFor="community-delete-password">{t.deleteAccountPassword}</label>
            <input id="community-delete-password" ref={passwordRef} name="password" type="password" required
              autoComplete="current-password" autoCapitalize="none" spellCheck={false} aria-describedby="community-delete-account-help" />
          </div>
          {issue && <p className="community-error" role="alert">{t.errors[issue as keyof typeof t.errors] ?? t.errors.community_unavailable}</p>}
          <div className="community-row-actions">
            <button type="button" className="secondary-action" disabled={busy} onClick={() => { setConfirming(false); setIssue(null); }}>{t.cancelDelete}</button>
            <button type="submit" className="community-primary community-delete-submit" disabled={busy}>{busy ? t.deletingAccount : t.deleteAccountConfirm}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function AccountForm({ language, mode, context, onMode, onAuthenticated }: {
  language: Language;
  mode: AuthMode;
  context?: string;
  onMode: (mode: AuthMode) => void;
  onAuthenticated: (session: CommunitySession) => void;
}) {
  const t = copy[language];
  const registering = mode === "register";
  const formRef = useRef<HTMLFormElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const usernameError = issue === "username_taken" || issue === "invalid_username";
  const passwordError = issue === "invalid_password";
  const fieldError = usernameError || passwordError ? "community-auth-error" : "";
  const errorText = issue && (t.errors[issue as keyof typeof t.errors] ?? t.errors.community_unavailable);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestRef.current) return;
    const values = new FormData(event.currentTarget);
    const username = String(values.get("username") ?? "").trim();
    const password = String(values.get("password") ?? "");
    const request = new AbortController();
    requestRef.current = request;
    setIssue(null);
    setBusy(true);
    try {
      const body = registering ? { username, password, acceptTerms: COMMUNITY_TERMS_VERSION } : { username, password };
      const account = await communityRequest<CommunitySession>(mode, { method: "POST", body, signal: request.signal });
      if (!request.signal.aborted) onAuthenticated(account);
    } catch (error) {
      if (request.signal.aborted) return;
      const code = communityIssue(error).error;
      setIssue(code);
      const field = formRef.current?.elements.namedItem(code === "invalid_username" || code === "username_taken" ? "username" : "password");
      if (field instanceof HTMLInputElement && ["invalid_username", "username_taken", "invalid_password", "incorrect_credentials"].includes(code)) {
        if (code === "incorrect_credentials") field.value = "";
        window.requestAnimationFrame(() => field.focus());
      }
    } finally {
      if (!request.signal.aborted) setBusy(false);
      requestRef.current = null;
    }
  }

  function changeMode() {
    setIssue(null);
    setVisiblePassword(false);
    const input = formRef.current?.elements.namedItem("password");
    if (input instanceof HTMLInputElement) input.value = "";
    onMode(registering ? "login" : "register");
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>("[name='username']")?.focus());
  }

  return (
    <div className="community-body community-auth">
      <p className="community-context">{context || (registering ? t.registerHelp : t.signInHelp)}</p>
      <form ref={formRef} onSubmit={authenticate}>
        <fieldset disabled={busy} className="community-auth-fields">
          <div className="community-field">
            <label htmlFor="community-username">{t.username}</label>
            <input id="community-username" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false}
              aria-invalid={usernameError || undefined}
              aria-describedby={[registering && "community-username-hint", usernameError && fieldError].filter(Boolean).join(" ") || undefined} />
            {registering && <small id="community-username-hint">{t.usernameHint}</small>}
          </div>
          <div className="community-field">
            <label htmlFor="community-password">{t.password}</label>
            <div className="community-password">
              <input id="community-password" name="password" required type={visiblePassword ? "text" : "password"}
                autoComplete={registering ? "new-password" : "current-password"} autoCapitalize="none" spellCheck={false}
                aria-invalid={passwordError || undefined}
                aria-describedby={[registering && "community-password-hint", passwordError && fieldError].filter(Boolean).join(" ") || undefined} />
              <button className="secondary-action" type="button" aria-controls="community-password"
                aria-label={visiblePassword ? t.hidePassword : t.showPassword} onClick={() => setVisiblePassword(show => !show)}>
                {visiblePassword ? t.hide : t.show}
              </button>
            </div>
            {registering && <small id="community-password-hint">{t.passwordHint}</small>}
          </div>
          {registering && <div className="community-field community-terms">
            <CommunityRules language={language} />
            <LegalLinks language={language} />
            <label className="community-check">
              <input type="checkbox" name="acceptTerms" required />
              <span>{t.acceptTerms}</span>
            </label>
          </div>}
          {errorText && <p id="community-auth-error" className="community-error" role="alert">{errorText}</p>}
          <button type="submit" className="community-primary">
            {registering ? (busy ? t.registering : t.signUp) : (busy ? t.signingIn : t.signIn)}
          </button>
        </fieldset>
      </form>
      <div className="community-auth-switch">
        <span>{registering ? t.registered : t.newHere}</span>
        <button type="button" disabled={busy} onClick={changeMode}>{registering ? t.signIn : t.signUp}</button>
      </div>
    </div>
  );
}

function MyContributions({ language, session, onAdd, onEdit, onListen, onDeleted, onSignOut, onExpired, onAccountDeleted }: {
  language: Language;
  session: CommunitySession;
  onAdd: () => void;
  onEdit: (song: CommunitySong) => void;
  onListen: (song: CommunitySong) => void;
  onDeleted: (songId: string) => void;
  onSignOut: () => void;
  onExpired: () => void;
  onAccountDeleted: () => void;
}) {
  const t = copy[language];
  const [page, setPage] = useState<CommunityPage | null>(null);
  const [request, setRequest] = useState(0);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutIssue, setSignOutIssue] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommunitySong | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteIssue, setDeleteIssue] = useState<"deleteFailed" | "try_later" | null>(null);
  const [removedTitle, setRemovedTitle] = useState<string | null>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const cancelDeleteButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const confirmingDelete = deleteTarget !== null;

  useEffect(() => {
    const controller = new AbortController();
    void communityRequest<CommunityPage>("mine", { token: session.token, signal: controller.signal })
      .then(setPage)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (communityIssue(error).error === "sign_in_required") onExpired();
        else setIssue(true);
      });
    return () => controller.abort();
  }, [onExpired, request, session.token]);

  useEffect(() => {
    if (deleteTarget) cancelDeleteButton.current?.focus({ preventScroll: true });
  }, [deleteTarget]);

  async function loadMore() {
    if (page?.nextOffset == null || busy) return;
    setBusy(true);
    setIssue(false);
    try {
      const next = await communityRequest<CommunityPage>(`mine?offset=${page.nextOffset}`, { token: session.token });
      const songs = new Map([...page.songs, ...next.songs].map(song => [song.id, song]));
      setPage({ songs: [...songs.values()], nextOffset: next.nextOffset });
    } catch (error) {
      if (communityIssue(error).error === "sign_in_required") onExpired();
      else setIssue(true);
    } finally {
      setBusy(false);
    }
  }

  function askToDelete(song: CommunitySong, trigger: HTMLButtonElement) {
    deleteTrigger.current = trigger;
    setDeleteIssue(null);
    setRemovedTitle(null);
    setDeleteTarget(song);
  }

  function cancelDelete() {
    setDeleteTarget(null);
    window.requestAnimationFrame(() => deleteTrigger.current?.focus({ preventScroll: true }));
  }

  async function deleteSong() {
    if (!deleteTarget || deleting || busy) return;
    const { id, title } = deleteTarget;
    setDeleting(true);
    setDeleteIssue(null);
    try {
      await communityRequest(`songs/${id}`, { method: "DELETE", token: session.token }).catch((error: unknown) => {
        if (communityIssue(error).error !== "song_not_found") throw error;
      });
      setPage(current => current && {
        songs: current.songs.filter(song => song.id !== id),
        nextOffset: current.nextOffset === null ? null : current.nextOffset - 1,
      });
      setDeleteTarget(null);
      setRemovedTitle(title);
      onDeleted(id);
      window.requestAnimationFrame(() => addButton.current?.focus({ preventScroll: true }));
    } catch (error) {
      const code = communityIssue(error).error;
      if (code === "sign_in_required") {
        if (addButton.current) onExpired();
      } else {
        setDeleteIssue(code === "try_later" ? "try_later" : "deleteFailed");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutIssue(false);
    try {
      await communityRequest("logout", { method: "POST", token: session.token });
      onSignOut();
    } catch {
      setSigningOut(false);
      setSignOutIssue(true);
    }
  }

  return (
    <div className="community-body community-library">
      <div className="community-user">
        <span className="community-avatar" aria-hidden="true">{session.username[0]?.toUpperCase()}</span>
        <strong>@{session.username}</strong>
        <button className="secondary-action" type="button" onClick={signOut} disabled={signingOut || confirmingDelete}>
          {signingOut ? t.signingOut : t.signOut}
        </button>
      </div>
      {signOutIssue && <p className="community-error" role="alert">{t.errors.community_unavailable}</p>}
      <div className="community-library-list">
        {removedTitle && <p className="community-delete-status" role="status">{t.deleted(removedTitle)}</p>}
        {!page && !issue && <p role="status">{t.loading}</p>}
        {page?.songs.length === 0 && <p>{t.empty}</p>}
        {!!page?.songs.length && <ul>
          {page.songs.map(song => (
            <li key={song.id}>
              <div><strong>{song.title}</strong>{song.artist && <small>{song.artist}</small>}
                {song.hidden && <small className="community-hidden-note">⚠ {t.hiddenForReview}</small>}</div>
              <div className="community-row-actions" hidden={deleteTarget?.id === song.id}>
                <button type="button" className="secondary-action" aria-label={`${t.listen} · ${song.title}`}
                  disabled={confirmingDelete} onClick={() => onListen(song)}>{t.listen}</button>
                <button type="button" className="secondary-action" aria-label={`${t.edit} · ${song.title}`}
                  disabled={confirmingDelete} onClick={() => onEdit(song)}>{t.edit}</button>
                <button type="button" className="secondary-action community-delete-action" aria-label={`${t.delete} · ${song.title}`}
                  disabled={confirmingDelete || busy || signingOut} onClick={event => askToDelete(song, event.currentTarget)}>{t.delete}</button>
              </div>
              {deleteTarget?.id === song.id && (
                <div className="community-delete-confirm" role="group" aria-labelledby="community-delete-title"
                  aria-describedby="community-delete-help">
                  <p id="community-delete-title"><strong>{t.deleteTitle(song.title)}</strong></p>
                  <p id="community-delete-help">{t.deleteHelp}</p>
                  {deleteIssue && <p className="community-error" role="alert">
                    {deleteIssue === "try_later" ? t.errors.try_later : t.deleteFailed}
                  </p>}
                  <div className="community-row-actions">
                    <button className="secondary-action" type="button" ref={cancelDeleteButton} disabled={deleting}
                      onClick={cancelDelete}>{t.cancelDelete}</button>
                    <button className="community-primary community-delete-submit" type="button" disabled={deleting}
                      onClick={() => void deleteSong()}>{deleting ? t.deleting : t.confirmDelete}</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>}
        {issue && <p className="community-error" role="alert">{t.errors.community_unavailable}</p>}
        {!page && issue && <button className="secondary-action" type="button" onClick={() => { setIssue(false); setRequest(value => value + 1); }}>{t.retry}</button>}
        {page?.nextOffset != null && <button className="secondary-action" type="button" disabled={busy || confirmingDelete}
          onClick={loadMore}>{busy ? t.loading : t.more}</button>}
      </div>
      <button className="community-primary" type="button" ref={addButton} disabled={confirmingDelete} onClick={onAdd}>{t.add}</button>
      <BlockedMembers language={language} session={session} onExpired={onExpired} />
      <DeleteAccount language={language} session={session} onDeleted={onAccountDeleted} onExpired={onExpired} />
    </div>
  );
}

export function CommunityWorkspace({ language, account, panel, source, editorRevision, onClose, onAdd, onEdit, onSaved, onListen, onDeleted, onAccountDeleted }: {
  language: Language;
  account: ReturnType<typeof useCommunityAccount>;
  panel: CommunityPanel;
  source: EditorSource | null | undefined;
  editorRevision: number;
  onClose: () => void;
  onAdd: () => void;
  onEdit: (song: CommunitySong) => void;
  onSaved: () => void;
  onListen: (song: CommunitySong) => void;
  onDeleted: (songId: string) => void;
  onAccountDeleted: () => void;
}) {
  const t = copy[language];
  const { session, draftOwner, updateSession, expireSession } = account;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [authChoice, setAuthChoice] = useState<{ panel: CommunityPanel; mode: AuthMode } | null>(null);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const needsTerms = !!session && session.termsAccepted === false;
  const pane = panel && (session === undefined ? "checking" : session === null ? "auth" : panel === "rating" ? null : panel);
  const defaultMode = panel === "editor" && !draftOwner ? "register" : "login";
  const authMode = authChoice?.panel === panel ? authChoice.mode : defaultMode;
  const editingOwn = !!source?.contributor && source.contributor === session?.username;
  const heading = pane === "auth" ? (authMode === "register" ? t.signUp : t.signIn)
    : pane === "editor" ? (editingOwn ? t.editSong : source ? t.arrange : t.add)
      : pane === "account" ? t.contributions : t.checking;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pane) {
      if (!dialog.open) dialog.showModal();
      headingRef.current?.focus({ preventScroll: true });
    } else if (dialog.open) dialog.close();
  }, [pane]);

  function listen(song: CommunitySong) {
    onClose();
    onListen(song);
  }

  return (
    <dialog className={pane === "editor" ? "editor-dialog editor-dialog-wide" : "editor-dialog"} ref={dialogRef}
      aria-labelledby="community-dialog-title" onClose={event => {
        if (event.currentTarget.open) return;
        setAuthChoice(null);
        setAccountDeleted(false);
        onClose();
      }}>
      <header className="editor-dialog-heading">
        <h2 ref={headingRef} id="community-dialog-title" tabIndex={-1}>{heading}</h2>
        <button className="secondary-action" type="button" onClick={() => dialogRef.current?.close()}>{t.close}</button>
      </header>
      {accountDeleted && <p className="community-delete-status" role="status">✓ {t.accountDeleted}</p>}
      {pane === "auth" && <AccountForm language={language} mode={authMode}
        context={panel === "rating" ? t.ratingHelp : panel === "editor" ? (draftOwner ? t.expired : source ? t.editHelp(source.title) : t.addHelp) : undefined}
        onMode={mode => setAuthChoice({ panel, mode })} onAuthenticated={session => {
          setAuthChoice(null);
          updateSession(session);
          if (panel === "rating") onClose();
        }} />}
      {pane === "account" && session && <MyContributions language={language} session={session} onAdd={onAdd} onEdit={onEdit}
        onListen={listen} onDeleted={onDeleted} onSignOut={() => { updateSession(null); onClose(); }} onExpired={expireSession}
        onAccountDeleted={() => { setAccountDeleted(true); updateSession(null); onAccountDeleted(); }} />}
      {pane === "editor" && session && needsTerms && <TermsGate language={language} session={session} onExpired={expireSession}
        onAccepted={() => updateSession({ ...session, termsAccepted: true })} />}
      {draftOwner && source !== undefined && <SongEditor key={`${draftOwner}:${editorRevision}`} language={language}
        visible={pane === "editor" && !needsTerms} source={source} author={draftOwner} session={session ?? null}
        onExpired={expireSession} onSaved={onSaved} onListen={listen} />}
    </dialog>
  );
}
