import { normalizeNote } from "./note-notation.mjs";
import { buildPlaybackPlan } from "./practice.mjs";
import { buildFollowSteps } from "./song-follow.mjs";

/** @typedef {{ en: string, tr: string }} Localized */
/** @typedef {{ id: string, title: Localized, guide: Localized, kind: "exercise" | "song", focus: string[], bpm: number, score: string }} TutorialLesson */
/** @typedef {{ id: string, title: Localized, summary: Localized, lessons: TutorialLesson[] }} TutorialUnit */

/** @type {TutorialUnit[]} */
export const TUTORIAL_UNITS = [
  {
    id: "first-sounds",
    title: { en: "First sounds", tr: "İlk sesler" },
    summary: { en: "Steady breath and the top three holes.", tr: "Sabit nefes ve üstteki üç delik." },
    lessons: [
      {
        id: "first-b",
        title: { en: "Your first note", tr: "İlk notan" },
        guide: {
          en: "Support the whistle with your thumbs behind it and place your left hand nearest the mouthpiece. Cover just the top hole with the pad of your index finger. Blow gently for a steady B. Leave a short gap before each repeat.",
          tr: "Başparmaklarınla çalgıyı arkadan destekle ve sol elini ağızlığa yakın tut. Yalnızca en üst deliği işaret parmağının yumuşak kısmıyla kapat. Hafifçe üfleyerek sabit bir Si sesi çıkar. Her tekrardan önce kısa bir ara ver.",
        },
        kind: "exercise", focus: ["B4"], bpm: 60, score: "B4:2 B4:2 B4:2",
      },
      {
        id: "b-a-g",
        title: { en: "B, A and G", tr: "Si, La ve Sol" },
        guide: {
          en: "Keep the top hole closed. Add your middle finger for A and your ring finger for G. Let each finger land softly and cover its entire hole.",
          tr: "En üst delik kapalı kalsın. La için orta parmağını, Sol için yüzük parmağını da indir. Her parmağını gevşek tut ve deliğin tamamını kapat.",
        },
        kind: "exercise", focus: ["B4", "A4", "G4"], bpm: 64, score: "B4 A4 G4:2 A4 B4 A4 G4:2",
      },
      {
        id: "hot-cross-buns",
        title: { en: "Hot Cross Buns", tr: "Hot Cross Buns" },
        guide: {
          en: "Use your three new notes in a traditional tune. Listen for the short repeated Gs and As. Start each repeat with a light “tu” so the notes stay separate.",
          tr: "Üç yeni notanı bu geleneksel ezgide kullan. Kısa Sol ve La tekrarlarını dinle. Notaları ayırmak için her tekrara hafif bir “tü” ile başla.",
        },
        kind: "song", focus: ["B4", "A4", "G4"], bpm: 70,
        score: "B4 A4 G4:2 B4 A4 G4:2 G4:0.5 G4:0.5 G4:0.5 G4:0.5 A4:0.5 A4:0.5 A4:0.5 A4:0.5 B4 A4 G4:2",
      },
    ],
  },
  {
    id: "both-hands",
    title: { en: "Both hands", tr: "İki el birlikte" },
    summary: { en: "Add the lower notes and play a longer phrase.", tr: "Pes notaları ekle ve daha uzun bir cümle çal." },
    lessons: [
      {
        id: "f-sharp-e",
        title: { en: "F♯ and E", tr: "Fa diyez ve Mi" },
        guide: {
          en: "Cover the top three holes with your left hand. Add your right index finger for F♯ and your right middle finger for E. Keep the other fingers near their holes.",
          tr: "Sol elinle üstteki üç deliği kapat. Fa diyez için sağ işaret parmağını, Mi için sağ orta parmağını da indir. Diğer parmaklarını deliklerine yakın tut.",
        },
        kind: "exercise", focus: ["G4", "F#4", "E4"], bpm: 66, score: "G4 F#4 E4:2 F#4 G4 F#4 E4:2",
      },
      {
        id: "low-d",
        title: { en: "Low D", tr: "Pes Re" },
        guide: {
          en: "Close all six holes for low D. Use a gentle, steady stream of air. If the note squeaks, check that every hole is sealed and ease the breath.",
          tr: "Pes Re için altı deliği de kapat. Hafif ve sabit üfle. Ses tizleşirse tüm deliklerin tam kapandığını kontrol et ve nefesini yumuşat.",
        },
        kind: "exercise", focus: ["F#4", "E4", "D4"], bpm: 66, score: "F#4 E4 D4:2 E4 F#4 E4 D4:2",
      },
      {
        id: "frere-jacques",
        title: { en: "Frère Jacques", tr: "Frère Jacques" },
        guide: {
          en: "Play the opening of this French round with five notes. Listen for the repeated four-note phrase, then let the final As ring out.",
          tr: "Bu Fransız kanonunun girişini beş notayla çal. Dört notalı cümlenin tekrarını dinle ve sondaki La notalarını uzat.",
        },
        kind: "song", focus: ["D4", "F#4", "A4"], bpm: 74,
        score: "D4 E4 F#4 D4 D4 E4 F#4 D4 F#4 G4 A4:2 F#4 G4 A4:2",
      },
    ],
  },
  {
    id: "rhythm-and-scale",
    title: { en: "Rhythm and scale", tr: "Ritim ve dizi" },
    summary: { en: "Shape longer and shorter notes and climb to C♯.", tr: "Uzun ve kısa notaları ayır, Do diyeze kadar çık." },
    lessons: [
      {
        id: "steady-beat",
        title: { en: "Long and short notes", tr: "Uzun ve kısa notalar" },
        guide: {
          en: "Tap a steady beat while you listen. The first D lasts two beats. The two quick Es share one beat. Use a light tongue movement to separate repeats.",
          tr: "Örneği dinlerken düzenli vuruş tut. İlk Re iki vuruş sürer. İki kısa Mi, bir vuruşu paylaşır. Tekrarları dilini hafifçe oynatarak ayır.",
        },
        kind: "exercise", focus: ["D4", "E4", "F#4"], bpm: 68,
        score: "D4:2 D4 D4 E4:0.5 E4:0.5 F#4 E4 D4",
      },
      {
        id: "c-sharp",
        title: { en: "Up to C♯", tr: "Do diyeze çıkış" },
        guide: {
          en: "Open all six holes for C♯ and support the whistle from behind. Play up from low D, then move back down one step at a time.",
          tr: "Do diyez için altı deliği de aç ve çalgıyı arkadan destekle. Pes Re’den yukarı çık, ardından basamak basamak geri in.",
        },
        kind: "exercise", focus: ["D4", "B4", "C#5"], bpm: 70,
        score: "D4 E4 F#4 G4 A4 B4 C#5:2 B4 A4 G4 F#4 E4 D4:2",
      },
      {
        id: "ode-to-joy",
        title: { en: "Ode to Joy", tr: "Neşeye Övgü" },
        guide: {
          en: "Play the opening of Beethoven’s melody in D. Keep the repeated notes distinct and listen for the long-short pair near the end of the phrase.",
          tr: "Beethoven’ın ezgisinin girişini Re’de çal. Tekrarlanan notaları ayrı duyur ve cümlenin sonuna yakın uzun-kısa çifti dinle.",
        },
        kind: "song", focus: ["F#4", "G4", "A4"], bpm: 78,
        score: "F#4 F#4 G4 A4 A4 G4 F#4 E4 D4 D4 E4 F#4 F#4:1.5 E4:0.5 E4:2",
      },
    ],
  },
  {
    id: "upper-register",
    title: { en: "Upper register", tr: "Üst oktav" },
    summary: { en: "Find upper D and E, then bring both registers into a tune.", tr: "Tiz Re ve Mi’yi öğren, ardından iki oktavı bir ezgide kullan." },
    lessons: [
      {
        id: "two-ds",
        title: { en: "Two Ds", tr: "İki farklı Re" },
        guide: {
          en: "Play low D first. For upper D, lift the finger on the top hole, seal the other five and increase the air speed smoothly. Listen to the octave jump before repeating it.",
          tr: "Önce pes Re’yi çal. Tiz Re için en üst deliği aç, diğer beşini kapat ve hava akışını yavaşça hızlandır. Tekrarlamadan önce oktav farkını dinle.",
        },
        kind: "exercise", focus: ["D4", "D5"], bpm: 66,
        score: "D4:2 D5:2 D4:2 B4 A4 B4 C#5 D5:2",
      },
      {
        id: "upper-e",
        title: { en: "Upper E and back", tr: "Tiz Mi ve dönüş" },
        guide: {
          en: "Upper E uses the same holes as low E. Listen to both, then use a more focused air stream to reach the higher note. Soften the air as you descend.",
          tr: "Tiz Mi ile pes Mi’nin parmak dizilimi aynı. İkisini dinle, sonra tiz notaya daha hızlı ve kontrollü üfleyerek çık. Pes notalara dönerken nefesini yumuşat.",
        },
        kind: "exercise", focus: ["E4", "D5", "E5"], bpm: 68,
        score: "E4:2 E5:2 D5 B4 A4 D5 E5 D5:2 C#5 B4 A4 E4:2",
      },
      {
        id: "amazing-grace",
        title: { en: "Amazing Grace", tr: "Amazing Grace" },
        guide: {
          en: "Put the skills together in the first two phrases of New Britain. Breathe between phrases and prepare for the final jump to upper D.",
          tr: "New Britain ezgisinin ilk iki cümlesinde öğrendiklerini birleştir. Cümleler arasında nefes al ve sondaki tiz Re sıçramasına hazırlan.",
        },
        kind: "song", focus: ["D4", "G4", "D5"], bpm: 80,
        score: "D4 G4:2 B4:0.5 G4:0.5 B4:2 A4 G4:2 E4 D4:2 D4 G4:2 B4:0.5 G4:0.5 B4:2 A4 D5:5",
      },
    ],
  },
];

export const TUTORIAL_LESSONS = TUTORIAL_UNITS.flatMap(unit => unit.lessons);
export const TUTORIAL_PROGRESS_PREFIX = "twnc-tutorial:completed:";

/** @param {TutorialLesson} lesson */
export function buildTutorialSteps(lesson) {
  const notes = [];
  const beats = [];
  for (const token of lesson.score.trim().split(/\s+/)) {
    const [label, duration = "1"] = token.split(":");
    const note = normalizeNote(label);
    const length = Number(duration);
    if (!note || !Number.isFinite(length) || length <= 0) return [];
    notes.push(note);
    beats.push(length);
  }
  return buildFollowSteps(buildPlaybackPlan([notes], { durations: [beats] }, lesson.bpm));
}

/** @param {Pick<Storage, "getItem">} storage */
export function completedTutorialLessons(storage) {
  return TUTORIAL_LESSONS.filter(lesson => storage.getItem(TUTORIAL_PROGRESS_PREFIX + lesson.id) === "1")
    .map(lesson => lesson.id);
}
