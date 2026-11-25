import assert from "node:assert/strict";
import { test } from "node:test";

import type { Chapter, Mission, Requirement } from "../src/schema.ts";
import { Gta6DataError, validateDataset } from "../src/validate.ts";

function chapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: "vice-city-arrival",
    number: 1,
    title: "Vice City Arrival",
    mandatoryMissions: 7,
    sources: [{ url: "https://example.com/gta6/chapters", checkedOn: "2026-11-22" }],
    ...overrides,
  };
}

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: "first-contact",
    chapterId: "vice-city-arrival",
    order: 1,
    title: "First Contact",
    optional: false,
    sources: [{ url: "https://example.com/gta6/missions", checkedOn: "2026-11-22" }],
    ...overrides,
  };
}

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "meditation-spots",
    category: "collectibles",
    title: "Meditation spots",
    needed: 15,
    total: 18,
    unit: "spots",
    strict: false,
    sources: [{ url: "https://example.com/gta6/completion", checkedOn: "2026-11-22" }],
    ...overrides,
  };
}

test("a valid chapter has no problems", () => {
  assert.deepEqual(validateDataset("chapter", [chapter()]), []);
});

test("an entry without a source is refused", () => {
  const problems = validateDataset("chapter", [chapter({ sources: [] })]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "missing_source");
  assert.equal(problems[0].entryId, "vice-city-arrival");
});

test("an http source is refused", () => {
  const problems = validateDataset("chapter", [
    chapter({ sources: [{ url: "http://example.com/gta6/chapters", checkedOn: "2026-11-22" }] }),
  ]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "insecure_source_url");
  assert.equal(problems[0].field, "sources[0].url");
});

test("2026-02-30 is refused as checkedOn", () => {
  const problems = validateDataset("chapter", [
    chapter({ sources: [{ url: "https://example.com/gta6/chapters", checkedOn: "2026-02-30" }] }),
  ]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "invalid_checked_on");
  assert.match(problems[0].message, /2026-02-30/);
});

test("a duplicate id is named in the problem list", () => {
  const problems = validateDataset("chapter", [
    chapter(),
    chapter({ number: 2, title: "Still Chapter One" }),
  ]);

  const duplicates = problems.filter((entry) => entry.code === "duplicate_id");
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].entryId, "vice-city-arrival");
  assert.equal(duplicates[0].index, 1);
  assert.match(duplicates[0].message, /vice-city-arrival/);
});

test("an id that is not kebab-case is refused", () => {
  const problems = validateDataset("chapter", [chapter({ id: "Vice City Arrival" })]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "invalid_id");
});

test("an empty title is refused", () => {
  const problems = validateDataset("chapter", [chapter({ title: "  " })]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "empty_field");
  assert.equal(problems[0].field, "title");
});

test("a mission must reference an existing chapter", () => {
  const known = ["vice-city-arrival"];

  assert.deepEqual(validateDataset("mission", [mission()], known), []);

  const problems = validateDataset("mission", [mission({ chapterId: "leonida-keys" })], known);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "unknown_chapter");
  assert.match(problems[0].message, /leonida-keys/);
});

test("a valid requirement has no problems", () => {
  assert.deepEqual(validateDataset("requirement", [requirement()]), []);
});

test("a requirement that needs more than the total is refused", () => {
  const problems = validateDataset("requirement", [requirement({ needed: 20, total: 18 })]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "needed_over_total");
  assert.equal(problems[0].field, "needed");
  assert.equal(problems[0].entryId, "meditation-spots");
});

test("a negative count is refused", () => {
  const problems = validateDataset("requirement", [requirement({ needed: -1 })]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "invalid_number");
  assert.equal(problems[0].field, "needed");

  const negativeTotal = validateDataset("requirement", [requirement({ total: -18 })]);
  assert.ok(negativeTotal.some((entry) => entry.code === "invalid_number" && entry.field === "total"));
});

test("a requirement without a reported total is accepted", () => {
  assert.deepEqual(
    validateDataset("requirement", [
      requirement({ id: "waink-location-scans", needed: 100, total: null, unit: "scans" }),
    ]),
    [],
  );
});

test("strict must say whether needed equals total", () => {
  const missing = validateDataset("requirement", [requirement({ needed: 18, total: 18 })]);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].code, "inconsistent_strict");
  assert.equal(missing[0].field, "strict");

  const claimed = validateDataset("requirement", [requirement({ strict: true })]);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].code, "inconsistent_strict");

  assert.deepEqual(
    validateDataset("requirement", [requirement({ needed: 18, total: 18, strict: true })]),
    [],
  );
});

test("an empty requirement category or unit is refused", () => {
  const problems = validateDataset("requirement", [requirement({ category: " ", unit: "" })]);

  assert.deepEqual(
    problems.map((entry) => entry.field).sort(),
    ["category", "unit"],
  );
  assert.ok(problems.every((entry) => entry.code === "empty_field"));
});

test("an unknown dataset kind throws Gta6DataError with a code", () => {
  assert.throws(
    () => validateDataset("vehicle" as "chapter", []),
    (error: unknown) => error instanceof Gta6DataError && error.code === "unknown_kind",
  );
});
