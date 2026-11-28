import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { COMMANDS } from "../src/cli.ts";
import { checkSkill } from "../src/skillcheck.ts";

const SKILL_DIR = fileURLToPath(
  new URL("../skills/gta6-completion-tracker/", import.meta.url),
);
const temps: string[] = [];

function skillDir(name: string, body: string | null): string {
  const base = mkdtempSync(path.join(tmpdir(), "gta6-skill-"));
  temps.push(base);

  const dir = path.join(base, name);
  mkdirSync(dir, { recursive: true });

  if (body !== null) {
    writeFileSync(path.join(dir, "SKILL.md"), body);
  }

  return dir;
}

function frontMatter(
  name: string,
  description: string,
  body = "Run `gta6 status`.\n",
): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;
}

function codes(dir: string): string[] {
  return checkSkill(dir).map((problem) => problem.code);
}

after(() => {
  for (const base of temps) {
    rmSync(base, { recursive: true, force: true });
  }
});

test("the shipped skill passes the check", () => {
  assert.deepEqual(checkSkill(SKILL_DIR), []);
});

test("the shipped skill names every command the command line implements", () => {
  const body = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");

  for (const command of COMMANDS) {
    assert.ok(body.includes(`gta6 ${command}`), `the skill does not name gta6 ${command}`);
  }
});

test("a directory without SKILL.md is refused", () => {
  assert.deepEqual(codes(skillDir("gta6-completion-tracker", null)), [
    "missing_skill_file",
  ]);
});

test("a file without front matter is refused", () => {
  assert.deepEqual(codes(skillDir("gta6-completion-tracker", "# No front matter\n")), [
    "missing_front_matter",
  ]);
});

test("the name must match the directory", () => {
  const dir = skillDir(
    "gta6-completion-tracker",
    frontMatter("gta6-tracker", "Use for GTA 6 progress."),
  );

  assert.deepEqual(codes(dir), ["name_mismatch"]);
});

test("a name that is not lowercase with hyphens is refused", () => {
  const dir = skillDir(
    "GTA6_Tracker",
    frontMatter("GTA6_Tracker", "Use for GTA 6 progress."),
  );

  assert.deepEqual(codes(dir), ["invalid_name"]);
});

test("a front matter without a name is refused", () => {
  const dir = skillDir(
    "gta6-completion-tracker",
    "---\ndescription: Use for GTA 6 progress.\n---\n\nRun `gta6 left`.\n",
  );

  assert.deepEqual(codes(dir), ["missing_name"]);
});

test("the description must be 1 to 1024 characters", () => {
  const empty = skillDir(
    "gta6-completion-tracker",
    frontMatter("gta6-completion-tracker", ""),
  );
  assert.deepEqual(codes(empty), ["missing_description"]);

  const long = skillDir(
    "gta6-completion-tracker",
    frontMatter("gta6-completion-tracker", "G".repeat(1025)),
  );
  assert.deepEqual(codes(long), ["description_too_long"]);

  const edge = skillDir(
    "gta6-completion-tracker",
    frontMatter("gta6-completion-tracker", "G".repeat(1024)),
  );
  assert.deepEqual(codes(edge), []);
});

test("a command the command line does not implement is refused", () => {
  const dir = skillDir(
    "gta6-completion-tracker",
    frontMatter(
      "gta6-completion-tracker",
      "Use for GTA 6 progress.",
      "Run `gta6 cheats`, then `gta6 status`.\n",
    ),
  );
  const problems = checkSkill(dir);

  assert.deepEqual(
    problems.map((problem) => problem.code),
    ["unknown_command"],
  );
  assert.match(problems[0].message, /cheats/);
});
