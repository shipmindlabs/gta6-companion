import assert from "node:assert/strict";
import { test } from "node:test";

import { loadChapters, loadMissions, loadRequirements } from "../src/data.ts";
import type { JsonRpcResponse, ServerContext } from "../src/mcp/server.ts";
import { createContext, handle, readOnlyMode } from "../src/mcp/server.ts";
import type { Progress, ProgressData } from "../src/progress.ts";
import { emptyProgress, markMission, setCount } from "../src/progress.ts";

const NOW = "2026-11-26T12:00:00.000Z";

const data: ProgressData = {
  chapters: loadChapters(),
  missions: loadMissions(undefined, { includeOptional: true }),
  requirements: loadRequirements(),
};

const READ_TOOLS = ["gta6_whats_left", "gta6_status", "gta6_mission", "gta6_requirements"];
const WRITE_TOOLS = ["gta6_mark_done", "gta6_undo", "gta6_set_count"];

type ToolCallResult = {
  content: { type: string; text: string }[];
  isError?: boolean;
};

type ToolInfo = {
  name: string;
  description: string;
  inputSchema: { type: string };
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
};

type Store = {
  ctx: ServerContext;
  current: () => Progress;
};

function store(start: Progress = emptyProgress(NOW)): Store {
  let kept = start;

  return {
    ctx: {
      data,
      loadProgress: () => kept,
      saveProgress: (next) => {
        kept = next;
      },
    },
    current: () => kept,
  };
}

function context(progress: Progress = emptyProgress(NOW)): ServerContext {
  return store(progress).ctx;
}

function readOnlyContext(progress: Progress = emptyProgress(NOW)): ServerContext {
  return { data, loadProgress: () => progress };
}

function request(method: string, params?: unknown, id: string | number = 1): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    ...(params === undefined ? {} : { params }),
  });
}

function ask(line: string, ctx: ServerContext = context()): JsonRpcResponse {
  const response = handle(line, ctx);
  assert.ok(response !== null);
  return response;
}

function callTool(
  name: string,
  args: Record<string, unknown> = {},
  ctx: ServerContext = context(),
): JsonRpcResponse {
  return ask(request("tools/call", { name, arguments: args }), ctx);
}

function textOf(response: JsonRpcResponse): string {
  return (response.result as ToolCallResult).content.map((entry) => entry.text).join("\n");
}

function listTools(ctx: ServerContext): ToolInfo[] {
  return (ask(request("tools/list"), ctx).result as { tools: ToolInfo[] }).tools;
}

test("the initialize handshake echoes a protocol version the server knows", () => {
  const response = ask(
    request(
      "initialize",
      { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } },
      "init",
    ),
  );

  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.id, "init");

  const result = response.result as {
    protocolVersion: string;
    capabilities: { tools?: unknown };
    serverInfo: { name: string; version: string };
  };
  assert.equal(result.protocolVersion, "2024-11-05");
  assert.notEqual(result.capabilities.tools, undefined);
  assert.equal(result.serverInfo.name, "gta6-companion");

  const own = ask(request("initialize", { protocolVersion: "1999-01-01" }));
  assert.equal((own.result as { protocolVersion: string }).protocolVersion, "2025-06-18");

  assert.equal(handle(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), context()), null);
  assert.deepEqual(ask(request("ping")).result, {});
});

test("tools/list names the read tools and the write tools, each with an object schema", () => {
  const tools = listTools(context());

  assert.deepEqual(
    tools.map((tool) => tool.name),
    [...READ_TOOLS, ...WRITE_TOOLS],
  );
  assert.ok(tools.every((tool) => tool.inputSchema.type === "object"));
  assert.ok(tools.every((tool) => tool.description.length > 0));

  for (const tool of tools.filter((entry) => WRITE_TOOLS.includes(entry.name))) {
    assert.equal(tool.annotations.readOnlyHint, false);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.idempotentHint, true);
  }
});

