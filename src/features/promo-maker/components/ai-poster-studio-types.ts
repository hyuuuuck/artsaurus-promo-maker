export type PosterGenerationPlanRecord = {
  summary: string;
  warnings?: string[];
  layoutJob?: {
    templateIds?: string[];
  };
  performerAssetJob?: {
    posePolicy?: string;
  };
  backgroundJob?: {
    mode?: string;
  };
};

export type PosterGenerationRunRecord = {
  id: string;
  status: string;
  plannerProvider: string;
  fallbackReason?: string;
  orchestrationPrompt?: string;
  proposalCount: number;
  proposalsCreated?: number;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  planSummary?: string;
  templateIds?: string[];
  posePolicy?: string;
  backgroundMode?: string;
  layoutDensity?: string;
  warnings?: string[];
};
