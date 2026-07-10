import type { GeneratedPerformerAsset } from "../server/types";
import { performerAssetAllowedOperations, performerAssetDisallowedOperations } from "./assetPolicy";
import { posterTemplateIds, type PosterConcertInfo, type PosterTemplateId } from "./types";

type ProposalCount = 2 | 4 | 6 | 8;

export type PerformerPosePolicy = "locked_asset" | "subtle_profile_variation" | "pose_reference_required";
export type BackgroundJobMode = "template_graphics" | "background_relight" | "stage_background_generation";
export type LayoutDensity = "quiet" | "balanced" | "bold";

export type PosterGenerationPlanStep = {
  id: string;
  kind: "asset" | "pose" | "background" | "layout" | "text" | "render";
  title: string;
  instruction: string;
  status: "planned" | "skipped";
};

export type PosterGenerationPlan = {
  version: 1;
  summary: string;
  naturalLanguagePrompt: string;
  proposalCount: ProposalCount;
  performerAssetJob: {
    mode: "use_approved_locked_asset";
    sourceAssetId: string;
    sourceGenerationMode: string;
    identityPolicy: "preserve_apparent_identity";
    posePolicy: PerformerPosePolicy;
    poseInstruction: string;
    allowedOperations: string[];
    disallowedOperations: string[];
  };
  backgroundJob: {
    mode: BackgroundJobMode;
    mood: string;
    palette: string;
    lighting: string;
    instruction: string;
  };
  layoutJob: {
    templateIds: PosterTemplateId[];
    density: LayoutDensity;
    typography: string;
    qrPriority: "standard" | "high";
    instruction: string;
  };
  textJob: {
    source: "concert_info";
    editableLayerNames: string[];
    instruction: string;
  };
  steps: PosterGenerationPlanStep[];
  warnings: string[];
};

export type PosterPlannerProvider = "deterministic" | "google-ai-studio";

export type PlanPosterGenerationResult = {
  plan: PosterGenerationPlan;
  plannerProvider: PosterPlannerProvider;
  fallbackReason?: string;
};

export type BuildPosterGenerationPlanInput = {
  performerAsset: GeneratedPerformerAsset;
  concertInfo: PosterConcertInfo;
  proposalCount: ProposalCount;
  naturalLanguagePrompt?: string | null;
};

type AiPlannerOverrides = {
  summary?: string;
  tags?: string[];
  posePolicy?: PerformerPosePolicy;
  backgroundMode?: BackgroundJobMode;
  layoutDensity?: LayoutDensity;
  templateIds?: PosterTemplateId[];
  mood?: string;
  palette?: string;
  lighting?: string;
  typography?: string;
  qrPriority?: "standard" | "high";
  warnings?: string[];
};

export async function planPosterGeneration(input: BuildPosterGenerationPlanInput): Promise<PlanPosterGenerationResult> {
  const deterministicPlan = buildPosterGenerationPlan(input);
  const plannerMode = (process.env.POSTER_ORCHESTRATOR_PLANNER?.trim() || "auto").toLowerCase();
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  const shouldUseAiPlanner =
    Boolean(normalizePrompt(input.naturalLanguagePrompt)) &&
    Boolean(apiKey) &&
    plannerMode !== "off" &&
    plannerMode !== "false" &&
    plannerMode !== "deterministic";

  if (!shouldUseAiPlanner) {
    return {
      plan: deterministicPlan,
      plannerProvider: "deterministic",
    };
  }

  try {
    const overrides = await generateGoogleAiStudioPlanOverrides({
      apiKey: apiKey!,
      input,
      deterministicPlan,
    });
    return {
      plan: applyPlannerOverrides(deterministicPlan, overrides),
      plannerProvider: "google-ai-studio",
    };
  } catch (error) {
    return {
      plan: deterministicPlan,
      plannerProvider: "deterministic",
      fallbackReason: error instanceof Error ? error.message.slice(0, 240) : "AI planner failed.",
    };
  }
}

