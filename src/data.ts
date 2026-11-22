import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Chapter, Mission } from "./schema.ts";
import { Gta6DataError } from "./validate.ts";

const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const MISSION_FILE = /^chapter-(\d+)\.json$/;

function readJson<T>(...segments: string[]): T {
  const raw = readFileSync(path.join(DATA_DIR, ...segments), "utf8");
  return JSON.parse(raw) as T;
}

function chapterNumberOf(fileName: string): number {
  return Number(MISSION_FILE.exec(fileName)?.[1]);
}

function missionFiles(): string[] {
  return readdirSync(path.join(DATA_DIR, "missions"))
    .filter((name) => MISSION_FILE.test(name))
    .sort((left, right) => chapterNumberOf(left) - chapterNumberOf(right));
}

export function loadChapters(): Chapter[] {
  return readJson<Chapter[]>("chapters.json");
}

export function loadMissions(chapterNumber?: number): Mission[] {
  const files = missionFiles();

  if (chapterNumber === undefined) {
    return files.flatMap((name) => readJson<Mission[]>("missions", name));
  }

  const wanted = `chapter-${chapterNumber}.json`;
  if (!files.includes(wanted)) {
    throw new Gta6DataError(
      `no mission data for chapter ${chapterNumber}`,
      "unknown_chapter",
    );
  }

  return readJson<Mission[]>("missions", wanted);
}
