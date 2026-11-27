#!/usr/bin/env node
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { loadChapters, loadMissions, loadRequirements } from "../data.ts";
import type { Progress, ProgressData, RequirementProgress } from "../progress.ts";
import {
  emptyProgress,
  markMission,
  setCount,
  summarize,
  unmarkMission,
  whatsLeft,
} from "../progress.ts";
import type { Mission, Requirement } from "../schema.ts";
import type { SearchData } from "../search.ts";
import { editDistance, search, storyIndexes } from "../search.ts";

const SERVER_NAME = "gta6-companion";
const SERVER_VERSION = "0.0.1";
const PROTOCOL_VERSION = "2025-06-18";
const KNOWN_PROTOCOL_VERSIONS: readonly string[] = [
  PROTOCOL_VERSION,
  "2025-03-26",
  "2024-11-05",
];
const DEFAULT_PROGRESS_FILE = "gta6-progress.json";
const READ_ONLY_FLAG = "--read-only";
const READ_ONLY_REFUSAL =
  "this server was started read-only, so it will not change the progress file; start it without --read-only and without GTA6_READ_ONLY=1 to allow writes";
const UPCOMING = 5;
const MATCHES = 5;
const SUGGESTIONS = 5;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

export type ServerContext = {
  data: ProgressData;
  loadProgress: () => Progress;
  // absent when the server runs read-only: the write tools are then left out of
  // tools/list and refuse the call
  saveProgress?: (progress: Progress) => void;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: true;
};

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, unknown>;
  write: boolean;
  run: (args: Record<string, unknown>, ctx: ServerContext) => string;
};

type Named = {
  id: string;
  title: string;
};

// Wrong arguments are a protocol error (-32602); every other tool failure comes
// back as a result with isError, so the assistant can read what went wrong.
class BadParams extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanArg(args: Record<string, unknown>, name: string): boolean {
  const value = args[name];
  if (value === undefined) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new BadParams(`"${name}" must be a boolean`);
  }
  return value;
}

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadParams(`"${name}" must be a non-empty string`);
  }
  return value;
}

function integerArg(args: Record<string, unknown>, name: string): number {
  const value = args[name];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new BadParams(`"${name}" must be an integer of 0 or more`);
  }
  return value;
}

function searchDataOf(data: ProgressData): SearchData {
  return {
    chapters: data.chapters,
    missions: data.missions,
    requirements: data.requirements,
    cheats: [],
  };
}

function chapterNumbers(data: ProgressData): Map<string, number> {
  return new Map(data.chapters.map((chapter) => [chapter.id, chapter.number]));
}

function chapterOf(mission: Mission, chapters: Map<string, number>): string {
  const number = chapters.get(mission.chapterId) ?? 0;
  return `Chapter ${String(number)}, mission ${String(mission.order)}`;
}

function storyMissions(data: ProgressData, indexes: Map<string, number>): Mission[] {
  return data.missions
    .filter((mission) => !mission.optional)
    .slice()
    .sort((left, right) => (indexes.get(left.id) ?? 0) - (indexes.get(right.id) ?? 0));
}

function reachedIndex(
  progress: Progress,
  data: ProgressData,
  indexes: Map<string, number>,
): number {
  const next = whatsLeft(progress, data).nextMission;
  if (next === null) {
    return Number.MAX_SAFE_INTEGER;
  }
  return indexes.get(next.id) ?? 1;
}

function requirementLine(entry: RequirementProgress): string {
  const state = entry.met ? "met" : `${String(entry.remaining)} left`;
  return `- ${entry.id}: ${entry.title}, ${String(entry.have)} of ${String(entry.needed)} ${entry.unit}, ${state}`;
}

function storyLine(done: number, total: number, percent: number): string {
  return `Story: ${String(done)} of ${String(total)} done, ${String(percent)}%.`;
}

function summaryLine(progress: Progress, data: ProgressData, chapterId?: string): string {
  const summary = summarize(progress, data);
  const wanted = chapterId ?? whatsLeft(progress, data).nextMission?.chapterId;
  const chapter =
    summary.chapters.find((entry) => entry.id === wanted) ??
    summary.chapters[summary.chapters.length - 1];

  return `Chapter ${String(chapter.number)}: ${String(chapter.done)} of ${String(chapter.total)}, story ${String(summary.story.done)} of ${String(summary.story.total)}`;
}

