"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isUpperWhistleRegister } from "./fingerings.mjs";
import { describeLiveNote } from "./live-note-display.mjs";
import { PracticeMicrophone } from "./practice-microphone";
import { FollowFingering, songFollowCopy } from "./song-follow-panel";
import {
  buildTutorialSteps, completedTutorialLessons, TUTORIAL_LESSONS, TUTORIAL_PROGRESS_PREFIX, TUTORIAL_UNITS,
  type TutorialLesson,
} from "./tutorial-curriculum.mjs";

const copy = {
  en: {
    title: "Learn tin whistle",
    instrument: "High D tin whistle",
    intro: "Start with your first clear note. Learn the fingerings, then use them to play short tunes at your own pace.",
    progress: "Course progress",
    completedCount: (done: number, total: number) => `${done} of ${total} lessons completed`,
    stages: "Course stages",
    stage: (number: number) => `Stage ${number}`,
    start: "Start first lesson",
    continue: "Continue learning",
    review: "Review first lesson",
    completed: "Completed",
    next: "Up next",
    back: "Back to lessons",
    count: (number: number, total: number) => `Lesson ${number} of ${total}`,
    exercise: "Exercise",
    song: "Tune",
    notes: "Fingerings to know",
    legend: "Filled circles show covered holes, starting at the mouthpiece.",
    lower: "Lower",
    upper: "Upper",
    nextLesson: "Next lesson",
    finished: "You completed the course",
    saveIssue: "This browser could not save your progress for next time.",
  },
  tr: {
    title: "Tin whistle öğren",
    instrument: "Yüksek Re tin whistle",
    intro: "İlk temiz sesini çıkar. Parmak dizilimlerini öğren, ardından kısa ezgileri kendi hızında çal.",
    progress: "Eğitim ilerlemesi",
    completedCount: (done: number, total: number) => `${total} dersten ${done} tamamlandı`,
    stages: "Eğitim kademeleri",
    stage: (number: number) => `${number}. kademe`,
    start: "İlk derse başla",
    continue: "Öğrenmeye devam et",
    review: "İlk dersi tekrar et",
    completed: "Tamamlandı",
    next: "Sıradaki",
    back: "Derslere dön",
    count: (number: number, total: number) => `${number}. ders / ${total}`,
    exercise: "Alıştırma",
    song: "Ezgi",
    notes: "Parmak dizilimleri",
    legend: "Delikler ağızlıktan uca sıralanır. Dolu daireler kapalı delikleri gösterir.",
    lower: "Pes",
    upper: "Tiz",
    nextLesson: "Sıradaki ders",
    finished: "Eğitimi tamamladın",
    saveIssue: "Tarayıcı ilerlemeni bir sonraki oturum için kaydedemedi.",
  },
};

type Language = keyof typeof copy;

