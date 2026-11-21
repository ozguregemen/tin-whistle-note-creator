"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { fingeringFor } from "./fingerings.mjs";
import { NOTE_NAMES, noteForPattern, registerForNote } from "./note-notation.mjs";
import { MAX_COMMUNITY_NOTATION, MAX_COMMUNITY_NOTES, parseCommunityNotation, validateCommunitySong } from "../shared/community-song.mjs";
import {
  CommunityRequestError, communityRequest, readCommunitySession, storeCommunitySession,
  type CommunityPage, type CommunitySession, type CommunitySong,
} from "./community-client";

const copy = {
  en: {
    add: "Add a song", arrange: "Edit song", close: "Close",
    intro: "Build a tin whistle arrangement and share it in the catalog.",
    changesOwn: "Save changes to your published arrangement.",
    newVersion: "Publish your own version alongside the versions in the catalog.",
    useNotes: "Use current notes",
    song: "Song title", artist: "Artist (optional)", tempo: "Tempo (BPM)",
    method: "Note entry method", text: "Note names", fingers: "Fingerings", notes: "Notes",
    textHint: "Use letters or solfège. Separate phrases with a new line or |. Use D5 or Re+ for high D.",
    fingerHint: "Tap the holes to fill a note card. Filled cards play in order.",
    half: "Half cover", addNote: "Add note", addPhrase: "Add phrase", openHoles: "All holes open",
    note: "Note", hole: "Hole", remove: "Remove card", register: "Register", first: "Lower",
    second: "Upper", third: "Third", newPhrase: "New phrase", noMatch: "Check fingering",
    publish: "Publish to catalog", update: "Save changes", cancelEdit: "New arrangement", saving: "Saving…",
    published: "Published to the catalog.", updated: "Arrangement updated.", listen: "Listen",
    account: "Your account", accountHint: "Sign in to publish under your username.",
    signIn: "Sign in", signUp: "Create account", username: "Username", password: "Password",
    usernameHint: "3–24 characters. Use letters, numbers, dots, hyphens, or underscores.",
    passwordHint: "Use at least 15 characters.", signingIn: "Connecting…", signOut: "Sign out",
    yours: "Your arrangements", empty: "Your published arrangements will appear here.",
    edit: "Edit", more: "Load more", loading: "Loading your arrangements…",
    errors: {
      invalid_title: "Enter a song title with 2–100 characters.",
      invalid_artist: "The artist name can have up to 100 characters.",
      invalid_bpm: "Enter a whole tempo between 40 and 220 BPM.",
      notes_required: "Add at least one note.",
      invalid_note: "Enter a playable tin whistle note.",
      too_many_notes: "An arrangement can have up to 512 notes.",
      invalid_fingering: "Finish the highlighted fingering before continuing.",
      invalid_username: "Enter a username with 3–24 allowed characters.",
      invalid_password: "Enter a password with 15–128 characters.",
      username_taken: "That username is already in use.",
      incorrect_credentials: "The username or password is incorrect.",
      sign_in_required: "Sign in to publish this arrangement.",
      try_later: "Too many recent attempts. Try again in a minute.",
      song_not_found: "This arrangement could not be found in your account.",
      community_unavailable: "The community service is unavailable. Try again in a moment.",
    },
  },
  tr: {
    add: "Şarkı ekle", arrange: "Şarkıyı düzenle", close: "Kapat",
    intro: "Tin whistle düzenlemeni oluştur ve katalogda paylaş.",
    changesOwn: "Yayımladığın düzenlemenin değişikliklerini kaydet.",
    newVersion: "Kendi düzenlemeni katalogdaki diğer sürümlerin yanında yayımla.",
    useNotes: "Mevcut notaları getir",
    song: "Şarkı adı", artist: "Sanatçı (isteğe bağlı)", tempo: "Tempo (BPM)",
    method: "Nota girme yöntemi", text: "Nota adları", fingers: "Parmak dizilimi", notes: "Notalar",
    textHint: "Do, Re veya C, D yazabilirsin. Ezgi bölümlerini yeni satırla veya | ile ayır. İnce Re için Re+ veya D5 yaz.",
    fingerHint: "Nota kartındaki deliklere dokunarak doldur. Doldurduğun kartlar sırayla çalınır.",
    half: "Yarım kapat", addNote: "Nota ekle", addPhrase: "Bölüm ekle", openHoles: "Tümü açık",
    note: "Nota", hole: "Delik", remove: "Kartı kaldır", register: "Ses bölgesi", first: "Alt",
    second: "Üst", third: "Üçüncü", newPhrase: "Yeni bölüm", noMatch: "Dizilimi kontrol et",
    publish: "Katalogda yayımla", update: "Değişiklikleri kaydet", cancelEdit: "Yeni düzenleme", saving: "Kaydediliyor…",
    published: "Düzenleme katalogda yayımlandı.", updated: "Düzenleme güncellendi.", listen: "Dinle",
    account: "Hesabın", accountHint: "Düzenlemeni kullanıcı adınla paylaşmak için giriş yap.",
    signIn: "Giriş yap", signUp: "Hesap oluştur", username: "Kullanıcı adı", password: "Şifre",
    usernameHint: "3–24 karakter. İngilizce harf, rakam, nokta, tire veya alt çizgi kullan.",
    passwordHint: "En az 15 karakter kullan.", signingIn: "Bağlanıyor…", signOut: "Çıkış yap",
    yours: "Düzenlemelerin", empty: "Yayımladığın düzenlemeler burada görünür.",
    edit: "Düzenle", more: "Daha fazla göster", loading: "Düzenlemelerin yükleniyor…",
    errors: {
      invalid_title: "2–100 karakter arasında bir şarkı adı gir.",
      invalid_artist: "Sanatçı adı en fazla 100 karakter olabilir.",
      invalid_bpm: "40 ile 220 arasında tam sayı bir tempo gir.",
      notes_required: "En az bir nota ekle.",
      invalid_note: "Geçerli bir tin whistle notası gir.",
      too_many_notes: "Bir düzenlemede en fazla 512 nota olabilir.",
      invalid_fingering: "Devam etmeden önce gösterilen parmak dizilimini tamamla.",
      invalid_username: "3–24 karakter arasında geçerli bir kullanıcı adı gir.",
      invalid_password: "15–128 karakter arasında bir şifre gir.",
      username_taken: "Bu kullanıcı adı kullanılıyor.",
      incorrect_credentials: "Kullanıcı adı veya şifre hatalı.",
      sign_in_required: "Bu düzenlemeyi yayımlamak için giriş yap.",
      try_later: "Arka arkaya çok fazla deneme yapıldı. Bir dakika sonra tekrar dene.",
      song_not_found: "Bu düzenleme hesabında bulunamadı.",
      community_unavailable: "Topluluğa şu anda ulaşılamıyor. Biraz sonra tekrar dene.",
    },
  },
};