export function buildPosterGenerationPlan(input: BuildPosterGenerationPlanInput): PosterGenerationPlan {
  const prompt = normalizePrompt(input.naturalLanguagePrompt);
  const styleSignals = inferStyleSignals(prompt, input.concertInfo);
  const posePolicy = inferPosePolicy(prompt);
  const backgroundMode = inferBackgroundMode(prompt, styleSignals);
  const density = inferLayoutDensity(prompt, styleSignals);
  const templateIds = prioritizeTemplates(styleSignals, input.proposalCount);
  const warnings = buildWarnings(posePolicy, prompt);
  const backgroundInstruction = buildBackgroundInstruction(backgroundMode, styleSignals);
  const poseInstruction = buildPoseInstruction(posePolicy);
  const layoutInstruction = buildLayoutInstruction(density, styleSignals);

  return {
    version: 1,
    summary: buildSummary(styleSignals, posePolicy, backgroundMode, density),
    naturalLanguagePrompt: prompt,
    proposalCount: input.proposalCount,
    performerAssetJob: {
      mode: "use_approved_locked_asset",
      sourceAssetId: input.performerAsset.id,
      sourceGenerationMode: input.performerAsset.generationMode,
      identityPolicy: "preserve_apparent_identity",
      posePolicy,
      poseInstruction,
      allowedOperations: [...performerAssetAllowedOperations],
      disallowedOperations: [...performerAssetDisallowedOperations],
    },
    backgroundJob: {
      mode: backgroundMode,
      mood: styleSignals.mood,
      palette: styleSignals.palette,
      lighting: styleSignals.lighting,
      instruction: backgroundInstruction,
    },
    layoutJob: {
      templateIds,
      density,
      typography: styleSignals.typography,
      qrPriority: prompt.includes("qr") || prompt.includes("예매") || prompt.includes("티켓") ? "high" : "standard",
      instruction: layoutInstruction,
    },
    textJob: {
      source: "concert_info",
      editableLayerNames: ["concert title", "performer name", "program", "date", "time", "venue", "ticket information", "QR caption"],
      instruction: "All important poster copy must be generated as editable text layers. Do not bake title, performer, date, venue, program, ticket, sponsor, or QR labels into a raster image.",
    },
    steps: [
      {
        id: "asset-lock",
        kind: "asset",
        title: "승인 에셋 잠금",
        instruction: "Use the approved performer asset as a locked identity layer. Do not redraw face, hair, expression, clothing, or instrument in the poster document.",
        status: "planned",
      },
      {
        id: "pose-policy",
        kind: "pose",
        title: "포즈 정책",
        instruction: poseInstruction,
        status: posePolicy === "locked_asset" ? "skipped" : "planned",
      },
      {
        id: "background",
        kind: "background",
        title: "배경/조명 생성",
        instruction: backgroundInstruction,
        status: "planned",
      },
      {
        id: "layout",
        kind: "layout",
        title: "레이아웃 생성",
        instruction: layoutInstruction,
        status: "planned",
      },
      {
        id: "editable-text",
        kind: "text",
        title: "편집 가능한 텍스트",
        instruction: "Map concert information into editable text layers and keep OCR/imported text editable when possible.",
        status: "planned",
      },
      {
        id: "render-preview",
        kind: "render",
        title: "미리보기 렌더",
        instruction: "Render proposal previews from the layer document after the plan has produced asset, background, layout, and text jobs.",
        status: "planned",
      },
    ],
    warnings,
  };
}

export function applyPlannerOverrides(basePlan: PosterGenerationPlan, overrides: AiPlannerOverrides): PosterGenerationPlan {
  const templateIds = sanitizeTemplateIds(overrides.templateIds, basePlan.proposalCount) ?? basePlan.layoutJob.templateIds;
  const posePolicy = sanitizeEnum(overrides.posePolicy, ["locked_asset", "subtle_profile_variation", "pose_reference_required"] as const) ?? basePlan.performerAssetJob.posePolicy;
  const backgroundMode = sanitizeEnum(overrides.backgroundMode, ["template_graphics", "background_relight", "stage_background_generation"] as const) ?? basePlan.backgroundJob.mode;
  const density = sanitizeEnum(overrides.layoutDensity, ["quiet", "balanced", "bold"] as const) ?? basePlan.layoutJob.density;
  const qrPriority = sanitizeEnum(overrides.qrPriority, ["standard", "high"] as const) ?? basePlan.layoutJob.qrPriority;
  const warnings = sanitizeStringList(overrides.warnings, 4);
  const poseInstruction = buildPoseInstruction(posePolicy);
  const backgroundJob = {
    ...basePlan.backgroundJob,
    mode: backgroundMode,
    mood: sanitizeShortText(overrides.mood) ?? basePlan.backgroundJob.mood,
    palette: sanitizeShortText(overrides.palette) ?? basePlan.backgroundJob.palette,
    lighting: sanitizeShortText(overrides.lighting) ?? basePlan.backgroundJob.lighting,
  };
  backgroundJob.instruction = buildBackgroundInstruction(backgroundJob.mode, {
    tags: sanitizeStringList(overrides.tags, 5) ?? [],
    mood: backgroundJob.mood,
    palette: backgroundJob.palette,
    lighting: backgroundJob.lighting,
    typography: sanitizeShortText(overrides.typography) ?? basePlan.layoutJob.typography,
  });
  const layoutJob = {
    ...basePlan.layoutJob,
    templateIds,
    density,
    typography: sanitizeShortText(overrides.typography) ?? basePlan.layoutJob.typography,
    qrPriority,
  };
  layoutJob.instruction = buildLayoutInstruction(layoutJob.density, {
    tags: sanitizeStringList(overrides.tags, 5) ?? [],
    mood: backgroundJob.mood,
    palette: backgroundJob.palette,
    lighting: backgroundJob.lighting,
    typography: layoutJob.typography,
  });

  return {
    ...basePlan,
    summary: sanitizeShortText(overrides.summary) ?? basePlan.summary,
    performerAssetJob: {
      ...basePlan.performerAssetJob,
      posePolicy,
      poseInstruction,
    },
    backgroundJob,
    layoutJob,
    steps: basePlan.steps.map((step) => {
      if (step.id === "pose-policy") {
        return {
          ...step,
          instruction: poseInstruction,
          status: posePolicy === "locked_asset" ? "skipped" : "planned",
        };
      }
      if (step.id === "background") {
        return {
          ...step,
          instruction: backgroundJob.instruction,
        };
      }
      if (step.id === "layout") {
        return {
          ...step,
          instruction: layoutJob.instruction,
        };
      }
      return step;
    }),
    warnings: [...basePlan.warnings, ...(warnings ?? [])].slice(0, 6),
  };
}