function LessonPractice({ language, lesson, onUseChange, onComplete }: {
  language: Language;
  lesson: TutorialLesson;
  onUseChange: (active: boolean) => void;
  onComplete: () => void;
}) {
  const t = copy[language];
  const steps = useMemo(() => buildTutorialSteps(lesson), [lesson]);
  return (
    <>
      <div className="tutorial-lesson-prep">
        <p className="tutorial-instruction">{lesson.guide[language]}</p>
        <section className="tutorial-note-reference" aria-labelledby="tutorial-notes-title">
          <div>
            <h2 id="tutorial-notes-title">{t.notes}</h2>
            <p>{t.legend}</p>
          </div>
          <ul className="tutorial-note-list">
            {lesson.focus.map(token => {
              const step = steps.find(note => note.pitch + (note.octave - 1) === token);
              if (!step) return null;
              const note = describeLiveNote(step, language);
              const register = isUpperWhistleRegister(step.pitch, step.octave - 1) ? t.upper : t.lower;
              return (
                <li className="tutorial-note" key={token}>
                  <FollowFingering holes={note.holes} copy={songFollowCopy[language]} />
                  <div><strong>{note.name}</strong><small>{note.sounding} · {register}</small></div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <PracticeMicrophone language={language} steps={steps} visible onUseChange={onUseChange}
        lesson={{ onComplete }} />
    </>
  );
}

export function TutorialWorkspace({ language, onUseChange }: {
  language: Language;
  onUseChange: (active: boolean) => void;
}) {
  const t = copy[language];
  const [lesson, setLesson] = useState<TutorialLesson | null>(null);
  const [completed, setCompleted] = useState<string[]>(() => {
    try { return completedTutorialLessons(window.localStorage); } catch { return []; }
  });
  const [saveIssue, setSaveIssue] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    function readProgress(event?: StorageEvent) {
      if (event?.key && !event.key.startsWith(TUTORIAL_PROGRESS_PREFIX)) return;
      try { setCompleted(completedTutorialLessons(window.localStorage)); } catch { /* Keep progress for this visit. */ }
    }
    window.addEventListener("storage", readProgress);
    return () => window.removeEventListener("storage", readProgress);
  }, []);

  function openLesson(selected: TutorialLesson | null) {
    setLesson(selected);
    window.requestAnimationFrame(() => {
      if (!titleRef.current) return;
      titleRef.current.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }

  function finishLesson(id: string) {
    try {
      window.localStorage.setItem(TUTORIAL_PROGRESS_PREFIX + id, "1");
      setSaveIssue(false);
    } catch {
      setSaveIssue(true);
    }
    setCompleted(current => current.includes(id) ? current : [...current, id]);
  }

  const total = TUTORIAL_LESSONS.length;
  const remaining = TUTORIAL_LESSONS.find(item => !completed.includes(item.id));
  const percentage = new Intl.NumberFormat(language, { style: "percent" }).format(completed.length / total);
  const formattedCount = t.completedCount(completed.length, total);

  if (lesson) {
    const index = TUTORIAL_LESSONS.indexOf(lesson);
    const nextLesson = TUTORIAL_LESSONS[index + 1];
    const done = completed.includes(lesson.id);
    return (
      <section id="tutorial-workspace" className="tutorial tutorial-detail" aria-labelledby="tutorial-title">
        <button type="button" className="secondary-action tutorial-back" onClick={() => openLesson(null)}>
          <span aria-hidden="true">←</span> {t.back}
        </button>
        <header className="tutorial-lesson-heading">
          <div>
            <p className="tutorial-lesson-position">
              {t.count(index + 1, total)} · {t[lesson.kind]}{lesson.meter && ` · ${lesson.meter}`}
            </p>
            <h1 id="tutorial-title" tabIndex={-1} ref={titleRef}>{lesson.title[language]}</h1>
          </div>
          <span className="tutorial-lesson-progress">{t.progress} <strong>{percentage}</strong></span>
        </header>
        <LessonPractice key={lesson.id} language={language} lesson={lesson} onUseChange={onUseChange}
          onComplete={() => finishLesson(lesson.id)} />
        {done && (
          <div className="tutorial-completion">
            <div>
              <strong><span aria-hidden="true">✓</span> {remaining ? t.completed : t.finished}</strong>
              <p>{formattedCount}</p>
              {saveIssue && <p role="status">{t.saveIssue}</p>}
            </div>
            {nextLesson ? <button type="button" className="tutorial-primary" onClick={() => openLesson(nextLesson)}>
              {t.nextLesson} <span aria-hidden="true">→</span>
            </button> : <button type="button" className="secondary-action" onClick={() => openLesson(null)}>{t.back}</button>}
          </div>
        )}
      </section>
    );
  }

  return (
    <section id="tutorial-workspace" className="tutorial" aria-labelledby="tutorial-title">
      <header className="tutorial-overview">
        <div className="tutorial-intro">
          <p className="tutorial-instrument">{t.instrument}</p>
          <h1 id="tutorial-title" tabIndex={-1} ref={titleRef}>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        <div className="tutorial-progress">
          <div className="tutorial-progress-heading"><span>{t.progress}</span><strong>{percentage}</strong></div>
          <progress aria-label={t.progress} aria-valuetext={formattedCount} value={completed.length} max={total} />
          <p>{formattedCount}</p>
          <button type="button" className="tutorial-primary" onClick={() => openLesson(remaining ?? TUTORIAL_LESSONS[0])}>
            {completed.length ? (remaining ? t.continue : t.review) : t.start} <span aria-hidden="true">→</span>
          </button>
        </div>
      </header>
      <ol className="tutorial-units" aria-label={t.stages}>
        {TUTORIAL_UNITS.map((unit, index) => {
          const doneCount = unit.lessons.filter(item => completed.includes(item.id)).length;
          return (
            <li className="tutorial-unit" key={unit.id}>
              <header className="tutorial-unit-heading">
                <div>
                  <p className="tutorial-unit-position">{t.stage(index + 1)}</p>
                  <h2>{unit.title[language]}</h2>
                  <p>{unit.summary[language]}</p>
                </div>
                <span className="tutorial-unit-progress">
                  <span aria-hidden="true">{doneCount} / {unit.lessons.length}</span>
                  <span className="sr-only">{t.completedCount(doneCount, unit.lessons.length)}</span>
                </span>
              </header>
              <ol className="tutorial-lessons">
                {unit.lessons.map(item => {
                  const done = completed.includes(item.id);
                  return (
                    <li key={item.id}>
                      <button type="button" className="tutorial-lesson-link" data-next={item === remaining} onClick={() => openLesson(item)}>
                        <span><small>{t[item.kind]}</small><strong>{item.title[language]}</strong></span>
                        {done ? <span className="tutorial-done"><span aria-hidden="true">✓</span><span className="sr-only">{t.completed}</span></span>
                          : item === remaining ? <span className="tutorial-next">{t.next}</span>
                            : <span className="tutorial-chevron" aria-hidden="true">›</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