test("gta6_whats_left on an empty progress names the Prologue", () => {
  const text = textOf(callTool("gta6_whats_left"));

  assert.match(text, /Story: 0 of 91 done, 0%/);
  assert.match(text, /Next: Prologue \(ch1-prologue\), Chapter 1, mission 1/);
  assert.ok(text.includes(`Unmet requirements (${String(data.requirements.length)} of ${String(data.requirements.length)}):`));
  assert.ok(text.includes("- unique-playlists: Unique playlists, 0 of 2 playlists, 2 left"));
  assert.ok(!text.includes("Gone Fishing"));

  assert.match(textOf(callTool("gta6_whats_left", { spoilers: true })), /Then: Gone Fishing/);
});

test("a mission title past the player's position is withheld without spoilers", () => {
  const hidden = textOf(callTool("gta6_mission", { query: "cartel heist" }));

  assert.ok(!hidden.includes("The Cartel Heist"));
  assert.ok(!hidden.includes("ch3-the-cartel-heist"));
  assert.match(hidden, /Chapter 3, mission 26, story mission 59 of 91, not done, title withheld/);

  const shown = textOf(callTool("gta6_mission", { query: "cartel heist", spoilers: true }));
  assert.match(shown, /The Cartel Heist \(ch3-the-cartel-heist\)/);

  const reached = textOf(callTool("gta6_mission", { query: "prolog" }));
  assert.match(reached, /Prologue \(ch1-prologue\): Chapter 1, mission 1, story mission 1 of 91, not done/);
});

test("a malformed JSON line yields -32700", () => {
  const response = ask("{ not json");

  assert.equal(response.id, null);
  assert.equal(response.error?.code, -32700);
  assert.equal(response.result, undefined);
});

test("an unknown method is -32601 and bad params are -32602", () => {
  assert.equal(ask(request("tools/fly")).error?.code, -32601);
  assert.equal(callTool("gta6_fly").error?.code, -32602);
  assert.equal(callTool("gta6_mission").error?.code, -32602);
  assert.equal(callTool("gta6_mission", { query: "prologue", spoilers: "yes" }).error?.code, -32602);
  assert.equal(callTool("gta6_mark_done").error?.code, -32602);
});

test("a tool that cannot do its work answers with isError, not a protocol error", () => {
  const broken: ServerContext = {
    data,
    loadProgress: () => {
      throw new Error("could not read gta6-progress.json");
    },
  };

  const response = callTool("gta6_status", {}, broken);
  const result = response.result as ToolCallResult;

  assert.equal(response.error, undefined);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /could not read gta6-progress\.json/);

  const missing = callTool("gta6_mission", { query: "zzzzqq" });
  assert.equal((missing.result as ToolCallResult).isError, true);
});

test("gta6_status and gta6_requirements read the progress document", () => {
  let progress = markMission(emptyProgress(NOW), "ch1-prologue", NOW);
  progress = setCount(progress, "vaults", 8, data, NOW);

  const status = textOf(callTool("gta6_status", {}, context(progress)));
  assert.match(status, /Story: 1 of 91 done, 1%/);
  assert.ok(status.includes(`Requirements: 1 of ${String(data.requirements.length)} met.`));
  assert.match(status, /1 {2}Just Like Paradise\s+1 of 22/);
  assert.match(status, /5 {2}Top of the World, Ma\s+0 of 7/);

  const all = textOf(callTool("gta6_requirements", {}, context(progress)));
  assert.ok(all.includes("- vaults: Vaults, 8 of 8 vaults, met"));

  const unmet = textOf(callTool("gta6_requirements", { onlyUnmet: true }, context(progress)));
  assert.ok(!unmet.includes("- vaults:"));
  assert.ok(unmet.includes("- card-sets: Card sets, 0 of 15 sets, 15 left"));
});

