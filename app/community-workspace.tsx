"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_COMMUNITY_PASSWORD_LENGTH, MIN_COMMUNITY_PASSWORD_LENGTH } from "../shared/community-auth.mjs";
import {
  communityIssue, communityRequest, readCommunitySession, storeCommunitySession,
  type CommunityPage, type CommunitySession, type CommunitySong,
} from "./community-client";
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
    expired: "Your session ended. Sign in to keep working on this arrangement.",
    signingIn: "Signing in…", registering: "Creating account…", signingOut: "Signing out…", signOut: "Sign out",
    contributions: "My contributions", add: "Add song", listen: "Listen", edit: "Edit", arrange: "Create your version", editSong: "Edit song",
    empty: "Your published arrangements will appear here.", loading: "Loading your contributions…", more: "Show more", retry: "Try again",
    errors: {
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
    expired: "Oturumun sona erdi. Bu düzenlemeye devam etmek için giriş yap.",
    signingIn: "Giriş yapılıyor…", registering: "Hesap oluşturuluyor…", signingOut: "Çıkış yapılıyor…", signOut: "Çıkış yap",
    contributions: "Katkılarım", add: "Şarkı ekle", listen: "Dinle", edit: "Düzenle", arrange: "Kendi sürümünü oluştur", editSong: "Şarkıyı düzenle",
    empty: "Yayımladığın düzenlemeler burada görünecek.", loading: "Katkıların yükleniyor…", more: "Daha fazla göster", retry: "Tekrar dene",
    errors: {
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
export type CommunityPanel = "account" | "editor" | null;

export function useCommunityAccount() {
  const [account, setAccount] = useState<{ session: CommunitySession | null | undefined; draftOwner: string | null }>({
    session: undefined, draftOwner: null,
  });
  const updateSession = useCallback((session: CommunitySession | null, retainDraft = false) => {
    storeCommunitySession(session);
    setAccount(previous => ({ session, draftOwner: session?.username ?? (retainDraft ? previous.draftOwner : null) }));
  }, []);

  useEffect(() => {
    const stored = readCommunitySession();
    if (!stored) { updateSession(null); return; }
    const controller = new AbortController();
    void communityRequest<{ username: string }>("session", { token: stored.token, signal: controller.signal })
      .then(({ username }) => updateSession({ ...stored, username }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        updateSession(communityIssue(error).error === "sign_in_required" ? null : stored);
      });
    return () => controller.abort();
  }, [updateSession]);

  const expiresAt = account.session?.expiresAt;
  useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = window.setTimeout(() => updateSession(null, true), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt, updateSession]);

  return { ...account, updateSession };
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
      const account = await communityRequest<CommunitySession>(mode, { method: "POST", body: { username, password }, signal: request.signal });
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

function MyContributions({ language, session, onAdd, onEdit, onListen, onSignOut, onExpired }: {
  language: Language;
  session: CommunitySession;
  onAdd: () => void;
  onEdit: (song: CommunitySong) => void;
  onListen: (song: CommunitySong) => void;
  onSignOut: () => void;
  onExpired: () => void;
}) {
  const t = copy[language];
  const [page, setPage] = useState<CommunityPage | null>(null);
  const [request, setRequest] = useState(0);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutIssue, setSignOutIssue] = useState(false);

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
        <button className="secondary-action" type="button" onClick={signOut} disabled={signingOut}>
          {signingOut ? t.signingOut : t.signOut}
        </button>
      </div>
      {signOutIssue && <p className="community-error" role="alert">{t.errors.community_unavailable}</p>}
      <div className="community-library-list">
        {!page && !issue && <p role="status">{t.loading}</p>}
        {page?.songs.length === 0 && <p>{t.empty}</p>}
        {!!page?.songs.length && <ul>
          {page.songs.map(song => (
            <li key={song.id}>
              <div><strong>{song.title}</strong>{song.artist && <small>{song.artist}</small>}</div>
              <div className="community-row-actions">
                <button type="button" className="secondary-action" aria-label={`${t.listen} · ${song.title}`} onClick={() => onListen(song)}>{t.listen}</button>
                <button type="button" className="secondary-action" aria-label={`${t.edit} · ${song.title}`} onClick={() => onEdit(song)}>{t.edit}</button>
              </div>
            </li>
          ))}
        </ul>}
        {issue && <p className="community-error" role="alert">{t.errors.community_unavailable}</p>}
        {!page && issue && <button className="secondary-action" type="button" onClick={() => { setIssue(false); setRequest(value => value + 1); }}>{t.retry}</button>}
        {page?.nextOffset != null && <button className="secondary-action" type="button" disabled={busy} onClick={loadMore}>{busy ? t.loading : t.more}</button>}
      </div>
      <button className="community-primary" type="button" onClick={onAdd}>{t.add}</button>
    </div>
  );
}

export function CommunityWorkspace({ language, account, panel, source, editorRevision, onClose, onAdd, onEdit, onSaved, onListen }: {
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
}) {
  const t = copy[language];
  const { session, draftOwner, updateSession } = account;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [authChoice, setAuthChoice] = useState<{ panel: CommunityPanel; mode: AuthMode } | null>(null);
  const pane = panel && (session === undefined ? "checking" : session === null ? "auth" : panel);
  const defaultMode = panel === "editor" && !draftOwner ? "register" : "login";
  const authMode = authChoice?.panel === panel ? authChoice.mode : defaultMode;
  const expireSession = useCallback(() => updateSession(null, true), [updateSession]);
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
        onClose();
      }}>
      <header className="editor-dialog-heading">
        <h2 ref={headingRef} id="community-dialog-title" tabIndex={-1}>{heading}</h2>
        <button className="secondary-action" type="button" onClick={() => dialogRef.current?.close()}>{t.close}</button>
      </header>
      {pane === "auth" && <AccountForm language={language} mode={authMode}
        context={panel === "editor" ? (draftOwner ? t.expired : source ? t.editHelp(source.title) : t.addHelp) : undefined}
        onMode={mode => setAuthChoice({ panel, mode })} onAuthenticated={session => { setAuthChoice(null); updateSession(session); }} />}
      {pane === "account" && session && <MyContributions language={language} session={session} onAdd={onAdd} onEdit={onEdit}
        onListen={listen} onSignOut={() => { updateSession(null); onClose(); }} onExpired={expireSession} />}
      {draftOwner && source !== undefined && <SongEditor key={`${draftOwner}:${editorRevision}`} language={language}
        visible={pane === "editor"} source={source} author={draftOwner} session={session ?? null}
        onExpired={expireSession} onSaved={onSaved} onListen={listen} />}
    </dialog>
  );
}
