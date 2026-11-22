import assert from "node:assert/strict";
import { test } from "node:test";

import type { Chapter, Mission } from "../src/schema.ts";
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

test("an unknown dataset kind throws Gta6DataError with a code", () => {
  assert.throws(
    () => validateDataset("cheat" as "chapter", []),
    (error: unknown) => error instanceof Gta6DataError && error.code === "unknown_kind",
  );
});
