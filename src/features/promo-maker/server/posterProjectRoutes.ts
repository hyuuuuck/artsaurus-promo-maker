import { randomUUID } from "node:crypto";
import { renderAndStorePosterExport } from "../poster/renderPosterPreview";
import type { PosterDesign } from "../poster/types";
import { errorResponse, ok, parseError, parseRecord, readJson } from "./http";
import { insertByNewest, mutateDb, readDb, serializeProject, standaloneUserId } from "./localStore";
import type { PosterProject } from "./types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const performanceId = url.searchParams.get("performanceId")?.trim();
    const db = await readDb();
    const projects = db.projects
      .filter((project) => project.userId === standaloneUserId())
      .filter((project) => !performanceId || project.performanceId === performanceId)
      .slice(0, 20)
      .map((project) => {
        const proposal = project.proposalId ? db.proposals.find((item) => item.id === project.proposalId) : null;
        return {
          id: project.id,
          performanceId: project.performanceId,
          proposalId: project.proposalId,
          performerAssetId: project.performerAssetId,
          title: project.title,
          exportUrl: project.exportUrl,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          sourceTitle: proposal?.title ?? null,
          sourceTemplateId: proposal?.templateId ?? null,
          sourceKind: proposal ? "ai_proposal" : "uploaded_poster",
          thumbnailUrl: project.exportUrl ?? proposal?.thumbnailUrl ?? proposal?.previewUrl ?? extractPosterProjectThumbnail(project.editableDesignJson),
        };
      });
    return ok({ projects });
  } catch (error) {
    return parseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = parseRecord(await readJson(request));
    const db = await readDb();
    const proposalId = readString(payload.proposalId);
    const now = new Date();

    if (proposalId) {
      const proposal = db.proposals.find((item) => item.id === proposalId && item.userId === standaloneUserId());
      if (!proposal) return errorResponse("POSTER_PROPOSAL_NOT_FOUND", "선택한 시안을 찾을 수 없습니다.", 404);
      const project: PosterProject = {
        id: `project_${randomUUID()}`,
        userId: standaloneUserId(),
        performanceId: proposal.performanceId,
        proposalId: proposal.id,
        performerAssetId: proposal.performerAssetId,
        title: readString(payload.title) || proposal.title,
        exportUrl: null,
        editableDesignJson: proposal.editableDesignJson,
        createdAt: now,
        updatedAt: now,
      };
      await mutateDb((mutable) => {
        insertByNewest(mutable.projects, project, 80);
      });
      return ok({ project: serializeProject(project) });
    }

    const editableDesign = readPosterDesign(payload.editableDesign);
    if (!editableDesign) return errorResponse("POSTER_DESIGN_REQUIRED", "편집할 포스터 문서가 필요합니다.", 400);
    const project: PosterProject = {
      id: `project_${randomUUID()}`,
      userId: standaloneUserId(),
      performanceId: readString(payload.performanceId) ?? null,
      proposalId: null,
      performerAssetId: null,
      title: readString(payload.title) || "업로드 포스터",
      exportUrl: null,
      editableDesignJson: JSON.stringify(editableDesign),
      createdAt: now,
      updatedAt: now,
    };
    await mutateDb((mutable) => {
      insertByNewest(mutable.projects, project, 80);
    });
    return ok({ project: serializeProject(project) });
  } catch (error) {
    return parseError(error);
  }
}

export async function GET_DETAIL(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await readDb();
    const project = db.projects.find((item) => item.id === id && item.userId === standaloneUserId());
    if (!project) return errorResponse("POSTER_PROJECT_NOT_FOUND", "포스터 프로젝트를 찾을 수 없습니다.", 404);
    return ok({ project: serializeProject(project) });
  } catch (error) {
    return parseError(error);
  }
}

export async function PATCH_DETAIL(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = parseRecord(await readJson(request));
    const editableDesign = readPosterDesign(payload.editableDesign);
    if (!editableDesign) return errorResponse("POSTER_DESIGN_REQUIRED", "편집할 포스터 문서가 필요합니다.", 400);
    let updated: PosterProject | null = null;
    await mutateDb((db) => {
      const project = db.projects.find((item) => item.id === id && item.userId === standaloneUserId());
      if (!project) return;
      project.title = readString(payload.title) || project.title;
      project.editableDesignJson = JSON.stringify(editableDesign);
      project.updatedAt = new Date();
      updated = project;
    });
    if (!updated) return errorResponse("POSTER_PROJECT_NOT_FOUND", "포스터 프로젝트를 찾을 수 없습니다.", 404);
    return ok({ project: serializeProject(updated) });
  } catch (error) {
    return parseError(error);
  }
}

export async function POST_EXPORT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = parseRecord(await readJson(request));
    const db = await readDb();
    const project = db.projects.find((item) => item.id === id && item.userId === standaloneUserId());
    if (!project) return errorResponse("POSTER_PROJECT_NOT_FOUND", "포스터 프로젝트를 찾을 수 없습니다.", 404);
    const editableDesign = readPosterDesign(payload.editableDesign) ?? (JSON.parse(project.editableDesignJson) as PosterDesign);
    const exportResult = await renderAndStorePosterExport({
      userId: standaloneUserId(),
      design: editableDesign,
    });
    let updated: PosterProject | null = null;
    await mutateDb((mutable) => {
      const existing = mutable.projects.find((item) => item.id === id && item.userId === standaloneUserId());
      if (!existing) return;
      existing.editableDesignJson = JSON.stringify(editableDesign);
      existing.exportUrl = exportResult.exportUrl;
      existing.updatedAt = new Date();
      updated = existing;
    });
    if (!updated) return errorResponse("POSTER_PROJECT_NOT_FOUND", "포스터 프로젝트를 찾을 수 없습니다.", 404);
    return ok({
      project: serializeProject(updated),
      exportUrl: exportResult.exportUrl,
    });
  } catch (error) {
    return parseError(error);
  }
}

function readPosterDesign(value: unknown): PosterDesign | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<PosterDesign>;
  if (record.version !== 1 || !record.canvas || !Array.isArray(record.layers)) return null;
  return record as PosterDesign;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractPosterProjectThumbnail(editableDesignJson: string) {
  try {
    const design = JSON.parse(editableDesignJson) as {
      layers?: Array<{
        type?: string;
        src?: string;
        imageRole?: string;
        width?: number;
        height?: number;
      }>;
    };
    const images = (design.layers ?? []).filter((layer) => layer.type === "image" && typeof layer.src === "string" && layer.src);
    const preferred =
      images.find((layer) => layer.imageRole === "poster") ??
      images.find((layer) => layer.imageRole === "performer") ??
      images.sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0];
    return preferred?.src ?? null;
  } catch {
    return null;
  }
}
