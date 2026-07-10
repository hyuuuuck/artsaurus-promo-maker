import { randomUUID } from "node:crypto";
import { buildPerformerAsset, isPerformerAssetApprovedForPosterUse } from "../poster/assetPolicy";
import { serializePosterGenerationRun } from "../poster/generationRun";
import { planPosterGeneration } from "../poster/generationOrchestrator";
import { buildPosterProposals, selectPosterProposalTemplates, type PerformerVisual, type PosterTemplateMeta } from "../poster/posterProposalTemplates";
import { generateProposalPerformerVariants } from "../poster/proposalPerformerVariants";
import { analyzePosterProposalQuality, autoRepairPosterDesign } from "../poster/proposalQuality";
import { renderAndStorePosterPreview } from "../poster/renderPosterPreview";
import type { PosterConcertInfo, PosterTemplateId } from "../poster/types";
import { errorResponse, ok, parseError, parseRecord, readJson } from "./http";
import { insertByNewest, mutateDb, readDb, standaloneUserId } from "./localStore";
import type { GeneratedPerformerAsset, PosterGenerationRun, PosterProposal } from "./types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const performanceId = url.searchParams.get("performanceId")?.trim();
    const db = await readDb();
    const proposals = db.proposals
      .filter((proposal) => proposal.userId === standaloneUserId())
      .filter((proposal) => !performanceId || proposal.performanceId === performanceId)
      .slice(0, 32);
    return ok({ proposals });
  } catch (error) {
    return parseError(error);
  }
}

export async function GET_DETAIL(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await readDb();
    const proposal = db.proposals.find((item) => item.id === id && item.userId === standaloneUserId());
    if (!proposal) return errorResponse("POSTER_PROPOSAL_NOT_FOUND", "시안을 찾을 수 없습니다.", 404);
    return ok({
      proposal: {
        ...proposal,
        editableDesign: JSON.parse(proposal.editableDesignJson),
      },
    });
  } catch (error) {
    return parseError(error);
  }
}

