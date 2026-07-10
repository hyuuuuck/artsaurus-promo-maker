import type { PosterGenerationRun } from "../server/types";
import { posterTemplateIds, type PosterTemplateId } from "./types";

type SerializablePosterGenerationRun = Pick<
  PosterGenerationRun,
  | "id"
  | "status"
  | "plannerProvider"
  | "plannerFallbackReason"
  | "orchestrationPrompt"
  | "proposalCount"
  | "planJson"
  | "errorMessage"
  | "proposalsCreated"
  | "startedAt"
  | "completedAt"
  | "createdAt"
>;

export type PosterGenerationRunSummary = {
  id: string;
  status: string;
  plannerProvider: string;
  fallbackReason?: string;
  orchestrationPrompt?: string;
  proposalCount: number;
  proposalsCreated: number;
  createdAt: string;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  planSummary?: string;
  templateIds: PosterTemplateId[];
  posePolicy?: string;
  backgroundMode?: string;
  layoutDensity?: string;
  warnings: string[];
};

export function serializePosterGenerationRun(run: SerializablePosterGenerationRun): PosterGenerationRunSummary {
  const plan = parseGenerationPlanSnapshot(run.planJson);
  return {
    id: run.id,
    status: run.status,
    plannerProvider: run.plannerProvider,
    fallbackReason: run.plannerFallbackReason ?? undefined,
    orchestrationPrompt: run.orchestrationPrompt ?? undefined,
    proposalCount: run.proposalCount,
    proposalsCreated: run.proposalsCreated,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString(),
    errorMessage: run.errorMessage ?? undefined,
    planSummary: plan.summary,
    templateIds: plan.templateIds,
    posePolicy: plan.posePolicy,
    backgroundMode: plan.backgroundMode,
    layoutDensity: plan.layoutDensity,
    warnings: plan.warnings,
  };
}

function parseGenerationPlanSnapshot(value: string | null) {
  if (!value) return emptyPlanSnapshot();

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return emptyPlanSnapshot();
    const layoutJob = isRecord(parsed.layoutJob) ? parsed.layoutJob : {};
    const performerAssetJob = isRecord(parsed.performerAssetJob) ? parsed.performerAssetJob : {};
    const backgroundJob = isRecord(parsed.backgroundJob) ? parsed.backgroundJob : {};

    return {
      summary: readShortText(parsed.summary),
      templateIds: readTemplateIds(layoutJob.templateIds),
      posePolicy: readShortText(performerAssetJob.posePolicy),
      backgroundMode: readShortText(backgroundJob.mode),
      layoutDensity: readShortText(layoutJob.density),
      warnings: readWarnings(parsed.warnings),
    };
  } catch {
    return emptyPlanSnapshot();
  }
}

function emptyPlanSnapshot() {
  return {
    summary: undefined,
    templateIds: [] as PosterTemplateId[],
    posePolicy: undefined,
    backgroundMode: undefined,
    layoutDensity: undefined,
    warnings: [] as string[],
  };
}

function readTemplateIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(posterTemplateIds);
  return value
    .filter((item): item is PosterTemplateId => typeof item === "string" && allowed.has(item))
    .slice(0, 8);
}

function readWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\s+/g, " ").slice(0, 180))
    .filter(Boolean)
    .slice(0, 4);
}

function readShortText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 220) || undefined : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
