"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { CatalogBrowser } from "./catalog-browser";
import { songFollowCopy } from "./song-follow-panel";
import { workspaceCopy } from "./workspace-navigation";

type CatalogProps = ComponentProps<typeof CatalogBrowser>;
type PickerSong = CatalogProps["songs"][number];

export function PracticeSongPicker<Song extends PickerSong>({
  language, songs, activeId, onClose, onPick, onImport,
}: {
  language: CatalogProps["language"];
  songs: Song[];
  activeId?: string;
  onClose: () => void;
  onPick: (song: Song) => void;
  onImport: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog className="practice-song-picker" ref={dialogRef} onClose={event => {
      if (!event.currentTarget.open) onClose();
    }} aria-labelledby="practice-song-picker-title">
      <header>
        <h2 id="practice-song-picker-title">{songFollowCopy[language].choose}</h2>
        <button className="secondary-action" type="button" onClick={() => dialogRef.current?.close()}>
          {language === "tr" ? "Kapat" : "Close"}
        </button>
      </header>
      <CatalogBrowser compact songs={songs} language={language} activeId={activeId} busy={false}
        onOpen={song => { dialogRef.current?.close(); onPick(song); }} />
      <footer>
        <button className="secondary-action" type="button" onClick={() => { dialogRef.current?.close(); onImport(); }}>
          {workspaceCopy[language].convert}
        </button>
      </footer>
    </dialog>
  );
}
