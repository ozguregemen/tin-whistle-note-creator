"use client";

import { useRef, useState, type FormEvent } from "react";
import { fingeringFor } from "./fingerings.mjs";
import { NOTE_NAMES, noteChoicesForPattern, noteForPattern, registerForNote } from "./note-notation.mjs";
import { MAX_COMMUNITY_NOTATION, MAX_COMMUNITY_NOTES, parseCommunityNotation, validateCommunitySong } from "../shared/community-song.mjs";
import {
  communityIssue, communityRequest, type CommunityIssue, type CommunitySession, type CommunitySong,
} from "./community-client";

const copy = {
  en: {
    versionHint: "Start with empty cards or use the catalog notes as a starting point.",
    useNotes: "Use current notes", publishingAs: (author: string) => `Publish as @${author}`,
    song: "Song title", artist: "Artist (optional)", tempo: "Tempo (BPM)",
    method: "Note entry method", text: "Note names", fingers: "Fingerings", notes: "Notes",
    textHint: "Use letters or solfège. Separate phrases with a new line or |. Use D5 or Re+ for high D.",
    fingerHint: "Tap the holes to enter notes. Empty cards are skipped.",
    half: "Half cover", addNote: "Add note", addPhrase: "Add phrase", openHoles: "All holes open",
    note: "Note", hole: "Hole", remove: "Remove card", register: "Register", first: "Lower",
    second: "Upper", third: "Third", newPhrase: "New phrase", noMatch: "Check fingering",
    chooseRegister: "Choose register", registerHint: "This fingering works in these registers.",
    publish: "Publish to catalog", update: "Save changes", saving: "Saving…",
    published: "Published to the catalog.", updated: "Arrangement updated.", listen: "Listen",
    notesEntered: (count: number) => `${count} ${count === 1 ? "note" : "notes"}`,
    errors: {
      invalid_title: "Enter a song title with 2–100 characters.",
      invalid_artist: "The artist name can have up to 100 characters.",
      invalid_bpm: "Enter a whole tempo between 40 and 220 BPM.",
      notes_required: "Add at least one note.",
      invalid_note: "Enter a playable tin whistle note.",
      too_many_notes: "An arrangement can have up to 512 notes.",
      invalid_fingering: "Finish the highlighted fingering before continuing.",
      song_not_found: "This arrangement could not be found in your account.",
      community_unavailable: "The community service is unavailable. Try again in a moment.",
    },
  },
  tr: {
    versionHint: "Boş kartlarla başla veya katalogdaki notaları düzenlemene aktar.",
    useNotes: "Mevcut notaları getir", publishingAs: (author: string) => `Katalogda @${author} adıyla yayımlanacak`,
    song: "Şarkı adı", artist: "Sanatçı (isteğe bağlı)", tempo: "Tempo (BPM)",
    method: "Nota girme yöntemi", text: "Nota adları", fingers: "Parmak dizilimi", notes: "Notalar",
    textHint: "Do, Re veya C, D yazabilirsin. Ezgi bölümlerini yeni satırla veya | ile ayır. İnce Re için Re+ veya D5 yaz.",
    fingerHint: "Nota girmek için deliklere dokun. Boş kartlar atlanır.",
    half: "Yarım kapat", addNote: "Nota ekle", addPhrase: "Bölüm ekle", openHoles: "Tümü açık",
    note: "Nota", hole: "Delik", remove: "Kartı kaldır", register: "Ses bölgesi", first: "Alt",
    second: "Üst", third: "Üçüncü", newPhrase: "Yeni bölüm", noMatch: "Dizilimi kontrol et",
    chooseRegister: "Oktav seç", registerHint: "Bu dizilim şu ses bölgelerinde çalınır.",
    publish: "Katalogda yayımla", update: "Değişiklikleri kaydet", saving: "Kaydediliyor…",
    published: "Düzenleme katalogda yayımlandı.", updated: "Düzenleme güncellendi.", listen: "Dinle",
    notesEntered: (count: number) => `${count} nota`,
    errors: {
      invalid_title: "2–100 karakter arasında bir şarkı adı gir.",
      invalid_artist: "Sanatçı adı en fazla 100 karakter olabilir.",
      invalid_bpm: "40 ile 220 arasında tam sayı bir tempo gir.",
      notes_required: "En az bir nota ekle.",
      invalid_note: "Geçerli bir tin whistle notası gir.",
      too_many_notes: "Bir düzenlemede en fazla 512 nota olabilir.",
      invalid_fingering: "Devam etmeden önce gösterilen parmak dizilimini tamamla.",
      song_not_found: "Bu düzenleme hesabında bulunamadı.",
      community_unavailable: "Topluluğa şu anda ulaşılamıyor. Biraz sonra tekrar dene.",
    },
  },
};

