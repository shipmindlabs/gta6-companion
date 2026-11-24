import assert from "node:assert/strict";
import { test } from "node:test";

import { loadChapters, loadMissions, loadRequirements } from "../src/data.ts";
import type { ProgressData } from "../src/progress.ts";
import {
  emptyProgress,
  markMission,
  setCount,
  summarize,
  unmarkMission,
  whatsLeft,
} from "../src/progress.ts";
import type { Mission } from "../src/schema.ts";
import { Gta6DataError } from "../src/validate.ts";

const NOW = "2026-11-24T12:00:00.000Z";

const data: ProgressData = {
  chapters: loadChapters(),
  missions: loadMissions(),
  requirements: loadRequirements(),
};

function withMissions(ids: readonly string[]) {
  return ids.reduce((progress, id) => markMission(progress, id, NOW), emptyProgress(NOW));
}

test("an empty progress leaves 91 missions and every requirement", () => {
  const progress = emptyProgress(NOW);

  assert.deepEqual(progress, { version: 1, updatedAt: NOW, missions: {}, counts: {} });

  const summary = summarize(progress, data);
  assert.deepEqual(summary.story, { done: 0, total: 91, percent: 0 });
  assert.deepEqual(summary.overall, {
    metRequirements: 0,
    totalRequirements: data.requirements.length,
  });
  assert.ok(
    summary.requirements.every(
      (entry) => entry.have === 0 && entry.remaining === entry.needed && !entry.met,
    ),
  );

  const left = whatsLeft(progress, data);
  assert.equal(left.nextMission?.id, "ch1-prologue");
  assert.equal(left.requirements.length, data.requirements.length);
});

test("90 of 91 missions is 98 percent", () => {
  const progress = withMissions(data.missions.slice(0, 90).map((entry) => entry.id));
  const summary = summarize(progress, data);

  assert.equal(summary.story.done, 90);
  assert.equal(summary.story.total, 91);
  assert.equal(summary.story.percent, 98);
  assert.equal(whatsLeft(progress, data).nextMission?.id, "ch5-the-end-of-the-road");
});

test("the story reaches 100 percent only with every mission done", () => {
  const progress = withMissions(data.missions.map((entry) => entry.id));
  const summary = summarize(progress, data);

  assert.deepEqual(summary.story, { done: 91, total: 91, percent: 100 });
  assert.equal(whatsLeft(progress, data).nextMission, null);
});

test("a percentage is never rounded up to 100 while a mission is missing", () => {
  function mission(index: number): Mission {
    return {
      id: `ch1-m${String(index + 1)}`,
      chapterId: "ch1",
      order: index + 1,
      title: `Mission ${String(index + 1)}`,
      optional: false,
      sources: [],
    };
  }

  const synthetic: ProgressData = {
    chapters: [
      { id: "ch1", number: 1, title: "One Long Chapter", mandatoryMissions: 1000, sources: [] },
    ],
    missions: Array.from({ length: 1000 }, (_, index) => mission(index)),
    requirements: [],
  };

  const progress = synthetic.missions
    .slice(0, 999)
    .reduce((acc, entry) => markMission(acc, entry.id, NOW), emptyProgress(NOW));

  assert.equal(summarize(progress, synthetic).story.percent, 99);
});

test("per-chapter totals follow the mandatory mission counts", () => {
  const progress = withMissions(loadMissions(1).map((entry) => entry.id));
  const summary = summarize(progress, data);

  for (const chapter of data.chapters) {
    const entry = summary.chapters.find((candidate) => candidate.id === chapter.id);
    assert.equal(entry?.total, chapter.mandatoryMissions);
  }

  const first = summary.chapters.find((entry) => entry.number === 1);
  assert.deepEqual([first?.done, first?.total], [22, 22]);
  assert.ok(summary.chapters.filter((entry) => entry.number > 1).every((entry) => entry.done === 0));
  assert.equal(summary.story.percent, 24);
});

