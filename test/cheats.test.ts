import assert from "node:assert/strict";
import { test } from "node:test";

import { loadCheats, loadCheatSet } from "../src/data.ts";
import type { Cheat } from "../src/schema.ts";
import { validateDataset } from "../src/validate.ts";

const SOURCES = [
  "https://www.redbull.com/us-en/gta-6-cheat-codes",
  "https://www.pcguide.com/news/gta-6-cheat-codes-list-for-playstation-5-xbox-series-xs-and-how-to-unlock-them/",
];

function cheat(overrides: Partial<Cheat> = {}): Cheat {
  return {
    id: "cycle-weather",
    name: "Cycle Weather",
    unlock: "story-complete",
    input: null,
    inputStatus: "unverified",
    sources: [{ url: "https://example.com/gta6/cheats", checkedOn: "2026-11-22" }],
    ...overrides,
  };
}

test("a cheat without a published input has no problems", () => {
  assert.deepEqual(validateDataset("cheat", [cheat()]), []);
});

test("a confirmed cheat with one source is refused", () => {
  const problems = validateDataset("cheat", [
    cheat({ input: "Up, Up, Down, Down", inputStatus: "confirmed" }),
  ]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "confirmed_without_two_sources");
  assert.equal(problems[0].field, "sources");
  assert.equal(problems[0].entryId, "cycle-weather");
});

test("two sources on the same hostname do not confirm an input", () => {
  const problems = validateDataset("cheat", [
    cheat({
      input: "Up, Up, Down, Down",
      inputStatus: "confirmed",
      sources: [
        { url: "https://example.com/gta6/cheats", checkedOn: "2026-11-22" },
        { url: "https://example.com/gta6/cheats-update", checkedOn: "2026-11-22" },
      ],
    }),
  ]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "confirmed_without_two_sources");
});

test("a confirmed cheat needs a non-null input", () => {
  const problems = validateDataset("cheat", [
    cheat({
      inputStatus: "confirmed",
      sources: [
        { url: "https://example.com/gta6/cheats", checkedOn: "2026-11-22" },
        { url: "https://example.org/gta6/cheats", checkedOn: "2026-11-22" },
      ],
    }),
  ]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "confirmed_without_input");
  assert.equal(problems[0].field, "input");
});

test("two sources on different hostnames confirm an input", () => {
  assert.deepEqual(
    validateDataset("cheat", [
      cheat({
        input: "Up, Up, Down, Down",
        inputStatus: "confirmed",
        sources: [
          { url: "https://example.com/gta6/cheats", checkedOn: "2026-11-22" },
          { url: "https://example.org/gta6/cheats", checkedOn: "2026-11-22" },
        ],
      }),
    ]),
    [],
  );
});

test("an unknown inputStatus is refused", () => {
  const problems = validateDataset("cheat", [cheat({ inputStatus: "reported" as "confirmed" })]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "invalid_input_status");
  assert.equal(problems[0].field, "inputStatus");
});

test("the shipped cheat file is valid", () => {
  assert.deepEqual(validateDataset("cheat", loadCheats()), []);
});

test("the cheat file reports 61 cheats that cannot be used from the start", () => {
  const set = loadCheatSet();

  assert.equal(set.total, 61);
  assert.equal(set.usableFromStart, false);
  assert.equal(set.pcInputs, false);
  assert.equal(set.inputDevice, "d-pad");
  assert.deepEqual(set.platforms, ["PlayStation 5", "Xbox Series X|S"]);
  assert.match(set.unlock, /Progress tab/);
  assert.deepEqual(set.cheats, loadCheats());
  assert.deepEqual(
    set.sources.map((source) => source.url),
    SOURCES,
  );
});

test("the four cheats that unlock with the story are the shipped entries", () => {
  const cheats = loadCheats();

  assert.deepEqual(
    cheats.map((entry) => entry.id),
    ["cash-250000", "unlimited-focus", "attack-force", "cycle-weather"],
  );
  assert.deepEqual(
    cheats.map((entry) => entry.name),
    ["$250,000", "Unlimited Focus", "Attack Force", "Cycle Weather"],
  );
  assert.ok(cheats.every((entry) => entry.unlock === "story-complete"));
});

test("no cheat publishes an input while the guides disagree", () => {
  for (const entry of loadCheats()) {
    assert.equal(entry.input, null);
    assert.equal(entry.inputStatus, "unverified");
  }
});

test("every cheat cites both cheat guides", () => {
  for (const entry of loadCheats()) {
    assert.deepEqual(
      entry.sources.map((source) => source.url),
      SOURCES,
    );
    assert.ok(entry.sources.every((source) => source.checkedOn === "2026-11-22"));
  }
});
