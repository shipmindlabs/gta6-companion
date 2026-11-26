# GTA 6 Companion - open data, 100% completion tracker and MCP server for Grand Theft Auto VI

## What is this

Open data and a small TypeScript toolkit for tracking 100% completion in Grand
Theft Auto VI: chapters, story missions, completion requirements and cheats.
The data is meant to be readable by both people and machines, so the same
entries can later be served to AI assistants through an MCP server and an Agent
Skill.

## Status

The complete story mission list, a first pass at the 100% requirements and the
cheat facts are in the repository:

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
- `data/cheats.json` - how cheats unlock, how many there are, and the four
  cheats reported to unlock when the story ends.
- `src/schema.ts` - plain types for `Source`, `Chapter`, `Mission`,
  `Requirement`, `RequirementSet`, `Cheat` and `CheatSet`.
- `src/validate.ts` - `validateDataset(kind, entries)`, which returns a list of
  problems instead of throwing, plus `Gta6DataError` for a bad dataset kind.
- `src/data.ts` - `loadChapters()`, `loadMissions(chapterNumber?, options?)`,
  `loadRequirements()`, `loadRequirementSet()`, `loadCheats()` and
  `loadCheatSet()`, which read the JSON files from `data/`.
- `src/progress.ts` - the progress document and pure functions over it:
  `emptyProgress()`, `markMission()`, `unmarkMission()`, `setCount()`,
  `summarize()` and `whatsLeft()`.
- `src/search.ts` - `search(query, data, options?)` over missions, requirements
  and cheats, with one typo per word tolerated and spoilers left out on
  request.
- `src/cli.ts` - the `gta6` command: `left`, `status`, `done`, `undo`, `set`,
  `missions` and `search`.
- `src/index.ts` - public entry point.
- `test/validate.test.ts`, `test/data.test.ts`, `test/progress.test.ts`,
  `test/cheats.test.ts`, `test/search.test.ts` and `test/cli.test.ts` - tests,
  run with `npm test` on Node >= 22.18.

The MCP server and the Agent Skill are not in the repository yet.

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

## Command line

`src/cli.ts` is the `gta6` command. Node runs it with type stripping, so there
is no build step: `npx gta6 left`, or `npm link` once and then `gta6 left`.

| Command | What it does |
| --- | --- |
| `gta6 left` | the next story mission and every unmet requirement |
| `gta6 status` | story and per-chapter progress, plus requirements met |
| `gta6 done <mission>` | marks a mission done, by id or exact title |
| `gta6 undo <mission>` | unmarks a mission |
| `gta6 set <requirement-id> <n>` | records how many of a requirement you have |
| `gta6 missions [chapter]` | lists missions, all of them or one chapter |
| `gta6 search <words>` | finds a mission, requirement or cheat by name |

```sh
gta6 done ch1-prologue
gta6 done "Gone Fishing"
gta6 set card-sets 9
gta6 missions 2 --spoilers
gta6 search cartel heist --spoilers
gta6 status --file ~/gta6.json
```

The progress file is the `--file <path>` argument if given, else
`$GTA6_PROGRESS`, else `./gta6-progress.json`. It is created on the first write
and written atomically, to a temporary file that is renamed over the old one, so
a failed write leaves the previous file untouched.

A mission can be named by id (`ch1-gone-fishing`) or by its exact title,
case-insensitive (`gone fishing`). An unknown or ambiguous name exits with code
2 and lists the closest ids. Exit code 0 means the command ran, 1 means the
progress file could not be read or written, 2 means the command line was wrong.

Mission titles are spoilers, so the titles of missions past the next unfinished
one are printed as `Chapter 3, mission 7` unless `--spoilers` is passed.

`run(argv, io)` in `src/cli.ts` returns `{code, out}` and takes every side
effect through its `io` argument, so `test/cli.test.ts` drives the commands
against an in-memory file map without spawning a process.

## Search

`src/search.ts` holds `search(query, data, options?)`, which finds a mission, a
requirement or a cheat by name. Matching is case-insensitive and ignores
punctuation and diacritics, so `Photo/Shoot`, `photo shoot` and `hèy arnöld`
all find their mission. One typo per word is tolerated, two swapped letters
included, because `editDistance()` is a Damerau-Levenshtein distance written in
the file itself; the package still has no dependencies.

