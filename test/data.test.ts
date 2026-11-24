import assert from "node:assert/strict";
import { test } from "node:test";

import { loadChapters, loadMissions, loadRequirements, loadRequirementSet } from "../src/data.ts";
import { Gta6DataError, validateDataset } from "../src/validate.ts";

const ALL_OR_NOTHING = [
  "underwater-discoveries",
  "unique-playlists",
  "gang-operations",
  "bank-jobs",
  "payday-loan-jobs",
  "vaults",
  "shooting-range-gold-medals",
  "drone-time-trials",
  "brets-target-decks",
];

const WITHOUT_TOTAL = [
  "waink-location-scans",
  "fenced-narcotics",
  "fenced-jewellery",
  "fenced-marked-bills",
  "fenced-vehicles",
];

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
  assert.deepEqual(
    validateDataset(
      "mission",
      loadMissions(undefined, { includeOptional: true }),
      chapterIds,
    ),
    [],
  );
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

test("chapter 2 has exactly 11 mandatory missions ordered 1..11", () => {
  const missions = loadMissions(2);

  assert.equal(missions.length, 11);
  assert.deepEqual(
    missions.map((entry) => entry.order),
    Array.from({ length: 11 }, (_, position) => position + 1),
  );
  assert.ok(missions.every((entry) => entry.chapterId === "ch2"));
  assert.ok(missions.every((entry) => entry.optional === false));
  assert.equal(missions[0].id, "ch2-whats-in-the-bag");
  assert.equal(missions[10].id, "ch2-checking-out");
});

test("the chapter 2 count matches the number of mission entries", () => {
  const chapterTwo = loadChapters().find((entry) => entry.number === 2);

  assert.equal(chapterTwo?.mandatoryMissions, loadMissions(2).length);
});

test("chapter 3 has exactly 26 mandatory missions ordered 1..26", () => {
  const missions = loadMissions(3);

  assert.equal(missions.length, 26);
  assert.deepEqual(
    missions.map((entry) => entry.order),
    Array.from({ length: 26 }, (_, position) => position + 1),
  );
  assert.ok(missions.every((entry) => entry.chapterId === "ch3"));
  assert.ok(missions.every((entry) => entry.optional === false));
  assert.equal(missions[0].id, "ch3-welcome-to-vice-city");
  assert.equal(missions[25].id, "ch3-the-cartel-heist");
});

test("the chapter 3 count matches the number of mission entries", () => {
  const chapterThree = loadChapters().find((entry) => entry.number === 3);

  assert.equal(chapterThree?.mandatoryMissions, loadMissions(3).length);
});

test("chapter 4 has exactly 25 mandatory missions ordered 1..25", () => {
  const missions = loadMissions(4);

  assert.equal(missions.length, 25);
  assert.deepEqual(
    missions.map((entry) => entry.order),
    Array.from({ length: 25 }, (_, position) => position + 1),
  );
  assert.ok(missions.every((entry) => entry.chapterId === "ch4"));
  assert.ok(missions.every((entry) => entry.optional === false));
  assert.equal(missions[0].id, "ch4-ocean-beach");
  assert.equal(missions[24].id, "ch4-starting-from-zero");
});

test("chapter 5 has exactly 7 mandatory missions ordered 1..7", () => {
  const missions = loadMissions(5);

  assert.equal(missions.length, 7);
  assert.deepEqual(
    missions.map((entry) => entry.order),
    Array.from({ length: 7 }, (_, position) => position + 1),
  );
  assert.ok(missions.every((entry) => entry.chapterId === "ch5"));
  assert.ok(missions.every((entry) => entry.optional === false));
  assert.equal(missions[0].id, "ch5-bird-in-the-hand");
});

test("every chapter file holds exactly its mandatoryMissions entries", () => {
  for (const chapter of loadChapters()) {
    const missions = loadMissions(chapter.number);

    assert.equal(missions.length, chapter.mandatoryMissions);
    assert.ok(missions.every((entry) => entry.chapterId === chapter.id));
    assert.ok(missions.every((entry) => entry.optional === false));
    assert.deepEqual(
      missions.map((entry) => entry.order),
      Array.from({ length: chapter.mandatoryMissions }, (_, position) => position + 1),
    );
  }
});

test("the mission files hold 91 mandatory missions in total", () => {
  const missions = loadMissions();

  assert.equal(missions.length, 91);
  assert.ok(missions.every((entry) => entry.optional === false));
});