function nextLine(progress: Progress, data: ProgressData): string {
  const next = whatsLeft(progress, data).nextMission;
  if (next === null) {
    return "Next: nothing, every story mission is done.";
  }
  return `Next: ${next.title} (${next.id}).`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function closestIds(name: string, candidates: readonly Named[]): string {
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
    .map((entry) => entry.id)
    .join(", ");
}

function saver(ctx: ServerContext): (progress: Progress) => void {
  if (ctx.saveProgress === undefined) {
    throw new Error(READ_ONLY_REFUSAL);
  }
  return ctx.saveProgress;
}

// Same rules as the CLI: an id or an exact title, case-insensitive.
function missionFor(name: string, ctx: ServerContext): Mission {
  const needle = name.trim().toLowerCase();
  const missions = ctx.data.missions;

  const byId = missions.filter((entry) => entry.id.toLowerCase() === needle);
  if (byId.length === 1) {
    return byId[0];
  }

  const byTitle = missions.filter((entry) => entry.title.toLowerCase() === needle);
  if (byTitle.length === 1) {
    return byTitle[0];
  }
  if (byTitle.length > 1) {
    throw new Error(
      `"${name}" matches more than one mission: ${byTitle.map((entry) => entry.id).join(", ")}`,
    );
  }

  throw new Error(
    `no mission has the id or title "${name}"; closest ids: ${closestIds(name, missions)}`,
  );
}

function requirementFor(name: string, ctx: ServerContext): Requirement {
  const needle = name.trim().toLowerCase();
  const found = ctx.data.requirements.find((entry) => entry.id === needle);

  if (found === undefined) {
    throw new Error(
      `no requirement has the id "${name}"; closest ids: ${closestIds(name, ctx.data.requirements)}`,
    );
  }

  return found;
}

function whatsLeftTool(args: Record<string, unknown>, ctx: ServerContext): string {
  const spoilers = booleanArg(args, "spoilers");
  const progress = ctx.loadProgress();
  const summary = summarize(progress, ctx.data);
  const left = whatsLeft(progress, ctx.data);
  const chapters = chapterNumbers(ctx.data);
  const next = left.nextMission;

  const lines = [storyLine(summary.story.done, summary.story.total, summary.story.percent)];

  if (next === null) {
    lines.push("Every story mission is done.");
  } else {
    lines.push(`Next: ${next.title} (${next.id}), ${chapterOf(next, chapters)}.`);

    if (spoilers) {
      const indexes = storyIndexes(searchDataOf(ctx.data));
      const order = storyMissions(ctx.data, indexes);
      const at = order.findIndex((mission) => mission.id === next.id);
      const upcoming = order.slice(at + 1, at + 1 + UPCOMING);

      if (upcoming.length > 0) {
        lines.push(`Then: ${upcoming.map((mission) => mission.title).join(", ")}.`);
      }
    }
  }

  if (left.requirements.length === 0) {
    lines.push("Every requirement is met.");
  } else {
    lines.push(
      `Unmet requirements (${String(left.requirements.length)} of ${String(summary.overall.totalRequirements)}):`,
    );
    lines.push(...left.requirements.map(requirementLine));
  }

  return lines.join("\n");
}

function statusTool(_args: Record<string, unknown>, ctx: ServerContext): string {
  const summary = summarize(ctx.loadProgress(), ctx.data);
  const width = Math.max(...summary.chapters.map((chapter) => chapter.title.length));

  return [
    storyLine(summary.story.done, summary.story.total, summary.story.percent),
    `Requirements: ${String(summary.overall.metRequirements)} of ${String(summary.overall.totalRequirements)} met.`,
    "Chapters:",
    ...summary.chapters.map(
      (chapter) =>
        `  ${String(chapter.number)}  ${chapter.title.padEnd(width)}  ${String(chapter.done)} of ${String(chapter.total)}`,
    ),
  ].join("\n");
}

function missionTool(args: Record<string, unknown>, ctx: ServerContext): string {
  const query = stringArg(args, "query");
  const spoilers = booleanArg(args, "spoilers");
  const progress = ctx.loadProgress();
  const data = searchDataOf(ctx.data);
  const indexes = storyIndexes(data);
  const reached = reachedIndex(progress, ctx.data, indexes);
  const chapters = chapterNumbers(ctx.data);
  const total = storyMissions(ctx.data, indexes).length;
  const byId = new Map(ctx.data.missions.map((mission) => [mission.id, mission]));

  const found = search(query, data, { kinds: ["mission"], limit: MATCHES })
    .map((hit) => byId.get(hit.id))
    .filter((mission): mission is Mission => mission !== undefined);

  if (found.length === 0) {
    throw new Error(`no mission matches "${query}"`);
  }

  const lines = [
    found.length === 1 ? "1 mission matches:" : `${String(found.length)} missions match:`,
  ];

  for (const mission of found) {
    const index = indexes.get(mission.id) ?? 1;
    const place = mission.optional
      ? "optional job"
      : `story mission ${String(index)} of ${String(total)}`;
    const state = progress.missions[mission.id] === undefined ? "not done" : "done";
    const where = `${chapterOf(mission, chapters)}, ${place}, ${state}`;

    lines.push(
      spoilers || index <= reached
        ? `- ${mission.title} (${mission.id}): ${where}`
        : `- ${where}, title withheld until you reach it or pass spoilers: true`,
    );
  }

  return lines.join("\n");
}

function requirementsTool(args: Record<string, unknown>, ctx: ServerContext): string {
  const onlyUnmet = booleanArg(args, "onlyUnmet");
  const summary = summarize(ctx.loadProgress(), ctx.data);
  const shown = onlyUnmet
    ? summary.requirements.filter((entry) => !entry.met)
    : summary.requirements;

  const lines = [
    `Requirements: ${String(summary.overall.metRequirements)} of ${String(summary.overall.totalRequirements)} met.`,
  ];

  if (onlyUnmet && shown.length === 0) {
    lines.push("Every requirement is met.");
  }
  lines.push(...shown.map(requirementLine));

  return lines.join("\n");
}

function markDoneTool(args: Record<string, unknown>, ctx: ServerContext): string {
  const name = stringArg(args, "mission");
  const save = saver(ctx);
  const mission = missionFor(name, ctx);
  const before = ctx.loadProgress();
  const already = before.missions[mission.id] !== undefined;
  const after = markMission(before, mission.id);

  if (!already) {
    save(after);
  }

  return [
    `${already ? "Already done" : "Done"}: ${mission.title} (${mission.id}).`,
    summaryLine(after, ctx.data, mission.chapterId),
    nextLine(after, ctx.data),
  ].join("\n");
}

function undoTool(args: Record<string, unknown>, ctx: ServerContext): string {
  const name = stringArg(args, "mission");
  const save = saver(ctx);
  const mission = missionFor(name, ctx);
  const before = ctx.loadProgress();
  const marked = before.missions[mission.id] !== undefined;
  const after = unmarkMission(before, mission.id);

  if (marked) {
    save(after);
  }

  return [
    `${marked ? "Undone" : "Not marked as done"}: ${mission.title} (${mission.id}).`,
    summaryLine(after, ctx.data, mission.chapterId),
    nextLine(after, ctx.data),
  ].join("\n");
}

function setCountTool(args: Record<string, unknown>, ctx: ServerContext): string {
  const name = stringArg(args, "requirement");
  const count = integerArg(args, "count");
  const save = saver(ctx);
  const requirement = requirementFor(name, ctx);
  const before = ctx.loadProgress();
  const after = setCount(before, requirement.id, count, ctx.data);

  if ((before.counts[requirement.id] ?? 0) !== count) {
    save(after);
  }

  const have = after.counts[requirement.id];
  const remaining = Math.max(0, requirement.needed - have);
  const tail = remaining === 0 ? "met" : `${String(remaining)} left`;
  const overall = summarize(after, ctx.data).overall;

  return [
    `Set ${requirement.id} to ${String(have)} of ${String(requirement.needed)} ${requirement.unit}, ${tail}.`,
    `Requirements: ${String(overall.metRequirements)} of ${String(overall.totalRequirements)} met.`,
    summaryLine(after, ctx.data),
  ].join("\n");
}

const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
};

