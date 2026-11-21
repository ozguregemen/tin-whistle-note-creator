import { normalizeNote } from "./note-notation.mjs";
import { buildPlaybackPlan } from "./practice.mjs";
import { buildFollowSteps } from "./song-follow.mjs";

/** @typedef {{ en: string, tr: string }} Localized */
/** @typedef {{ id: string, title: Localized, guide: Localized, kind: "exercise" | "song", focus: string[], bpm: number, score: string, meter?: "2/4" | "3/4" | "6/8" }} TutorialLesson */
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
        id: "b-to-a",
        title: { en: "From B to A", tr: "Si’den La’ya" },
        guide: {
          en: "Keep your left index finger down and lower your middle finger to move from B to A. Keep the air steady through the change. On the way back, lift just the middle finger.",
          tr: "Si’den La’ya geçerken sol işaret parmağın yerinde kalsın, orta parmağını indir. Geçiş boyunca sabit üfle. Si’ye dönerken sadece orta parmağını kaldır.",
        },
        kind: "exercise", focus: ["B4", "A4"], bpm: 60, score: "B4:2 A4:2 B4:2 A4:2 B4:2",
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
      {
        id: "twinkle-twinkle",
        title: { en: "Twinkle, Twinkle, Little Star", tr: "Parla Parla Küçük Yıldız" },
        guide: {
          en: "Play the first two phrases. For the opening jump from low D to A, keep the top two fingers down and lift the lower four together. Breathe after the long A.",
          tr: "Ezginin ilk iki cümlesini çal. Başta pes Re’den La’ya geçerken üstteki iki parmağın kapalı kalsın, alttaki dört parmağını birlikte kaldır. Uzun La’dan sonra nefes al.",
        },
        kind: "song", focus: ["D4", "A4", "B4"], bpm: 72,
        score: "D4 D4 A4 A4 B4 B4 A4:2 G4 G4 F#4 F#4 E4 E4 D4:2",
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
      {
        id: "three-beat-waltz",
        title: { en: "A three-beat waltz", tr: "Üç vuruşluk vals" },
        guide: {
          en: "Count one, two, three as the example plays. The first beat of each bar sounds a little stronger. Keep counting the second beat when a note lasts two beats.",
          tr: "Örnek çalarken bir, iki, üç diye say. Her ölçünün ilk vuruşu biraz daha güçlü duyulur. Bir nota iki vuruş sürdüğünde ikinci vuruşu da saymaya devam et.",
        },
        kind: "exercise", focus: ["D4", "F#4", "A4"], bpm: 72, meter: "3/4",
        score: "D4 F#4 A4 A4 G4 E4 D4:2 F#4 E4:2 D4",
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
      {
        id: "upper-f-sharp",
        title: { en: "Upper F♯", tr: "Tiz Fa diyez" },
        guide: {
          en: "Begin on upper D and climb through E to F♯. Keep the air flowing as you change fingers. End by easing back to low F♯ with the same fingering and gentler air.",
          tr: "Tiz Re’den başla, Mi üzerinden Fa diyeze çık. Parmak değiştirirken hava akışını sürdür. Sonunda aynı parmak dizilimiyle daha yumuşak üfleyip pes Fa diyeze dön.",
        },
        kind: "exercise", focus: ["F#4", "E5", "F#5"], bpm: 68,
        score: "D5 E5 F#5:2 E5 F#5 E5 D5:2 F#5:2 F#4:2",
      },
    ],
  },
  {
    id: "new-keys",
    title: { en: "New keys", tr: "Yeni tonlar" },
    summary: { en: "Reach upper G and use C natural in G major and E minor.", tr: "Tiz Sol’a ulaş, Do natüreli Sol majör ve Mi minörde kullan." },
    lessons: [
      {
        id: "upper-g",
        title: { en: "Upper G", tr: "Tiz Sol" },
        guide: {
          en: "Use the same three closed holes for both Gs. As you climb from upper E through F♯, keep the air focused. Soften the air when you return to low G.",
          tr: "İki Sol için de üstteki üç deliği kapat. Tiz Mi’den Fa diyez üzerinden yukarı çıkarken hava akışını sabit tut. Pes Sol’a dönerken nefesini yumuşat.",
        },
        kind: "exercise", focus: ["G4", "F#5", "G5"], bpm: 68,
        score: "G4:2 E5 F#5 G5:2 F#5 E5 G5:2 G4:2",
      },
      {
        id: "c-natural",
        title: { en: "C natural", tr: "Do natürel" },
        guide: {
          en: "For C natural, leave the top hole open and close holes two and three. For C♯, open all six holes. Listen to the small step between the two notes before trying the changes.",
          tr: "Do natürel için en üst deliği açık bırak, ikinci ve üçüncü delikleri kapat. Do diyezde altı delik de açık. Geçişi çalmadan önce iki ses arasındaki yarım tonu dinle.",
        },
        kind: "exercise", focus: ["B4", "C5", "C#5"], bpm: 68,
        score: "B4 C5:2 C#5:2 C5:2 B4 A4 B4 C5:2",
      },
      {
        id: "g-major-scale",
        title: { en: "G major scale", tr: "Sol majör dizisi" },
        guide: {
          en: "Climb from low G to upper G and return. Remember C natural on the way up and down. Break the scale into shorter groups if the upper notes need another try.",
          tr: "Pes Sol’dan tiz Sol’a çık ve geri dön. Hem çıkarken hem inerken Do natürel çal. Tiz geçişlerde zorlanırsan diziyi kısa gruplar halinde çalış.",
        },
        kind: "exercise", focus: ["G4", "C5", "G5"], bpm: 72,
        score: "G4 A4 B4 C5 D5 E5 F#5 G5:2 F#5 E5 D5 C5 B4 A4 G4:2",
      },
      {
        id: "e-minor-air",
        title: { en: "An air in E minor", tr: "Mi minör ezgisi" },
        guide: {
          en: "Apply C natural in a short original melody. Keep the higher phrase flowing and hear the return to low E at the end.",
          tr: "Do natüreli kısa, özgün bir ezgide kullan. Tiz cümlede nefes akışını sürdür ve sonda ezginin pes Mi’ye döndüğünü dinle.",
        },
        kind: "song", focus: ["E4", "C5", "E5"], bpm: 72,
        score: "E4 G4 A4 B4 B4 C5 B4 G4 A4 B4 C5 D5 E5:2 D5 C5 B4 A4 F#4 E4:2",
      },
    ],
  },
  {
    id: "irish-dances",
    title: { en: "Irish dance tunes", tr: "İrlanda dans ezgileri" },
    summary: { en: "Hear the pulse of a polka and a jig, then play each in a tune.", tr: "Polka ve jig vuruşlarını duy, ardından ikisini de bir ezgide çal." },
    lessons: [
      {
        id: "polka-pulse",
        title: { en: "Polka pulse", tr: "Polka vuruşu" },
        guide: {
          en: "Tap two beats per bar. Hear a stronger first beat followed by a lighter second beat, which sometimes contains two quicker notes.",
          tr: "Her ölçüde iki vuruş tut. İlk vuruş daha güçlü duyulur. Daha hafif olan ikinci vuruş kimi ölçülerde iki kısa notaya bölünür.",
        },
        kind: "exercise", focus: ["G4", "B4", "C5"], bpm: 76, meter: "2/4",
        score: "G4 B4:0.5 A4:0.5 G4 B4:0.5 C5:0.5 D5 C5:0.5 B4:0.5 A4 G4",
      },
      {
        id: "rakes-of-mallow",
        title: { en: "The Rakes of Mallow", tr: "The Rakes of Mallow" },
        guide: {
          en: "Use the two-beat pulse in the opening strain. Listen to the quick turns at the ends of the phrases, then work through the notes at your own pace.",
          tr: "İki vuruşlu düzeni ezginin ilk bölümünde uygula. Cümle sonlarındaki hızlı geçişleri dinle, ardından notaları kendi hızında çal.",
        },
        kind: "song", focus: ["G4", "C5", "D5"], bpm: 76, meter: "2/4",
        score: [
          "G4:0.5 B4:0.5 G4:0.5 B4:0.5 G4:0.5 B4:0.5 C5:0.25 B4:0.25 A4:0.25 G4:0.25",
          "F#4:0.5 A4:0.5 F#4:0.5 A4:0.5 F#4:0.5 A4:0.5 D5:0.25 C5:0.25 B4:0.25 A4:0.25",
          "G4:0.5 B4:0.5 G4:0.5 B4:0.5 G4:0.5 B4:0.5 D5:0.5 B4:0.5",
          "C5:0.25 B4:0.25 A4:0.25 G4:0.25 F#4:0.25 G4:0.25 A4:0.25 C5:0.25 B4:0.5 G4:0.5 G4:1",
        ].join(" "),
      },
      {
        id: "jig-pulse",
        title: { en: "Two groups of three", tr: "Jig’in üçlü grupları" },
        guide: {
          en: "Hear two groups of three in 6/8. Tap on counts one and four. Keep the three notes in each group moving at an even pace.",
          tr: "6/8’lik ölçüde iki tane üçlü grup duy. Birinci ve dördüncü sayılarda vuruş tut. Her grubun üç notasını eşit aralıklarla çal.",
        },
        kind: "exercise", focus: ["G4", "A4", "D5"], bpm: 84, meter: "6/8",
        score: [
          "G4:0.5 B4:0.5 D5:0.5 B4:0.5 A4:0.5 G4:0.5",
          "F#4:0.5 A4:0.5 D5:0.5 A4:0.5 G4:0.5 F#4:0.5",
          "E4:0.5 G4:0.5 B4:0.5 G4:0.5 F#4:0.5 E4:0.5",
          "D4:0.5 F#4:0.5 A4:0.5 D5:1.5",
        ].join(" "),
      },
      {
        id: "irish-washerwoman",
        title: { en: "The Irish Washerwoman", tr: "The Irish Washerwoman" },
        guide: {
          en: "Play the first strain of this traditional jig. Hear the two pulses in each bar. Take a short breath halfway through, then play to the final held G.",
          tr: "Bu geleneksel jig’in ilk bölümünü çal. Her ölçüdeki iki ana vuruşu duy. Ortada kısa bir nefes al ve ezgiyi uzun Sol ile bitir.",
        },
        kind: "song", focus: ["G4", "C5", "D5"], bpm: 84, meter: "6/8",
        // Goulding setting from the O'Neill collection, with the pickup omitted and the final G held.
        score: [
          "B4:0.5 G4:0.5 G4:0.5 D4:0.5 G4:0.5 G4:0.5",
          "B4:0.5 G4:0.5 B4:0.5 D5:0.5 C5:0.5 B4:0.5",
          "C5:0.5 A4:0.5 A4:0.5 E4:0.5 A4:0.5 A4:0.5",
          "C5:0.5 A4:0.5 C5:0.5 E5:0.5 D5:0.5 C5:0.5",
          "B4:0.5 G4:0.5 G4:0.5 D4:0.5 G4:0.5 G4:0.5",
          "B4:0.5 G4:0.5 B4:0.5 D5:0.5 C5:0.5 B4:0.5",
          "C5:0.5 B4:0.5 C5:0.5 A4:0.5 D5:0.5 C5:0.5",
          "B4:0.5 G4:0.5 G4:0.5 G4:1.5",
        ].join(" "),
      },
    ],
  },
];

export const TUTORIAL_LESSONS = TUTORIAL_UNITS.flatMap(unit => unit.lessons);
export const TUTORIAL_PROGRESS_PREFIX = "twnc-tutorial:completed:";

/**
 * @param {TutorialLesson} lesson
 * @returns {import("./song-follow.mjs").FollowStep[]}
 */
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
  const steps = buildFollowSteps(buildPlaybackPlan([notes], { durations: [beats] }, lesson.bpm));
  if (!lesson.meter) return steps;
  const barLength = lesson.meter === "2/4" ? 2 : 3;
  let elapsed = 0;
  return steps.map((step, index) => {
    const position = elapsed % barLength;
    elapsed += beats[index];
    if (position === 0) return { ...step, accent: "bar" };
    if (lesson.meter === "6/8" && position === 1.5) return { ...step, accent: "beat" };
    return step;
  });
}

/** @param {Pick<Storage, "getItem">} storage */
export function completedTutorialLessons(storage) {
  return TUTORIAL_LESSONS.filter(lesson => storage.getItem(TUTORIAL_PROGRESS_PREFIX + lesson.id) === "1")
    .map(lesson => lesson.id);
}