export async function POST_GENERATE(request: Request) {
  let generationRunId: string | null = null;
  try {
    const payload = parseRecord(await readJson(request));
    const performerAssetId = readString(payload.performerAssetId);
    if (!performerAssetId) return errorResponse("PERFORMER_ASSET_REQUIRED", "포스터용 프로필 후보를 먼저 선택해 주세요.", 400);

    const proposalCount = readProposalCount(payload.proposalCount);
    const db = await readDb();
    const performerAsset = db.performerAssets.find((asset) => asset.id === performerAssetId && asset.userId === standaloneUserId());
    if (!performerAsset) return errorResponse("PERFORMER_ASSET_NOT_FOUND", "연주자 에셋을 찾을 수 없습니다.", 404);
    const normalizedAsset = buildPerformerAsset(performerAsset);
    if (!isPerformerAssetApprovedForPosterUse(normalizedAsset)) {
      return errorResponse("PERFORMER_ASSET_NOT_APPROVED", "승인되지 않은 연주자 에셋으로는 포스터 시안을 만들 수 없습니다.", 422);
    }

    const concertInfo = readConcertInfo(payload.concertInfo);
    const qrTargetUrl = resolveQrTargetUrl(request, concertInfo);
    const now = new Date();
    const generationRun: PosterGenerationRun = {
      id: `run_${randomUUID()}`,
      userId: standaloneUserId(),
      performanceId: readString(payload.performanceId) ?? null,
      performerAssetId: performerAsset.id,
      status: "planning",
      plannerProvider: "deterministic",
      plannerFallbackReason: null,
      orchestrationPrompt: readString(payload.orchestrationPrompt) ?? null,
      proposalCount,
      planJson: null,
      stepsJson: null,
      errorMessage: null,
      proposalsCreated: 0,
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    generationRunId = generationRun.id;
    await mutateDb((mutable) => {
      insertByNewest(mutable.runs, generationRun, 60);
    });

    const plannedGeneration = await planPosterGeneration({
      performerAsset,
      concertInfo,
      proposalCount,
      naturalLanguagePrompt: readString(payload.orchestrationPrompt),
    });
    const orchestrationPlan = plannedGeneration.plan;
    const assetMetadata = parseMetadata(performerAsset.providerMetadataJson);
    const templates = selectPosterProposalTemplates(
      proposalCount,
      assetMetadata.cutoutStatus === "fallback_source"
        ? photoSafeTemplatePreference(orchestrationPlan.layoutJob.templateIds)
        : orchestrationPlan.layoutJob.templateIds,
    );
    const performerVisuals: Partial<Record<PosterTemplateMeta["id"], PerformerVisual>> =
      assetMetadata.cutoutStatus === "fallback_source"
        ? {}
        : await generateProposalPerformerVariants({
            userId: standaloneUserId(),
            performerAsset,
            concertInfo,
            templates,
            orchestrationPlan,
          });
    fillMissingPerformerVisualsFromSavedCandidates({
      performerAsset,
      candidateAssetIds: readStringArray(payload.candidateAssetIds),
      allAssets: db.performerAssets,
      templates,
      performerVisuals,
    });

    const missingVisualTemplates = templates.filter((template) => !performerVisuals[template.id]);
    const visualFallbackTemplateIds = missingVisualTemplates.map((template) => template.id);
    if (missingVisualTemplates.length) {
      const fallbackVisual = fallbackPerformerVisual(performerAsset);
      for (const template of missingVisualTemplates) {
        performerVisuals[template.id] = fallbackVisual;
      }
    }

    await mutateDb((mutable) => {
      const run = mutable.runs.find((item) => item.id === generationRunId);
      if (run) {
        run.status = "running";
        run.plannerProvider = plannedGeneration.plannerProvider;
        run.plannerFallbackReason =
          plannedGeneration.fallbackReason ??
          (visualFallbackTemplateIds.length ? `performer_variant_fallback:${visualFallbackTemplateIds.join(",")}` : null);
        run.planJson = JSON.stringify(orchestrationPlan);
        run.stepsJson = JSON.stringify(orchestrationPlan.steps);
        run.updatedAt = new Date();
      }
    });

    const drafts = buildPosterProposals({
      performerAsset,
      performerVisuals,
      concertInfo,
      qrTargetUrl,
      count: proposalCount,
      templates,
      generationPlan: orchestrationPlan,
    });

    const proposals: PosterProposal[] = [];
    for (const draft of drafts) {
      const repaired = autoRepairPosterDesign(draft.design);
      const qualityReport = {
        ...analyzePosterProposalQuality(repaired.design),
        autoFixes: repaired.fixes,
      };
      const preview = await renderAndStorePosterPreview({
        userId: standaloneUserId(),
        design: repaired.design,
      });
      const createdAt = new Date();
      proposals.push({
        id: `proposal_${randomUUID()}`,
        userId: standaloneUserId(),
        performanceId: readString(payload.performanceId) ?? null,
        performerAssetId: performerAsset.id,
        templateId: draft.templateId,
        title: draft.title,
        previewUrl: preview.previewUrl,
        thumbnailUrl: preview.thumbnailUrl,
        editableDesignJson: JSON.stringify(repaired.design),
        qualityReportJson: JSON.stringify(qualityReport),
        createdAt,
        updatedAt: createdAt,
      });
    }

    let completedRun: PosterGenerationRun | null = null;
    await mutateDb((mutable) => {
      mutable.proposals = mutable.proposals.filter(
        (proposal) =>
          !(
            proposal.userId === standaloneUserId() &&
            proposal.performerAssetId === performerAsset.id &&
            proposal.performanceId === (readString(payload.performanceId) ?? null)
          ),
      );
      mutable.proposals.unshift(...proposals);
      mutable.proposals.splice(80);
      const run = mutable.runs.find((item) => item.id === generationRunId);
      if (run) {
        run.status = "succeeded";
        run.proposalsCreated = proposals.length;
        run.completedAt = new Date();
        run.updatedAt = new Date();
        completedRun = run;
      }
    });

    return ok({
      proposals,
      orchestrationPlan,
      orchestrationRun: completedRun ? serializePosterGenerationRun(completedRun) : undefined,
      visualFallbackTemplateIds,
    });
  } catch (error) {
    if (generationRunId) await markRunFailed(generationRunId, error instanceof Error ? error.message.slice(0, 500) : "Poster generation failed.");
    return parseError(error);
  }
}

function fallbackPerformerVisual(asset: GeneratedPerformerAsset): PerformerVisual {
  const metadata = parseMetadata(asset.providerMetadataJson);
  if (metadata.cutoutStatus === "fallback_source") {
    return {
      generatedImageUrl: asset.generatedImageUrl,
      cutoutPngUrl: asset.generatedImageUrl,
    };
  }

  return {
    generatedImageUrl: asset.generatedImageUrl,
    cutoutPngUrl: asset.cutoutPngUrl || asset.generatedImageUrl,
  };
}

function photoSafeTemplatePreference(preferredTemplateIds: PosterTemplateId[] = []): PosterTemplateId[] {
  const photoSafe: PosterTemplateId[] = ["concert-hall-classic", "premium-monochrome", "grid-portfolio"];
  return [
    ...photoSafe,
    ...preferredTemplateIds.filter((templateId) => !photoSafe.includes(templateId)),
    "minimal-recital",
    "modern-typography",
    "black-editorial",
    "soft-romantic",
    "experimental-contemporary",
  ];
}

async function markRunFailed(id: string, message: string) {
  await mutateDb((db) => {
    const run = db.runs.find((item) => item.id === id);
    if (!run) return;
    run.status = "failed";
    run.errorMessage = message;
    run.completedAt = new Date();
    run.updatedAt = new Date();
  });
}

function fillMissingPerformerVisualsFromSavedCandidates(input: {
  performerAsset: GeneratedPerformerAsset;
  candidateAssetIds: string[];
  allAssets: GeneratedPerformerAsset[];
  templates: PosterTemplateMeta[];
  performerVisuals: Partial<Record<PosterTemplateMeta["id"], PerformerVisual>>;
}) {
  const missingTemplates = input.templates.filter((template) => !input.performerVisuals[template.id]);
  if (!missingTemplates.length) return;

  const explicitOrder = new Map(input.candidateAssetIds.map((id, index) => [id, index]));
  const explicitCandidates = input.allAssets
    .filter((asset) => input.candidateAssetIds.includes(asset.id))
    .sort((left, right) => (explicitOrder.get(left.id) ?? 999) - (explicitOrder.get(right.id) ?? 999));
  const savedCandidates = input.allAssets
    .filter((asset) => asset.userId === standaloneUserId())
    .filter((asset) => asset.referenceImageId === input.performerAsset.referenceImageId)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const usableCandidates = [...explicitCandidates, ...savedCandidates]
    .filter(isUsableProposalPerformerCandidate)
    .filter((asset, index, assets) => assets.findIndex((item) => item.generatedImageUrl === asset.generatedImageUrl && item.cutoutPngUrl === asset.cutoutPngUrl) === index);

  for (const template of missingTemplates) {
    const asset = usableCandidates.shift();
    if (!asset) break;
    input.performerVisuals[template.id] = {
      generatedImageUrl: asset.generatedImageUrl,
      cutoutPngUrl: asset.cutoutPngUrl,
    };
  }
}

function isUsableProposalPerformerCandidate(asset: GeneratedPerformerAsset) {
  if (!asset.generatedImageUrl || !asset.cutoutPngUrl) return false;
  if (asset.generationMode !== "portrait-variant" && asset.generationMode !== "pose-synthesis") return false;
  const metadata = parseMetadata(asset.providerMetadataJson);
  return (
    metadata.cutoutStatus !== "fallback_source" &&
    metadata.cutoutStatus !== "not_attempted" &&
    metadata.cutoutStatus !== "unknown" &&
    metadata.faceIdentityStatus !== "failed"
  );
}

function readConcertInfo(value: unknown): PosterConcertInfo {
  const input = parseRecord(value);
  return {
    title: readString(input.title),
    subtitle: readString(input.subtitle),
    performerName: readString(input.performerName),
    program: readString(input.program),
    venueName: readString(input.venueName),
    dateText: readString(input.dateText),
    qrTargetType: readQrTargetType(input.qrTargetType),
    qrTargetUrl: readString(input.qrTargetUrl),
  };
}

function resolveQrTargetUrl(request: Request, concertInfo: PosterConcertInfo) {
  if (concertInfo.qrTargetType === "custom_url" && concertInfo.qrTargetUrl) return concertInfo.qrTargetUrl;
  return concertInfo.qrTargetUrl || new URL(request.url).origin;
}

function readQrTargetType(value: unknown): PosterConcertInfo["qrTargetType"] {
  const allowed = new Set(["ticket_link", "pamphlet_link", "checkin_link", "artist_profile_link", "custom_url"]);
  return typeof value === "string" && allowed.has(value) ? (value as PosterConcertInfo["qrTargetType"]) : "ticket_link";
}

function readProposalCount(value: unknown): 2 | 4 | 6 | 8 {
  return value === 2 || value === 4 || value === 6 || value === 8 ? value : 4;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function parseMetadata(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