test("gta6_mark_done advances what is left and marking twice changes nothing", () => {
  const kept = store();

  const first = textOf(callTool("gta6_mark_done", { mission: "ch1-prologue" }, kept.ctx));
  assert.match(first, /^Done: Prologue \(ch1-prologue\)\./m);
  assert.match(first, /^Chapter 1: 1 of 22, story 1 of 91$/m);
  assert.match(first, /^Next: Gone Fishing \(ch1-gone-fishing\)\.$/m);

  const left = textOf(callTool("gta6_whats_left", {}, kept.ctx));
  assert.match(left, /Story: 1 of 91 done, 1%/);
  assert.match(left, /Next: Gone Fishing \(ch1-gone-fishing\), Chapter 1, mission 2/);

  const stamp = kept.current().missions["ch1-prologue"];
  const again = textOf(callTool("gta6_mark_done", { mission: "Prologue" }, kept.ctx));
  assert.match(again, /^Already done: Prologue \(ch1-prologue\)\./m);
  assert.match(again, /^Chapter 1: 1 of 22, story 1 of 91$/m);
  assert.equal(kept.current().missions["ch1-prologue"], stamp);
  assert.deepEqual(Object.keys(kept.current().missions), ["ch1-prologue"]);
});

test("gta6_undo takes a mission back off the done list", () => {
  const kept = store(markMission(emptyProgress(NOW), "ch2-moses", NOW));

  const text = textOf(callTool("gta6_undo", { mission: "Moses" }, kept.ctx));
  assert.match(text, /^Undone: Moses \(ch2-moses\)\./m);
  assert.match(text, /^Chapter 2: 0 of 11, story 0 of 91$/m);
  assert.deepEqual(kept.current().missions, {});

  const again = textOf(callTool("gta6_undo", { mission: "ch2-moses" }, kept.ctx));
  assert.match(again, /^Not marked as done: Moses \(ch2-moses\)\./m);

  const unknown = callTool("gta6_mark_done", { mission: "ch9-nope" }, kept.ctx);
  assert.equal((unknown.result as ToolCallResult).isError, true);
  assert.match(textOf(unknown), /closest ids:/);
});

test("gta6_set_count records a count and refuses one that is not a whole number", () => {
  const kept = store();

  const text = textOf(callTool("gta6_set_count", { requirement: "vaults", count: 8 }, kept.ctx));
  assert.match(text, /^Set vaults to 8 of 8 vaults, met\.$/m);
  assert.match(text, /^Chapter 1: 0 of 22, story 0 of 91$/m);
  assert.equal(kept.current().counts.vaults, 8);

  assert.equal(
    callTool("gta6_set_count", { requirement: "vaults", count: "8" }, kept.ctx).error?.code,
    -32602,
  );
  assert.equal(
    callTool("gta6_set_count", { requirement: "vaults", count: -1 }, kept.ctx).error?.code,
    -32602,
  );
  assert.equal(
    callTool("gta6_set_count", { requirement: "vaults" }, kept.ctx).error?.code,
    -32602,
  );
  assert.equal(kept.current().counts.vaults, 8);

  const unknown = callTool("gta6_set_count", { requirement: "vaultz", count: 1 }, kept.ctx);
  assert.equal((unknown.result as ToolCallResult).isError, true);
  assert.match(textOf(unknown), /vaults/);
});

test("a read-only server hides the write tools and refuses a write", () => {
  const ctx = readOnlyContext();

  assert.deepEqual(
    listTools(ctx).map((tool) => tool.name),
    READ_TOOLS,
  );

  const refused = callTool("gta6_mark_done", { mission: "ch1-prologue" }, ctx);
  assert.equal(refused.error, undefined);
  assert.equal((refused.result as ToolCallResult).isError, true);
  assert.match(textOf(refused), /read-only/);

  for (const name of ["gta6_undo", "gta6_set_count"]) {
    const args = name === "gta6_undo" ? { mission: "ch1-prologue" } : { requirement: "vaults", count: 1 };
    assert.equal((callTool(name, args, ctx).result as ToolCallResult).isError, true);
  }

  assert.match(textOf(callTool("gta6_status", {}, ctx)), /Story: 0 of 91 done/);
});

test("--read-only and GTA6_READ_ONLY=1 take the writer away", () => {
  assert.equal(readOnlyMode(["--file", "gta6.json"], {}), false);
  assert.equal(readOnlyMode(["--read-only"], {}), true);
  assert.equal(readOnlyMode([], { GTA6_READ_ONLY: "1" }), true);
  assert.equal(readOnlyMode([], { GTA6_READ_ONLY: "0" }), false);

  assert.equal(createContext(["--read-only"], {}).saveProgress, undefined);
  assert.notEqual(createContext([], {}).saveProgress, undefined);
});