async function generateGoogleAiStudioPlanOverrides(input: {
  apiKey: string;
  input: BuildPosterGenerationPlanInput;
  deterministicPlan: PosterGenerationPlan;
}): Promise<AiPlannerOverrides> {
  const model = process.env.POSTER_ORCHESTRATOR_MODEL?.trim() || process.env.GOOGLE_TEXT_MODEL?.trim() || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${input.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "You are the planning layer for ArtSaurus, a Korean classical musician poster editor.",
                "Convert the user's natural-language design request into a safe orchestration plan override.",
                "Do not identify the person in images. Do not infer sensitive attributes. Do not request changing face, age impression, gender presentation, or identity.",
                "The approved performer asset must stay locked. Important text must remain editable layers.",
                "Return only JSON with this exact shape:",
                JSON.stringify({
                  summary: "short Korean summary",
                  tags: ["classic"],
                  posePolicy: "locked_asset|subtle_profile_variation|pose_reference_required",
                  backgroundMode: "template_graphics|background_relight|stage_background_generation",
                  layoutDensity: "quiet|balanced|bold",
                  templateIds: ["minimal-recital"],
                  mood: "short mood",
                  palette: "short palette",
                  lighting: "short lighting",
                  typography: "short typography direction",
                  qrPriority: "standard|high",
                  warnings: ["short Korean warning"],
                }),
                "Allowed templateIds: minimal-recital, black-editorial, concert-hall-classic, modern-typography, soft-romantic, experimental-contemporary, premium-monochrome, grid-portfolio.",
                `Proposal count: ${input.input.proposalCount}. Return at most that many templateIds.`,
                `Concert info: ${JSON.stringify(input.input.concertInfo)}`,
                `Deterministic baseline plan: ${JSON.stringify(input.deterministicPlan)}`,
                `User request: ${input.input.naturalLanguagePrompt ?? ""}`,
              ].join("\n"),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Google AI Studio planner failed with status ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as unknown;
  return parsePlannerOverrides(payload);
}

type StyleSignals = {
  mood: string;
  palette: string;
  lighting: string;
  typography: string;
  tags: string[];
};