const MISSION_SCHEMA = {
  type: "object",
  properties: {
    mission: {
      type: "string",
      description: "A mission id (ch2-moses) or its exact title (Moses).",
    },
  },
  required: ["mission"],
  additionalProperties: false,
};

const TOOLS: readonly Tool[] = [
  {
    name: "gta6_whats_left",
    description:
      "The next unfinished GTA 6 story mission and every 100% requirement that is still short. Pass spoilers to also name the missions after the next one.",
    inputSchema: {
      type: "object",
      properties: {
        spoilers: {
          type: "boolean",
          description: "Also name the story missions after the next one. Defaults to false.",
        },
      },
      additionalProperties: false,
    },
    annotations: { title: "What is left in GTA 6", readOnlyHint: true },
    write: false,
    run: whatsLeftTool,
  },
  {
    name: "gta6_status",
    description:
      "Story and per-chapter GTA 6 progress, plus how many of the 100% requirements are met.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "GTA 6 progress", readOnlyHint: true },
    write: false,
    run: statusTool,
  },
  {
    name: "gta6_mission",
    description:
      "Find a GTA 6 mission by title or id, one typo per word tolerated. Titles of missions past your position are withheld unless spoilers is true.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A mission title or id, or part of one." },
        spoilers: {
          type: "boolean",
          description: "Show titles of missions you have not reached. Defaults to false.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { title: "Find a GTA 6 mission", readOnlyHint: true },
    write: false,
    run: missionTool,
  },
  {
    name: "gta6_requirements",
    description:
      "The GTA 6 100% completion requirements with how many of each you have and how many are left.",
    inputSchema: {
      type: "object",
      properties: {
        onlyUnmet: {
          type: "boolean",
          description: "Leave out the requirements already met. Defaults to false.",
        },
      },
      additionalProperties: false,
    },
    annotations: { title: "GTA 6 100% requirements", readOnlyHint: true },
    write: false,
    run: requirementsTool,
  },
  {
    name: "gta6_mark_done",
    description:
      "Mark a GTA 6 story mission done in the progress file, by id or exact title. Marking a mission that is already done changes nothing. Answers with the new chapter and story counts.",
    inputSchema: MISSION_SCHEMA,
    annotations: { title: "Mark a GTA 6 mission done", ...WRITE_ANNOTATIONS },
    write: true,
    run: markDoneTool,
  },
  {
    name: "gta6_undo",
    description:
      "Take a GTA 6 mission back off the done list, by id or exact title. Answers with the new chapter and story counts.",
    inputSchema: MISSION_SCHEMA,
    annotations: { title: "Unmark a GTA 6 mission", ...WRITE_ANNOTATIONS },
    write: true,
    run: undoTool,
  },
  {
    name: "gta6_set_count",
    description:
      "Record how many of a GTA 6 100% requirement you have, by requirement id. Answers with what is left of it and the new chapter and story counts.",
    inputSchema: {
      type: "object",
      properties: {
        requirement: {
          type: "string",
          description: "A requirement id from the 100% list, such as card-sets.",
        },
        count: {
          type: "integer",
          minimum: 0,
          description: "How many of them you have now.",
        },
      },
      required: ["requirement", "count"],
      additionalProperties: false,
    },
    annotations: { title: "Set a GTA 6 requirement count", ...WRITE_ANNOTATIONS },
    write: true,
    run: setCountTool,
  },
];

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResponse(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function idOf(message: Record<string, unknown>): string | number | null | undefined {
  const id = message.id;
  if (typeof id === "string" || typeof id === "number" || id === null) {
    return id;
  }
  return undefined;
}

function initializeResult(params: unknown): unknown {
  const asked = isRecord(params) ? params.protocolVersion : undefined;
  const version =
    typeof asked === "string" && KNOWN_PROTOCOL_VERSIONS.includes(asked)
      ? asked
      : PROTOCOL_VERSION;

  return {
    protocolVersion: version,
    capabilities: { tools: {} },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function listResult(ctx: ServerContext): unknown {
  const shown = TOOLS.filter((tool) => !tool.write || ctx.saveProgress !== undefined);

  return {
    tools: shown.map(({ name, description, inputSchema, annotations }) => ({
      name,
      description,
      inputSchema,
      annotations,
    })),
  };
}

function callTool(
  id: string | number | null,
  params: unknown,
  ctx: ServerContext,
): JsonRpcResponse {
  if (!isRecord(params) || typeof params.name !== "string") {
    return errorResponse(id, INVALID_PARAMS, "invalid params: tools/call needs a tool name");
  }

  const tool = TOOLS.find((entry) => entry.name === params.name);
  if (tool === undefined) {
    return errorResponse(id, INVALID_PARAMS, `invalid params: unknown tool "${params.name}"`);
  }

  const args = params.arguments ?? {};
  if (!isRecord(args)) {
    return errorResponse(id, INVALID_PARAMS, "invalid params: arguments must be an object");
  }

  try {
    return { jsonrpc: "2.0", id, result: textResult(tool.run(args, ctx)) };
  } catch (error) {
    if (error instanceof BadParams) {
      return errorResponse(id, INVALID_PARAMS, `invalid params: ${error.message}`);
    }
    return { jsonrpc: "2.0", id, result: { ...textResult(messageOf(error)), isError: true } };
  }
}

// message is one newline-delimited JSON line; null means the line was a
// notification, which gets no answer.
export function handle(message: string, ctx: ServerContext): JsonRpcResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return errorResponse(null, PARSE_ERROR, "parse error: the line is not valid JSON");
  }

  if (!isRecord(parsed) || typeof parsed.method !== "string") {
    const id = isRecord(parsed) ? idOf(parsed) ?? null : null;
    return errorResponse(id, INVALID_REQUEST, "invalid request: a method name is required");
  }

  const id = idOf(parsed);
  if (id === undefined) {
    return null;
  }

  switch (parsed.method) {
    case "initialize":
      return { jsonrpc: "2.0", id, result: initializeResult(parsed.params) };
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: listResult(ctx) };
    case "tools/call":
      return callTool(id, parsed.params, ctx);
    default:
      return errorResponse(id, METHOD_NOT_FOUND, `method not found: ${parsed.method}`);
  }
}

