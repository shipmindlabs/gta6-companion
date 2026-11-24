# GTA 6 Companion - open data, 100% completion tracker and MCP server for Grand Theft Auto VI

## What is this

Open data and a small TypeScript toolkit for tracking 100% completion in Grand
Theft Auto VI: chapters, story missions, completion requirements and cheats.
The data is meant to be readable by both people and machines, so the same
entries can later be served to AI assistants through an MCP server and an Agent
Skill.

## Status

The complete story mission list and a first pass at the 100% requirements are in
the repository:

- `data/chapters.json` - the five story chapters with their mandatory mission
  counts, 91 story missions in total.
- `data/missions/chapter-1.json` - the 22 mandatory missions of Chapter 1 in
  story order.
- `data/missions/chapter-2.json` - the 11 mandatory missions of Chapter 2 in
  story order.
- `data/missions/chapter-3.json` - the 26 mandatory missions of Chapter 3 in
  story order.
- `data/missions/chapter-4.json` - the 25 mandatory missions of Chapter 4 in
  story order.
- `data/missions/chapter-5.json` - the 7 mandatory missions of Chapter 5 in
  story order, ending the story.
- `data/missions/optional.json` - optional missions that sit outside the
  mandatory counts, currently the two jobs from Billy's questline.
- `data/requirements.json` - the 100% completion requirements cross-checked so
  far, with a `complete: false` flag while entries are missing.
- `src/schema.ts` - plain types for `Source`, `Chapter`, `Mission`,
  `Requirement` and `RequirementSet`.
- `src/validate.ts` - `validateDataset(kind, entries)`, which returns a list of
  problems instead of throwing, plus `Gta6DataError` for a bad dataset kind.
- `src/data.ts` - `loadChapters()`, `loadMissions(chapterNumber?, options?)`,
  `loadRequirements()` and `loadRequirementSet()`, which read the JSON files
  from `data/`.
- `src/progress.ts` - the progress document and pure functions over it:
  `emptyProgress()`, `markMission()`, `unmarkMission()`, `setCount()`,
  `summarize()` and `whatsLeft()`.
- `src/index.ts` - public entry point.
- `test/validate.test.ts`, `test/data.test.ts` and `test/progress.test.ts` -
  tests, run with `npm test` on Node >= 22.18.

The cheat list, the MCP server and the Agent Skill are not in the repository
yet.

## Usage

```ts
import {
  loadChapters,
  loadMissions,
  loadRequirements,
  validateDataset,
} from "gta6-companion";

const chapters = loadChapters();
const wholeStory = loadMissions();
const finale = loadMissions(5);
const chapterTwoWithSideJobs = loadMissions(2, { includeOptional: true });
const problems = validateDataset(
  "mission",
  wholeStory,
  chapters.map((chapter) => chapter.id),
);

const requirements = loadRequirements();
const allOrNothing = requirements.filter((entry) => entry.strict);
```

`loadMissions()` without an argument returns all 91 mandatory story missions in
chapter and story order. Optional missions are left out unless
`{ includeOptional: true }` is passed, so the mandatory counts in
`data/chapters.json` always match what you get back.

A requirement holds `needed` and `total` counts. `strict` is true when `needed`
equals `total`, so the requirement is all or nothing; `total` is `null` when no
total is reported for it. `loadRequirementSet()` returns the same entries plus
the `complete` flag and the note about what is still missing.

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

The source below also states that GTA 6 has no mission replay at launch, so a
finished story mission cannot be played again from the pause menu; a checklist
is the only way to keep track of what you have already done.

### Chapter 1 - Just Like Paradise

Mission titles are spoilers. Skip the tables if you would rather meet the story
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

### Chapter 4 - Vice City, Baby

| # | Mission | Id |
| --- | --- | --- |
| 1 | Ocean Beach | `ch4-ocean-beach` |
| 2 | Another Life | `ch4-another-life` |
| 3 | Company Cars | `ch4-company-cars` |
| 4 | Lawyer Up | `ch4-lawyer-up` |
| 5 | Party Hard | `ch4-party-hard` |
| 6 | Heavy Lifting | `ch4-heavy-lifting` |
| 7 | Photo/Shoot | `ch4-photo-shoot` |
| 8 | Making Gainz | `ch4-making-gainz` |
| 9 | Watch It | `ch4-watch-it` |
| 10 | Cash Injections | `ch4-cash-injections` |
| 11 | Amateur Hour | `ch4-amateur-hour` |
| 12 | Dirty Work | `ch4-dirty-work` |
| 13 | Too Much Baggage | `ch4-too-much-baggage` |
| 14 | Adventures in Babysitting | `ch4-adventures-in-babysitting` |
| 15 | Fresh Evidence | `ch4-fresh-evidence` |
| 16 | Power Play | `ch4-power-play` |
| 17 | Child's Play | `ch4-childs-play` |
| 18 | Headliners | `ch4-headliners` |
| 19 | Close Surveillance | `ch4-close-surveillance` |
| 20 | Delivery Method | `ch4-delivery-method` |
| 21 | Team Building | `ch4-team-building` |
| 22 | Fully Catered | `ch4-fully-catered` |
| 23 | VCIA Takedown | `ch4-vcia-takedown` |
| 24 | Sunset | `ch4-sunset` |
| 25 | Starting From Zero | `ch4-starting-from-zero` |

### Chapter 5 - Top of the World, Ma

