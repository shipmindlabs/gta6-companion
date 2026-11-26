import assert from "node:assert/strict";
import { test } from "node:test";

import { loadChapters, loadMissions, loadRequirements } from "../src/data.ts";
import type { JsonRpcResponse, ServerContext } from "../src/mcp/server.ts";
import { handle } from "../src/mcp/server.ts";
import type { Progress, ProgressData } from "../src/progress.ts";
import { emptyProgress, markMission, setCount } from "../src/progress.ts";

const NOW = "2026-11-26T12:00:00.000Z";

const data: ProgressData = {
  chapters: loadChapters(),
  missions: loadMissions(undefined, { includeOptional: true }),
  requirements: loadRequirements(),
};

type ToolCallResult = {
  content: { type: string; text: string }[];
  isError?: boolean;
};

function context(progress: Progress = emptyProgress(NOW)): ServerContext {
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

test("tools/list names the four tools, each with an object schema", () => {
  const tools = (
    ask(request("tools/list")).result as {
      tools: { name: string; description: string; inputSchema: { type: string } }[];
    }
  ).tools;

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["gta6_whats_left", "gta6_status", "gta6_mission", "gta6_requirements"],
  );
  assert.ok(tools.every((tool) => tool.inputSchema.type === "object"));
  assert.ok(tools.every((tool) => tool.description.length > 0));
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