export function progressFile(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): string {
  const flag = argv.indexOf("--file");
  const given = flag === -1 ? undefined : argv[flag + 1];
  return given ?? env.GTA6_PROGRESS ?? DEFAULT_PROGRESS_FILE;
}

export function readOnlyMode(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): boolean {
  return argv.includes(READ_ONLY_FLAG) || env.GTA6_READ_ONLY === "1";
}

export function readProgress(file: string): Progress {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return emptyProgress();
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error(`${file} does not hold a progress document`);
  }

  return {
    version: 1,
    updatedAt:
      typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    missions: isRecord(parsed.missions) ? (parsed.missions as Record<string, string>) : {},
    counts: isRecord(parsed.counts) ? (parsed.counts as Record<string, number>) : {},
  };
}

export function writeProgress(file: string, progress: Progress): void {
  const temp = `${file}.tmp`;

  try {
    writeFileSync(temp, `${JSON.stringify(progress, null, 2)}\n`);
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw new Error(`could not write ${file}: ${messageOf(error)}`);
  }
}

export function createContext(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): ServerContext {
  const file = progressFile(argv, env);
  const data: ProgressData = {
    chapters: loadChapters(),
    missions: loadMissions(undefined, { includeOptional: true }),
    requirements: loadRequirements(),
  };

  if (readOnlyMode(argv, env)) {
    return { data, loadProgress: () => readProgress(file) };
  }

  return {
    data,
    loadProgress: () => readProgress(file),
    saveProgress: (progress) => {
      writeProgress(file, progress);
    },
  };
}

export function main(): void {
  const ctx = createContext(process.argv.slice(2), process.env);
  let buffer = "";

  function reply(line: string): void {
    if (line.trim() === "") {
      return;
    }
    const response = handle(line, ctx);
    if (response !== null) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      reply(line);
      newline = buffer.indexOf("\n");
    }
  });
  process.stdin.on("end", () => {
    const rest = buffer;
    buffer = "";
    reply(rest);
  });
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main();
}
