import assert from "node:assert/strict";
import { test } from "node:test";

import { loadChapters, loadMissions } from "../src/data.ts";
import { Gta6DataError, validateDataset } from "../src/validate.ts";

test("the chapter dataset is valid", () => {
  assert.deepEqual(validateDataset("chapter", loadChapters()), []);
});

test("the five chapters hold 91 mandatory missions", () => {
  const chapters = loadChapters();

  assert.deepEqual(
    chapters.map((entry) => entry.number),
    [1, 2, 3, 4, 5],
  );
  assert.equal(
    chapters.reduce((total, entry) => total + entry.mandatoryMissions, 0),
    91,
  );
});

test("the mission dataset is valid against the known chapters", () => {
  const chapterIds = loadChapters().map((entry) => entry.id);

  assert.deepEqual(validateDataset("mission", loadMissions(), chapterIds), []);
});

test("chapter 1 has 22 missions ordered 1..22 without gaps", () => {
  const missions = loadMissions(1);

  assert.equal(missions.length, 22);
  assert.deepEqual(
    missions.map((entry) => entry.order),
    Array.from({ length: 22 }, (_, position) => position + 1),
  );
  assert.ok(missions.every((entry) => entry.chapterId === "ch1"));
});

test("the chapter 1 count matches the number of mission entries", () => {
  const chapterOne = loadChapters().find((entry) => entry.number === 1);

  assert.equal(chapterOne?.mandatoryMissions, loadMissions(1).length);
});

test("chapter 1 runs from the prologue to the last mandatory mission", () => {
  const missions = loadMissions(1);

  assert.equal(missions[0].id, "ch1-prologue");
  assert.equal(missions[21].id, "ch1-discharge-time");
  assert.ok(missions.every((entry) => entry.optional === false));
});

test("a chapter without mission data throws Gta6DataError", () => {
  assert.throws(
    () => loadMissions(5),
    (error: unknown) => error instanceof Gta6DataError && error.code === "unknown_chapter",
  );
});