```ts
import {
  loadChapters,
  loadCheats,
  loadMissions,
  loadRequirements,
  search,
} from "gta6-companion";

const data = {
  chapters: loadChapters(),
  missions: loadMissions(undefined, { includeOptional: true }),
  requirements: loadRequirements(),
  cheats: loadCheats(),
};

search("cartel heist", data); // the Chapter 3 finale, as a mission hit
search("gon fishing", data); // Gone Fishing, one edit away
search("flamingo", data, { kinds: ["requirement"] }); // cocaine-flamingos
search("cartel heist", data, { spoilerLimit: 58 }); // [], too far ahead
```

A hit is `{kind, id, title, chapter?, score}`, where `kind` is `"mission"`,
`"requirement"` or `"cheat"` and `chapter` is the chapter number, present for
missions only. Hits come back sorted by score, highest first:

| Score | Match |
| --- | --- |
| 100 | the query is the whole title, or the whole id |
| 80 | the title or the id starts with the query |
| 60 | every query word starts a word of the title |
| 40 or 39 | every query word is within one edit of a word of the title |

Equal scores are broken by the shorter title, then by id. `limit` caps how many
hits come back and defaults to 10, `kinds` narrows the search to some of the
three kinds, and `spoilerLimit` takes a story mission index and drops the
missions past it. An empty, blank or punctuation-only query returns `[]`.

`gta6 search <words>` passes the index of the next unfinished mission as the
`spoilerLimit`, so a search cannot name a title you have not reached yet;
`--spoilers` searches the whole story.

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

## GTA 6 cheat codes

GTA 6 has 61 cheats, and none of them can be used from the start. A Cheats entry
appears in the Progress tab of the pause menu after the final story mission, so
cheats become available only once the story is finished. Input sequences are
entered on the D-pad and are the same on PlayStation 5 and Xbox Series X|S.
There are no PC inputs, because no PC version is announced.

Four cheats are reported to unlock when the story ends:

| Cheat | Id | Unlock | Input |
| --- | --- | --- | --- |
| $250,000 | `cash-250000` | story-complete | unverified |
| Unlimited Focus | `unlimited-focus` | story-complete | unverified |
| Attack Force | `attack-force` | story-complete | unverified |
| Cycle Weather | `cycle-weather` | story-complete | unverified |

Launch guides disagree on several button sequences, so this dataset publishes a
sequence only when two independent sources report the same one. Until then
`input` is `null`, `inputStatus` is `"unverified"`, and no sequence is printed
here either. `validateDataset("cheat", entries)` enforces the rule: an
`inputStatus` of `"confirmed"` needs a non-null `input` and at least two sources
on different hostnames, otherwise the entry comes back as a problem
(`confirmed_without_input` or `confirmed_without_two_sources`).

`data/cheats.json` keeps the counts and the unlock note next to the entries, so
`loadCheatSet()` returns `total`, `usableFromStart`, `unlock`, `inputDevice`,
`platforms` and `pcInputs` along with the four cheats, while `loadCheats()`
returns the entries alone. The file holds the four cheats that unlock with the
story, not all 61.

```ts
import { loadCheatSet, loadCheats, validateDataset } from "gta6-companion";

const set = loadCheatSet();
set.total; // 61
set.usableFromStart; // false

const cheats = loadCheats();
const published = cheats.filter((entry) => entry.inputStatus === "confirmed");
const problems = validateDataset("cheat", cheats);
```

Sources for the cheats, both checked on 2026-11-22:
<https://www.redbull.com/us-en/gta-6-cheat-codes> and
<https://www.pcguide.com/news/gta-6-cheat-codes-list-for-playstation-5-xbox-series-xs-and-how-to-unlock-them/>

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
- A cheat input sequence is published only when two independent sources agree.

## Disclaimer

This is an unofficial fan project. It is not affiliated with or endorsed by
Rockstar Games or Take-Two Interactive. Grand Theft Auto and GTA are their
trademarks. No game assets are included in this repository.

---

Maintained by [Shipmind Labs](https://shipmindlabs.com).
