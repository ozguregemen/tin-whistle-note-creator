import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTutorialSteps, completedTutorialLessons, TUTORIAL_LESSONS, TUTORIAL_PROGRESS_PREFIX, TUTORIAL_UNITS,
} from "../app/tutorial-curriculum.mjs";

test("every lesson has playable notes and its focus diagrams cover notes in the score", () => {
  assert.equal(TUTORIAL_UNITS.length, 6);
  assert.equal(TUTORIAL_LESSONS.length, 24);
  assert.equal(new Set(TUTORIAL_LESSONS.map(lesson => lesson.id)).size, TUTORIAL_LESSONS.length);
  for (const unit of TUTORIAL_UNITS) {
    assert.ok(unit.lessons.some(lesson => lesson.kind === "song"));
    for (const lesson of unit.lessons) {
      const steps = buildTutorialSteps(lesson);
      assert.equal(steps.length, lesson.score.trim().split(/\s+/).length, lesson.id);
      const written = new Set(steps.map(note => note.pitch + (note.octave - 1)));
      for (const pitch of lesson.focus) assert.ok(written.has(pitch), `${lesson.id} includes ${pitch}`);
    }
  }
  const firstUnitNotes = TUTORIAL_UNITS[0].lessons.flatMap(lesson => buildTutorialSteps(lesson).map(note => note.midi));
  assert.deepEqual(new Set(firstUnitNotes), new Set([83, 81, 79]));
  const twoDs = TUTORIAL_LESSONS.find(lesson => lesson.id === "two-ds");
  assert.deepEqual(buildTutorialSteps(twoDs).slice(0, 2).map(note => note.midi), [74, 86]);
});

test("course progress reads each completed lesson independently in curriculum order", () => {
  const saved = new Map([
    [TUTORIAL_PROGRESS_PREFIX + "amazing-grace", "1"],
    [TUTORIAL_PROGRESS_PREFIX + "not-a-lesson", "1"],
    [TUTORIAL_PROGRESS_PREFIX + "first-b", "1"],
    [TUTORIAL_PROGRESS_PREFIX + "b-a-g", "0"],
  ]);
  const storage = { getItem: key => saved.get(key) ?? null };
  assert.deepEqual(completedTutorialLessons(storage), ["first-b", "amazing-grace"]);
  saved.set(TUTORIAL_PROGRESS_PREFIX + "b-a-g", "1");
  assert.deepEqual(completedTutorialLessons(storage), ["first-b", "b-a-g", "amazing-grace"]);
});

test("completed lessons from the first edition still count in the expanded course", () => {
  const original = [
    "first-b", "b-a-g", "hot-cross-buns", "f-sharp-e", "low-d", "frere-jacques",
    "steady-beat", "c-sharp", "ode-to-joy", "two-ds", "upper-e", "amazing-grace",
  ];
  const storage = {
    getItem: key => original.some(id => key === TUTORIAL_PROGRESS_PREFIX + id) ? "1" : null,
  };
  assert.deepEqual(completedTutorialLessons(storage), original);
});

test("metered examples accent the first beat and both pulses in a jig", () => {
  const examples = {
    "three-beat-waltz": ["bar", null, null, "bar", null, null, "bar", null, "bar", null],
    "polka-pulse": ["bar", null, null, "bar", null, null, "bar", null, null, "bar", null],
    "jig-pulse": ["bar", null, null, "beat", null, null, "bar", null, null, "beat", null, null],
  };
  for (const [id, expected] of Object.entries(examples)) {
    const lesson = TUTORIAL_LESSONS.find(item => item.id === id);
    const accents = buildTutorialSteps(lesson).map(step => step.accent ?? null);
    assert.deepEqual(accents.slice(0, expected.length), expected, id);
  }
  for (const lesson of TUTORIAL_LESSONS.filter(item => item.meter)) {
    const quarterMs = 60000 / lesson.bpm;
    const beats = buildTutorialSteps(lesson).reduce((total, step) => total + step.durationMs / quarterMs, 0);
    const bars = beats / (lesson.meter === "2/4" ? 2 : 3);
    assert.ok(Math.abs(bars - Math.round(bars)) < 0.001, `${lesson.id} ends at a bar boundary`);
  }
});
