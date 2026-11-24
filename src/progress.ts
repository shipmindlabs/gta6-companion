import type { Chapter, Mission, Requirement } from "./schema.ts";
import { Gta6DataError } from "./validate.ts";

export type Progress = {
  version: 1;
  updatedAt: string;
  // mission id -> timestamp the mission was first marked done
  missions: Record<string, string>;
  // requirement id -> how many of the needed count you have
  counts: Record<string, number>;
};

export type ProgressData = {
  chapters: readonly Chapter[];
  missions: readonly Mission[];
  requirements: readonly Requirement[];
};

export type StoryProgress = {
  done: number;
  total: number;
  percent: number;
};

export type ChapterProgress = {
  id: string;
  number: number;
  title: string;
  done: number;
  total: number;
};

export type RequirementProgress = {
  id: string;
  title: string;
  category: string;
  unit: string;
  have: number;
  needed: number;
  remaining: number;
  met: boolean;
};

export type Summary = {
  story: StoryProgress;
  chapters: ChapterProgress[];
  requirements: RequirementProgress[];
  overall: {
    metRequirements: number;
    totalRequirements: number;
  };
};

export type WhatsLeft = {
  nextMission: Mission | null;
  requirements: RequirementProgress[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function storyOrder(data: ProgressData): Mission[] {
  const chapterRank = new Map(data.chapters.map((chapter) => [chapter.id, chapter.number]));

  return data.missions
    .filter((entry) => !entry.optional)
    .slice()
    .sort((left, right) => {
      const leftChapter = chapterRank.get(left.chapterId) ?? Number.MAX_SAFE_INTEGER;
      const rightChapter = chapterRank.get(right.chapterId) ?? Number.MAX_SAFE_INTEGER;
      return leftChapter - rightChapter || left.order - right.order;
    });
}

function percentOf(done: number, total: number): number {
  if (done >= total) {
    return 100;
  }
  return Math.min(99, Math.floor((done / total) * 100));
}

function requirementProgress(
  progress: Progress,
  requirement: Requirement,
): RequirementProgress {
  const have = progress.counts[requirement.id] ?? 0;
  const remaining = Math.max(0, requirement.needed - have);

  return {
    id: requirement.id,
    title: requirement.title,
    category: requirement.category,
    unit: requirement.unit,
    have,
    needed: requirement.needed,
    remaining,
    met: remaining === 0,
  };
}

export function emptyProgress(now: string = nowIso()): Progress {
  return { version: 1, updatedAt: now, missions: {}, counts: {} };
}

export function markMission(
  progress: Progress,
  missionId: string,
  now: string = nowIso(),
): Progress {
  if (progress.missions[missionId] !== undefined) {
    return progress;
  }

  return {
    ...progress,
    updatedAt: now,
    missions: { ...progress.missions, [missionId]: now },
  };
}

export function unmarkMission(
  progress: Progress,
  missionId: string,
  now: string = nowIso(),
): Progress {
  if (progress.missions[missionId] === undefined) {
    return progress;
  }

  const missions = { ...progress.missions };
  delete missions[missionId];

  return { ...progress, updatedAt: now, missions };
}

export function setCount(
  progress: Progress,
  requirementId: string,
  count: number,
  data: ProgressData,
  now: string = nowIso(),
): Progress {
  if (!data.requirements.some((entry) => entry.id === requirementId)) {
    throw new Gta6DataError(
      `unknown requirement id: "${requirementId}"`,
      "unknown_id",
    );
  }

  if (!Number.isInteger(count) || count < 0) {
    throw new Gta6DataError(
      `count for "${requirementId}" must be an integer >= 0, got ${String(count)}`,
      "invalid_count",
    );
  }

  return {
    ...progress,
    updatedAt: now,
    counts: { ...progress.counts, [requirementId]: count },
  };
}

export function summarize(progress: Progress, data: ProgressData): Summary {
  const missions = storyOrder(data);
  const done = missions.filter((entry) => progress.missions[entry.id] !== undefined).length;

  const chapters = data.chapters.map((chapter) => {
    const own = missions.filter((entry) => entry.chapterId === chapter.id);
    return {
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      done: own.filter((entry) => progress.missions[entry.id] !== undefined).length,
      total: own.length,
    };
  });

  const requirements = data.requirements.map((entry) => requirementProgress(progress, entry));

  return {
    story: { done, total: missions.length, percent: percentOf(done, missions.length) },
    chapters,
    requirements,
    overall: {
      metRequirements: requirements.filter((entry) => entry.met).length,
      totalRequirements: requirements.length,
    },
  };
}

export function whatsLeft(progress: Progress, data: ProgressData): WhatsLeft {
  const nextMission =
    storyOrder(data).find((entry) => progress.missions[entry.id] === undefined) ?? null;

  const requirements = data.requirements
    .map((entry) => requirementProgress(progress, entry))
    .filter((entry) => !entry.met)
    .sort((left, right) => left.remaining - right.remaining || left.id.localeCompare(right.id));

  return { nextMission, requirements };
}