type Language = keyof typeof copy;
type Register = 1 | 2 | 3;
type Cell = { id: number; holes: string; register: Register; entered: boolean; startsPhrase: boolean };
type Issue = { error: string; note?: string };

export type EditorSource = {
  id: string;
  title: string;
  artist?: string;
  contributor?: string;
  notes: string;
  rhythm?: { bpm: number };
};

function emptyCell(id: number, startsPhrase = false): Cell {
  return { id, holes: "000000", register: 1, entered: false, startsPhrase };
}

function templateCells(notation?: string): Cell[] {
  const phrases = notation?.split("|").map(phrase => phrase.trim()).filter(Boolean) ?? [];
  if (!phrases.length) return Array.from({ length: 8 }, (_, index) => emptyCell(index));
  const template: Cell[] = [];
  for (const phrase of phrases) {
    const length = Math.min(phrase.split(/\s+/).length, MAX_COMMUNITY_NOTES - template.length);
    for (let index = 0; index < length; index += 1) {
      template.push(emptyCell(template.length, template.length > 0 && index === 0));
    }
  }
  return template;
}

function cellNote(cell: Cell) {
  return cell.entered ? noteForPattern(cell.holes, cell.register) : null;
}

function diagramToText(cells: Cell[]): string | Issue {
  const tokens: string[] = [];
  let pendingPhrase = false;
  for (const [index, cell] of cells.entries()) {
    if (cell.startsPhrase && tokens.length > 0) pendingPhrase = true;
    if (!cell.entered) continue;
    const note = cellNote(cell);
    if (!note) return { error: "invalid_fingering", note: String(index + 1) };
    if (pendingPhrase) tokens.push("|");
    pendingPhrase = false;
    tokens.push(`${note.pitch}${note.octave}`);
  }
  return tokens.join(" ");
}

function requestIssue(error: unknown): Issue {
  return error instanceof CommunityRequestError
    ? { error: error.code, note: error.detail }
    : { error: "community_unavailable" };
}

