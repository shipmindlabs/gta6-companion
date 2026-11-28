# Set up the GTA 6 MCP server

`src/mcp/server.ts` is a Model Context Protocol server over stdio: newline
delimited JSON-RPC 2.0, no dependencies, no build step. It answers from the data
in this repository - the five chapters, the 91 story missions and the 100%
completion requirements - and it reads and writes the same progress file as the
`gta6` command line, so an assistant sees the checklist you keep yourself.

## Run it locally

Node 22.18 or newer runs the TypeScript sources directly, so there is nothing to
compile and nothing to install:

```sh
git clone https://github.com/shipmindlabs/gta6-companion.git
cd gta6-companion
node src/mcp/server.ts
```

The process waits for JSON-RPC lines on stdin and answers on stdout, one JSON
object per line. Nothing else is written to stdout, so a client can be pointed
straight at it. To watch it answer by hand:

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node src/mcp/server.ts
```

Clients need the absolute path of `src/mcp/server.ts`. The snippets below write
it as `/path/to/gta6-companion/src/mcp/server.ts`; replace that with the path of
your clone. The published package also carries a `gta6-mcp` binary, but the
local path keeps the assistant on the code and the data you have checked out.

## Environment variables and arguments

| What | Argument | Variable | Default |
| --- | --- | --- | --- |
| Progress file | `--file <path>` | `GTA6_PROGRESS` | `./gta6-progress.json` |
| Read-only | `--read-only` | `GTA6_READ_ONLY=1` | off |

The argument wins over the variable. A progress file that does not exist counts
as an empty progress document, so the first question works before anything is
tracked; the file is created on the first write and written atomically, to a
temporary file renamed over the old one, so a failed write leaves the previous
file untouched.

You do not control the working directory a client starts the server in, so give
an absolute path for the progress file instead of relying on the default.

## Read-only mode

Started with `--read-only`, or with `GTA6_READ_ONLY=1` in the environment, the
server has no writer: `tools/list` leaves the three write tools out, and a call
for one of them comes back as a result with `isError: true` saying the server
was started read-only. The four read tools work as usual. Use it when an
assistant should answer about your progress but never change the file.

## Claude Code

`.mcp.json` in the root of the project you work in:

```json
{
  "mcpServers": {
    "gta6-companion": {
      "command": "node",
      "args": ["/path/to/gta6-companion/src/mcp/server.ts"],
      "env": { "GTA6_PROGRESS": "/home/you/gta6.json" }
    }
  }
}
```

The read-only form, for a project where the assistant should only answer
questions:

```json
{
  "mcpServers": {
    "gta6-companion": {
      "command": "node",
      "args": ["/path/to/gta6-companion/src/mcp/server.ts", "--read-only"],
      "env": { "GTA6_PROGRESS": "/home/you/gta6.json" }
    }
  }
}
```

## Cursor

`.cursor/mcp.json` for one project, or `~/.cursor/mcp.json` for every project.
The same shape as above:

```json
{
  "mcpServers": {
    "gta6-companion": {
      "command": "node",
      "args": ["/path/to/gta6-companion/src/mcp/server.ts"],
      "env": { "GTA6_PROGRESS": "/home/you/gta6.json" }
    }
  }
}
```

## Codex

`~/.codex/config.toml`, where servers live under `mcp_servers`:

```toml
[mcp_servers.gta6-companion]
command = "node"
args = ["/path/to/gta6-companion/src/mcp/server.ts"]
env = { GTA6_PROGRESS = "/home/you/gta6.json" }
```

Add `"--read-only"` to `args` for the read-only form.

## The tools

| Tool | Arguments | What it returns |
| --- | --- | --- |
| `gta6_whats_left` | `spoilers?` | the next story mission and every unmet requirement |
| `gta6_status` | none | story and per-chapter progress, plus requirements met |
| `gta6_mission` | `query`, `spoilers?` | up to five matching missions with position and state |
| `gta6_requirements` | `onlyUnmet?` | requirements with `have`, `needed` and what is left |
| `gta6_mark_done` | `mission` | marks a mission done, with the new chapter and story counts |
| `gta6_undo` | `mission` | takes a mission back off the done list |
| `gta6_set_count` | `requirement`, `count` | records a requirement count and what is left of it |

The last three write the progress file and are the ones left out in read-only
mode. A mission is named by id (`ch2-moses`) or by its exact title,
case-insensitive (`moses`); a requirement by its id from
`data/requirements.json`. An unknown or ambiguous name comes back as a result
with `isError: true` listing the candidates or the closest ids.

Mission titles are spoilers, so `gta6_mission` reports only the position of a
mission you have not reached (`Chapter 3, mission 26, story mission 59 of 91,
not done, title withheld`) unless `spoilers: true` is passed, and
`gta6_whats_left` names the missions after the next one only with the same flag.

## Example questions

"What do I have left for 100% in GTA 6?" - `gta6_whats_left`, the next story
mission and every requirement still short:

```text
Story: 29 of 91 done, 31%.
Next: Breakfast Run (ch2-breakfast-run), Chapter 2, mission 8.
Unmet requirements (23 of 23):
- unique-playlists: Unique playlists, 0 of 2 playlists, 2 left
- ... one line per requirement, smallest remainder first
```

"Which GTA 6 mission comes after Slam Dunk?" - `gta6_mission` places Slam Dunk
at Chapter 2, mission 7, story mission 29 of 91; with Slam Dunk marked done,
`gta6_whats_left` names the mission that follows, and `spoilers: true` lets it
name the five after that as well.

"How far am I in GTA 6?" - `gta6_status`, the story percentage and a line per
chapter.

"Which GTA 6 collectibles am I still missing?" - `gta6_requirements` with
`onlyUnmet: true`.

"I just finished Moses, tick it off." - `gta6_mark_done`, which answers with the
new counts, `Chapter 2: 5 of 11, story 27 of 91`, and the mission after it.

"I am up to 12 card sets." - `gta6_set_count` with `requirement: card-sets` and
`count: 12`.
