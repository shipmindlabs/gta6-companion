import type { Chapter, Mission, Source } from "./schema.ts";

export type DatasetKind = "chapter" | "mission";

export type Problem = {
  code: string;
  index: number;
  entryId: string;
  field: string;
  message: string;
};

export class Gta6DataError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "Gta6DataError";
    this.code = code;
  }
}

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
  const parts = ISO_DATE.exec(value);
  if (parts === null) {
    return false;
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function problem(
  code: string,
  index: number,
  entryId: string,
  field: string,
  message: string,
): Problem {
  return { code, index, entryId, field, message };
}

function checkText(
  value: unknown,
  index: number,
  entryId: string,
  field: string,
  problems: Problem[],
): void {
  if (typeof value !== "string" || value.trim() === "") {
    problems.push(
      problem("empty_field", index, entryId, field, `${field} must be a non-empty string`),
    );
  }
}

function checkCount(
  value: unknown,
  index: number,
  entryId: string,
  field: string,
  minimum: number,
  problems: Problem[],
): void {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    problems.push(
      problem(
        "invalid_number",
        index,
        entryId,
        field,
        `${field} must be an integer >= ${minimum}`,
      ),
    );
  }
}

function checkSources(
  sources: readonly Source[] | undefined,
  index: number,
  entryId: string,
  problems: Problem[],
): void {
  if (sources === undefined || sources.length === 0) {
    problems.push(
      problem(
        "missing_source",
        index,
        entryId,
        "sources",
        "every entry needs at least one source",
      ),
    );
    return;
  }

  sources.forEach((source, position) => {
    const field = `sources[${position}]`;
    const url: unknown = source?.url;
    if (typeof url !== "string" || url.trim() === "") {
      problems.push(
        problem("empty_field", index, entryId, `${field}.url`, "source url must be a non-empty string"),
      );
    } else {
      let parsed: URL | null = null;
      try {
        parsed = new URL(url);
      } catch {
        parsed = null;
      }
      if (parsed === null) {
        problems.push(
          problem("invalid_source_url", index, entryId, `${field}.url`, `"${url}" is not a url`),
        );
      } else if (parsed.protocol !== "https:") {
        problems.push(
          problem(
            "insecure_source_url",
            index,
            entryId,
            `${field}.url`,
            `"${url}" must use https`,
          ),
        );
      }
    }

    const checkedOn: unknown = source?.checkedOn;
    if (typeof checkedOn !== "string" || checkedOn.trim() === "") {
      problems.push(
        problem(
          "empty_field",
          index,
          entryId,
          `${field}.checkedOn`,
          "checkedOn must be a non-empty string",
        ),
      );
    } else if (!isCalendarDate(checkedOn)) {
      problems.push(
        problem(
          "invalid_checked_on",
          index,
          entryId,
          `${field}.checkedOn`,
          `"${checkedOn}" is not a calendar date in YYYY-MM-DD form`,
        ),
      );
    }
  });
}

export function validateDataset(kind: "chapter", entries: readonly Chapter[]): Problem[];
export function validateDataset(
  kind: "mission",
  entries: readonly Mission[],
  chapterIds?: readonly string[],
): Problem[];
export function validateDataset(
  kind: DatasetKind,
  entries: readonly (Chapter | Mission)[],
  chapterIds: readonly string[] = [],
): Problem[] {
  if (kind !== "chapter" && kind !== "mission") {
    throw new Gta6DataError(`unknown dataset kind: ${String(kind)}`, "unknown_kind");
  }

  const problems: Problem[] = [];
  const seen = new Set<string>();

  entries.forEach((entry, index) => {
    const id: unknown = entry.id;
    const entryId = typeof id === "string" ? id : "";

    if (typeof id !== "string" || id.trim() === "") {
      problems.push(problem("empty_field", index, "", "id", "id must be a non-empty string"));
    } else if (!KEBAB_CASE.test(id)) {
      problems.push(problem("invalid_id", index, id, "id", `id "${id}" must be kebab-case`));
    } else if (seen.has(id)) {
      problems.push(
        problem("duplicate_id", index, id, "id", `id "${id}" is used more than once`),
      );
    } else {
      seen.add(id);
    }

    checkText(entry.title, index, entryId, "title", problems);
    checkSources(entry.sources, index, entryId, problems);

    if (kind === "chapter") {
      const chapter = entry as Chapter;
      checkCount(chapter.number, index, entryId, "number", 1, problems);
      checkCount(chapter.mandatoryMissions, index, entryId, "mandatoryMissions", 0, problems);
      return;
    }

    const mission = entry as Mission;
    checkCount(mission.order, index, entryId, "order", 1, problems);
    const missionChapterId: unknown = mission.chapterId;
    if (typeof missionChapterId !== "string" || missionChapterId.trim() === "") {
      problems.push(
        problem("empty_field", index, entryId, "chapterId", "chapterId must be a non-empty string"),
      );
    } else if (!chapterIds.includes(missionChapterId)) {
      problems.push(
        problem(
          "unknown_chapter",
          index,
          entryId,
          "chapterId",
          `chapterId "${missionChapterId}" does not match a known chapter`,
        ),
      );
    }
  });

  return problems;
}