function issueText(t: typeof copy[Language], issue: Issue) {
  const text = t.errors[issue.error as keyof typeof t.errors] ?? t.errors.community_unavailable;
  return issue.note ? `${text} (${issue.note})` : text;
}

export function SongEditor({ language, visible, source, onClose, onSaved, onListen }: {
  language: Language;
  visible: boolean;
  source: EditorSource | null;
  onClose: () => void;
  onSaved: () => void;
  onListen: (song: CommunitySong) => void;
}) {
  const t = copy[language];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const gridRef = useRef<HTMLOListElement>(null);
  const [session, setSession] = useState<CommunitySession | null>(null);
  const sessionChecked = useRef(false);
  const [accountMode, setAccountMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountIssue, setAccountIssue] = useState<Issue | null>(null);
  const [mine, setMine] = useState<CommunitySong[]>([]);
  const [mineNext, setMineNext] = useState<number | null>(null);
  const [loadingMine, setLoadingMine] = useState(false);
  const [mineIssue, setMineIssue] = useState<Issue | null>(null);
  const [draftSource, setDraftSource] = useState(source);
  const editingId = draftSource && session && draftSource.contributor === session.username ? draftSource.id : null;
  const [title, setTitle] = useState(source?.title ?? "");
  const [artist, setArtist] = useState(source?.artist ?? "");
  const [bpm, setBpm] = useState(String(source?.rhythm?.bpm ?? 90));
  const [method, setMethod] = useState<"text" | "fingers">("fingers");
  const [notation, setNotation] = useState("");
  const nextCell = useRef(MAX_COMMUNITY_NOTES);
  const [cells, setCells] = useState<Cell[]>(() => templateCells(source?.notes));
  const [selectedCell, setSelectedCell] = useState(0);
  const [half, setHalf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formIssue, setFormIssue] = useState<Issue | null>(null);
  const [saved, setSaved] = useState<{ song: CommunitySong; updated: boolean } | null>(null);
  const selectedIndex = Math.max(0, cells.findIndex(cell => cell.id === selectedCell));
  const activeCell = cells[selectedIndex];
  const activeLabel = `${t.note} ${selectedIndex + 1}`;
  const canImport = Boolean(draftSource?.notes && (method === "text" ? !notation.trim() : !cells.some(cell => cell.entered)));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (visible && !dialog.open) {
      dialog.showModal();
      headingRef.current?.focus({ preventScroll: true });
    } else if (!visible && dialog.open) {
      dialog.close();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || sessionChecked.current) return;
    const previous = readCommunitySession();
    if (!previous) {
      sessionChecked.current = true;
      return;
    }
    const controller = new AbortController();
    void communityRequest<{ username: string }>("session", { token: previous.token, signal: controller.signal })
      .then(({ username }) => setSession({ ...previous, username }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const issue = requestIssue(error);
        if (issue.error === "sign_in_required") storeCommunitySession(null);
        else setAccountIssue(issue);
      })
      .finally(() => { if (!controller.signal.aborted) sessionChecked.current = true; });
    return () => controller.abort();
  }, [visible]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void communityRequest<CommunityPage>("mine", { token: session.token, signal: controller.signal })
      .then(page => { setMine(page.songs); setMineNext(page.nextOffset); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setMineIssue(requestIssue(error)); });
    return () => controller.abort();
  }, [session]);

  function updateSession(value: CommunitySession | null) {
    setSession(value);
    storeCommunitySession(value);
    if (!value) {
      setMine([]);
      setMineNext(null);
      setMineIssue(null);
    }
  }

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountIssue(null);
    try {
      const account = await communityRequest<CommunitySession>(accountMode, { method: "POST", body: { username, password } });
      sessionChecked.current = true;
      updateSession(account);
      setPassword("");
      setFormIssue(previous => previous?.error === "sign_in_required" ? null : previous);
    } catch (error) {
      setAccountIssue(requestIssue(error));
    } finally {
      setAccountBusy(false);
    }
  }

  async function signOut() {
    if (!session || saving || accountBusy) return;
    setAccountBusy(true);
    try {
      await communityRequest("logout", { method: "POST", token: session.token });
      updateSession(null);
    } catch (error) {
      setAccountIssue(requestIssue(error));
    } finally {
      setAccountBusy(false);
    }
  }

  async function moreMine() {
    if (!session || loadingMine || mineNext === null) return;
    setLoadingMine(true);
    setMineIssue(null);
    try {
      const page = await communityRequest<CommunityPage>(`mine?offset=${mineNext}`, { token: session.token });
      setMine(previous => [...new Map([...previous, ...page.songs].map(song => [song.id, song])).values()]);
      setMineNext(page.nextOffset);
    } catch (error) {
      setMineIssue(requestIssue(error));
    } finally {
      setLoadingMine(false);
    }
  }

  function fillDiagramFromNotes(notes: string) {
    const parsed = parseCommunityNotation(notes);
    if ("error" in parsed) { setFormIssue(parsed); return false; }
    let position = 0;
    setCells(parsed.phrases.flatMap((phrase, phraseIndex) => phrase.map((note, index) => ({
      id: position++, holes: fingeringFor(note.pitch, note.octave)!, register: registerForNote(note) as Register,
      entered: true, startsPhrase: phraseIndex > 0 && index === 0,
    }))));
    setSelectedCell(0);
    return true;
  }

  function switchMethod(next: typeof method) {
    if (next === method) return;
    if (next === "fingers") {
      if (notation.trim()) {
        if (!fillDiagramFromNotes(notation)) return;
      } else {
        setCells(templateCells(draftSource?.notes));
        setSelectedCell(0);
      }
    } else {
      const text = diagramToText(cells);
      if (typeof text !== "string") { setFormIssue(text); return; }
      setNotation(text);
    }
    setFormIssue(null);
    setMethod(next);
  }

  function patchCell(id: number, update: Partial<Cell>) {
    setCells(previous => previous.map(cell => cell.id === id ? { ...cell, ...update } : cell));
  }

  function appendCell(startsPhrase = false) {
    const cell = emptyCell(nextCell.current++, startsPhrase);
    setCells(previous => [...previous, cell]);
    setSelectedCell(cell.id);
    window.requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-note-position="${cell.id}"]`)?.focus());
  }

  function removeSelectedCell() {
    if (cells.length === 1) {
      setCells([emptyCell(0)]);
      setSelectedCell(0);
    } else {
      setCells(previous => previous.filter((_, i) => i !== selectedIndex).map((cell, i) =>
        i === selectedIndex && previous[selectedIndex].startsPhrase ? { ...cell, startsPhrase: i > 0 } : cell));
      setSelectedCell((cells[selectedIndex + 1] ?? cells[selectedIndex - 1]).id);
    }
  }

  function importSourceNotes() {
    if (!draftSource?.notes || !canImport) return;
    if (method === "fingers" && !fillDiagramFromNotes(draftSource.notes)) return;
    if (method === "text") setNotation(draftSource.notes);
    setFormIssue(null);
  }

  function loadArrangement(song: EditorSource | null = null) {
    setDraftSource(song);
    setTitle(song?.title ?? "");
    setArtist(song?.artist ?? "");
    setBpm(String(song?.rhythm?.bpm ?? 90));
    setNotation("");
    setCells(templateCells(song?.notes));
    setSelectedCell(0);
    setMethod("fingers");
    setFormIssue(null);
    setSaved(null);
    document.getElementById("editor-song-title")?.focus();
  }

  async function saveArrangement(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormIssue(null);
    setSaved(null);
    const text = method === "text" ? notation : diagramToText(cells);
    if (typeof text !== "string") { setFormIssue(text); return; }
    const draft = validateCommunitySong({ title, artist, bpm, notes: text });
    if ("error" in draft) { setFormIssue(draft); return; }
    if (!session) {
      setFormIssue({ error: "sign_in_required" });
      document.getElementById("editor-username")?.focus();
      return;
    }
    setSaving(true);
    try {
      const song = await communityRequest<CommunitySong>(editingId ? `songs/${editingId}` : "songs", {
        method: editingId ? "PUT" : "POST", token: session.token, body: draft,
      });
      setSaved({ song, updated: Boolean(editingId) });
      setDraftSource(song);
      setMine(previous => [song, ...previous.filter(item => item.id !== song.id)]);
      onSaved();
    } catch (error) {
      const issue = requestIssue(error);
      if (issue.error === "sign_in_required") updateSession(null);
      setFormIssue(issue);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog className="editor-dialog" ref={dialogRef} aria-labelledby="editor-title" onClose={event => {
      if (!event.currentTarget.open) onClose();
    }}>
      <header className="editor-dialog-heading">
        <div>
          <h1 id="editor-title" ref={headingRef} tabIndex={-1}>{draftSource ? t.arrange : t.add}</h1>
          <p>{editingId ? t.changesOwn : draftSource ? t.newVersion : t.intro}</p>
        </div>
        <button className="secondary-action" type="button" onClick={() => dialogRef.current?.close()}>{t.close}</button>
      </header>
      <div className="editor-layout">
        <form className="editor-panel" onSubmit={saveArrangement}>
          <fieldset className="editor-fields" disabled={saving}>
            <div className="editor-song-fields">
              <label>{t.song}<input id="editor-song-title" value={title} required maxLength={100} onChange={event => setTitle(event.target.value)} /></label>
              <label>{t.artist}<input value={artist} maxLength={100} onChange={event => setArtist(event.target.value)} /></label>
              <label>{t.tempo}<input value={bpm} inputMode="numeric" type="number" min={40} max={220} required onChange={event => setBpm(event.target.value)} /></label>
            </div>
            <div className="editor-entry-controls">
              <div className="editor-choice" role="group" aria-label={t.method}>
                <button type="button" aria-pressed={method === "fingers"} onClick={() => switchMethod("fingers")}>{t.fingers}</button>
                <button type="button" aria-pressed={method === "text"} onClick={() => switchMethod("text")}>{t.text}</button>
              </div>
              {canImport && <button type="button" className="secondary-action" onClick={importSourceNotes}>{t.useNotes}</button>}
            </div>
            {method === "text" ? (
              <div className="editor-notation">
                <label htmlFor="editor-notes">{t.notes}</label>
                <textarea id="editor-notes" value={notation} maxLength={MAX_COMMUNITY_NOTATION} spellCheck={false}
                  placeholder={language === "tr" ? "Re Mi Fa# Sol | La Si La Sol" : "D4 E4 F#4 G4 | A4 B4 A4 G4"}
                  aria-describedby="editor-note-hint" onChange={event => setNotation(event.target.value)} />
                <p id="editor-note-hint">{t.textHint}</p>
              </div>
            ) : (
              <div className="editor-notation">
                <p id="editor-note-hint">{t.fingerHint}</p>
                <div className="editor-finger-tools" role="group" aria-label={activeLabel}>
                  <label>{t.register}
                    <select value={activeCell.register} aria-label={`${activeLabel} · ${t.register}`}
                      onChange={event => patchCell(activeCell.id, { register: Number(event.target.value) as Register })}>
                      <option value={1}>{t.first}</option><option value={2}>{t.second}</option><option value={3}>{t.third}</option>
                    </select>
                  </label>
                  <button type="button" className="secondary-action" aria-pressed={half} onClick={() => setHalf(value => !value)}>{t.half}</button>
                  <button type="button" className="secondary-action" onClick={() => patchCell(activeCell.id, { holes: "000000", entered: true })}>{t.openHoles}</button>
                  <button type="button" className="secondary-action" onClick={removeSelectedCell}>{t.remove}</button>
                </div>
                <ol className="song-follow-grid song-follow-attempts editor-note-grid" ref={gridRef} aria-describedby="editor-note-hint">
                  {cells.map((cell, index) => {
                    const note = cellNote(cell);
                    const number = index + 1;
                    const described = `${t.note} ${number}`;
                    const current = cell.id === activeCell.id;
                    return (
                      <li className={`song-follow-tile song-follow-attempt editor-note${current ? " current" : ""}${cell.startsPhrase ? " editor-phrase-start" : ""}${cell.entered && !note ? " editor-note-invalid" : ""}`} key={cell.id}>
                        <button type="button" className="song-follow-position editor-note-position" data-note-position={cell.id}
                          aria-pressed={current} aria-label={cell.startsPhrase ? `${described} · ${t.newPhrase}` : described}
                          onClick={() => setSelectedCell(cell.id)}>{number}</button>
                        <div className="song-follow-note-holes editor-holes" role="group" aria-label={described}>
                          {Array.from(cell.holes, (state, holeIndex) => (
                            <button type="button" className="editor-hole" key={holeIndex}
                              aria-label={`${described} · ${t.hole} ${holeIndex + 1}`} onFocus={() => setSelectedCell(cell.id)}
                              aria-pressed={state === "h" ? "mixed" : state === "1"} onClick={() => {
                                const mark = half ? "h" : "1";
                                const next = state === mark ? "0" : mark;
                                setSelectedCell(cell.id);
                                patchCell(cell.id, { holes: cell.holes.slice(0, holeIndex) + next + cell.holes.slice(holeIndex + 1), entered: true });
                              }}>
                              <span aria-hidden="true" className={`hole ${state === "h" ? "half" : state === "1" ? "closed" : "open"}`} />
                            </button>
                          ))}
                        </div>
                        <output aria-live={current ? "polite" : "off"}>{note
                          ? language === "tr" ? `${NOTE_NAMES[note.pitch]} · ${note.pitch}${note.octave}` : `${note.pitch}${note.octave}`
                          : cell.entered ? t.noMatch : ""}</output>
                      </li>
                    );
                  })}
                </ol>
                <div className="editor-actions">
                  <button type="button" className="secondary-action" disabled={cells.length >= MAX_COMMUNITY_NOTES} onClick={() => appendCell()}>{t.addNote}</button>
                  <button type="button" className="secondary-action" disabled={cells.length >= MAX_COMMUNITY_NOTES} onClick={() => appendCell(true)}>{t.addPhrase}</button>
                </div>
              </div>
            )}
            {formIssue && <p className="editor-error" role="alert">{issueText(t, formIssue)}</p>}
            <div className="editor-actions editor-publish">
              <button className="primary-button" type="submit">{saving ? t.saving : editingId ? t.update : t.publish}</button>
              {draftSource && <button className="secondary-action" type="button" onClick={() => loadArrangement()}>{t.cancelEdit}</button>}
            </div>
            {saved && <div className="editor-success">
              <p role="status">{saved.updated ? t.updated : t.published}</p>
              <button className="secondary-action" type="button" onClick={() => {
                dialogRef.current?.close();
                onListen(saved.song);
              }}>{t.listen}</button>
            </div>}
          </fieldset>
        </form>

        <aside className="editor-panel editor-account" aria-labelledby="editor-account-title">
          <h2 id="editor-account-title">{t.account}</h2>
          {session ? (
            <>
              <div className="editor-user"><strong>@{session.username}</strong>
                <button className="secondary-action" type="button" onClick={() => void signOut()} disabled={accountBusy || saving}>{t.signOut}</button>
              </div>
              <div className="editor-mine">
                <h3>{t.yours}</h3>
                {mine.length ? <ul>{mine.map(song => (
                  <li key={song.id}><span>{song.title}</span>
                    <button className="secondary-action" type="button" onClick={() => loadArrangement(song)} disabled={saving} aria-label={`${t.edit} ${song.title}`}>{t.edit}</button>
                  </li>
                ))}</ul> : !mineIssue && <p>{t.empty}</p>}
                {mineIssue && <p className="editor-error" role="alert">{issueText(t, mineIssue)}</p>}
                {mineNext !== null && <button className="secondary-action" type="button" onClick={() => void moreMine()} disabled={loadingMine}>{loadingMine ? t.loading : t.more}</button>}
              </div>
            </>
          ) : (
            <>
              <p>{t.accountHint}</p>
              <div className="editor-choice">
                <button type="button" aria-pressed={accountMode === "login"} disabled={accountBusy} onClick={() => { setAccountMode("login"); setAccountIssue(null); }}>{t.signIn}</button>
                <button type="button" aria-pressed={accountMode === "register"} disabled={accountBusy} onClick={() => { setAccountMode("register"); setAccountIssue(null); }}>{t.signUp}</button>
              </div>
              <form className="editor-account-form" onSubmit={authenticate}>
                <label>{t.username}<input id="editor-username" required value={username} minLength={3} maxLength={24} autoComplete="username" autoCapitalize="none"
                  spellCheck={false} aria-describedby={accountMode === "register" ? "editor-username-hint" : undefined}
                  onChange={event => setUsername(event.target.value)} /></label>
                {accountMode === "register" && <small id="editor-username-hint">{t.usernameHint}</small>}
                <label>{t.password}<input value={password} required type="password" autoComplete={accountMode === "register" ? "new-password" : "current-password"} minLength={15}
                  maxLength={256} onChange={event => setPassword(event.target.value)} /></label>
                {accountMode === "register" && <small>{t.passwordHint}</small>}
                <button className="primary-button" type="submit" disabled={accountBusy}>{accountBusy ? t.signingIn : accountMode === "login" ? t.signIn : t.signUp}</button>
              </form>
            </>
          )}
          {accountIssue && <p className="editor-error" role="alert">{issueText(t, accountIssue)}</p>}
        </aside>
      </div>
    </dialog>
  );
}