type Language = keyof typeof copy;
type Register = 1 | 2 | 3;
type Cell = { id: number; holes: string; register: Register; entered: boolean; startsPhrase: boolean };

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

function diagramToText(cells: Cell[]): string | CommunityIssue {
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

function diagramFromNotes(notes: string): Cell[] | CommunityIssue {
  const parsed = parseCommunityNotation(notes);
  if ("error" in parsed) return parsed;
  let position = 0;
  return parsed.phrases.flatMap((phrase, phraseIndex) => phrase.map((note, index) => ({
    id: position++, holes: fingeringFor(note.pitch, note.octave)!, register: registerForNote(note) as Register,
    entered: true, startsPhrase: phraseIndex > 0 && index === 0,
  })));
}

function issueText(t: typeof copy[Language], issue: CommunityIssue) {
  const text = t.errors[issue.error as keyof typeof t.errors] ?? t.errors.community_unavailable;
  return issue.note ? `${text} (${issue.note})` : text;
}

export function SongEditor({ language, visible, source, author, session, onExpired, onSaved, onListen }: {
  language: Language;
  visible: boolean;
  source: EditorSource | null;
  author: string;
  session: CommunitySession | null;
  onExpired: () => void;
  onSaved: () => void;
  onListen: (song: CommunitySong) => void;
}) {
  const t = copy[language];
  const gridRef = useRef<HTMLOListElement>(null);
  const registerRef = useRef<HTMLSelectElement>(null);
  const listenRef = useRef<HTMLButtonElement>(null);
  const editingId = source && source.contributor === author ? source.id : null;
  const [title, setTitle] = useState(source?.title ?? "");
  const [artist, setArtist] = useState(source?.artist ?? "");
  const [bpm, setBpm] = useState(String(source?.rhythm?.bpm ?? 90));
  const [method, setMethod] = useState<"text" | "fingers">("fingers");
  const [notation, setNotation] = useState("");
  const nextCell = useRef(MAX_COMMUNITY_NOTES);
  const [cells, setCells] = useState<Cell[]>(() => {
    const savedDiagram = source?.contributor === author ? diagramFromNotes(source.notes) : null;
    return Array.isArray(savedDiagram) ? savedDiagram : templateCells(source?.notes);
  });
  const [selectedCell, setSelectedCell] = useState(0);
  const [half, setHalf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formIssue, setFormIssue] = useState<CommunityIssue | null>(null);
  const [saved, setSaved] = useState<CommunitySong | null>(null);
  const selectedIndex = Math.max(0, cells.findIndex(cell => cell.id === selectedCell));
  const activeCell = cells[selectedIndex];
  const activeLabel = `${t.note} ${selectedIndex + 1}`;
  const registerLabels = { 1: t.first, 2: t.second, 3: t.third };
  const resolved = cells.map(cell => {
    const note = cellNote(cell);
    return { note, choices: cell.entered && !note ? noteChoicesForPattern(cell.holes) : [] };
  });
  const registerChoices = resolved[selectedIndex].choices;
  const notesEntered = resolved.filter(({ note }) => note).length;
  const canImport = Boolean(source?.notes && (method === "text" ? !notation.trim() : !cells.some(cell => cell.entered)));

  function noteLabel(note: NonNullable<ReturnType<typeof noteForPattern>>) {
    const pitch = `${note.pitch}${note.octave}`;
    return language === "tr" ? `${NOTE_NAMES[note.pitch]} · ${pitch}` : pitch;
  }

  function fillDiagramFromNotes(notes: string) {
    const diagram = diagramFromNotes(notes);
    if (!Array.isArray(diagram)) { setFormIssue(diagram); return false; }
    setCells(diagram);
    setSelectedCell(0);
    return true;
  }

  function switchMethod(next: typeof method) {
    if (next === method) return;
    if (next === "fingers") {
      if (notation.trim()) {
        if (!fillDiagramFromNotes(notation)) return;
      } else {
        setCells(templateCells(source?.notes));
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
    if (formIssue?.error === "invalid_fingering") setFormIssue(null);
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
    if (!source?.notes || !canImport) return;
    if (method === "fingers" && !fillDiagramFromNotes(source.notes)) return;
    if (method === "text") setNotation(source.notes);
    setFormIssue(null);
  }

  async function saveArrangement(event: FormEvent) {
    event.preventDefault();
    if (saving || saved || !session) return;
    setFormIssue(null);
    const text = method === "text" ? notation : diagramToText(cells);
    if (typeof text !== "string") {
      setFormIssue(text);
      const invalid = cells[Number(text.note) - 1];
      if (invalid) gridRef.current?.querySelector<HTMLButtonElement>(`[data-note-position="${invalid.id}"]`)?.focus();
      return;
    }
    const draft = validateCommunitySong({ title, artist, bpm, notes: text });
    if ("error" in draft) { setFormIssue(draft); return; }
    setSaving(true);
    try {
      const song = await communityRequest<CommunitySong>(editingId ? `songs/${editingId}` : "songs", {
        method: editingId ? "PUT" : "POST", token: session.token, body: draft,
      });
      setSaved(song);
      onSaved();
      window.requestAnimationFrame(() => listenRef.current?.focus({ preventScroll: true }));
    } catch (error) {
      const issue = communityIssue(error);
      if (issue.error === "sign_in_required") onExpired();
      else setFormIssue(issue);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="editor-form" hidden={!visible} onSubmit={saveArrangement}>
      <div className="community-body editor-body">
        <fieldset className="editor-fields" disabled={saving || Boolean(saved)}>
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
          {!editingId && canImport && <p className="editor-help">{t.versionHint}</p>}
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
              <div className="editor-toolbar">
                <div className="editor-finger-tools" role="group" aria-label={activeLabel}>
                  <label>{t.register}
                    <select ref={registerRef} value={activeCell.register} aria-label={`${activeLabel} · ${t.register}`}
                      onChange={event => patchCell(activeCell.id, { register: Number(event.target.value) as Register })}>
                      <option value={1}>{t.first}</option><option value={2}>{t.second}</option><option value={3}>{t.third}</option>
                    </select>
                  </label>
                  <button type="button" className="secondary-action" aria-pressed={half} onClick={() => setHalf(value => !value)}>{t.half}</button>
                  <button type="button" className="secondary-action" onClick={() => patchCell(activeCell.id, { holes: "000000", entered: true })}>{t.openHoles}</button>
                  <button type="button" className="secondary-action" onClick={removeSelectedCell}>{t.remove}</button>
                </div>
                <div className="editor-actions">
                  <button type="button" className="secondary-action" disabled={cells.length >= MAX_COMMUNITY_NOTES} onClick={() => appendCell()}>{t.addNote}</button>
                  <button type="button" className="secondary-action" disabled={cells.length >= MAX_COMMUNITY_NOTES} onClick={() => appendCell(true)}>{t.addPhrase}</button>
                </div>
              </div>
              {registerChoices.length > 0 && (
                <div className="editor-register-choices" role="group" aria-label={`${activeLabel} · ${t.chooseRegister}`}>
                  <p>{t.registerHint}</p>
                  {registerChoices.map(({ register, note }) => (
                    <button key={register} type="button" className="secondary-action" onClick={() => {
                      patchCell(activeCell.id, { register });
                      registerRef.current?.focus({ preventScroll: true });
                    }}>{registerLabels[register]} · {noteLabel(note)}</button>
                  ))}
                </div>
              )}
              <ol className="song-follow-grid song-follow-attempts editor-note-grid" ref={gridRef} aria-describedby="editor-note-hint">
                {cells.map((cell, index) => {
                  const { note, choices } = resolved[index];
                  const number = index + 1;
                  const described = `${t.note} ${number}`;
                  const current = cell.id === activeCell.id;
                  return (
                    <li className={`song-follow-tile song-follow-attempt editor-note${current ? " current" : ""}${cell.startsPhrase ? " editor-phrase-start" : ""}${cell.entered && !note ? " editor-note-invalid" : ""}`} key={cell.id}>
                      <button type="button" className="song-follow-position editor-note-position" data-note-position={cell.id}
                        aria-pressed={current} aria-label={cell.startsPhrase ? `${described} · ${t.newPhrase}` : described}
                        onFocus={() => setSelectedCell(cell.id)} onClick={() => setSelectedCell(cell.id)}>{number}</button>
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
                        ? noteLabel(note)
                        : cell.entered ? (choices.length ? t.chooseRegister : t.noMatch) : ""}</output>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </fieldset>
      </div>
      <footer className="editor-footer">
        {formIssue && <p className="community-error" role="alert">{issueText(t, formIssue)}</p>}
        {saved ? (
          <div className="editor-publish-row">
            <p className="editor-success" role="status">{editingId ? t.updated : t.published}</p>
            <button className="community-primary" type="button" ref={listenRef} onClick={() => onListen(saved)}>{t.listen}</button>
          </div>
        ) : (
          <div className="editor-publish-row">
            <div className="editor-publication">
              {method === "fingers" && <strong>{t.notesEntered(notesEntered)}</strong>}
              <span>{t.publishingAs(author)}</span>
            </div>
            <button className="community-primary" type="submit" disabled={saving}>{saving ? t.saving : editingId ? t.update : t.publish}</button>
          </div>
        )}
      </footer>
    </form>
  );
}