test("marking a mission twice keeps the first doneAt", () => {
  const first = markMission(emptyProgress(NOW), "ch1-prologue", "2026-11-23T10:00:00.000Z");
  const again = markMission(first, "ch1-prologue", "2026-11-24T10:00:00.000Z");

  assert.equal(again.missions["ch1-prologue"], "2026-11-23T10:00:00.000Z");
  assert.equal(again.updatedAt, first.updatedAt);
  assert.equal(summarize(again, data).story.done, 1);
});

test("unmarking a mission puts it back at the front of what is left", () => {
  const marked = markMission(emptyProgress(NOW), "ch1-prologue", NOW);
  const cleared = unmarkMission(marked, "ch1-prologue", "2026-11-25T00:00:00.000Z");

  assert.deepEqual(cleared.missions, {});
  assert.equal(cleared.updatedAt, "2026-11-25T00:00:00.000Z");
  assert.equal(whatsLeft(cleared, data).nextMission?.id, "ch1-prologue");
  assert.equal(unmarkMission(cleared, "ch1-gone-fishing", "2026-11-26T00:00:00.000Z"), cleared);
});

test("a count above needed is met with remaining 0", () => {
  const progress = setCount(emptyProgress(NOW), "card-sets", 18, data, NOW);
  const summary = summarize(progress, data);
  const entry = summary.requirements.find((candidate) => candidate.id === "card-sets");

  assert.deepEqual(entry, {
    id: "card-sets",
    title: "Card sets",
    category: "collectibles",
    unit: "sets",
    have: 18,
    needed: 15,
    remaining: 0,
    met: true,
  });
  assert.equal(summary.overall.metRequirements, 1);
  assert.ok(!whatsLeft(progress, data).requirements.some((left) => left.id === "card-sets"));
});

test("a count for an unknown requirement throws", () => {
  assert.throws(
    () => setCount(emptyProgress(NOW), "golden-skulls", 1, data),
    (error: unknown) => error instanceof Gta6DataError && error.code === "unknown_id",
  );
});

test("a negative or fractional count is refused", () => {
  for (const count of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setCount(emptyProgress(NOW), "vaults", count, data),
      (error: unknown) => error instanceof Gta6DataError && error.code === "invalid_count",
    );
  }
});

test("every requirement can be met at once", () => {
  const progress = data.requirements.reduce(
    (acc, entry) => setCount(acc, entry.id, entry.needed, data, NOW),
    emptyProgress(NOW),
  );
  const summary = summarize(progress, data);

  assert.equal(summary.overall.metRequirements, data.requirements.length);
  assert.ok(summary.requirements.every((entry) => entry.met && entry.remaining === 0));
  assert.deepEqual(whatsLeft(progress, data).requirements, []);
});

test("unmet requirements come back with the smallest remaining first", () => {
  let progress = emptyProgress(NOW);
  progress = setCount(progress, "vaults", 7, data, NOW);
  progress = setCount(progress, "unique-playlists", 1, data, NOW);
  progress = setCount(progress, "card-sets", 10, data, NOW);

  const left = whatsLeft(progress, data).requirements;
  const remaining = left.map((entry) => entry.remaining);

  assert.deepEqual(
    left.slice(0, 3).map((entry) => entry.id),
    ["unique-playlists", "vaults", "card-sets"],
  );
  assert.deepEqual(remaining, [...remaining].sort((first, second) => first - second));
  assert.ok(left.every((entry) => entry.remaining > 0 && !entry.met));
});

test("optional missions can be marked but never count toward the story", () => {
  const withOptional: ProgressData = {
    ...data,
    missions: loadMissions(undefined, { includeOptional: true }),
  };
  const progress = markMission(emptyProgress(NOW), "ch2-thrillbillies", NOW);
  const summary = summarize(progress, withOptional);

  assert.deepEqual(summary.story, { done: 0, total: 91, percent: 0 });
  assert.equal(whatsLeft(progress, withOptional).nextMission?.id, "ch1-prologue");
});

test("the progress document passed in is never changed", () => {
  const base = emptyProgress(NOW);

  markMission(base, "ch1-prologue", NOW);
  setCount(base, "vaults", 3, data, NOW);

  assert.deepEqual(base, { version: 1, updatedAt: NOW, missions: {}, counts: {} });
});
