import type { Chapter, Cheat, Mission, Requirement } from "./schema.ts";

export type SearchKind = "mission" | "requirement" | "cheat";

export type SearchData = {
  chapters: readonly Chapter[];
  missions: readonly Mission[];
  requirements: readonly Requirement[];
  cheats: readonly Cheat[];
};

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  chapter?: number;
  score: number;
};

export type SearchOptions = {
  limit?: number;
  kinds?: readonly SearchKind[];
  // story order index; missions past it are left out
  spoilerLimit?: number;
};

type Candidate = {
  kind: SearchKind;
  id: string;
  title: string;
  chapter?: number;
  folded: string;
  foldedId: string;
  words: string[];
};

const EXACT_TITLE = 100;
const TITLE_PREFIX = 80;
const ALL_WORDS = 60;
const ONE_EDIT = 40;
const DEFAULT_LIMIT = 10;
const ALL_KINDS: readonly SearchKind[] = ["mission", "requirement", "cheat"];

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function wordsOf(folded: string): string[] {
  return folded === "" ? [] : folded.split(" ");
}

export function editDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  let twoBack: number[] = [];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];

    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      let best = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );

      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        best = Math.min(best, twoBack[column - 2] + 1);
      }

      current[column] = best;
    }

    twoBack = previous;
    previous = current;
  }

  return previous[right.length];
}

export function storyIndexes(data: SearchData): Map<string, number> {
  const rank = new Map(data.chapters.map((chapter) => [chapter.id, chapter.number]));

  const ordered = data.missions.slice().sort((left, right) => {
    const leftChapter = rank.get(left.chapterId) ?? Number.MAX_SAFE_INTEGER;
    const rightChapter = rank.get(right.chapterId) ?? Number.MAX_SAFE_INTEGER;
    return leftChapter - rightChapter || left.order - right.order;
  });

  const indexes = new Map<string, number>();
  let story = 0;

  for (const mission of ordered) {
    if (!mission.optional) {
      story += 1;
    }
    indexes.set(mission.id, Math.max(1, story));
  }

  return indexes;
}

function candidateOf(
  kind: SearchKind,
  id: string,
  title: string,
  chapter?: number,
): Candidate {
  const folded = fold(title);

  return {
    kind,
    id,
    title,
    ...(chapter === undefined ? {} : { chapter }),
    folded,
    foldedId: fold(id),
    words: wordsOf(folded),
  };
}

function missionCandidates(
  data: SearchData,
  spoilerLimit: number | undefined,
): Candidate[] {
  const numbers = new Map(data.chapters.map((chapter) => [chapter.id, chapter.number]));
  const indexes = storyIndexes(data);

  return data.missions
    .filter(
      (mission) =>
        spoilerLimit === undefined || (indexes.get(mission.id) ?? 1) <= spoilerLimit,
    )
    .map((mission) =>
      candidateOf("mission", mission.id, mission.title, numbers.get(mission.chapterId)),
    );
}

function candidatesOf(
  data: SearchData,
  kinds: readonly SearchKind[],
  spoilerLimit: number | undefined,
): Candidate[] {
  const candidates: Candidate[] = [];

  if (kinds.includes("mission")) {
    candidates.push(...missionCandidates(data, spoilerLimit));
  }
  if (kinds.includes("requirement")) {
    candidates.push(
      ...data.requirements.map((entry) =>
        candidateOf("requirement", entry.id, entry.title),
      ),
    );
  }
  if (kinds.includes("cheat")) {
    candidates.push(
      ...data.cheats.map((entry) => candidateOf("cheat", entry.id, entry.name)),
    );
  }

  return candidates;
}

function scoreOf(
  query: string,
  queryWords: readonly string[],
  candidate: Candidate,
): number | null {
  if (candidate.folded === query || candidate.foldedId === query) {
    return EXACT_TITLE;
  }

  if (candidate.folded.startsWith(query) || candidate.foldedId.startsWith(query)) {
    return TITLE_PREFIX;
  }

  const present = queryWords.every((word) =>
    candidate.words.some((titleWord) => titleWord.startsWith(word)),
  );
  if (present) {
    return ALL_WORDS;
  }

  let edits = 0;
  for (const word of queryWords) {
    const best = Math.min(
      ...candidate.words.map((titleWord) => editDistance(word, titleWord)),
    );
    if (!(best <= 1)) {
      return null;
    }
    edits += best;
  }

  return ONE_EDIT - edits;
}

export function search(
  query: string,
  data: SearchData,
  options: SearchOptions = {},
): SearchHit[] {
  const folded = fold(query);
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (folded === "" || limit <= 0) {
    return [];
  }

  const queryWords = wordsOf(folded);
  const hits: SearchHit[] = [];

  for (const candidate of candidatesOf(
    data,
    options.kinds ?? ALL_KINDS,
    options.spoilerLimit,
  )) {
    const score = scoreOf(folded, queryWords, candidate);
    if (score === null) {
      continue;
    }

    hits.push({
      kind: candidate.kind,
      id: candidate.id,
      title: candidate.title,
      ...(candidate.chapter === undefined ? {} : { chapter: candidate.chapter }),
      score,
    });
  }

  return hits
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.title.length - right.title.length ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit);
}
