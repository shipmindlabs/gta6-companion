#!/usr/bin/env node
import { readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";

import { loadChapters, loadCheats, loadMissions, loadRequirements } from "./data.ts";
import type { Progress, RequirementProgress } from "./progress.ts";
import {
  emptyProgress,
  markMission,
  setCount,
  summarize,
  unmarkMission,
  whatsLeft,
} from "./progress.ts";
import type { SearchData, SearchHit } from "./search.ts";
import { editDistance, search, storyIndexes } from "./search.ts";
import type { Chapter, Mission } from "./schema.ts";
import { Gta6DataError } from "./validate.ts";

export type Io = {
  env: Record<string, string | undefined>;
  now: () => string;
  data: SearchData;
  // null when the progress file is not there yet
  readFile: (file: string) => string | null;
  writeFile: (file: string, body: string) => void;
  rename: (from: string, to: string) => void;
  // ignores a file that is already gone
  remove: (file: string) => void;
};

export type Result = {
  code: number;
  out: string;
};

type Options = {
  file: string | null;
  spoilers: boolean;
  help: boolean;
  args: string[];
  bad: string | null;
};

type View = {
  io: Io;
  progress: Progress;
  spoilers: boolean;
  nextId: string | null;
};

type Named = {
  id: string;
  title: string;
};

const DEFAULT_FILE = "gta6-progress.json";
const SUGGESTIONS = 5;
const ID_WIDTH = 34;
const TITLE_WIDTH = 20;
const KIND_WIDTH = 11;
const COMMANDS = ["left", "status", "done", "undo", "set", "missions", "search"];

const USAGE = [
  "gta6 - track GTA 6 missions and 100% progress from a terminal",
  "",
  "Usage:",
  "  gta6 left                      next mission and unmet requirements",
  "  gta6 status                    story and per-chapter progress",
  "  gta6 done <mission>            mark a mission done, by id or exact title",
  "  gta6 undo <mission>            unmark a mission",
  "  gta6 set <requirement-id> <n>  record how many of a requirement you have",
  "  gta6 missions [chapter]        list missions, all of them or one chapter",
  "  gta6 search <words>            find a mission, requirement or cheat by name",
  "",
  "Options:",
  "  --file <path>  progress file; defaults to $GTA6_PROGRESS or ./gta6-progress.json",
  "  --spoilers     print titles of missions you have not reached yet",
  "",
  "Exit codes: 0 ran, 1 the progress file could not be read or written,",
  "2 the command line was wrong.",
  "",
].join("\n");

class CliError extends Error {
  exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function defaultIo(): Io {
  return {
    env: process.env,
    now: () => new Date().toISOString(),
    data: {
      chapters: loadChapters(),
      missions: loadMissions(undefined, { includeOptional: true }),
      requirements: loadRequirements(),
      cheats: loadCheats(),
    },
    readFile: (file) => {
      try {
        return readFileSync(file, "utf8");
      } catch (error) {
        if ((error as { code?: string }).code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    writeFile: (file, body) => {
      writeFileSync(file, body);
    },
    rename: (from, to) => {
      renameSync(from, to);
    },
    remove: (file) => {
      rmSync(file, { force: true });
    },
  };
}

function parse(argv: readonly string[]): Options {
  const options: Options = { file: null, spoilers: false, help: false, args: [], bad: null };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--spoilers") {
      options.spoilers = true;
    } else if (token === "--help" || token === "-h") {
      options.help = true;
    } else if (token === "--file") {
      if (index + 1 >= argv.length) {
        options.bad = "--file needs a path";
        return options;
      }
      options.file = argv[index + 1];
      index += 1;
    } else if (token.startsWith("--file=")) {
      options.file = token.slice("--file=".length);
    } else if (token.startsWith("-") && token !== "-" && !/^-\d/.test(token)) {
      options.bad = `unknown option: ${token}`;
      return options;
    } else {
      options.args.push(token);
    }
  }

  return options;
}

function fileFor(options: Options, io: Io): string {
  if (options.file !== null && options.file.trim() !== "") {
    return options.file;
  }

  const fromEnv = io.env.GTA6_PROGRESS;
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    return fromEnv;
  }

  return DEFAULT_FILE;
}

function readProgress(io: Io, file: string): Progress {
  const raw = io.readFile(file);
  if (raw === null) {
    return emptyProgress(io.now());
  }

  try {
    return JSON.parse(raw) as Progress;
  } catch {
    throw new CliError(`${file} is not valid JSON`, 1);
  }
}

function writeProgress(io: Io, file: string, progress: Progress): void {
  const temp = `${file}.tmp`;

  try {
    io.writeFile(temp, `${JSON.stringify(progress, null, 2)}\n`);
    io.rename(temp, file);
  } catch (error) {
    io.remove(temp);
    throw new CliError(`could not write ${file}: ${(error as Error).message}`, 1);
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function closest(name: string, candidates: readonly Named[]): string[] {
  const needle = slug(name);

  return candidates
    .map((entry) => ({
      id: entry.id,
      score: Math.min(
        editDistance(needle, entry.id),
        editDistance(needle, slug(entry.title)),
      ),
    }))
    .sort((left, right) => left.score - right.score || left.id.localeCompare(right.id))
    .slice(0, SUGGESTIONS)
    .map((entry) => entry.id);
}

function listIds(ids: readonly string[]): string {
  return ids.map((id) => `  ${id}`).join("\n");
}

function resolveMission(name: string, io: Io): Mission {
  const needle = name.trim().toLowerCase();

  const byId = io.data.missions.filter((entry) => entry.id.toLowerCase() === needle);
  if (byId.length === 1) {
    return byId[0];
  }

  const byTitle = io.data.missions.filter((entry) => entry.title.toLowerCase() === needle);
  if (byTitle.length === 1) {
    return byTitle[0];
  }

  if (byTitle.length > 1) {
    throw new CliError(
      `"${name}" matches more than one mission:\n${listIds(byTitle.map((entry) => entry.id))}`,
      2,
    );
  }

  throw new CliError(
    `unknown mission: "${name}"\nclosest ids:\n${listIds(closest(name, io.data.missions))}`,
    2,
  );
}

function viewOf(io: Io, progress: Progress, spoilers: boolean): View {
  return {
    io,
    progress,
    spoilers,
    nextId: whatsLeft(progress, io.data).nextMission?.id ?? null,
  };
}

function position(mission: Mission, io: Io): string {
  const chapter = io.data.chapters.find((entry) => entry.id === mission.chapterId);
  const number = chapter === undefined ? "?" : chapter.number;
  return `Chapter ${number}, mission ${mission.order}`;
}

function label(mission: Mission, view: View): string {
  const visible =
    view.spoilers ||
    mission.id === view.nextId ||
    view.progress.missions[mission.id] !== undefined;

  return visible ? `${mission.title} (${mission.id})` : position(mission, view.io);
}

function storyLine(view: View): string {
  const story = summarize(view.progress, view.io.data).story;
  return `Story: ${story.done} of ${story.total} done, ${story.percent}%`;
}

function nextLine(view: View): string {
  const next = whatsLeft(view.progress, view.io.data).nextMission;
  if (next === null) {
    return "Next: nothing, every story mission is done";
  }
  return `Next: ${next.title} (${next.id}), ${position(next, view.io)}`;
}

function requirementLine(entry: RequirementProgress): string {
  const counts = `${entry.have} of ${entry.needed} ${entry.unit}`;
  return `  ${entry.id.padEnd(ID_WIDTH)} ${counts}, ${entry.remaining} left`;
}

function leftCommand(view: View): Result {
  const left = whatsLeft(view.progress, view.io.data);
  const lines = [nextLine(view), storyLine(view)];

  if (left.requirements.length === 0) {
    lines.push("Requirements: every one of them is met");
  } else {
    lines.push(
      `Requirements left: ${left.requirements.length} of ${view.io.data.requirements.length}`,
      "",
      ...left.requirements.map(requirementLine),
    );
  }

  return { code: 0, out: `${lines.join("\n")}\n` };
}

function statusCommand(view: View, file: string): Result {
  const summary = summarize(view.progress, view.io.data);
  const met = `${summary.overall.metRequirements} of ${summary.overall.totalRequirements}`;
  const lines = [
    storyLine(view),
    `Requirements: ${met} met`,
    `Progress file: ${file}`,
    "",
    ...summary.chapters.map(
      (chapter) =>
        `  ${chapter.number}  ${chapter.title.padEnd(TITLE_WIDTH)}  ${chapter.done} of ${chapter.total}`,
    ),
    "",
    nextLine(view),
  ];

  return { code: 0, out: `${lines.join("\n")}\n` };
}

function missionName(args: readonly string[], command: string): string {
  const name = args.join(" ").trim();
  if (name === "") {
    throw new CliError(`${command} needs a mission id or title`, 2);
  }
  return name;
}

function doneCommand(args: readonly string[], view: View, file: string): Result {
  const mission = resolveMission(missionName(args, "done"), view.io);
  const already = view.progress.missions[mission.id] !== undefined;
  const progress = markMission(view.progress, mission.id, view.io.now());

  if (!already) {
    writeProgress(view.io, file, progress);
  }

  const after = viewOf(view.io, progress, view.spoilers);
  const head = already ? "Already done" : "Done";

  return {
    code: 0,
    out: `${head}: ${label(mission, after)}\n${nextLine(after)}\n${storyLine(after)}\n`,
  };
}

function undoCommand(args: readonly string[], view: View, file: string): Result {
  const mission = resolveMission(missionName(args, "undo"), view.io);
  const marked = view.progress.missions[mission.id] !== undefined;
  const progress = unmarkMission(view.progress, mission.id, view.io.now());

  if (marked) {
    writeProgress(view.io, file, progress);
  }

  const after = viewOf(view.io, progress, view.spoilers);
  const head = marked ? "Undone" : "Not marked as done";

  return {
    code: 0,
    out: `${head}: ${label(mission, after)}\n${nextLine(after)}\n${storyLine(after)}\n`,
  };
}

function setCommand(args: readonly string[], view: View, file: string): Result {
  if (args.length < 2) {
    throw new CliError("set needs a requirement id and a count", 2);
  }

  const wanted = args[0].trim().toLowerCase();
  const requirement = view.io.data.requirements.find((entry) => entry.id === wanted);
  if (requirement === undefined) {
    const ids = listIds(closest(args[0], view.io.data.requirements));
    throw new CliError(`unknown requirement: "${args[0]}"\nclosest ids:\n${ids}`, 2);
  }

  const progress = setCount(
    view.progress,
    requirement.id,
    Number(args[1]),
    view.io.data,
    view.io.now(),
  );
  writeProgress(view.io, file, progress);

  const have = progress.counts[requirement.id];
  const remaining = Math.max(0, requirement.needed - have);
  const tail = remaining === 0 ? "met" : `${remaining} left`;
  const overall = summarize(progress, view.io.data).overall;

  return {
    code: 0,
    out: [
      `Set ${requirement.id} to ${have} of ${requirement.needed} ${requirement.unit}, ${tail}`,
      `Requirements: ${overall.metRequirements} of ${overall.totalRequirements} met`,
      "",
    ].join("\n"),
  };
}

function chapterBlock(chapter: Chapter, view: View): string {
  const missions = view.io.data.missions
    .filter((entry) => entry.chapterId === chapter.id)
    .slice()
    .sort(
      (left, right) =>
        Number(left.optional) - Number(right.optional) || left.order - right.order,
    );

  const done = missions.filter(
    (entry) => !entry.optional && view.progress.missions[entry.id] !== undefined,
  ).length;

  const lines = missions.map((mission) => {
    const mark = view.progress.missions[mission.id] !== undefined ? "x" : " ";
    const tail = mission.optional ? " (optional)" : "";
    const order = String(mission.order).padStart(2);
    return `  [${mark}] ${order}  ${label(mission, view)}${tail}`;
  });

  const header = `Chapter ${chapter.number} - ${chapter.title} (${done} of ${chapter.mandatoryMissions} done)`;
  return [header, ...lines].join("\n");
}

function missionsCommand(args: readonly string[], view: View): Result {
  const chapters = view.io.data.chapters;
  let shown: readonly Chapter[] = chapters;

  if (args.length > 0) {
    const wanted = args[0].trim().toLowerCase();
    const chapter = chapters.find(
      (entry) => String(entry.number) === wanted || entry.id === wanted,
    );
    if (chapter === undefined) {
      const known = listIds(chapters.map((entry) => `${entry.number} (${entry.id})`));
      throw new CliError(`unknown chapter: "${args[0]}"\nknown chapters:\n${known}`, 2);
    }
    shown = [chapter];
  }

  const blocks = shown.map((chapter) => chapterBlock(chapter, view));
  return { code: 0, out: `${blocks.join("\n\n")}\n` };
}

function hitLine(hit: SearchHit): string {
  const where = hit.chapter === undefined ? "" : ` (Chapter ${hit.chapter})`;
  return `  ${hit.kind.padEnd(KIND_WIDTH)} ${hit.id.padEnd(ID_WIDTH)} ${hit.title}${where}`;
}

function searchCommand(args: readonly string[], view: View): Result {
  const query = args.join(" ").trim();
  if (query === "") {
    throw new CliError("search needs words to look for", 2);
  }

  const spoilerLimit =
    view.spoilers || view.nextId === null
      ? undefined
      : storyIndexes(view.io.data).get(view.nextId);
  const hits = search(query, view.io.data, { spoilerLimit });

  if (hits.length === 0) {
    const hint = view.spoilers
      ? ""
      : "\nmissions past the next one are left out; pass --spoilers to search them";
    return { code: 0, out: `nothing found for "${query}"${hint}\n` };
  }

  return { code: 0, out: `${hits.map(hitLine).join("\n")}\n` };
}

function dispatch(command: string, options: Options, io: Io): Result {
  const args = options.args.slice(1);
  const file = fileFor(options, io);
  const view = viewOf(io, readProgress(io, file), options.spoilers);

  switch (command) {
    case "left":
      return leftCommand(view);
    case "status":
      return statusCommand(view, file);
    case "done":
      return doneCommand(args, view, file);
    case "undo":
      return undoCommand(args, view, file);
    case "set":
      return setCommand(args, view, file);
    case "search":
      return searchCommand(args, view);
    default:
      return missionsCommand(args, view);
  }
}

export function run(argv: readonly string[], io: Io = defaultIo()): Result {
  const options = parse(argv);

  if (options.bad !== null) {
    return { code: 2, out: `${options.bad}\n\n${USAGE}` };
  }
  if (options.help || options.args.length === 0) {
    return { code: 0, out: USAGE };
  }

  const command = options.args[0];
  if (!COMMANDS.includes(command)) {
    return { code: 2, out: `unknown command: ${command}\n\n${USAGE}` };
  }

  try {
    return dispatch(command, options, io);
  } catch (error) {
    if (error instanceof CliError) {
      return { code: error.exitCode, out: `${error.message}\n` };
    }
    if (error instanceof Gta6DataError) {
      return { code: 2, out: `${error.message}\n` };
    }
    return { code: 1, out: `${(error as Error).message}\n` };
  }
}

function invokedDirectly(entry: string | undefined): boolean {
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(entry) === import.meta.filename;
  } catch {
    return false;
  }
}

if (invokedDirectly(process.argv[1])) {
  const result = run(process.argv.slice(2));
  const stream = result.code === 0 ? process.stdout : process.stderr;
  stream.write(result.out);
  process.exitCode = result.code;
}