test("the story ends with The End of the Road", () => {
  const missions = loadMissions();
  const last = missions[missions.length - 1];

  assert.equal(last.title, "The End of the Road");
  assert.equal(last.id, "ch5-the-end-of-the-road");
  assert.equal(last.chapterId, "ch5");
  assert.equal(last.order, 7);
});

test("mission ids stay unique across every chapter file loaded together", () => {
  const missions = loadMissions(undefined, { includeOptional: true });
  const ids = missions.map((entry) => entry.id);

  assert.equal(new Set(ids).size, ids.length);
});

test("optional missions are left out unless they are asked for", () => {
  const withOptional = loadMissions(2, { includeOptional: true });

  assert.equal(withOptional.length, 13);
  assert.deepEqual(
    withOptional.filter((entry) => entry.optional).map((entry) => entry.id),
    ["ch2-thrillbillies", "ch2-twist-wrist-smash-grab"],
  );
  assert.ok(
    withOptional
      .filter((entry) => entry.optional)
      .every((entry) => /93/.test(entry.note ?? "")),
  );
});

test("optional missions never count toward a chapter's mandatoryMissions", () => {
  const missions = loadMissions(undefined, { includeOptional: true });
  const optional = missions.filter((entry) => entry.optional);

  assert.equal(optional.length, 2);
  assert.ok(optional.every((entry) => entry.chapterId === "ch2"));

  for (const chapter of loadChapters()) {
    const mandatory = missions.filter(
      (entry) => entry.chapterId === chapter.id && !entry.optional,
    );
    if (mandatory.length > 0) {
      assert.equal(mandatory.length, chapter.mandatoryMissions);
    }
  }
});

test("mission titles stay plain ASCII, apostrophes included", () => {
  const titles = loadMissions(undefined, { includeOptional: true }).map(
    (entry) => entry.title,
  );

  assert.ok(titles.includes("What's in the Bag?"));
  assert.ok(titles.includes("Girls' Trip"));
  assert.ok(titles.includes("Dealer's Choice"));
  assert.ok(titles.includes("Child's Play"));
  for (const title of titles) {
    assert.match(title, /^[\x20-\x7e]+$/);
    assert.doesNotMatch(title, /[\u2018\u2019\u02bc]/);
  }
});

test("a chapter without mission data throws Gta6DataError", () => {
  assert.throws(
    () => loadMissions(6),
    (error: unknown) => error instanceof Gta6DataError && error.code === "unknown_chapter",
  );
});

test("the requirement dataset is valid", () => {
  assert.deepEqual(validateDataset("requirement", loadRequirements()), []);
});

test("the requirement file says it is still incomplete", () => {
  const set = loadRequirementSet();

  assert.equal(set.complete, false);
  assert.match(set.note, /35/);
  assert.ok(set.note.includes(String(set.requirements.length)));
  assert.deepEqual(set.requirements, loadRequirements());
});

test("every all-or-nothing requirement is marked strict", () => {
  const requirements = loadRequirements();

  assert.deepEqual(
    requirements.filter((entry) => entry.strict).map((entry) => entry.id),
    ALL_OR_NOTHING,
  );
  assert.ok(
    requirements
      .filter((entry) => entry.strict)
      .every((entry) => entry.needed === entry.total),
  );
  assert.ok(
    requirements
      .filter((entry) => !entry.strict)
      .every((entry) => entry.total === null || entry.needed < entry.total),
  );
});

test("a requirement without a reported total is kept as null", () => {
  const requirements = loadRequirements();

  assert.deepEqual(
    requirements.filter((entry) => entry.total === null).map((entry) => entry.id),
    WITHOUT_TOTAL,
  );
  assert.deepEqual(validateDataset("requirement", requirements), []);
});

test("fencing requirements are counted in us dollars", () => {
  const fencing = loadRequirements().filter((entry) => entry.category === "fencing");

  assert.equal(fencing.length, 4);
  assert.ok(fencing.every((entry) => entry.unit === "usd"));
  assert.ok(fencing.every((entry) => entry.needed >= 100000));
});

test("every requirement cites both completion guides", () => {
  for (const entry of loadRequirements()) {
    assert.deepEqual(
      entry.sources.map((source) => source.url),
      [
        "https://www.pushsquare.com/guides/gta-6-100percent-completion-checklist",
        "https://gtaside.com/tips/gta6/100-percent-completion/",
      ],
    );
    assert.ok(entry.sources.every((source) => source.checkedOn === "2026-11-22"));
  }
});
