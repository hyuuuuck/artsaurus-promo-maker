import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedPerformerAsset, PosterGenerationRun, PosterProject, PosterProposal, ReferenceImage } from "./types";

type LocalDb = {
  referenceImages: ReferenceImage[];
  performerAssets: GeneratedPerformerAsset[];
  proposals: PosterProposal[];
  projects: PosterProject[];
  runs: PosterGenerationRun[];
};

const DATA_DIR = path.join(process.cwd(), ".promo-maker-data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const USER_ID = "standalone-dev-user";

export function standaloneUserId() {
  return USER_ID;
}

export async function readDb(): Promise<LocalDb> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(DB_PATH, "utf8")) as LocalDb;
    return reviveDb(parsed);
  } catch {
    return emptyDb();
  }
}

export async function writeDb(db: LocalDb) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`);
}

export async function mutateDb<T>(mutator: (db: LocalDb) => T | Promise<T>) {
  const db = await readDb();
  const result = await mutator(db);
  await writeDb(db);
  return result;
}

export function insertByNewest<T extends { id: string; createdAt: Date; updatedAt?: Date }>(items: T[], item: T, limit = 100) {
  const next = [item, ...items.filter((existing) => existing.id !== item.id)];
  items.splice(0, items.length, ...next.slice(0, limit));
}

export function serializeProject(project: PosterProject) {
  return {
    ...project,
    editableDesign: project.editableDesign ?? safeParseJson(project.editableDesignJson, null),
  };
}

function emptyDb(): LocalDb {
  return {
    referenceImages: [],
    performerAssets: [],
    proposals: [],
    projects: [],
    runs: [],
  };
}

function reviveDb(db: LocalDb): LocalDb {
  return {
    referenceImages: (db.referenceImages ?? []).map(reviveReferenceImage),
    performerAssets: (db.performerAssets ?? []).map(revivePerformerAsset),
    proposals: (db.proposals ?? []).map(reviveProposal),
    projects: (db.projects ?? []).map(reviveProject),
    runs: (db.runs ?? []).map(reviveRun),
  };
}

function reviveDate(value: unknown) {
  const date = typeof value === "string" || value instanceof Date ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function reviveReferenceImage(item: ReferenceImage): ReferenceImage {
  return { ...item, createdAt: reviveDate(item.createdAt) };
}

function revivePerformerAsset(item: GeneratedPerformerAsset): GeneratedPerformerAsset {
  return { ...item, createdAt: reviveDate(item.createdAt), updatedAt: reviveDate(item.updatedAt) };
}

function reviveProposal(item: PosterProposal): PosterProposal {
  return { ...item, createdAt: reviveDate(item.createdAt), updatedAt: reviveDate(item.updatedAt) };
}

function reviveProject(item: PosterProject): PosterProject {
  return { ...item, createdAt: reviveDate(item.createdAt), updatedAt: reviveDate(item.updatedAt) };
}

function reviveRun(item: PosterGenerationRun): PosterGenerationRun {
  return {
    ...item,
    planJson: normalizeJsonString(item.planJson),
    stepsJson: normalizeJsonString(item.stepsJson),
    startedAt: reviveDate(item.startedAt),
    completedAt: item.completedAt ? reviveDate(item.completedAt) : null,
    createdAt: reviveDate(item.createdAt),
    updatedAt: reviveDate(item.updatedAt),
  };
}

function normalizeJsonString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() ? value : null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function safeParseJson<T>(value: unknown, fallback: T): unknown | T {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}
