---
name: gta6-completion-tracker
description: Use when the user asks about Grand Theft Auto VI (GTA 6) story missions, mission order, 100% completion requirements, cheats, or their own progress toward 100%. Answers from the open dataset in this repository and from the user's progress file.
---

# GTA 6 completion tracker

This repository holds open data for Grand Theft Auto VI - five chapters, 91
mandatory story missions, the 100% completion requirements cross-checked so
far, and the cheats - plus a command line that keeps the player's progress
file.

## Answer from the data, not from memory

The dataset is the only source to answer from: `data/chapters.json`,
`data/missions/chapter-*.json`, `data/missions/optional.json`,
`data/requirements.json` and `data/cheats.json`. Read those files, or run the
commands below, before stating a title, an order, a count or an unlock.

## Run the command line for anything about progress

The `gta6` command line is in this repository and needs Node 22.18 or newer,
with no build step: `npx gta6 left` from the repository root, or `npm link`
once and then `gta6 left`.

| Command | What it does |
| --- | --- |
| `gta6 left` | the next story mission and every unmet requirement |
| `gta6 status` | story and per-chapter progress, plus requirements met |
| `gta6 done <mission>` | marks a mission done, by id or exact title |
| `gta6 undo <mission>` | unmarks a mission |
| `gta6 set <requirement-id> <n>` | records how many of a requirement the player has |
| `gta6 missions [chapter]` | lists missions, all of them or one chapter |
| `gta6 search <words>` | finds a mission, requirement or cheat by name |

Examples: `gta6 done "Gone Fishing"`, `gta6 set card-sets 9`, `gta6 search flamingo`.

The progress file is `--file <path>` if given, else `$GTA6_PROGRESS`, else
`./gta6-progress.json`; ask which file the player keeps rather than writing to
a new one. Exit code 0 means the command ran, 1 that the progress file could
not be read or written, 2 that the command line was wrong - an unknown mission
name prints the closest ids, so offer those instead of trying again blindly.

## Never spoil the story

Mission titles are spoilers. Do not name a mission past the player's current
position unless they ask for spoilers. The commands withhold those titles by
default and print a position such as `Chapter 3, mission 7` instead;
`--spoilers` prints them, so pass it only when the player has asked for
spoilers.

## Cite the source and the date behind a count

Every entry in the dataset carries a `sources` array with a `url` and a
`checkedOn` date. When stating a count - 91 story missions, 61 cheats, 15 of 18
card sets - name that source and the date it was checked, so the player can see
how old the fact is.

## Say "not in the dataset yet" instead of guessing

`data/requirements.json` carries `complete: false`: launch guides count 35
requirements for 100% completion and the file holds only the entries
cross-checked against two sources so far. If a requirement, a mission, a
chapter or a cheat is not in the data, say it is not in the dataset yet. Never
fill the gap from memory, from a guide the dataset does not cite, or by
inference from the entries that are there.

## Never state an unverified cheat sequence

`data/cheats.json` publishes a button sequence only when two independent
sources report the same one. While an entry has `input: null` and
`inputStatus: "unverified"` there is no sequence to give, and none may be
invented or recalled. What can be said is the unlock: a Cheats entry appears in
the Progress tab of the pause menu after the final story mission, cheats are
entered on the D-pad on PlayStation 5 and Xbox Series X|S, there are no PC
inputs, and no cheat works from the start.
