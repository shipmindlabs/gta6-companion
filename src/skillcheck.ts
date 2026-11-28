import { readFileSync } from "node:fs";
import path from "node:path";

import { COMMANDS } from "./cli.ts";

export type SkillProblem = {
  code: string;
  field: string;
  message: string;
};

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const VALID_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMMAND_MENTION = /gta6 ([a-z][a-z0-9-]*)/g;
const DESCRIPTION_MAX = 1024;

function fieldsOf(block: string): Record<string, string | undefined> {
  const fields: Record<string, string | undefined> = {};

  for (const line of block.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (line.trim() === "" || at === -1) {
      continue;
    }

    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    const quote = value.slice(0, 1);

    if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    fields[key] = value;
  }

  return fields;
}

function nameProblems(name: string | undefined, dir: string): SkillProblem[] {
  if (name === undefined || name === "") {
    return [
      { code: "missing_name", field: "name", message: "the front matter has no name" },
    ];
  }

  const problems: SkillProblem[] = [];

  if (!VALID_NAME.test(name)) {
    problems.push({
      code: "invalid_name",
      field: "name",
      message: `name "${name}" is not lowercase words joined by hyphens`,
    });
  }

  const folder = path.basename(path.resolve(dir));
  if (name !== folder) {
    problems.push({
      code: "name_mismatch",
      field: "name",
      message: `name "${name}" does not match the directory "${folder}"`,
    });
  }

  return problems;
}

function descriptionProblems(description: string | undefined): SkillProblem[] {
  if (description === undefined || description.trim() === "") {
    return [
      {
        code: "missing_description",
        field: "description",
        message: "the front matter has no description saying when to use the skill",
      },
    ];
  }

  if (description.length > DESCRIPTION_MAX) {
    return [
      {
        code: "description_too_long",
        field: "description",
        message: `the description is ${description.length} characters, over the ${DESCRIPTION_MAX} allowed`,
      },
    ];
  }

  return [];
}

function commandProblems(body: string, commands: readonly string[]): SkillProblem[] {
  const mentioned = [...body.matchAll(COMMAND_MENTION)].map((match) => match[1]);

  return [...new Set(mentioned)]
    .filter((name) => !commands.includes(name))
    .sort()
    .map((name) => ({
      code: "unknown_command",
      field: "instructions",
      message: `the skill names "gta6 ${name}", which the command line does not implement`,
    }));
}

export function checkSkill(
  dir: string,
  commands: readonly string[] = COMMANDS,
): SkillProblem[] {
  const file = path.join(dir, "SKILL.md");
  let raw: string;

  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return [
      { code: "missing_skill_file", field: "SKILL.md", message: `${file} cannot be read` },
    ];
  }

  const matter = FRONT_MATTER.exec(raw);
  if (matter === null) {
    return [
      {
        code: "missing_front_matter",
        field: "front matter",
        message: `${file} does not open with a --- front matter block`,
      },
    ];
  }

  const fields = fieldsOf(matter[1]);

  return [
    ...nameProblems(fields.name, dir),
    ...descriptionProblems(fields.description),
    ...commandProblems(raw.slice(matter[0].length), commands),
  ];
}
