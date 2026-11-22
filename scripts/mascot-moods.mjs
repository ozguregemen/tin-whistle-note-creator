// In-app mascot expressions, derived from mobile/brand/mascot.svg by swapping the
// eyes, sweat, cheek and notes groups. Used by scripts/build-brand.mjs.
const INK = "#2b2320";
const CREAM = "#f3ead8";
const GOLD = "#e7c45a";

const EYES = {
  // Looks at the user: direct gaze for welcome screens.
  welcome: `<g id="eyes">
    <path d="M132 90 Q148 76 168 86" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M200 96 Q214 86 230 94" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <circle cx="154" cy="126" r="23" fill="#ffffff" stroke="${INK}" stroke-width="5"/>
    <ellipse cx="213" cy="124" rx="16" ry="21" fill="#ffffff" stroke="${INK}" stroke-width="4.5"/>
    <circle cx="150" cy="127" r="10.5" fill="#231d1a"/><circle cx="154" cy="122" r="3.6" fill="#ffffff"/>
    <circle cx="209" cy="125" r="7.5" fill="#231d1a"/><circle cx="212" cy="121" r="2.6" fill="#ffffff"/>
  </g>`,
  // Eyes shut, carried away by the music: a correct note.
  correct: `<g id="eyes">
    <path d="M132 96 Q150 84 170 94" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M200 98 Q214 92 228 98" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M134 128 Q154 144 174 128" stroke="${INK}" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    <path d="M200 126 Q213 138 226 126" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  </g>`,
  // Wide, mismatched eyes looking two ways: a wrong note.
  oops: `<g id="eyes">
    <path d="M128 84 Q146 66 168 80" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M200 90 Q216 76 232 88" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <circle cx="154" cy="124" r="26" fill="#ffffff" stroke="${INK}" stroke-width="5"/>
    <ellipse cx="214" cy="122" rx="18" ry="24" fill="#ffffff" stroke="${INK}" stroke-width="4.5"/>
    <circle cx="146" cy="118" r="6" fill="#231d1a"/>
    <circle cx="221" cy="130" r="5" fill="#231d1a"/>
  </g>`,
  // A wink at the user: lesson or song finished.
  celebrate: `<g id="eyes">
    <path d="M132 92 Q150 80 170 90" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M200 92 Q214 80 230 90" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M134 130 Q154 116 174 130" stroke="${INK}" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="213" cy="124" rx="16" ry="21" fill="#ffffff" stroke="${INK}" stroke-width="4.5"/>
    <circle cx="209" cy="125" r="7.5" fill="#231d1a"/><circle cx="212" cy="121" r="2.6" fill="#ffffff"/>
  </g>`,
};

const note = (x, y, scale = 1) => `<path transform="translate(${x} ${y}) scale(${scale})" d="M0 0 L0 40 Q-7 34 -15 38 Q-25 44 -20 52 Q-13 60 -1 54 Q8 49 8 40 L8 16 Q21 20 23 32 Q29 12 8 0 Z" fill="${CREAM}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
const sparkle = (x, y, r) => `<path d="M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z" fill="${GOLD}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;

const NOTES = {
  welcome: `<g id="notes">${note(303, 40)}</g>`,
  correct: `<g id="notes">${note(300, 44)}${note(330, 108, 0.65)}${note(268, 18, 0.6)}</g>`,
  // A crooked grey note and a wobble line: the "falso".
  oops: `<g id="notes"><path transform="translate(300 48) rotate(24)" d="M0 0 L0 40 Q-7 34 -15 38 Q-25 44 -20 52 Q-13 60 -1 54 Q8 49 8 40 L8 16 Q21 20 23 32 Q29 12 8 0 Z" fill="#b9b2ab" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M262 120 q8 -12 16 0 t16 0 t16 0" stroke="#b9b2ab" stroke-width="5" fill="none" stroke-linecap="round"/></g>`,
  celebrate: `<g id="notes">${note(304, 40)}${sparkle(268, 30, 13)}${sparkle(334, 118, 11)}${sparkle(92, 40, 10)}</g>`,
};

/** @param {string} mascot @param {"welcome"|"focus"|"correct"|"oops"|"celebrate"} mood */
export function mascotMood(mascot, mood) {
  if (mood === "focus") return mascot;
  let svg = mascot
    .replace(/<g id="eyes">[\s\S]*?<\/g>/, EYES[mood])
    .replace(/<g id="notes"[\s\S]*?<\/g>/, NOTES[mood]);
  if (mood !== "oops") svg = svg.replace(/<g id="sweat">[\s\S]*?<\/g>/, "");
  if (mood === "correct") svg = svg.replace('<ellipse cx="180" cy="210" rx="20" ry="17"', '<ellipse cx="180" cy="208" rx="25" ry="21"');
  return svg;
}

export const MASCOT_MOODS = Object.freeze(["welcome", "focus", "correct", "oops", "celebrate"]);
