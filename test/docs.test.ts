import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createContext, handle } from "../src/mcp/server.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DOC = readFileSync(path.join(ROOT, "docs", "mcp.md"), "utf8");
const REPO_PATH = /[A-Za-z0-9_./-]*src\/[A-Za-z0-9_./-]+\.ts/g;
const TOOL_NAME = /\bgta6_[a-z0-9_]+/g;
const COMMANDS = ["node", "npx"];

function fenced(language: string): string[] {
  const fence = new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g");
  return [...DOC.matchAll(fence)].map((match) => match[1]);
}

function inRepo(named: string): string {
  const at = named.indexOf("src/");
  assert.notEqual(at, -1, `${named} is not a path inside the repository`);
  return named.slice(at);
}

function listedTools(): string[] {
  const response = handle(
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    createContext([], {}),
  );
  const result = response?.result as { tools: { name: string }[] } | undefined;

  assert.ok(result !== undefined, "tools/list answered without a result");
  return result.tools.map((tool) => tool.name);
}

test("every JSON snippet parses and points at the server in this repository", () => {
  const snippets = fenced("json");
  assert.ok(snippets.length >= 3, "the page should carry a snippet per client");

  let checked = 0;

  for (const snippet of snippets) {
    const parsed = JSON.parse(snippet) as { mcpServers?: Record<string, unknown> };
    assert.ok(parsed.mcpServers !== undefined, `snippet without mcpServers: ${snippet}`);

    for (const entry of Object.values(parsed.mcpServers)) {
      const server = entry as { command?: unknown; args?: unknown };

      assert.ok(
        typeof server.command === "string" && COMMANDS.includes(server.command),
        `unexpected command: ${String(server.command)}`,
      );
      assert.ok(
        Array.isArray(server.args) && typeof server.args[0] === "string",
        "a snippet names no server file",
      );

      const named = inRepo(server.args[0] as string);
      assert.ok(
        existsSync(path.join(ROOT, named)),
        `a snippet names ${named}, which is not in the repository`,
      );
      checked += 1;
    }
  }

  assert.ok(checked >= 3);
});

test("every repository path named on the page exists", () => {
  const named = [...new Set(DOC.match(REPO_PATH) ?? [])];
  assert.ok(named.length > 0);

  for (const entry of named) {
    const relative = inRepo(entry);
    assert.ok(
      existsSync(path.join(ROOT, relative)),
      `docs/mcp.md names ${relative}, which is not in the repository`,
    );
  }
});

test("the page names every tool the server lists and no other", () => {
  const mentioned = [...new Set(DOC.match(TOOL_NAME) ?? [])].sort();
  const listed = listedTools().slice().sort();

  assert.deepEqual(mentioned, listed);
});
