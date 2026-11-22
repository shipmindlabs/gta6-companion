# GTA 6 Companion - open data, 100% completion tracker and MCP server for Grand Theft Auto VI

## What is this

Open data and a small TypeScript toolkit for tracking 100% completion in Grand
Theft Auto VI: chapters, story missions, completion requirements and cheats.
The data is meant to be readable by both people and machines, so the same
entries can later be served to AI assistants through an MCP server and an Agent
Skill.

## Status

Early bootstrap. What the repository contains today:

- `src/schema.ts` - plain types for `Source`, `Chapter` and `Mission`.
- `src/validate.ts` - `validateDataset(kind, entries)`, which returns a list of
  problems instead of throwing, plus `Gta6DataError` for a bad dataset kind.
- `src/index.ts` - public entry point.
- `test/validate.test.ts` - tests, run with `npm test` on Node >= 22.18.

The mission data files, the MCP server and the Agent Skill are not in the
repository yet.

## Data policy

- Facts only: ids, titles, ordering, counts and requirements.
- Every entry cites a public source and the date it was checked (`checkedOn`).
- No walkthrough text is copied from other sites.
- Spoilers are marked, so a reader can opt out of story details.

## Disclaimer

This is an unofficial fan project. It is not affiliated with or endorsed by
Rockstar Games or Take-Two Interactive. Grand Theft Auto and GTA are their
trademarks. No game assets are included in this repository.

---

Maintained by [Shipmind Labs](https://shipmindlabs.com).
