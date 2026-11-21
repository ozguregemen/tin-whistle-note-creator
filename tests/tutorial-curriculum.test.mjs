import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTutorialSteps, completedTutorialLessons, TUTORIAL_LESSONS, TUTORIAL_PROGRESS_PREFIX, TUTORIAL_UNITS,
} from "../app/tutorial-curriculum.mjs";

test("every lesson has playable notes and its focus diagrams cover notes in the score", () => {
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