function normalizePrompt(value?: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function inferStyleSignals(prompt: string, concertInfo: PosterConcertInfo): StyleSignals {
  const joined = [prompt, concertInfo.title, concertInfo.subtitle, concertInfo.program].filter(Boolean).join(" ").toLowerCase();
  const tags: string[] = [];
  const has = (...keywords: string[]) => keywords.some((keyword) => joined.includes(keyword));

  if (has("깔끔", "미니멀", "minimal", "clean", "여백")) tags.push("minimal");
  if (has("강렬", "무대", "dramatic", "stage", "블랙", "black", "dark", "어둡")) tags.push("dramatic");
  if (has("클래식", "classic", "고급", "리사이틀", "recital", "정통")) tags.push("classic");
  if (has("부드", "따뜻", "romantic", "soft", "warm", "감성")) tags.push("romantic");
  if (has("현대", "모던", "contemporary", "modern", "타이포", "그래픽")) tags.push("modern");
  if (!tags.length) tags.push("classic", "minimal");

  return {
    tags,
    mood: inferMood(tags),
    palette: inferPalette(tags),
    lighting: inferLighting(tags),
    typography: inferTypography(tags),
  };
}

function inferPosePolicy(prompt: string): PerformerPosePolicy {
  if (!prompt) return "locked_asset";
  const wantsPerformancePose = ["포즈", "자세", "연주", "치는", "켜는", "잡고", "들고", "앉아", "standing", "sitting", "pose", "playing"].some((keyword) =>
    prompt.includes(keyword),
  );
  if (wantsPerformancePose) return "pose_reference_required";
  const wantsVariant = ["다양", "후보", "변형", "variation", "variant", "다른 분위기"].some((keyword) => prompt.includes(keyword));
  return wantsVariant ? "subtle_profile_variation" : "locked_asset";
}

function inferBackgroundMode(prompt: string, styleSignals: StyleSignals): BackgroundJobMode {
  if (["배경", "무대", "콘서트홀", "stage", "hall", "lighting", "조명"].some((keyword) => prompt.includes(keyword))) {
    return styleSignals.tags.includes("dramatic") ? "stage_background_generation" : "background_relight";
  }
  return "template_graphics";
}

function inferLayoutDensity(prompt: string, styleSignals: StyleSignals): LayoutDensity {
  if (["크게", "강하게", "대담", "bold", "impact"].some((keyword) => prompt.includes(keyword)) || styleSignals.tags.includes("dramatic")) return "bold";
  if (["여백", "조용", "작게", "quiet", "minimal"].some((keyword) => prompt.includes(keyword)) || styleSignals.tags.includes("minimal")) return "quiet";
  return "balanced";
}

function prioritizeTemplates(styleSignals: StyleSignals, count: ProposalCount): PosterTemplateId[] {
  const preferred: PosterTemplateId[] = [];
  const add = (...ids: PosterTemplateId[]) => {
    for (const id of ids) {
      if (!preferred.includes(id)) preferred.push(id);
    }
  };

  if (styleSignals.tags.includes("dramatic")) add("black-editorial", "premium-monochrome", "experimental-contemporary");
  if (styleSignals.tags.includes("classic")) add("concert-hall-classic", "minimal-recital", "premium-monochrome");
  if (styleSignals.tags.includes("romantic")) add("soft-romantic", "concert-hall-classic", "minimal-recital");
  if (styleSignals.tags.includes("modern")) add("modern-typography", "experimental-contemporary", "grid-portfolio");
  if (styleSignals.tags.includes("minimal")) add("minimal-recital", "grid-portfolio", "modern-typography");

  for (const id of posterTemplateIds) add(id);
  return preferred.slice(0, count);
}

function buildWarnings(posePolicy: PerformerPosePolicy, prompt: string) {
  const warnings: string[] = [];
  if (posePolicy === "pose_reference_required") {
    warnings.push("큰 포즈 변경은 얼굴 붕괴 위험이 있어, 명령만으로 강제하지 않고 포즈 참고 사진이 있을 때만 강하게 적용합니다.");
  }
  if (["얼굴 바꿔", "다른 사람", "어리게", "성별"].some((keyword) => prompt.includes(keyword))) {
    warnings.push("인물의 얼굴, 나이 인상, 성별 표현, 민감 속성 변경 요청은 포스터 생성 계획에서 제외합니다.");
  }
  return warnings;
}

function buildPoseInstruction(policy: PerformerPosePolicy) {
  if (policy === "pose_reference_required") {
    return "Create pose variants only when there is an uploaded pose/instrument reference. Preserve face angle and apparent identity; if identity conflicts with pose, reduce pose change.";
  }
  if (policy === "subtle_profile_variation") {
    return "Create only subtle profile variations: crop, shoulder line, hand neatness, lighting, and framing may change, but face direction must stay close.";
  }
  return "Use the approved performer asset as-is as a locked poster layer. Do not synthesize a new body pose for this poster batch.";
}

function buildBackgroundInstruction(mode: BackgroundJobMode, styleSignals: StyleSignals) {
  if (mode === "stage_background_generation") {
    return `Generate or compose stage-inspired background layers around the locked performer asset using ${styleSignals.lighting} and ${styleSignals.palette}. Keep text and performer as separate editable layers.`;
  }
  if (mode === "background_relight") {
    return `Relight or redesign the background mood around the locked performer asset using ${styleSignals.lighting}. Do not bake performer or important text into the background.`;
  }
  return `Use template graphics, abstract musical shapes, and ${styleSignals.palette} around the locked performer asset. Keep the performer asset separate.`;
}

function buildLayoutInstruction(density: LayoutDensity, styleSignals: StyleSignals) {
  return `Use ${density} layout density with ${styleSignals.typography}. Keep title, performer, date, venue, program, and QR as editable layer objects.`;
}

function buildSummary(styleSignals: StyleSignals, posePolicy: PerformerPosePolicy, backgroundMode: BackgroundJobMode, density: LayoutDensity) {
  return `스타일 ${styleSignals.tags.join(", ")} / 포즈 ${posePolicy} / 배경 ${backgroundMode} / 레이아웃 ${density}`;
}

function inferMood(tags: string[]) {
  if (tags.includes("dramatic")) return "dramatic recital stage";
  if (tags.includes("romantic")) return "soft warm recital";
  if (tags.includes("modern")) return "contemporary music editorial";
  if (tags.includes("minimal")) return "quiet premium recital";
  return "classical concert recital";
}

function inferPalette(tags: string[]) {
  if (tags.includes("dramatic")) return "black, ivory, muted gold, deep stage blue";
  if (tags.includes("romantic")) return "warm ivory, rose, soft gray, muted burgundy";
  if (tags.includes("modern")) return "white, cobalt, charcoal, focused accent color";
  if (tags.includes("minimal")) return "ivory, graphite, warm gray";
  return "ivory, walnut, black, muted gold";
}

function inferLighting(tags: string[]) {
  if (tags.includes("dramatic")) return "controlled stage spotlight";
  if (tags.includes("romantic")) return "soft diffused recital lighting";
  if (tags.includes("modern")) return "gallery-like directional light";
  return "clean studio recital lighting";
}

function inferTypography(tags: string[]) {
  if (tags.includes("modern")) return "bold Korean sans serif with editorial scale contrast";
  if (tags.includes("classic")) return "classical serif headline with readable Korean sans supporting text";
  if (tags.includes("romantic")) return "soft serif headline with light sans metadata";
  return "restrained Korean sans serif hierarchy";
}

function parsePlannerOverrides(payload: unknown): AiPlannerOverrides {
  const object = extractPlannerObject(payload);
  if (!object) {
    throw new Error("AI planner did not return a JSON object.");
  }

  return {
    summary: sanitizeShortText(object.summary),
    tags: sanitizeStringList(object.tags, 6),
    posePolicy: sanitizeEnum(object.posePolicy, ["locked_asset", "subtle_profile_variation", "pose_reference_required"] as const),
    backgroundMode: sanitizeEnum(object.backgroundMode, ["template_graphics", "background_relight", "stage_background_generation"] as const),
    layoutDensity: sanitizeEnum(object.layoutDensity, ["quiet", "balanced", "bold"] as const),
    templateIds: sanitizeTemplateIds(object.templateIds, 8),
    mood: sanitizeShortText(object.mood),
    palette: sanitizeShortText(object.palette),
    lighting: sanitizeShortText(object.lighting),
    typography: sanitizeShortText(object.typography),
    qrPriority: sanitizeEnum(object.qrPriority, ["standard", "high"] as const),
    warnings: sanitizeStringList(object.warnings, 4),
  };
}

function extractPlannerObject(payload: unknown): Record<string, unknown> | null {
  if (isRecord(payload) && ("posePolicy" in payload || "backgroundMode" in payload || "layoutDensity" in payload || "templateIds" in payload)) {
    return payload;
  }

  const text = extractFirstTextValue(payload);
  if (!text) return null;
  const parsed = parseJsonObjectFromText(text);
  return isRecord(parsed) ? parsed : null;
}

function extractFirstTextValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractFirstTextValue(item);
      if (text) return text;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  if (typeof value.text === "string") return value.text;
  for (const item of Object.values(value)) {
    const text = extractFirstTextValue(item);
    if (text) return text;
  }
  return null;
}

function parseJsonObjectFromText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function sanitizeTemplateIds(value: unknown, count: ProposalCount): PosterTemplateId[] | undefined {
  const values = sanitizeStringList(value, count);
  if (!values?.length) return undefined;

  const allowed = new Set<string>(posterTemplateIds);
  const templateIds: PosterTemplateId[] = [];
  for (const value of values) {
    if (allowed.has(value) && !templateIds.includes(value as PosterTemplateId)) {
      templateIds.push(value as PosterTemplateId);
    }
  }
  return templateIds.length ? templateIds : undefined;
}

function sanitizeEnum<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

function sanitizeStringList(value: unknown, limit: number): string[] | undefined {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const sanitized = values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\s+/g, " ").slice(0, 160))
    .filter(Boolean)
    .slice(0, limit);
  return sanitized.length ? sanitized : undefined;
}

function sanitizeShortText(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 240) || undefined : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
