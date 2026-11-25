import assert from "node:assert/strict";
import { test } from "node:test";

import type { Io } from "../src/cli.ts";
import { run } from "../src/cli.ts";
import { loadChapters, loadMissions, loadRequirements } from "../src/data.ts";

const NOW = "2026-11-25T12:00:00.000Z";
const FILE = "gta6-progress.json";
const TEMP = `${FILE}.tmp`;

const data = {
  chapters: loadChapters(),
  missions: loadMissions(undefined, { includeOptional: true }),
  requirements: loadRequirements(),
};

type Fake = {
  io: Io;
  files: Map<string, string>;
};

type SavedProgress = {
  missions: Record<string, string>;
  counts: Record<string, number>;
};

function fakeIo(
  options: {
    files?: Record<string, string>;
    env?: Record<string, string | undefined>;
    failWrite?: boolean;
  } = {},
): Fake {
  const files = new Map(Object.entries(options.files ?? {}));

  return {
    files,
    io: {
      env: options.env ?? {},
      now: () => NOW,
      data,
      readFile: (file) => files.get(file) ?? null,
      writeFile: (file, body) => {
        if (options.failWrite === true) {
          throw new Error("no space left on device");
        }
        files.set(file, body);
      },
      rename: (from, to) => {
        const body = files.get(from);
        if (body === undefined) {
          throw new Error(`no such file: ${from}`);
        }
        files.delete(from);
        files.set(to, body);
      },
      remove: (file) => {
        files.delete(file);
      },
    },
  };
}

function saved(files: Map<string, string>, file = FILE): SavedProgress {
  return JSON.parse(files.get(file) ?? "null") as SavedProgress;
}

test("done then left moves on to the next mission", () => {
  const { io, files } = fakeIo();

  const before = run(["left"], io);
  assert.equal(before.code, 0);
  assert.match(before.out, /Next: Prologue \(ch1-prologue\), Chapter 1, mission 1/);
  assert.match(before.out, /Story: 0 of 91 done, 0%/);

  const done = run(["done", "ch1-prologue"], io);
  assert.equal(done.code, 0);
  assert.match(done.out, /Done: Prologue \(ch1-prologue\)/);

  const after = run(["left"], io);
  assert.equal(after.code, 0);
  assert.match(after.out, /Next: Gone Fishing \(ch1-gone-fishing\), Chapter 1, mission 2/);
  assert.match(after.out, /Story: 1 of 91 done, 1%/);
  assert.match(after.out, /unique-playlists\s+0 of 2 playlists, 2 left/);

  assert.deepEqual(Object.keys(saved(files).missions), ["ch1-prologue"]);
  assert.ok(!files.has(TEMP));
});

test("a mission can be named by its exact title, case-insensitive", () => {
  const { io, files } = fakeIo();

  const done = run(["done", "gone FISHING"], io);
  assert.equal(done.code, 0);
  assert.match(done.out, /Done: Gone Fishing \(ch1-gone-fishing\)/);
  assert.deepEqual(Object.keys(saved(files).missions), ["ch1-gone-fishing"]);

  const again = run(["done", "ch1-gone-fishing"], io);
  assert.match(again.out, /Already done: Gone Fishing/);
});

test("an unknown mission exits 2 and lists the closest ids", () => {
  const { io, files } = fakeIo();

  const result = run(["done", "gone fishin"], io);

  assert.equal(result.code, 2);
  assert.match(result.out, /unknown mission: "gone fishin"/);
  assert.match(result.out, /ch1-gone-fishing/);
  assert.equal(files.size, 0);
});

test("mission titles past the next one need --spoilers", () => {
  const { io } = fakeIo();

  const plain = run(["missions", "1"], io);
  assert.equal(plain.code, 0);
  assert.match(plain.out, /Prologue \(ch1-prologue\)/);
  assert.ok(!plain.out.includes("Gone Fishing"));
  assert.ok(!plain.out.includes("ch1-gone-fishing"));
  assert.match(plain.out, /Chapter 1, mission 2/);

  const spoiled = run(["missions", "1", "--spoilers"], io);
  assert.match(spoiled.out, /Gone Fishing \(ch1-gone-fishing\)/);
  assert.ok(!spoiled.out.includes("Chapter 1, mission 2"));

  const unknown = run(["missions", "9"], io);
  assert.equal(unknown.code, 2);
  assert.match(unknown.out, /unknown chapter: "9"/);
});

