import type { PosterDesign } from "../poster/types";

export type ReferenceImage = {
  id: string;
  userId: string;
  originalUrl: string;
  thumbnailUrl: string;
  faceCropUrl: string | null;
  width: number;
  height: number;
  mimeType: string;
  hash: string;
  createdAt: Date;
};

export type GeneratedPerformerAsset = {
  id: string;
  userId: string;
  referenceImageId: string | null;
  generatedImageUrl: string;
  cutoutPngUrl: string;
  maskUrl: string | null;
  thumbnailUrl: string | null;
  promptUsed: string | null;
  promptHash: string | null;
  provider: string;
  generationMode: string;
  optionsJson: string | null;
  providerMetadataJson: string | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PosterProposal = {
  id: string;
  userId: string;
  performanceId: string | null;
  performerAssetId: string;
  templateId: string;
  title: string;
  previewUrl: string;
  thumbnailUrl: string;
  editableDesignJson: string;
  qualityReportJson: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PosterGenerationRun = {
  id: string;
  userId: string;
  performanceId: string | null;
  performerAssetId: string | null;
  status: "planning" | "running" | "succeeded" | "failed";
  plannerProvider: string;
  plannerFallbackReason: string | null;
  orchestrationPrompt: string | null;
  proposalCount: number;
  planJson: string | null;
  stepsJson: string | null;
  errorMessage: string | null;
  proposalsCreated: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PosterProject = {
  id: string;
  userId: string;
  performanceId: string | null;
  proposalId: string | null;
  performerAssetId: string | null;
  title: string;
  exportUrl: string | null;
  editableDesignJson: string;
  editableDesign?: PosterDesign;
  createdAt: Date;
  updatedAt: Date;
};