| # | Mission | Id |
| --- | --- | --- |
| 1 | Bird in the Hand | `ch5-bird-in-the-hand` |
| 2 | Taking Liberties | `ch5-taking-liberties` |
| 3 | VC Baby | `ch5-vc-baby` |
| 4 | Doggie Bag | `ch5-doggie-bag` |
| 5 | Operation Savage Glory | `ch5-operation-savage-glory` |
| 6 | Protective Custody | `ch5-protective-custody` |
| 7 | The End of the Road | `ch5-the-end-of-the-road` |

Source for the chapter and mission lists and for the mission replay note,
checked on 2026-11-22:
<https://www.g2a.com/news/gta-6-news/gta-6-mission-and-chapter-list/>

## GTA 6 100% completion requirements

This table is generated from `data/requirements.json`. "All or nothing" marks
the requirements where `needed` equals `total`, so nothing can be skipped. A
total of "unknown" means the guides report what you need without reporting how
much exists in the game.

| Requirement | Category | Needed | Total | Unit | All or nothing |
| --- | --- | --- | --- | --- | --- |
| Card sets | collectibles | 15 | 18 | sets | no |
| Kenton treasure sets | collectibles | 5 | 7 | sets | no |
| Underwater discoveries | collectibles | 33 | 33 | discoveries | yes |
| WAiNK location scans | collectibles | 100 | unknown | scans | no |
| Magazines, books and comics | collectibles | 30 | 34 | items | no |
| Meditation spots | collectibles | 15 | 18 | spots | no |
| Cocaine flamingos | collectibles | 100 | 125 | flamingos | no |
| Discovered styles | collections | 70 | 79 | styles | no |
| Unique playlists | collections | 2 | 2 | playlists | yes |
| Base-model vehicles scanned | collections | 200 | 277 | vehicles | no |
| Standard-issue weapons discovered | collections | 50 | 66 | weapons | no |
| Animals studied | collections | 100 | 255 | animals | no |
| Gang operations | crime | 39 | 39 | operations | yes |
| Bank jobs | crime | 22 | 22 | jobs | yes |
| Payday loan jobs | crime | 7 | 7 | jobs | yes |
| Vaults | crime | 8 | 8 | vaults | yes |
| Shooting range gold medals | activities | 42 | 42 | medals | yes |
| Drone time trials | activities | 42 | 42 | trials | yes |
| Bret's target decks | activities | 15 | 15 | decks | yes |
| Fenced narcotics | fencing | 100000 | unknown | usd | no |
| Fenced jewellery | fencing | 100000 | unknown | usd | no |
| Fenced marked bills | fencing | 250000 | unknown | usd | no |
| Fenced vehicles | fencing | 200000 | unknown | usd | no |

The list is incomplete on purpose: launch guides count 35 requirements for 100%
completion, and `data/requirements.json` holds the 23 entries cross-checked
against both sources so far, which is why the file carries `complete: false`.
The remaining entries are left out until they can be checked, never guessed.

Sources for the requirements, both checked on 2026-11-22:
<https://www.pushsquare.com/guides/gta-6-100percent-completion-checklist> and
<https://gtaside.com/tips/gta6/100-percent-completion/>

## GTA 6 progress tracker

`src/progress.ts` holds the progress document and pure functions over it. It
reads and writes nothing, so you keep the document wherever you like and pass
it back in; the repository ignores `progress.local.json` if you want to keep one
next to the code.

```json
{
  "version": 1,
  "updatedAt": "2026-11-24T18:20:00.000Z",
  "missions": {
    "ch1-prologue": "2026-11-23T20:10:00.000Z",
    "ch1-gone-fishing": "2026-11-24T18:20:00.000Z"
  },
  "counts": {
    "card-sets": 9,
    "vaults": 8
  }
}
```

- `version` is `1`.
- `updatedAt` and the mission values are ISO timestamps. A mission key means the
  mission is done; marking it again keeps the first timestamp.
- `missions` keys are mission ids from `data/missions/`. Optional missions can be
  marked, but only mandatory missions count toward the story total.
- `counts` maps requirement ids from `data/requirements.json` to how many you
  have. A requirement that is not in `counts` counts as 0.

```ts
import {
  emptyProgress,
  loadChapters,
  loadMissions,
  loadRequirements,
  markMission,
  setCount,
  summarize,
  whatsLeft,
} from "gta6-companion";

const data = {
  chapters: loadChapters(),
  missions: loadMissions(),
  requirements: loadRequirements(),
};

let progress = emptyProgress();
progress = markMission(progress, "ch1-prologue");
progress = setCount(progress, "vaults", 8, data);

const summary = summarize(progress, data);
summary.story; // { done: 1, total: 91, percent: 1 }
const left = whatsLeft(progress, data);
left.nextMission?.id; // "ch1-gone-fishing"
```

`markMission()`, `unmarkMission()` and `setCount()` return a new document and
take the timestamp to record as their last argument, which defaults to now.
`setCount()` also takes the dataset so it can refuse an unknown requirement id
(`Gta6DataError` with code `unknown_id`) as well as a negative or fractional
count (code `invalid_count`).

`summarize()` returns story `{done, total, percent}`, a `{done, total}` entry per
chapter, a `{have, needed, remaining, met}` entry per requirement and
`overall {metRequirements, totalRequirements}`. A count above `needed` is met
with `remaining` 0. Percentages are integers, floored, and never reach 100 while
a mission is missing: 90 of 91 missions is 98 percent.

`whatsLeft()` returns the next unfinished mission in story order, or `null` once
the story is done, plus every unmet requirement with the smallest `remaining`
first.

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