test("a failed write leaves the old progress file intact", () => {
  const old = `${JSON.stringify(
    {
      version: 1,
      updatedAt: "2026-11-24T00:00:00.000Z",
      missions: { "ch1-prologue": "2026-11-24T00:00:00.000Z" },
      counts: {},
    },
    null,
    2,
  )}\n`;
  const { io, files } = fakeIo({ files: { [FILE]: old }, failWrite: true });

  const result = run(["done", "ch1-gone-fishing"], io);

  assert.equal(result.code, 1);
  assert.match(result.out, /could not write gta6-progress\.json/);
  assert.equal(files.get(FILE), old);
  assert.ok(!files.has(TEMP));
  assert.match(run(["left"], io).out, /Next: Gone Fishing \(ch1-gone-fishing\)/);
});

test("the progress file comes from --file, then GTA6_PROGRESS, then the default", () => {
  const withEnv = fakeIo({ env: { GTA6_PROGRESS: "/tmp/from-env.json" } });

  run(["done", "ch1-prologue", "--file", "/tmp/from-flag.json"], withEnv.io);
  assert.deepEqual(Object.keys(saved(withEnv.files, "/tmp/from-flag.json").missions), [
    "ch1-prologue",
  ]);

  run(["done", "ch1-prologue"], withEnv.io);
  assert.ok(withEnv.files.has("/tmp/from-env.json"));

  const bare = fakeIo();
  run(["done", "ch1-prologue"], bare.io);
  assert.ok(bare.files.has(FILE));
});

test("undo puts a mission back at the front of what is left", () => {
  const { io, files } = fakeIo();

  run(["done", "ch1-prologue"], io);
  const undone = run(["undo", "Prologue"], io);

  assert.equal(undone.code, 0);
  assert.match(undone.out, /Undone: Prologue \(ch1-prologue\)/);
  assert.deepEqual(saved(files).missions, {});
  assert.match(run(["left"], io).out, /Next: Prologue \(ch1-prologue\)/);

  const never = run(["undo", "ch1-gone-fishing"], io);
  assert.equal(never.code, 0);
  assert.match(never.out, /Not marked as done/);
});

test("set records a count and refuses a bad one", () => {
  const { io, files } = fakeIo();

  const ok = run(["set", "vaults", "8"], io);
  assert.equal(ok.code, 0);
  assert.match(ok.out, /Set vaults to 8 of 8 vaults, met/);
  assert.equal(saved(files).counts.vaults, 8);

  const unknown = run(["set", "golden-skulls", "1"], io);
  assert.equal(unknown.code, 2);
  assert.match(unknown.out, /unknown requirement: "golden-skulls"/);

  const fraction = run(["set", "card-sets", "half"], io);
  assert.equal(fraction.code, 2);
  assert.match(fraction.out, /must be an integer/);
  assert.equal(saved(files).counts["card-sets"], undefined);
});

test("status reports the story and every chapter", () => {
  const { io } = fakeIo();

  run(["done", "ch1-prologue"], io);
  const out = run(["status"], io).out;

  assert.match(out, /Story: 1 of 91 done, 1%/);
  assert.match(out, /Requirements: 0 of \d+ met/);
  assert.match(out, /Progress file: gta6-progress\.json/);
  assert.match(out, /1 {2}Just Like Paradise\s+1 of 22/);
  assert.match(out, /5 {2}Top of the World, Ma\s+0 of 7/);
});

test("no command prints usage and an unknown command exits 2", () => {
  const { io } = fakeIo();

  const usage = run([], io);
  assert.equal(usage.code, 0);
  assert.match(usage.out, /Usage:/);

  const unknown = run(["fly"], io);
  assert.equal(unknown.code, 2);
  assert.match(unknown.out, /unknown command: fly/);

  const option = run(["left", "--everything"], io);
  assert.equal(option.code, 2);
  assert.match(option.out, /unknown option: --everything/);
});
