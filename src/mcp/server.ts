#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { loadChapters, loadMissions, loadRequirements } from "../data.ts";
import type { Progress, ProgressData, RequirementProgress } from "../progress.ts";
import { emptyProgress, summarize, whatsLeft } from "../progress.ts";
import type { Mission } from "../schema.ts";
import type { SearchData } from "../search.ts";
import { search, storyIndexes } from "../search.ts";

const SERVER_NAME = "gta6-companion";
const SERVER_VERSION = "0.0.1";
const PROTOCOL_VERSION = "2025-06-18";
const KNOWN_PROTOCOL_VERSIONS: readonly string[] = [
  PROTOCOL_VERSION,
  "2025-03-26",
  "2024-11-05",
];
const DEFAULT_PROGRESS_FILE = "gta6-progress.json";
const UPCOMING = 5;
const MATCHES = 5;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

export type ServerContext = {
  data: ProgressData;
  loadProgress: () => Progress;
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
  run: (args: Record<string, unknown>, ctx: ServerContext) => string;
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
    run: whatsLeftTool,
  },
  {
    name: "gta6_status",
    description:
      "Story and per-chapter GTA 6 progress, plus how many of the 100% requirements are met.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
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
    run: requirementsTool,
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
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })),
        },
      };
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

export function createContext(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): ServerContext {
  const file = progressFile(argv, env);

  return {
    data: {
      chapters: loadChapters(),
      missions: loadMissions(undefined, { includeOptional: true }),
      requirements: loadRequirements(),
    },
    loadProgress: () => readProgress(file),
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
