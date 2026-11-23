# GTA 6 Companion - open data, 100% completion tracker and MCP server for Grand Theft Auto VI

## What is this

Open data and a small TypeScript toolkit for tracking 100% completion in Grand
Theft Auto VI: chapters, story missions, completion requirements and cheats.
The data is meant to be readable by both people and machines, so the same
entries can later be served to AI assistants through an MCP server and an Agent
Skill.

## Status

The first data files are in the repository:

- `data/chapters.json` - the five story chapters with their mandatory mission
  counts, 91 story missions in total.
- `data/missions/chapter-1.json` - the 22 mandatory missions of Chapter 1 in
  story order.
- `data/missions/chapter-2.json` - the 11 mandatory missions of Chapter 2 in
  story order.
- `data/missions/chapter-3.json` - the 26 mandatory missions of Chapter 3 in
  story order.
- `data/missions/optional.json` - optional missions that sit outside the
  mandatory counts, currently the two jobs from Billy's questline.
- `src/schema.ts` - plain types for `Source`, `Chapter` and `Mission`.
- `src/validate.ts` - `validateDataset(kind, entries)`, which returns a list of
  problems instead of throwing, plus `Gta6DataError` for a bad dataset kind.
- `src/data.ts` - `loadChapters()` and `loadMissions(chapterNumber?, options?)`,
  which read the JSON files from `data/`.
- `src/index.ts` - public entry point.
- `test/validate.test.ts` and `test/data.test.ts` - tests, run with `npm test`
  on Node >= 22.18.

Missions for chapters 4 and 5, the 100% requirements, the cheat list, the MCP
server and the Agent Skill are not in the repository yet.

## Usage

```ts
import { loadChapters, loadMissions, validateDataset } from "gta6-companion";

const chapters = loadChapters();
const chapterThree = loadMissions(3);
const chapterTwoWithSideJobs = loadMissions(2, { includeOptional: true });
const problems = validateDataset(
  "mission",
  chapterThree,
  chapters.map((chapter) => chapter.id),
);
```

`loadMissions()` without an argument returns every mission file currently in
the repository, in chapter order. Optional missions are left out unless
`{ includeOptional: true }` is passed, so the mandatory counts in
`data/chapters.json` always match what you get back.

## GTA 6 mission list

| Chapter | Title | Mandatory missions |
| --- | --- | --- |
| 1 | Just Like Paradise | 22 |
| 2 | Paradise Lost | 11 |
| 3 | Tits Ass Drug Money | 26 |
| 4 | Vice City, Baby | 25 |
| 5 | Top of the World, Ma | 7 |
| | Total | 91 |

The total of 91 counts mandatory story missions only; some guides also count
Billy's two optional jobs, Thrillbillies and Twist Wrist, Smash, Grab, which is
where the total of 93 comes from.

### Chapter 1 - Just Like Paradise

Mission titles are spoilers. Skip the table if you would rather meet the story
in game.

| # | Mission | Id |
| --- | --- | --- |
| 1 | Prologue | `ch1-prologue` |
| 2 | Gone Fishing | `ch1-gone-fishing` |
| 3 | Gear Up | `ch1-gear-up` |
| 4 | Just a Scratch | `ch1-just-a-scratch` |
| 5 | Lab Fees | `ch1-lab-fees` |
| 6 | Unwanted Attention | `ch1-unwanted-attention` |
| 7 | Pipework | `ch1-pipework` |
| 8 | Hey Arnold! | `ch1-hey-arnold` |
| 9 | Island Dreams | `ch1-island-dreams` |
| 10 | Feng Shui | `ch1-feng-shui` |
| 11 | Coming Home | `ch1-coming-home` |
| 12 | Buck Me | `ch1-buck-me` |
| 13 | Clean Up After Donnie | `ch1-clean-up-after-donnie` |
| 14 | Down to Earth | `ch1-down-to-earth` |
| 15 | Clear Skies | `ch1-clear-skies` |
| 16 | Day Release | `ch1-day-release` |
| 17 | Swamped | `ch1-swamped` |
| 18 | Don Gone | `ch1-don-gone` |
| 19 | Recalibration | `ch1-recalibration` |
| 20 | Tourist Trap | `ch1-tourist-trap` |
| 21 | Home Sweet Home | `ch1-home-sweet-home` |
| 22 | Discharge Time | `ch1-discharge-time` |

### Chapter 2 - Paradise Lost

| # | Mission | Id |
| --- | --- | --- |
| 1 | What's in the Bag? | `ch2-whats-in-the-bag` |
| 2 | Ambulance Chaser | `ch2-ambulance-chaser` |
| 3 | Just Moved In | `ch2-just-moved-in` |
| 4 | Girls' Trip | `ch2-girls-trip` |
| 5 | Moses | `ch2-moses` |
| 6 | Daily Driver | `ch2-daily-driver` |
| 7 | Slam Dunk | `ch2-slam-dunk` |
| 8 | Breakfast Run | `ch2-breakfast-run` |
| 9 | Coffee Break | `ch2-coffee-break` |
| 10 | Afternoon Delight | `ch2-afternoon-delight` |
| 11 | Checking Out | `ch2-checking-out` |

Optional jobs from Billy's questline, available around Chapter 2:

| Mission | Id |
| --- | --- |
| Thrillbillies | `ch2-thrillbillies` |
| Twist Wrist, Smash, Grab | `ch2-twist-wrist-smash-grab` |

### Chapter 3 - Tits Ass Drug Money

| # | Mission | Id |
| --- | --- | --- |
| 1 | Welcome to Vice City | `ch3-welcome-to-vice-city` |
| 2 | Dealer's Choice | `ch3-dealers-choice` |
| 3 | Meet the Heders | `ch3-meet-the-heders` |
| 4 | Dubious Provenance | `ch3-dubious-provenance` |
| 5 | Mami Knows Best | `ch3-mami-knows-best` |
| 6 | South Leonida Real Estate | `ch3-south-leonida-real-estate` |
| 7 | Tyrone | `ch3-tyrone` |
| 8 | Here, Kitty Kitty | `ch3-here-kitty-kitty` |
| 9 | Car Service | `ch3-car-service` |
| 10 | Top Billing | `ch3-top-billing` |
| 11 | Boobie Time | `ch3-boobie-time` |
| 12 | First Impressions | `ch3-first-impressions` |
| 13 | Caught Slipping | `ch3-caught-slipping` |
| 14 | Crosstown Traffic | `ch3-crosstown-traffic` |
| 15 | Credit Check | `ch3-credit-check` |
| 16 | Steal the Zorrusso for Randy | `ch3-steal-the-zorrusso-for-randy` |
| 17 | Sinfrontera National Bank | `ch3-sinfrontera-national-bank` |
| 18 | Security Expert | `ch3-security-expert` |
| 19 | Ride or Die | `ch3-ride-or-die` |
| 20 | Company Property | `ch3-company-property` |
| 21 | The Missing Link | `ch3-the-missing-link` |
| 22 | Safe Word | `ch3-safe-word` |
| 23 | Cooties | `ch3-cooties` |
| 24 | Bricked Up | `ch3-bricked-up` |
| 25 | Hidden Charges | `ch3-hidden-charges` |
| 26 | The Cartel Heist | `ch3-the-cartel-heist` |

Source for the chapter and mission lists, checked on 2026-11-22:
<https://www.g2a.com/news/gta-6-news/gta-6-mission-and-chapter-list/>

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
