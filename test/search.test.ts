import assert from "node:assert/strict";
import { test } from "node:test";

import { loadChapters, loadCheats, loadMissions, loadRequirements } from "../src/data.ts";
import type { SearchData } from "../src/search.ts";
import { editDistance, search } from "../src/search.ts";
import type { Mission } from "../src/schema.ts";

const data: SearchData = {
  chapters: loadChapters(),
  missions: loadMissions(undefined, { includeOptional: true }),
  requirements: loadRequirements(),
  cheats: loadCheats(),
};

// The Cartel Heist closes Chapter 3: 22 + 11 + 26 story missions.
const CARTEL_HEIST = 59;

test("'cartel heist' finds The Cartel Heist first", () => {
  const hits = search("cartel heist", data);

  assert.deepEqual(hits[0], {
    kind: "mission",
    id: "ch3-the-cartel-heist",
    title: "The Cartel Heist",
    chapter: 3,
    score: 60,
  });
});

test("'gon fishing' finds Gone Fishing", () => {
  assert.equal(search("gon fishing", data)[0]?.id, "ch1-gone-fishing");
});

test("'flamingo' finds the cocaine flamingos requirement", () => {
  const hit = search("flamingo", data)[0];

  assert.equal(hit?.kind, "requirement");
  assert.equal(hit?.id, "cocaine-flamingos");
  assert.equal(hit?.chapter, undefined);
});

test("spoilerLimit hides missions further along the story", () => {
  assert.deepEqual(search("cartel heist", data, { spoilerLimit: CARTEL_HEIST - 1 }), []);
  assert.equal(
    search("cartel heist", data, { spoilerLimit: CARTEL_HEIST })[0]?.id,
    "ch3-the-cartel-heist",
  );
  assert.equal(search("prologue", data, { spoilerLimit: 1 })[0]?.id, "ch1-prologue");
  assert.deepEqual(
    search("flamingo", data, { spoilerLimit: 1 }).map((hit) => hit.id),
    ["cocaine-flamingos"],
  );
  assert.equal(
    search("thrillbillies", data, { spoilerLimit: 33 })[0]?.id,
    "ch2-thrillbillies",
  );
  assert.deepEqual(search("thrillbillies", data, { spoilerLimit: 32 }), []);
});

test("punctuation and diacritics do not block a match", () => {
  assert.equal(search("Photo/Shoot", data)[0]?.id, "ch4-photo-shoot");
  assert.equal(search("photo shoot", data)[0]?.id, "ch4-photo-shoot");
  assert.equal(search("Hey Arnold!", data)[0]?.id, "ch1-hey-arnold");
  assert.equal(search("h\u00e8y arn\u00f6ld", data)[0]?.id, "ch1-hey-arnold");
  assert.equal(search("girls trip", data)[0]?.id, "ch2-girls-trip");
});

test("an empty or punctuation-only query finds nothing", () => {
  assert.deepEqual(search("", data), []);
  assert.deepEqual(search("   \t ", data), []);
  assert.deepEqual(search("!!!", data), []);
});

test("an exact title ranks before a prefix, then words, then one edit", () => {
  function mission(id: string, order: number, title: string): Mission {
    return { id, chapterId: "ch1", order, title, optional: false, sources: [] };
  }

  const tiers: SearchData = {
    chapters: [{ id: "ch1", number: 1, title: "One", mandatoryMissions: 4, sources: [] }],
    missions: [
      mission("ch1-safe-word", 1, "Safe Word"),
      mission("ch1-safe-word-games", 2, "Safe Word Games"),
      mission("ch1-the-safe-word", 3, "The Safe Word"),
      mission("ch1-saef-word", 4, "Saef Word"),
    ],
    requirements: [],
    cheats: [],
  };

  const hits = search("safe word", tiers);

  assert.deepEqual(
    hits.map((hit) => hit.id),
    ["ch1-safe-word", "ch1-safe-word-games", "ch1-the-safe-word", "ch1-saef-word"],
  );
  assert.deepEqual(
    hits.map((hit) => hit.score),
    [100, 80, 60, 39],
  );
});

test("limit and kinds narrow the hits", () => {
  assert.equal(search("car", data, { limit: 2 }).length, 2);
  assert.deepEqual(search("card sets", data, { kinds: ["mission"] }), []);
  assert.deepEqual(
    search("card sets", data, { kinds: ["requirement"] }).map((hit) => hit.id),
    ["card-sets"],
  );
  assert.equal(
    search("unlimted focus", data, { kinds: ["cheat"] })[0]?.id,
    "unlimited-focus",
  );
});

test("two swapped letters count as one edit", () => {
  assert.equal(editDistance("saef", "safe"), 1);
  assert.equal(editDistance("cratel", "cartel"), 1);
  assert.equal(editDistance("gon", "gone"), 1);
  assert.equal(editDistance("flamingo", "flamingos"), 1);
  assert.equal(editDistance("heist", "heist"), 0);
  assert.equal(editDistance("", "heist"), 5);
});
