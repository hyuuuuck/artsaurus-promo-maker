"use client";

/* eslint-disable @next/next/no-img-element -- Poster layers need raw img tags for draggable canvas rendering. */

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  Download,
  ExternalLink,
  FileText,
  History,
  ImageIcon,
  Loader2,
  MousePointer2,
  Palette,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  TextCursorInput,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizePosterFont, posterBrowserFontStack, posterFontOptions } from "../poster/fonts";
import { POSTER_CANVAS, type PosterDesign, type PosterImageLayer, type PosterLayer, type PosterQrLayer, type PosterShapeLayer, type PosterTextLayer } from "../poster/types";

export type InitialPerformance = {
  id: string;
  title: string;
  subtitle?: string;
  performerName: string;
  venueName?: string;
  dateText: string;
  program?: string;
  profileImageUrl?: string;
};

type ReferenceImageRecord = {
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  faceCropUrl?: string | null;
};

type PerformerAssetRecord = {
  id: string;
  referenceImageId?: string;
  thumbnailUrl: string;
  cutoutPngUrl: string;
  generatedImageUrl: string;
  generationMode: string;
  provider: string;
  providerMetadataJson?: string | null;
  createdAt?: string;
};

type PipelineStatus = {
  imageGeneration: {
    mode: "live" | "mock";
    provider: "google-ai-studio" | "mock";
    liveRequested: boolean;
    apiKeyPresent: boolean;
    model?: string;
    ready: boolean;
  };
  cutout: {
    provider: "rembg" | "sharp";
    model?: string;
    pipelineVersion: string;
    ready: boolean;
  };
  faceIdentity?: {
    enabled: boolean;
    provider: string;
    model: string;
    threshold: number;
    localThreshold: number;
    maxAttempts: number;
    pipelineVersion: string;
    deepFaceApiUrlPresent?: boolean;
    deepFaceModel?: string;
    ready: boolean;
  };
  poseSynthesis?: {
    provider: "comfyui-faceid-controlnet";
    baseUrlPresent: boolean;
    backgroundWorkflowPresent: boolean;
    poseWorkflowPresent: boolean;
    backgroundReady: boolean;
    poseReady: boolean;
    ready: boolean;
    timeoutMs: number;
  };
  proposalVariants?: {
    mode: string;
    provider: "off" | "google-ai-studio" | "comfyui-faceid-controlnet";
    ready: boolean;
    googleKeyPresent: boolean;
    comfyPoseReady: boolean;
    candidatePoolSize?: number;
  };
};

type AssetMetadata = {
  cutoutStatus: "generated" | "fallback_source" | "not_attempted" | "unknown";
  cutoutProvider?: string;
  cutoutModel?: string;
  cutoutPipelineVersion?: string;
  assetPipelineMode?: string;
  faceIdentityStatus?: "passed" | "failed" | "unchecked";
  faceIdentityScore?: number;
  faceIdentityLocalScore?: number;
  faceIdentityDistance?: number;
  faceIdentityDistanceThreshold?: number;
  faceIdentityThreshold?: number;
  faceIdentityLocalThreshold?: number;
  faceIdentityAttempt?: number;
  faceIdentityMaxAttempts?: number;
  faceIdentityProvider?: string;
  faceIdentityReason?: string;
  profilePolishFallback?: boolean;
  profilePolishFallbackReason?: string;
  profilePolishSkippedReason?: string;
  identityMode?: string;
};

type ProposalRecord = {
  id: string;
  title: string;
  templateId: string;
  thumbnailUrl: string;
  previewUrl: string;
  editableDesignJson: string;
  qualityReportJson?: string | null;
};

type ProposalQualityReportRecord = {
  rating: "good" | "review" | "problem";
  score: number;
  summary: string;
  issues: Array<{
    id: string;
    severity: "error" | "warning" | "info";
    category: string;
    layerIds: string[];
    message: string;
  }>;
  autoFixes?: Array<{
    id: string;
    category: string;
    layerIds: string[];
    message: string;
  }>;
};

type PosterGenerationPlanRecord = {
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

type PosterGenerationRunRecord = {
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

type ProfileVariantFailureRecord = {
  index: number;
  label: string;
  reason: string;
};

type WorkProgressState = {
  title: string;
  detail: string;
  meta: string;
  percent: number | null;
  steps: string[];
};

type ProjectRecord = {
  id: string;
  title: string;
  exportUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
  editableDesign: PosterDesign;
};

type SavedProjectRecord = Omit<ProjectRecord, "editableDesign"> & {
  performanceId?: string | null;
  proposalId?: string | null;
  performerAssetId?: string | null;
  sourceKind?: "ai_proposal" | "uploaded_poster";
  sourceTemplateId?: string | null;
  sourceTitle?: string | null;
  thumbnailUrl?: string | null;
};

type UploadedImageRecord = {
  url: string;
  width: number;
  height: number;
};

type PosterOcrItem = {
  id: string;
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
  textColor: string;
};

type PosterOcrResponse = {
  image: {
    width: number;
    height: number;
  };
  text: string;
  items: PosterOcrItem[];
};

type DragState = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  layerX: number;
  layerY: number;
};

type RegionDragState = {
  layerId: string;
  regionId: string;
  regionKind: "protected" | "cover";
  mode: "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PosterImportSettings = {
  preset: PosterCanvasPresetValue;
  customWidth: number;
  customHeight: number;
  fit: PosterImageLayer["objectFit"];
};

const posterCanvasPresets = [
  { value: "performance", label: "공연 포스터", width: POSTER_CANVAS.width, height: POSTER_CANVAS.height },
  { value: "a4-portrait", label: "A4 세로", width: 1240, height: 1754 },
  { value: "a4-landscape", label: "A4 가로", width: 1754, height: 1240 },
  { value: "square", label: "정사각형", width: 1080, height: 1080 },
  { value: "custom", label: "직접 입력", width: POSTER_CANVAS.width, height: POSTER_CANVAS.height },
] as const;
type PosterCanvasPresetValue = (typeof posterCanvasPresets)[number]["value"];

const styleOptions = [
  { value: "clean", label: "깔끔" },
  { value: "dramatic", label: "무대감" },
  { value: "romantic", label: "부드럽게" },
  { value: "editorial", label: "에디토리얼" },
  { value: "contemporary", label: "현대적" },
] as const;

const wardrobeOptions = [
  { value: "", label: "자동" },
  { value: "elegant concert dress or gown", label: "드레스/가운" },
  { value: "black suit or tuxedo", label: "정장" },
  { value: "formal blouse and skirt or slacks", label: "블라우스/스커트" },
  { value: "traditional Korean hanbok stagewear", label: "한복/전통" },
  { value: "simple modern concert casualwear", label: "캐주얼 공연복" },
] as const;

const posterProposalCountOptions = [2] as const;
const profileVariantCountOptions = [5] as const;
type ProposalCount = (typeof posterProposalCountOptions)[number];
type ProfileVariantCount = (typeof profileVariantCountOptions)[number];

const posterPromptPresets = [
  {
    id: "quiet-recital",
    label: "차분한 리사이틀",
    description: "여백, 낮은 채도, 공연 정보 가독성 중심",
    value: "얼굴과 승인된 프로필 후보는 유지하고, 여백이 많은 차분한 클래식 리사이틀 포스터. 따뜻한 아이보리와 먹색 중심, 제목은 크게 읽히게.",
  },
  {
    id: "stage-light",
    label: "무대 조명",
    description: "콘서트홀 조명과 깊은 명암 중심",
    value: "얼굴은 바꾸지 말고, 콘서트홀 무대 조명과 깊은 명암을 사용한 고급 포스터. 검정, 금색, 짙은 블루 계열. 예매 QR은 잘 보이게.",
  },
  {
    id: "modern-type",
    label: "현대 타이포",
    description: "강한 제목 대비와 기하학적 구성",
    value: "승인된 연주자 이미지는 고정하고, 현대적인 타이포그래피 중심의 포스터. 강한 제목 대비, 기하학적 도형, 깔끔한 정보 정리.",
  },
  {
    id: "warm-recital",
    label: "따뜻한 감성",
    description: "부드러운 조명과 감성적인 독주회 톤",
    value: "연주자 얼굴과 포즈는 유지하고, 부드러운 조명과 따뜻한 색감의 감성적인 리사이틀 포스터. 너무 귀엽거나 스티커사진 느낌은 피하기.",
  },
] as const;

const profileVariantDirections = [
  {
    label: "악기 리사이틀",
    style: "clean",
    backgroundPolicy: "solid-cutout",
    mood: "정면 얼굴을 유지한 악기 연주 프로필",
    stylePrompt:
      "Create a refined classical recital profile candidate where the face direction and gaze remain close to the approved asset, but the torso, shoulders, hands, and instrument-performance context are newly composed. If the performer is a pianist, show a natural grand-piano or keyboard performance context without turning the face away.",
    actionPrompt:
      "Vary the upper-body pose into a believable performance-ready musician pose. Keep the face angle close; change hands, arms, seated/standing posture, and instrument staging instead of only changing the background.",
  },
  {
    label: "콘서트홀 연주",
    style: "romantic",
    backgroundPolicy: "soft-studio",
    mood: "콘서트홀 연주 장면",
    stylePrompt:
      "Create a warm concert-hall performance profile candidate. Preserve facial identity, gaze, face angle, hair, and outfit category, but make the body pose visibly different through recital-stage posture, hands, shoulders, and instrument context.",
    actionPrompt:
      "Use a serious classical performance posture, such as seated at piano, holding/playing the stated instrument, or preparing to perform. Do not use cute selfie gestures or sticker-photo poses.",
  },
  {
    label: "클래식 에디토리얼",
    style: "editorial",
    backgroundPolicy: "solid-cutout",
    mood: "클래식 에디토리얼",
    stylePrompt:
      "Create a premium editorial classical musician profile candidate. Keep the face angle close and recognizably the same person, while changing upper-body composition, hand placement, formal performance posture, and instrument staging enough to feel like a new usable profile asset.",
    actionPrompt:
      "Create a composed music-magazine style performance portrait: formal posture, hands intentionally placed, instrument or recital context if provided, face still camera-facing.",
  },
  {
    label: "절제된 무대감",
    style: "dramatic",
    backgroundPolicy: "stage-light",
    mood: "절제된 무대감",
    stylePrompt:
      "Create a restrained dramatic stage profile candidate for a classical performance poster. Use stage light plus a different performance-ready body pose; keep the face direction, gaze family, and facial structure close to the approved asset.",
    actionPrompt:
      "Use a dramatic but serious musician posture. Hands, torso, instrument, chair, piano, bow, or music-stand context may change; face angle must not swing into profile.",
  },
  {
    label: "갤러리 프로필",
    style: "contemporary",
    backgroundPolicy: "soft-studio",
    mood: "현대적인 연주자 프로필",
    stylePrompt:
      "Create a modern gallery-style classical performer profile candidate. Preserve face, hair, expression family, outfit category, and face direction, but introduce a clean alternate performance pose with changed arms, hands, crop, and instrument context where appropriate.",
    actionPrompt:
      "Make it feel like a new professional musician profile photo, not the same cutout on another background. Avoid side-profile face rotation.",
  },
  {
    label: "미니멀 프로필",
    style: "clean",
    backgroundPolicy: "transparent",
    mood: "미니멀 연주자 프로필",
    stylePrompt:
      "Create a minimal poster-ready classical musician profile candidate with a clean background optimized for cutout. Keep the same person and face angle, but vary hand placement, shoulders, seated/standing posture, and instrument-performance context.",
    actionPrompt:
      "Produce a different silhouette from the approved cutout while preserving the face direction. Use simple musician posture, not a casual portrait pose.",
  },
  {
    label: "부드러운 독주회",
    style: "romantic",
    backgroundPolicy: "soft-studio",
    mood: "부드러운 독주회 프로필",
    stylePrompt:
      "Create a soft recital profile candidate with gentle print-quality retouching. Preserve face shape, face angle, eyes, nose, mouth, jawline, hairstyle family, and outfit category; vary the pose through hands, shoulders, instrument, and stage-readiness.",
    actionPrompt:
      "Use a graceful classical recital pose. If the instrument is piano, allow seated piano context while keeping the face toward camera.",
  },
  {
    label: "고급 저채도",
    style: "editorial",
    backgroundPolicy: "solid-cutout",
    mood: "고급 흑백/저채도 프로필",
    stylePrompt:
      "Create a premium low-saturation or monochrome-leaning classical performance profile candidate. Do not alter identity, face direction, expression, or clothing category; do create a distinct musician pose, crop, hand placement, and instrument context.",
    actionPrompt:
      "Use an elegant stage-performance silhouette with a stable camera-facing face. Avoid merely pasting the same cutout onto a monochrome background.",
  },
] as const;

function selectProfileVariantDirections(count: number) {
  return profileVariantDirections.slice(0, count);
}

const referencePoseOptions = [
  { value: "front", label: "사용할 사진", fallbackLabel: "프로필/포즈 사진" },
  { value: "left", label: "추가 참고 1", fallbackLabel: "AI 보정용" },
  { value: "right", label: "추가 참고 2", fallbackLabel: "AI 보정용" },
] as const;
type ReferencePose = (typeof referencePoseOptions)[number]["value"];

export function AiPosterStudio({ initialPerformance, demoMode = false }: { initialPerformance: InitialPerformance; demoMode?: boolean }) {
  const [referenceFiles, setReferenceFiles] = useState<Partial<Record<ReferencePose, File>>>({});
  const [referenceImages, setReferenceImages] = useState<Partial<Record<ReferencePose, ReferenceImageRecord>>>({});
  const [performerAsset, setPerformerAsset] = useState<PerformerAssetRecord | null>(null);
  const [baselineAsset, setBaselineAsset] = useState<PerformerAssetRecord | null>(null);
  const [savedAssets, setSavedAssets] = useState<PerformerAssetRecord[]>([]);
  const [profileVariantAssets, setProfileVariantAssets] = useState<PerformerAssetRecord[]>([]);
  const [profileVariantFailures, setProfileVariantFailures] = useState<ProfileVariantFailureRecord[]>([]);
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [posterBriefTemplateId, setPosterBriefTemplateId] = useState<(typeof posterPromptPresets)[number]["id"]>(posterPromptPresets[0].id);
  const [orchestrationPrompt, setOrchestrationPrompt] = useState<string>(posterPromptPresets[0].value);
  const [orchestrationPlan, setOrchestrationPlan] = useState<PosterGenerationPlanRecord | null>(null);
  const [orchestrationRun, setOrchestrationRun] = useState<PosterGenerationRunRecord | null>(null);
  const [generationRuns, setGenerationRuns] = useState<PosterGenerationRunRecord[]>([]);
  const [generationRunsLoading, setGenerationRunsLoading] = useState(false);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedProjectRecord[]>([]);
  const [savedProjectsLoading, setSavedProjectsLoading] = useState(false);
  const [design, setDesign] = useState<PosterDesign | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState(() =>
    demoMode ? "개발용 데모 모드입니다. 인증 없이 에셋/시안/편집 UI 흐름을 확인할 수 있습니다." : "",
  );
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(() => (demoMode ? createDemoPipelineStatus() : null));
  const [zoom, setZoom] = useState(0.52);
  const [baseScale, setBaseScale] = useState(0.52);
  const [proposalCount, setProposalCount] = useState<ProposalCount>(2);
  const [profileVariantCount, setProfileVariantCount] = useState<ProfileVariantCount>(5);
  const [personImageConsent, setPersonImageConsent] = useState(false);
  const [assetUsageRightsConfirmed, setAssetUsageRightsConfirmed] = useState(false);
  const [approvedAssetIds, setApprovedAssetIds] = useState<Set<string>>(() => new Set());
  const [posterImportSettings, setPosterImportSettings] = useState({
    preset: "a4-portrait" as PosterCanvasPresetValue,
    customWidth: 1240,
    customHeight: 1754,
    fit: "contain" as PosterImageLayer["objectFit"],
  });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [regionDrag, setRegionDrag] = useState<RegionDragState | null>(null);
  const stageShellRef = useRef<HTMLDivElement>(null);
  const profileVariantPanelRef = useRef<HTMLDivElement>(null);
  const proposalSectionRef = useRef<HTMLElement>(null);
  const editorSectionRef = useRef<HTMLElement>(null);

  const [generationOptions, setGenerationOptions] = useState({
    identityMode: "background_replace",
    style: "clean",
    retouchPrompt: "",
    stylePrompt: "",
    instrument: "",
    wardrobe: "",
    wardrobePrompt: "",
    actionPrompt: "",
    mood: "",
    backgroundPolicy: "solid-cutout",
    useDefaultProfileFallback: true,
  });
  const [concertInfo, setConcertInfo] = useState({
    title: initialPerformance.title,
    subtitle: initialPerformance.subtitle ?? "",
    performerName: initialPerformance.performerName,
    program: initialPerformance.program ?? "",
    venueName: initialPerformance.venueName ?? "",
    dateText: initialPerformance.dateText,
    qrTargetType: "ticket_link",
    qrTargetUrl: "",
  });

  const selectedLayer = useMemo(
    () => design?.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [design, selectedLayerId],
  );
  const activePosterLayer = useMemo(
    () =>
      selectedLayer?.type === "image" && selectedLayer.imageRole === "poster"
        ? selectedLayer
        : (design?.layers.find((layer): layer is PosterImageLayer => layer.type === "image" && layer.imageRole === "poster") ?? null),
    [design?.layers, selectedLayer],
  );
  const assetMetadata = useMemo(() => parseAssetMetadata(performerAsset?.providerMetadataJson), [performerAsset?.providerMetadataJson]);
  const selectedProfileVariantTemplates = useMemo(() => selectProfileVariantDirections(profileVariantCount), [profileVariantCount]);
  const baselineMetadata = useMemo(() => parseAssetMetadata(baselineAsset?.providerMetadataJson), [baselineAsset?.providerMetadataJson]);
  const baselineReadyForPose = Boolean(
    baselineAsset &&
      isBackgroundBaselineAsset(baselineAsset) &&
      baselineMetadata.cutoutStatus === "generated" &&
      baselineMetadata.faceIdentityStatus !== "failed",
  );
  const hasTransparentCutout = assetMetadata.cutoutStatus === "generated";
  const filePreviewUrls = useMemo(
    () => ({
      front: referenceFiles.front ? URL.createObjectURL(referenceFiles.front) : "",
      left: referenceFiles.left ? URL.createObjectURL(referenceFiles.left) : "",
      right: referenceFiles.right ? URL.createObjectURL(referenceFiles.right) : "",
    }),
    [referenceFiles.front, referenceFiles.left, referenceFiles.right],
  );
  const scale = Math.max(0.2, Math.min(1.3, baseScale * zoom));
  const generationIsLive = pipelineStatus?.imageGeneration.mode === "live";
  const poseSynthesisReady = Boolean(pipelineStatus?.poseSynthesis?.poseReady);
  const poseSynthesisUnlocked = poseSynthesisReady && baselineReadyForPose;
  const uploadedPhotoLivePolish =
    generationOptions.identityMode === "uploaded_photo" && generationIsLive && Boolean(pipelineStatus?.imageGeneration.apiKeyPresent);
  const assetReadyForProposals = Boolean(
    performerAsset?.generatedImageUrl &&
      performerAsset.cutoutPngUrl &&
      assetMetadata.cutoutStatus !== "fallback_source" &&
      assetMetadata.cutoutStatus !== "not_attempted",
  );
  const assetGenerationDisabled = Boolean(busy) || (generationOptions.identityMode === "pose_synthesis" && !poseSynthesisUnlocked);
  const performerAssetApproved = Boolean(performerAsset && approvedAssetIds.has(performerAsset.id));
  const selectedAssetNeedsProfileCandidate = Boolean(performerAsset && !isPosterReadyPerformerAsset(performerAsset, assetMetadata));
  const proposalVariantEngineReady = Boolean(pipelineStatus?.proposalVariants?.ready);
  const posterCandidateAssets = useMemo(
    () => collectUsablePosterProfileCandidates([...(performerAsset ? [performerAsset] : []), ...profileVariantAssets, ...savedAssets]),
    [performerAsset, profileVariantAssets, savedAssets],
  );
  const savedPosterCandidateCount = posterCandidateAssets.length;
  const needsMoreProfileCandidatesForProposals = Boolean(
    performerAsset &&
      performerAssetApproved &&
      !selectedAssetNeedsProfileCandidate &&
      !proposalVariantEngineReady &&
      savedPosterCandidateCount < proposalCount,
  );
  const currentAssetCanGenerateProposals = Boolean(performerAsset && performerAssetApproved && !selectedAssetNeedsProfileCandidate && !needsMoreProfileCandidatesForProposals);
  const guidedFlowStage = project || design ? "edit" : proposals.length ? "poster" : performerAssetApproved ? "proposal" : performerAsset ? "profile" : "input";

  useEffect(() => {
    const node = stageShellRef.current;
    if (!node) return;
    const update = () => {
      const width = Math.max(280, node.clientWidth - 24);
      setBaseScale(Math.min(width / 1080, 0.62));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      for (const previewUrl of Object.values(filePreviewUrls)) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      }
    };
  }, [filePreviewUrls]);

  useEffect(() => {
    let mounted = true;
    if (demoMode) {
      return () => {
        mounted = false;
      };
    }
    apiFetch<{ pipeline: PipelineStatus; performerAssets?: PerformerAssetRecord[] }>("/api/performer-asset/generate")
      .then((data) => {
        if (mounted) {
          setPipelineStatus(data.pipeline);
          const assets = data.performerAssets ?? [];
          setSavedAssets(assets);
          setBaselineAsset(assets.find((asset) => isBackgroundBaselineAsset(asset) && parseAssetMetadata(asset.providerMetadataJson).cutoutStatus === "generated") ?? null);
        }
      })
      .catch(() => {
        if (mounted) setPipelineStatus(null);
      });
    return () => {
      mounted = false;
    };
  }, [demoMode]);

  useEffect(() => {
    let mounted = true;
    if (demoMode) {
      return () => {
        mounted = false;
      };
    }
    fetchGenerationRuns(initialPerformance.id)
      .then((runs) => {
        if (mounted) setGenerationRuns(runs);
      })
      .catch(() => {
        if (mounted) setGenerationRuns([]);
      });
    return () => {
      mounted = false;
    };
  }, [demoMode, initialPerformance.id]);

  useEffect(() => {
    let mounted = true;
    if (demoMode) {
      return () => {
        mounted = false;
      };
    }
    fetchPosterProjects(initialPerformance.id)
      .then((projects) => {
        if (mounted) setSavedProjects(projects);
      })
      .catch(() => {
        if (mounted) setSavedProjects([]);
      });
    return () => {
      mounted = false;
    };
  }, [demoMode, initialPerformance.id]);

  async function refreshGenerationRuns() {
    if (demoMode) {
      setGenerationRuns([]);
      return;
    }
    setGenerationRunsLoading(true);
    try {
      setGenerationRuns(await fetchGenerationRuns(initialPerformance.id));
    } catch {
      setMessage("생성 기록을 불러오지 못했습니다.");
    } finally {
      setGenerationRunsLoading(false);
    }
  }

  async function refreshSavedProjects() {
    if (demoMode) {
      setSavedProjects((current) => current);
      return;
    }
    setSavedProjectsLoading(true);
    try {
      setSavedProjects(await fetchPosterProjects(initialPerformance.id));
    } catch {
      setMessage("저장된 편집 작업을 불러오지 못했습니다.");
    } finally {
      setSavedProjectsLoading(false);
    }
  }

  async function uploadReferenceForPose(pose: ReferencePose) {
    const existing = referenceImages[pose];
    if (existing) return existing;
    const file = referenceFiles[pose];
    if (!file && pose !== "front") return null;
    if (demoMode) {
      const sourceUrl = (file ? filePreviewUrls[pose] : "") || initialPerformance.profileImageUrl || "/icon.png";
      const referenceImage = createDemoReferenceImage(pose, sourceUrl);
      setReferenceImages((current) => ({ ...current, [pose]: referenceImage }));
      return referenceImage;
    }
    const formData = new FormData();
    if (file) formData.set("file", file);
    const data = await apiFetch<{ referenceImage: ReferenceImageRecord }>("/api/reference/upload", {
      method: "POST",
      body: formData,
    });
    setReferenceImages((current) => ({ ...current, [pose]: data.referenceImage }));
    return data.referenceImage;
  }

  async function uploadReferencesIfNeeded() {
    setBusy("reference");
    setMessage(referenceFiles.front ? "사용할 사진 업로드 중" : "프로필 사진으로 기본 사진을 준비 중");
    const front = await uploadReferenceForPose("front");
    if (!front) throw new Error("사용할 사진을 준비할 수 없습니다.");
    const [left, right] = await Promise.all([uploadReferenceForPose("left"), uploadReferenceForPose("right")]);
    setBusy(null);
    return { front, left, right };
  }

  async function handlePrepareReferences() {
    try {
      const references = await uploadReferencesIfNeeded();
      const count = [references.front, references.left, references.right].filter(Boolean).length;
      setMessage(`참고 사진 ${count}장이 준비됐습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "참고 사진 준비에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function requestPerformerAsset(regenerate: boolean) {
    if (!personImageConsent) {
      throw new Error("인물 사진 AI 편집 동의가 필요합니다.");
    }
    if (!assetUsageRightsConfirmed) {
      throw new Error("업로드 이미지 사용 권한 확인이 필요합니다.");
    }
    if (generationOptions.identityMode === "pose_synthesis" && !poseSynthesisUnlocked) {
      throw new Error("2단계 포즈 합성은 1단계 배경 교체 baseline과 누끼가 준비된 뒤 실행할 수 있습니다.");
    }
    const references = await uploadReferencesIfNeeded();
    if (demoMode) {
      setBusy("asset");
      setMessage("개발용 프로필 에셋과 누끼를 준비하는 중");
      const performerAsset = createDemoPerformerAsset({
        imageUrl: references.front.thumbnailUrl,
        referenceImageId: references.front.id,
        mode: "background-replace",
        label: "개발용 에셋",
      });
      rememberPerformerAsset(performerAsset);
      setMessage("개발용 프로필 에셋과 누끼가 준비됐습니다. 프로필 후보를 만들거나 승인 흐름을 확인할 수 있습니다.");
      return performerAsset;
    }
    setBusy("asset");
    setMessage(assetGenerationProgressMessage(generationOptions.identityMode, generationIsLive));
    const data = await apiFetch<{ performerAsset: PerformerAssetRecord }>("/api/performer-asset/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referenceImageId: references.front.id,
        referenceImageIds: {
          front: references.front.id,
          left: references.left?.id,
          right: references.right?.id,
        },
        options: generationOptions,
        baselineAssetId: generationOptions.identityMode === "pose_synthesis" ? baselineAsset?.id : undefined,
        consentToPersonImageProcessing: personImageConsent,
        usageRightsConfirmed: assetUsageRightsConfirmed,
        regenerate,
      }),
    });
    rememberPerformerAsset(data.performerAsset);
    setMessage(assetReadyMessage(data.performerAsset, pipelineStatus));
    return data.performerAsset;
  }

  async function resolveProfileVariantReferencePayload(asset: PerformerAssetRecord) {
    let frontId = referenceImages.front?.id ?? asset.referenceImageId;
    let leftId = referenceImages.left?.id;
    let rightId = referenceImages.right?.id;

    if (!frontId) {
      const references = await uploadReferencesIfNeeded();
      frontId = references.front.id;
      leftId = references.left?.id;
      rightId = references.right?.id;
    }

    return {
      referenceImageId: frontId,
      referenceImageIds: {
        front: frontId,
        left: leftId,
        right: rightId,
      },
    };
  }

  async function handleGenerateProfileVariants(assetOverride?: PerformerAssetRecord): Promise<PerformerAssetRecord[]> {
    try {
      const targetAsset = assetOverride ?? performerAsset;
      const targetMetadata = parseAssetMetadata(targetAsset?.providerMetadataJson);
      if (!targetAsset) {
        setMessage("먼저 사용할 프로필 에셋과 누끼를 준비해 주세요.");
        return [];
      }
      if (!personImageConsent) {
        setMessage("인물 사진 AI 편집 동의가 필요합니다.");
        return [];
      }
      if (!assetUsageRightsConfirmed) {
        setMessage("업로드 이미지 사용 권한 확인이 필요합니다.");
        return [];
      }
      if (targetMetadata.cutoutStatus !== "generated") {
        setMessage("프로필 후보 생성에는 누끼가 완료된 에셋이 필요합니다.");
        return [];
      }
      if (demoMode) {
        setPerformerAsset(targetAsset);
        setBusy("profile-variants");
        setProfileVariantAssets([]);
        setProfileVariantFailures([]);
        setMessage(`${profileVariantCount}개 개발용 프로필 후보를 만드는 중`);
        const generatedAssets = createDemoProfileVariantAssets(targetAsset, profileVariantCount);
        for (const asset of generatedAssets) rememberSavedAsset(asset);
        setProfileVariantAssets(generatedAssets);
        setMessage(`개발용 프로필 후보 ${generatedAssets.length}개가 생성됐습니다. 하나를 선택하면 포스터 시안으로 이어집니다.`);
        window.requestAnimationFrame(() => profileVariantPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
        return generatedAssets;
      }

      setPerformerAsset(targetAsset);
      const referencePayload = await resolveProfileVariantReferencePayload(targetAsset);
      setBusy("profile-variants");
      setProfileVariantAssets([]);
      setProfileVariantFailures([]);
      const profileTemplates = selectProfileVariantDirections(profileVariantCount);
      const maxVariantAttempts = Math.min(10, profileVariantCount + 2);
      setMessage(`${profileVariantCount}개 프로필 후보 생성 중: 선택된 템플릿 슬롯으로 얼굴 방향을 고정합니다.`);

      const generatedAssets: PerformerAssetRecord[] = [];
      const failedVariants: ProfileVariantFailureRecord[] = [];
      for (let attemptIndex = 0; generatedAssets.length < profileVariantCount && attemptIndex < maxVariantAttempts; attemptIndex += 1) {
        const direction = profileVariantDirections[attemptIndex] ?? profileTemplates[attemptIndex % profileTemplates.length] ?? profileVariantDirections[0];
        const attemptLabel = attemptIndex >= profileVariantCount ? "보충 " : "";
        setMessage(`${attemptIndex + 1}/${maxVariantAttempts} ${attemptLabel}${direction.label} 프로필 후보 생성 중 · 통과 ${generatedAssets.length}/${profileVariantCount}`);
        try {
          const data = await apiFetch<{ performerAsset: PerformerAssetRecord }>("/api/performer-asset/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...referencePayload,
              options: {
                ...generationOptions,
                identityMode: "portrait_variant",
                style: direction.style,
                backgroundPolicy: direction.backgroundPolicy,
                mood: direction.mood,
                stylePrompt: [
                  `Variant attempt ${attemptIndex + 1} for ${profileVariantCount} accepted profile candidates: ${direction.stylePrompt}`,
                  "This candidate must be visibly different from the baseline in body pose, hands, arms, crop, or instrument/performance context. Changing only the background is not enough.",
                ]
                  .filter(Boolean)
                  .join("\n"),
                actionPrompt: [
                  direction.actionPrompt,
                  "Keep the face camera angle, gaze direction, and facial proportions close to the approved asset. Change body, hands, arms, instrument staging, seated/standing posture, or lower-body composition instead.",
                ]
                  .filter(Boolean)
                  .join("\n"),
                useDefaultProfileFallback: false,
              },
              baselineAssetId: targetAsset.id,
              consentToPersonImageProcessing: personImageConsent,
              usageRightsConfirmed: assetUsageRightsConfirmed,
              regenerate: true,
            }),
          });
          generatedAssets.push(data.performerAsset);
          generatedAssets.sort(compareProfileVariantAssets);
          rememberSavedAsset(data.performerAsset);
          setProfileVariantAssets([...generatedAssets]);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "생성 실패";
          const failure = { index: attemptIndex, label: direction.label, reason };
          failedVariants.push(failure);
          setProfileVariantFailures([...failedVariants]);
          setMessage(`${attemptIndex + 1}/${maxVariantAttempts} ${direction.label} 실패. 통과 후보가 부족하면 보충 생성합니다.`);
        }
      }

      if (!generatedAssets.length) {
        setMessage(
          `프로필 후보 생성에 실패했습니다. ${
            failedVariants[0] ? `${failedVariants[0].label} - ${failedVariants[0].reason}` : "사진/프롬프트를 조금 단순하게 바꿔 다시 시도해 주세요."
          }`,
        );
        return [];
      }
      setMessage(
        failedVariants.length
          ? `프로필 후보 ${generatedAssets.length}/${profileVariantCount}개가 생성됐습니다. 얼굴 게이트 탈락/실패 ${failedVariants.length}개: ${failedVariants[0]?.label} - ${failedVariants[0]?.reason}`
          : `프로필 후보 ${generatedAssets.length}개가 생성됐습니다. 가장 닮고 포즈가 쓸만한 프로필 후보를 선택하세요.`,
      );
      window.requestAnimationFrame(() => profileVariantPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return generatedAssets;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "프로필 후보 생성에 실패했습니다.");
      return [];
    } finally {
      setBusy(null);
    }
  }

  function rememberPerformerAsset(asset: PerformerAssetRecord) {
    setPerformerAsset(asset);
    setProfileVariantAssets([]);
    setProfileVariantFailures([]);
    setOrchestrationPlan(null);
    setOrchestrationRun(null);
    rememberSavedAsset(asset);
  }

  function rememberSavedAsset(asset: PerformerAssetRecord) {
    if (isBackgroundBaselineAsset(asset)) {
      setBaselineAsset(asset);
    }
    setSavedAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)].slice(0, 12));
  }

  function handleSelectSavedAsset(asset: PerformerAssetRecord) {
    const metadata = parseAssetMetadata(asset.providerMetadataJson);
    setPerformerAsset(asset);
    if (isBackgroundBaselineAsset(asset)) {
      setBaselineAsset(asset);
    }
    if (isPosterReadyPerformerAsset(asset, metadata) && metadata.cutoutStatus === "generated") {
      setApprovedAssetIds((current) => new Set(current).add(asset.id));
    }
    setProposals([]);
    setProject(null);
    setDesign(null);
    setSelectedLayerId(null);
    setProfileVariantAssets([]);
    setProfileVariantFailures([]);
    setOrchestrationPlan(null);
    setOrchestrationRun(null);
    setMessage(
      isPosterReadyPerformerAsset(asset, metadata) && metadata.cutoutStatus === "generated"
        ? "저장된 프로필 후보를 포스터용 고정 에셋으로 선택했습니다. 바로 포스터 시안을 만들 수 있습니다."
        : `${assetReadyMessage(asset, pipelineStatus)} 이 에셋은 카드의 프로필 후보 만들기로 이어서 쓸 수 있습니다.`,
    );
  }

  function handleUseProfileVariant(asset: PerformerAssetRecord) {
    setPerformerAsset(asset);
    setApprovedAssetIds((current) => new Set(current).add(asset.id));
    setProposals([]);
    setProject(null);
    setDesign(null);
    setSelectedLayerId(null);
    setOrchestrationPlan(null);
    setOrchestrationRun(null);
    setMessage("선택한 프로필 후보를 포스터용 고정 에셋으로 승인했습니다. 이제 포스터 시안을 만들 수 있습니다.");
  }

  async function handleGenerateAsset() {
    try {
      await requestPerformerAsset(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "연주자 에셋 생성에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePrepareGuidedPosterBatch() {
    try {
      if (!personImageConsent) {
        setMessage("인물 사진 AI 편집 동의가 필요합니다.");
        return;
      }
      if (!assetUsageRightsConfirmed) {
        setMessage("업로드 이미지 사용 권한 확인이 필요합니다.");
        return;
      }

      const selectedAsset = performerAsset;
      const selectedMetadata = parseAssetMetadata(selectedAsset?.providerMetadataJson);
      if (selectedAsset && isPosterReadyPerformerAsset(selectedAsset, selectedMetadata) && approvedAssetIds.has(selectedAsset.id)) {
        await handleGenerateProposals(selectedAsset);
        return;
      }

      setBusy("guided-flow");
      setMessage("전체 시안 준비 중: 연주자 에셋을 만들고 프로필 후보까지 이어서 준비합니다.");
      const sourceAsset =
        selectedAsset && selectedMetadata.cutoutStatus === "generated"
          ? selectedAsset
          : await requestPerformerAsset(Boolean(selectedAsset));
      const sourceMetadata = parseAssetMetadata(sourceAsset.providerMetadataJson);

      if (isPosterReadyPerformerAsset(sourceAsset, sourceMetadata)) {
        setPerformerAsset(sourceAsset);
        setApprovedAssetIds((current) => new Set(current).add(sourceAsset.id));
        setMessage("포스터용 프로필 후보가 준비됐습니다. 바로 포스터 시안을 생성합니다.");
        await handleGenerateProposals(sourceAsset, true);
        return;
      }

      if (sourceMetadata.cutoutStatus !== "generated") {
        setMessage("누끼가 안정적으로 준비되지 않아 프로필 후보 생성 전에 멈췄습니다. 사진을 다시 확인해 주세요.");
        return;
      }

      const generatedAssets = await handleGenerateProfileVariants(sourceAsset);
      if (!generatedAssets.length) return;

      setMessage(`전체 시안 준비 완료: 프로필 후보 ${generatedAssets.length}개 중 가장 닮은 것을 선택하면 포스터 시안으로 이어집니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "전체 시안 준비에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateProposals(assetOverride?: PerformerAssetRecord, approveOverride = false) {
    try {
      const selectedAsset = assetOverride ?? performerAsset;
      const selectedMetadata = assetOverride ? parseAssetMetadata(assetOverride.providerMetadataJson) : assetMetadata;
      if (selectedAsset && !isPosterReadyPerformerAsset(selectedAsset, selectedMetadata)) {
        setPerformerAsset(selectedAsset);
        setMessage("지금 선택된 에셋은 포스터 시안에 바로 넣지 않습니다. 먼저 누끼 기반 프로필 후보를 만들고, 프로필 후보 중 하나를 선택해 주세요.");
        return;
      }
      if (selectedAsset && approveOverride) {
        setApprovedAssetIds((current) => new Set(current).add(selectedAsset.id));
      }
      if (selectedAsset && !approveOverride && !approvedAssetIds.has(selectedAsset.id)) {
        setPerformerAsset(selectedAsset);
        setMessage("먼저 사용할 프로필 후보 에셋을 승인해 주세요.");
        return;
      }
      const asset =
        selectedAsset && selectedMetadata.cutoutStatus !== "fallback_source" && selectedMetadata.cutoutStatus !== "not_attempted"
          ? selectedAsset
          : assetReadyForProposals && performerAsset
            ? performerAsset
            : await requestPerformerAsset(Boolean(performerAsset));
      const nextAssetMetadata = parseAssetMetadata(asset.providerMetadataJson);
      if (!isPosterReadyPerformerAsset(asset, nextAssetMetadata)) {
        setPerformerAsset(asset);
        setMessage("누끼 에셋이 준비됐습니다. 포스터 시안 전에 이 에셋으로 프로필 후보를 만들고 하나를 선택해 주세요.");
        return;
      }
      if (!approveOverride && !approvedAssetIds.has(asset.id)) {
        setPerformerAsset(asset);
        setMessage("프로필 후보가 준비됐습니다. 미리보기에서 승인한 뒤 포스터 시안을 생성해 주세요.");
        return;
      }
      if (!proposalVariantEngineReady && savedPosterCandidateCount < proposalCount) {
        setPerformerAsset(asset);
        setMessage(`복붙 포스터 시안을 막기 위해 프로필 후보가 더 필요합니다. 현재 ${savedPosterCandidateCount}/${proposalCount}개입니다. 먼저 프로필 후보 ${proposalCount}개를 만들어 주세요.`);
        return;
      }
      setPerformerAsset(asset);
      setBusy("proposals");
      const promptForRequest = orchestrationPrompt.trim();
      const candidateAssetIds = collectUsablePosterProfileCandidates([asset, ...profileVariantAssets, ...savedAssets]).map((candidate) => candidate.id);
      setMessage(
        promptForRequest
          ? `${proposalCount}개 포스터 시안 생성 중: 선택한 방향 템플릿으로 생성 계획을 만듭니다.`
          : `${proposalCount}개 포스터 시안 생성 중: 기본 템플릿 계획으로 만듭니다.`,
      );
      if (demoMode) {
        const demo = createDemoPosterProposals({
          asset,
          count: proposalCount,
          concertInfo,
          prompt: promptForRequest,
        });
        setProposals(demo.proposals);
        setOrchestrationPlan(demo.orchestrationPlan);
        setOrchestrationRun(demo.orchestrationRun);
        setProject(null);
        setDesign(null);
        setSelectedLayerId(null);
        window.requestAnimationFrame(() => proposalSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
        setMessage(`개발용 포스터 시안 ${demo.proposals.length}개가 생성됐습니다. 시안을 눌러 편집 화면을 확인하세요.`);
        return;
      }
      const data = await apiFetch<{ proposals: ProposalRecord[]; orchestrationPlan?: PosterGenerationPlanRecord; orchestrationRun?: PosterGenerationRunRecord }>("/api/poster-proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          performerAssetId: asset.id,
          candidateAssetIds,
          performanceId: initialPerformance.id,
          proposalCount,
          orchestrationPrompt: promptForRequest,
          concertInfo,
        }),
      });
      setProposals(data.proposals);
      setOrchestrationPlan(data.orchestrationPlan ?? null);
      setOrchestrationRun(data.orchestrationRun ?? null);
      setProject(null);
      setDesign(null);
      setSelectedLayerId(null);
      await refreshGenerationRuns();
      window.requestAnimationFrame(() => proposalSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      setMessage(`포스터 시안 ${data.proposals.length}개가 생성됐습니다.${data.orchestrationPlan?.summary ? ` 계획: ${data.orchestrationPlan.summary}` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "포스터 시안 생성에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSelectProposal(proposal: ProposalRecord) {
    try {
      setBusy(`proposal-${proposal.id}`);
      setMessage(`${proposal.title} 포스터 시안을 편집 프로젝트로 여는 중`);
      if (demoMode) {
        const editableDesign = JSON.parse(proposal.editableDesignJson) as PosterDesign;
        const demoProject = createDemoProject({
          title: `${initialPerformance.title} 포스터`,
          editableDesign,
          proposal,
        });
        setProject(demoProject);
        setDesign(editableDesign);
        setSelectedLayerId(editableDesign.layers.find((layer) => layer.type === "text")?.id ?? null);
        window.requestAnimationFrame(() => editorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
        setMessage("개발용 포스터 시안을 편집 화면으로 열었습니다.");
        return;
      }
      const data = await apiFetch<{ project: ProjectRecord }>("/api/poster-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: proposal.id,
          title: `${initialPerformance.title} 포스터`,
        }),
      });
      setProject(data.project);
      setDesign(data.project.editableDesign);
      setSelectedLayerId(data.project.editableDesign.layers.find((layer) => layer.type === "text")?.id ?? null);
      await refreshSavedProjects();
      window.requestAnimationFrame(() => editorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      setMessage("포스터 시안을 열었습니다. 텍스트, 이미지, QR을 부분 수정할 수 있습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "포스터 시안을 열 수 없습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleImportPosterFile(file: File | null) {
    if (!file) return;
    try {
      setBusy("poster-import");
      setMessage("업로드 포스터를 편집 프로젝트로 여는 중");
      const upload = demoMode
        ? await createDemoUploadedImageRecord(file)
        : await (() => {
            const formData = new FormData();
            formData.set("file", file);
            formData.set("purpose", "poster");
            return apiFetch<UploadedImageRecord>("/api/uploads/image", {
              method: "POST",
              body: formData,
            });
          })();
      const importedDesign = buildImportedPosterDesign({
        imageUrl: upload.url,
        width: upload.width,
        height: upload.height,
        targetCanvas: resolvePosterImportCanvas(posterImportSettings, upload),
        objectFit: posterImportSettings.fit,
        title: concertInfo.title || initialPerformance.title,
        qrTargetType: concertInfo.qrTargetType as PosterDesign["qrTargetType"],
        qrTargetUrl: concertInfo.qrTargetUrl,
      });
      const nextProject = demoMode
        ? createDemoProject({ title: `${initialPerformance.title} 업로드 포스터`, editableDesign: importedDesign })
        : (
            await apiFetch<{ project: ProjectRecord }>("/api/poster-projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                performanceId: initialPerformance.id,
                title: `${initialPerformance.title} 업로드 포스터`,
                editableDesign: importedDesign,
              }),
            })
          ).project;
      setProject(nextProject);
      setDesign(nextProject.editableDesign);
      setSelectedLayerId("uploaded-poster");
      setProposals([]);
      await refreshSavedProjects();
      window.requestAnimationFrame(() => editorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      setMessage("업로드 포스터를 열었습니다. 포스터는 잠금 상태이며, 문구/QR/도형을 위에 추가해서 편집할 수 있습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "포스터를 가져오지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleLoadProject(projectId: string) {
    try {
      setBusy(`project-${projectId}`);
      setMessage("저장된 작업을 간단 편집으로 여는 중");
      const data = await apiFetch<{ project: ProjectRecord }>(`/api/poster-projects/${projectId}`);
      setProject(data.project);
      setDesign(data.project.editableDesign);
      setSelectedLayerId(data.project.editableDesign.layers.find((layer) => layer.type === "text")?.id ?? null);
      window.requestAnimationFrame(() => editorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      setMessage("저장된 작업을 간단 편집으로 불러왔습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장된 작업을 불러오지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRunPosterOcr(layer: PosterImageLayer) {
    if (!design) return;
    try {
      setBusy("poster-ocr");
      setMessage("포스터 글자를 OCR로 인식하는 중");
      const data = await apiFetch<PosterOcrResponse>("/api/poster-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: layer.src,
          minConfidence: 38,
        }),
      });
      const sourceLayer = design.layers.find((item): item is PosterImageLayer => item.id === layer.id && item.type === "image");
      if (!sourceLayer) throw new Error("포스터 레이어를 찾을 수 없습니다.");
      const textPrefix = `ocr-text-${sourceLayer.id}-`;
      const coverPrefix = `ocr-cover-${sourceLayer.id}-`;
      const textLayers = data.items.map((item, index) => createOcrTextLayer(sourceLayer, item, textPrefix, index));
      const coverPatches = data.items.map((item, index) => createOcrCoverPatch(sourceLayer, item, coverPrefix, index));

      updateDesign((current) => ({
        ...current,
        layers: current.layers
          .filter((item) => !item.id.startsWith(textPrefix))
          .flatMap((item) => {
            if (item.id !== sourceLayer.id || item.type !== "image") return [item];
            return [
              {
                ...item,
                coverPatches: [...(item.coverPatches ?? []).filter((patch) => !patch.id.startsWith(coverPrefix)), ...coverPatches],
              },
              ...textLayers,
            ];
          }),
      }));
      setSelectedLayerId(sourceLayer.id);
      setMessage(`${data.items.length}개 문구를 인식했습니다. 오른쪽 패널의 OCR 문구 목록에서 바로 수정할 수 있습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "포스터 OCR 인식에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveProject() {
    if (!project || !design) return;
    try {
      setBusy("save");
      if (demoMode) {
        const updated = {
          ...project,
          editableDesign: design,
          updatedAt: new Date().toISOString(),
        };
        setProject(updated);
        setDesign(updated.editableDesign);
        setMessage("개발용 작업 저장 상태를 갱신했습니다.");
        return;
      }
      const data = await apiFetch<{ project: ProjectRecord }>(`/api/poster-projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project.title,
          editableDesign: design,
        }),
      });
      setProject(data.project);
      setDesign(data.project.editableDesign);
      await refreshSavedProjects();
      setMessage("작업을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleExportProject() {
    if (!project || !design) return;
    try {
      setBusy("export");
      if (demoMode) {
        setMessage("개발용 모드에서는 실제 PNG 파일을 저장하지 않고 편집 화면만 검증합니다.");
        return;
      }
      const data = await apiFetch<{ exportUrl: string; project: ProjectRecord }>(`/api/poster-projects/${project.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "png",
          editableDesign: design,
        }),
      });
      setProject(data.project);
      await refreshSavedProjects();
      setMessage("PNG 내보내기가 완료됐습니다.");
      window.open(data.exportUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "내보내기에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  function updateDesign(updater: (current: PosterDesign) => PosterDesign) {
    setDesign((current) => (current ? updater(current) : current));
  }

  function updateSelectedLayer(patch: Partial<PosterLayer>) {
    if (!selectedLayerId) return;
    updateDesign((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === selectedLayerId ? ({ ...layer, ...patch } as PosterLayer) : layer)),
    }));
  }

  function updateTypedLayer<T extends PosterLayer>(layerId: string, updater: (layer: T) => T) {
    updateDesign((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === layerId ? (updater(layer as T) as PosterLayer) : layer)),
    }));
  }

  function fitLayerToCanvas(layerId: string, fit: PosterImageLayer["objectFit"]) {
    if (!design) return;
    updateTypedLayer<PosterImageLayer>(layerId, (layer) => ({
      ...layer,
      x: 0,
      y: 0,
      width: design.canvas.width,
      height: design.canvas.height,
      objectFit: fit,
      objectPosition: "50% 50%",
    }));
  }

  function updateCanvasSize(width: number, height: number) {
    if (!design) return;
    const nextWidth = Math.max(240, Math.min(3200, Math.round(width)));
    const nextHeight = Math.max(240, Math.min(3200, Math.round(height)));
    updateDesign((current) => {
      const ratioX = nextWidth / current.canvas.width;
      const ratioY = nextHeight / current.canvas.height;
      return {
        ...current,
        canvas: {
          ...current.canvas,
          width: nextWidth,
          height: nextHeight,
        },
        layers: current.layers.map((layer) => ({
          ...layer,
          x: Math.round(layer.x * ratioX),
          y: Math.round(layer.y * ratioY),
          width: Math.round(layer.width * ratioX),
          height: Math.round(layer.height * ratioY),
        })) as PosterLayer[],
      };
    });
  }

  function addTextLayer() {
    if (!design) return;
    const id = `text-${Date.now()}`;
    const layer: PosterTextLayer = {
      id,
      name: "문구",
      type: "text",
      text: "새 문구",
      x: 120,
      y: 1120,
      width: 560,
      height: 80,
      fontFamily: "poster-nanum-gothic",
      fontSize: 42,
      fontWeight: 800,
      color: "#111111",
      align: "left",
      lineHeight: 1.1,
      visible: true,
      opacity: 1,
    };
    updateDesign((current) => ({ ...current, layers: [...current.layers, layer] }));
    setSelectedLayerId(id);
  }

  function addQrLayer() {
    if (!design) return;
    const id = `qr-${Date.now()}`;
    const layer: PosterQrLayer = {
      id,
      name: "QR",
      type: "qr",
      targetType: concertInfo.qrTargetType as PosterQrLayer["targetType"],
      targetUrl: concertInfo.qrTargetUrl || design.qrTargetUrl,
      x: 860,
      y: 1130,
      width: 120,
      height: 120,
      foreground: "#111111",
      background: "#ffffff",
      caption: "QR",
      visible: true,
      opacity: 1,
    };
    updateDesign((current) => ({ ...current, layers: [...current.layers, layer] }));
    setSelectedLayerId(id);
  }

  function handleLayerPointerDown(event: React.PointerEvent<HTMLDivElement>, layer: PosterLayer) {
    if (!design) return;
    event.stopPropagation();
    setSelectedLayerId(layer.id);
    if (layer.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id: layer.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      layerX: layer.x,
      layerY: layer.y,
    });
  }

  function handleRegionPointerDown(
    event: React.PointerEvent<HTMLElement>,
    layer: PosterImageLayer,
    regionKind: RegionDragState["regionKind"],
    regionId: string,
    mode: RegionDragState["mode"],
  ) {
    const region = regionKind === "protected" ? layer.protectedAreas?.find((area) => area.id === regionId) : layer.coverPatches?.find((patch) => patch.id === regionId);
    if (!region) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedLayerId(layer.id);
    setRegionDrag({
      layerId: layer.id,
      regionId,
      regionKind,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
    });
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (regionDrag && design) {
      const dx = (event.clientX - regionDrag.startX) / scale;
      const dy = (event.clientY - regionDrag.startY) / scale;
      updateTypedLayer<PosterImageLayer>(regionDrag.layerId, (layer) => updateDraggedImageRegion(layer, regionDrag, dx, dy));
      return;
    }
    if (!drag || !design) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    updateTypedLayer<PosterLayer>(drag.id, (layer) => ({
      ...layer,
      ...snapLayerToCanvas(
        {
          x: Math.round(Math.max(-400, Math.min(design.canvas.width + 200, drag.layerX + dx))),
          y: Math.round(Math.max(-400, Math.min(design.canvas.height + 200, drag.layerY + dy))),
          width: layer.width,
          height: layer.height,
        },
        design.canvas.width,
        design.canvas.height,
      ),
    }));
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!design) return;
    event.preventDefault();
    const next = Math.max(0.5, Math.min(1.8, zoom - event.deltaY * 0.0015));
    setZoom(next);
  }

  const referencePreview = (pose: ReferencePose) =>
    filePreviewUrls[pose] || referenceImages[pose]?.thumbnailUrl || (pose === "front" ? initialPerformance.profileImageUrl : "");

  function handleReferenceFileChange(pose: ReferencePose, file: File | null) {
    setReferenceFiles((current) => ({ ...current, [pose]: file ?? undefined }));
    setReferenceImages((current) => ({ ...current, [pose]: undefined }));
    setPerformerAsset(null);
    setBaselineAsset(null);
    setProposals([]);
    setApprovedAssetIds(new Set());
  }

  function updateGenerationOptions(patch: Partial<typeof generationOptions>) {
    setGenerationOptions((current) => ({ ...current, ...patch }));
    setPerformerAsset(null);
    setProposals([]);
  }

  function applyPosterPromptPreset(preset: (typeof posterPromptPresets)[number]) {
    setPosterBriefTemplateId(preset.id);
    setOrchestrationPrompt(preset.value);
  }

  const guidedStageIndex = ["input", "profile", "proposal", "poster", "edit"].indexOf(guidedFlowStage);
  const guidedStageCopy =
    guidedFlowStage === "input"
      ? "공연 정보와 연주자 사진을 넣고 전체 시안 준비를 누르면 프로필 후보까지 이어서 준비합니다."
      : guidedFlowStage === "profile"
        ? "얼굴이 가장 닮고 홍보물에 어울리는 프로필 후보를 하나 고르면 됩니다."
        : guidedFlowStage === "proposal"
          ? "승인한 프로필 후보로 포스터 시안을 만들 차례입니다."
          : guidedFlowStage === "poster"
            ? "마음에 드는 포스터 시안을 선택하면 간단 편집으로 넘어갑니다."
            : "간단 편집에서 문구, QR, 색감, 위치를 정리하고 저장하면 됩니다.";
  const workProgress = buildWorkProgress({
    busy,
    message,
    proposalCount,
    profileVariantCount,
    faceCandidatePoolSize: pipelineStatus?.faceIdentity?.maxAttempts ?? 10,
    proposalCandidatePoolSize: pipelineStatus?.proposalVariants?.candidatePoolSize ?? 10,
  });

  return (
    <div className="ai-poster-studio">
      {workProgress ? <WorkProgress progress={workProgress} /> : null}
      <section className="ai-start-panel">
        <div>
          <p className="section-eyebrow">POSTER START</p>
          <h2>시작 방식 선택</h2>
          <span>갖고 있는 포스터를 바로 열거나, 연주자 사진으로 새 포스터 시안을 만들 수 있습니다.</span>
        </div>
        <div className="ai-start-actions">
          <PosterUploadButton busy={busy} primary onFile={handleImportPosterFile}>
            기존 포스터 업로드
          </PosterUploadButton>
          <Button type="button" variant="secondary" onClick={() => document.getElementById("poster-ai-setup")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            <Sparkles size={16} />
            AI 포스터 시안 만들기
          </Button>
        </div>
      </section>

      <section className="ai-guided-flow-panel" aria-label="홍보물 제작 흐름">
        <div className="ai-guided-flow-steps">
          {[
            ["input", "자료 넣기"],
            ["profile", "프로필 고르기"],
            ["proposal", "시안 만들기"],
            ["poster", "포스터 고르기"],
            ["edit", "편집하기"],
          ].map(([key, label], index) => (
            <span key={key} className={index < guidedStageIndex ? "done" : index === guidedStageIndex ? "active" : ""}>
              {label}
            </span>
          ))}
        </div>
        <strong>{guidedStageCopy}</strong>
      </section>

      <section className="ai-poster-setup" id="poster-ai-setup">
        <div className="ai-poster-panel">
          <div className="ai-poster-panel-head">
            <Sparkles size={18} />
            <h2>포스터 시안 만들기</h2>
          </div>
          <label className="ai-field">
            <span>공연 제목</span>
            <input value={concertInfo.title} onChange={(event) => setConcertInfo({ ...concertInfo, title: event.target.value })} />
          </label>
          <label className="ai-field">
            <span>연주자</span>
            <input value={concertInfo.performerName} onChange={(event) => setConcertInfo({ ...concertInfo, performerName: event.target.value })} />
          </label>
          <label className="ai-field">
            <span>프로그램/부제</span>
            <textarea value={concertInfo.program || concertInfo.subtitle} onChange={(event) => setConcertInfo({ ...concertInfo, program: event.target.value })} />
          </label>
          <div className="ai-field-grid">
            <label className="ai-field">
              <span>일시</span>
              <input value={concertInfo.dateText} onChange={(event) => setConcertInfo({ ...concertInfo, dateText: event.target.value })} />
            </label>
            <label className="ai-field">
              <span>장소</span>
              <input value={concertInfo.venueName} onChange={(event) => setConcertInfo({ ...concertInfo, venueName: event.target.value })} />
            </label>
          </div>
          <div className="ai-field ai-prompt-field">
            <span>포스터 방향 템플릿</span>
            <div className="ai-prompt-presets is-template-grid">
              {posterPromptPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={posterBriefTemplateId === preset.id ? "active" : ""}
                  onClick={() => applyPosterPromptPreset(preset)}
                >
                  <strong>{preset.label}</strong>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
            <div className="ai-prompt-status">
              <span>선택한 템플릿 기준으로 포스터 시안을 만듭니다.</span>
            </div>
          </div>
          <div className="ai-generation-inline">
            <div className="ai-field">
              <span>포스터 시안 수</span>
              <div className="segmented-control proposal-count-control" role="group" aria-label="포스터 시안 수 선택">
                {posterProposalCountOptions.map((count) => (
                  <button key={count} type="button" className={proposalCount === count ? "active" : ""} onClick={() => setProposalCount(count)}>
                    {count}개
                  </button>
                ))}
              </div>
            </div>
            {needsMoreProfileCandidatesForProposals ? (
              <div className="ai-profile-shortage">
                <strong>프로필 후보 부족</strong>
                <span>
                  {savedPosterCandidateCount}/{proposalCount}개 준비됨 · 같은 누끼 복붙 포스터 시안은 만들지 않습니다.
                </span>
                <Button type="button" variant="secondary" onClick={() => handleGenerateProfileVariants()} disabled={Boolean(busy) || !hasTransparentCutout}>
                  {busy === "profile-variants" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
                  프로필 후보 {proposalCount}개 만들기
                </Button>
              </div>
            ) : null}
            <Button
              type="button"
              onClick={() => handleGenerateProposals()}
              disabled={Boolean(busy) || Boolean(performerAsset && (!performerAssetApproved || selectedAssetNeedsProfileCandidate || needsMoreProfileCandidatesForProposals))}
              className="w-full"
            >
              {busy === "proposals" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
              {performerAsset && selectedAssetNeedsProfileCandidate
                ? "프로필 후보 선택 후 포스터 시안 만들기"
                : performerAsset && needsMoreProfileCandidatesForProposals
                  ? `프로필 후보 ${proposalCount}개 먼저 만들기`
                  : performerAsset && !performerAssetApproved
                    ? "프로필 후보 승인 후 포스터 시안 만들기"
                    : `${proposalCount}개 포스터 시안 만들기`}
            </Button>
            <details className="ai-operator-panel">
              <summary>생성 상태 / 기록</summary>
              <div className="ai-operator-panel-body">
                {pipelineStatus?.proposalVariants ? (
                  <p className={pipelineStatus.proposalVariants.ready ? "ai-pipeline-note is-ready" : "ai-pipeline-note is-blocked"}>
                    {proposalVariantStatusLabel(pipelineStatus.proposalVariants, proposalCount)}
                  </p>
                ) : null}
                {orchestrationPlan ? (
                  <div className="ai-orchestration-plan">
                    <strong>생성 계획</strong>
                    <span>{orchestrationPlan.summary}</span>
                    {orchestrationRun ? (
                      <em>
                        실행: {orchestrationRun.plannerProvider} / {orchestrationRun.proposalsCreated ?? proposals.length}개
                      </em>
                    ) : null}
                    {orchestrationRun?.fallbackReason ? <em>planner fallback: {orchestrationRun.fallbackReason}</em> : null}
                    {orchestrationPlan.layoutJob?.templateIds?.length ? <em>템플릿: {orchestrationPlan.layoutJob.templateIds.join(", ")}</em> : null}
                    {orchestrationPlan.warnings?.length ? (
                      <ul>
                        {orchestrationPlan.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <GenerationRunHistory
                  runs={generationRuns}
                  loading={generationRunsLoading}
                  onRefresh={refreshGenerationRuns}
                />
              </div>
            </details>
            {message ? <p className="ai-status">{message}</p> : null}
          </div>
        </div>

        <div className="ai-poster-panel ai-poster-import-panel">
          <div className="ai-poster-panel-head">
            <Palette size={18} />
            <h2>포스터 가져오기</h2>
          </div>
          <PosterImportControls
            busy={busy}
            settings={posterImportSettings}
            onSettingsChange={setPosterImportSettings}
            onFile={handleImportPosterFile}
          />
        </div>

        <div className="ai-poster-panel">
          <div className="ai-poster-panel-head">
            <ImageIcon size={18} />
            <h2>연주자 사진</h2>
          </div>
          <div className="ai-reference-grid">
            {referencePoseOptions.map((pose) => {
              const preview = referencePreview(pose.value);
              const file = referenceFiles[pose.value];
              return (
                <label key={pose.value} className="ai-upload-box ai-reference-upload">
                  <strong>{pose.label}</strong>
                  {preview ? <img src={preview} alt="" /> : <ImageIcon size={28} />}
                  <span>{file ? file.name : pose.fallbackLabel}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => handleReferenceFileChange(pose.value, event.target.files?.[0] ?? null)}
                  />
                </label>
              );
            })}
          </div>
          <div className="ai-consent-box">
            <label className="ai-checkbox-field">
              <input type="checkbox" checked={personImageConsent} onChange={(event) => setPersonImageConsent(event.target.checked)} />
              <span>이 사진은 본인 또는 사용 권한이 있는 인물의 사진이며, 공연 포스터 제작용 AI 편집에 동의합니다.</span>
            </label>
            <label className="ai-checkbox-field">
              <input type="checkbox" checked={assetUsageRightsConfirmed} onChange={(event) => setAssetUsageRightsConfirmed(event.target.checked)} />
              <span>이 이미지를 공연 포스터 제작에 사용할 권한이 있습니다.</span>
            </label>
          </div>
          <label className="ai-field">
            <span>악기/파트</span>
            <input
              value={generationOptions.instrument}
              onChange={(event) => updateGenerationOptions({ instrument: event.target.value })}
              placeholder="예: 피아노, 첼로, 성악"
            />
          </label>
          <div className="ai-guided-cta-card">
            <strong>전체 시안 준비</strong>
            <span>사진을 프로필 후보로 정리한 뒤, 가장 닮은 후보를 고르면 포스터 시안으로 이어집니다.</span>
            <Button type="button" onClick={handlePrepareGuidedPosterBatch} disabled={assetGenerationDisabled}>
              {busy === "guided-flow" || busy === "profile-variants" || busy === "proposals" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
              전체 시안 준비
            </Button>
          </div>
          <details className="ai-advanced-panel">
            <summary>고급 설정 / 재시도</summary>
            <div className="ai-advanced-panel-body">
              {pipelineStatus ? (
                <div className={generationIsLive ? "ai-pipeline-status is-live" : "ai-pipeline-status is-mock"}>
                  <strong>{pipelineStatusTitle(generationOptions.identityMode, pipelineStatus, generationIsLive, uploadedPhotoLivePolish, baselineReadyForPose)}</strong>
                  <span>{pipelineStatusDetail(generationOptions.identityMode, pipelineStatus, generationIsLive, uploadedPhotoLivePolish, baselineReadyForPose)}</span>
                </div>
              ) : null}
              {generationOptions.identityMode === "pose_synthesis" ? (
                <p className={poseSynthesisUnlocked ? "ai-pipeline-note is-ready" : "ai-pipeline-note is-blocked"}>
                  {poseSynthesisUnlocked
                    ? `1단계 baseline 준비됨: ${baselineAsset ? assetModeLabel(baselineAsset) : "배경 교체 완료"}`
                    : baselineAsset
                      ? "선택된 baseline의 누끼/얼굴 검수가 불안정합니다. 1단계 배경 교체를 다시 생성해 주세요."
                      : "2단계 전에 1단계 배경 교체를 먼저 생성하거나 저장된 baseline을 선택해 주세요."}
                </p>
              ) : baselineAsset ? (
                <p className={baselineReadyForPose ? "ai-pipeline-note is-ready" : "ai-pipeline-note is-blocked"}>
                  {baselineReadyForPose ? "2단계에 사용할 1단계 baseline이 준비돼 있습니다." : "baseline은 있지만 누끼가 불안정해 2단계에는 아직 쓰지 않습니다."}
                </p>
              ) : null}
              {savedAssets.length ? (
                <div className="ai-saved-assets">
                  <div className="ai-saved-assets-head">
                    <strong>저장된 에셋</strong>
                    <span>재사용하거나 문제가 생겼을 때 이어서 쓰는 운영용 목록입니다.</span>
                  </div>
                  <div className="ai-saved-asset-grid">
                    {savedAssets.map((asset) => {
                      const usage = savedAssetUsage(asset);
                      const proposalActionBlocked =
                        usage.actionKind === "proposal" && !proposalVariantEngineReady && savedPosterCandidateCount < proposalCount;
                      return (
                        <article key={asset.id} className={performerAsset?.id === asset.id ? "ai-saved-asset active" : "ai-saved-asset"}>
                          <button type="button" className="ai-saved-asset-preview" onClick={() => handleSelectSavedAsset(asset)} disabled={Boolean(busy)}>
                            <img src={asset.generatedImageUrl || asset.thumbnailUrl || asset.cutoutPngUrl} alt="" />
                          </button>
                          <div className="ai-saved-asset-info">
                            <strong>{usage.statusLabel}</strong>
                            <span>{assetModeLabel(asset)}</span>
                          </div>
                          <button
                            type="button"
                            className={usage.actionKind === "proposal" ? "ai-saved-asset-action is-primary" : "ai-saved-asset-action"}
                            disabled={Boolean(busy) || usage.disabled || proposalActionBlocked}
                            onClick={() => {
                              handleSelectSavedAsset(asset);
                              if (usage.actionKind === "proposal") {
                                void handleGenerateProposals(asset, true);
                              } else if (usage.actionKind === "variant") {
                                void handleGenerateProfileVariants(asset);
                              }
                            }}
                          >
                            {proposalActionBlocked ? `프로필 후보 ${proposalCount}개 필요` : usage.actionLabel}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="ai-field-grid">
                <label className="ai-field">
                  <span>프로필 방식</span>
                  <select value={generationOptions.identityMode} onChange={(event) => updateGenerationOptions({ identityMode: event.target.value })}>
                    <option value="background_replace">1단계 배경 교체</option>
                    <option value="pose_synthesis" disabled={!poseSynthesisUnlocked}>
                      2단계 포즈 합성
                    </option>
                    <option value="uploaded_photo">원본 누끼</option>
                  </select>
                </label>
                <label className="ai-field">
                  <span>사진 보정 요청</span>
                  <textarea
                    value={generationOptions.retouchPrompt}
                    onChange={(event) => updateGenerationOptions({ retouchPrompt: event.target.value })}
                    placeholder="예: 얼굴과 포즈는 유지, 배경은 밝게, 피부 보정은 자연스럽게"
                    maxLength={500}
                  />
                </label>
              </div>
              {generationOptions.identityMode === "pose_synthesis" ? (
                <>
                  <div className="ai-field-grid">
                    <label className="ai-field">
                      <span>스타일 프리셋</span>
                      <select value={generationOptions.style} onChange={(event) => updateGenerationOptions({ style: event.target.value })}>
                        {styleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ai-field">
                      <span>분위기</span>
                      <input
                        value={generationOptions.mood}
                        onChange={(event) => updateGenerationOptions({ mood: event.target.value })}
                        placeholder="예: 차분한, 강렬한, 따뜻한"
                      />
                    </label>
                  </div>
                  <label className="ai-field">
                    <span>추가 분위기 요청</span>
                    <textarea
                      value={generationOptions.stylePrompt}
                      onChange={(event) => updateGenerationOptions({ stylePrompt: event.target.value })}
                      placeholder="예: 원본 얼굴과 포즈는 유지, 차분한 리사이틀 분위기"
                      maxLength={500}
                    />
                  </label>
                  <label className="ai-field">
                    <span>의상 프리셋</span>
                    <select value={generationOptions.wardrobe} onChange={(event) => updateGenerationOptions({ wardrobe: event.target.value })}>
                      {wardrobeOptions.map((option) => (
                        <option key={option.label} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ai-field">
                    <span>의상 정돈 요청</span>
                    <textarea
                      value={generationOptions.wardrobePrompt}
                      onChange={(event) => updateGenerationOptions({ wardrobePrompt: event.target.value })}
                      placeholder="예: 기존 의상은 유지, 주름과 그림자만 자연스럽게 정리"
                      maxLength={500}
                    />
                  </label>
                  <label className="ai-field">
                    <span>포즈 참고 메모</span>
                    <textarea
                      value={generationOptions.actionPrompt}
                      onChange={(event) => updateGenerationOptions({ actionPrompt: event.target.value })}
                      placeholder="예: 다른 포즈가 필요하면 그 포즈 사진을 사용할 사진에 올려주세요"
                      maxLength={500}
                    />
                  </label>
                </>
              ) : null}
              <div className="ai-action-row">
                <Button type="button" variant="secondary" onClick={handlePrepareReferences} disabled={Boolean(busy)}>
                  {busy === "reference" ? <Loader2 className="spin-icon" size={16} /> : <Upload size={16} />}
                  참고 사진 준비
                </Button>
                <Button type="button" variant="secondary" onClick={handleGenerateAsset} disabled={assetGenerationDisabled}>
                  {busy === "asset" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
                  {assetActionLabel(generationOptions.identityMode, generationIsLive)}
                </Button>
              </div>
            </div>
          </details>
        </div>

        <div className="ai-poster-panel">
          <div className="ai-poster-panel-head">
            <QrCode size={18} />
            <h2>QR 목적</h2>
          </div>
          <label className="ai-field">
            <span>연결 대상</span>
            <select value={concertInfo.qrTargetType} onChange={(event) => setConcertInfo({ ...concertInfo, qrTargetType: event.target.value })}>
              <option value="ticket_link">예매 링크</option>
              <option value="pamphlet_link">팜플렛 링크</option>
              <option value="checkin_link">체크인 링크</option>
              <option value="artist_profile_link">아티스트 프로필</option>
              <option value="custom_url">직접 입력</option>
            </select>
          </label>
          <label className="ai-field">
            <span>직접 입력 URL</span>
            <input value={concertInfo.qrTargetUrl} onChange={(event) => setConcertInfo({ ...concertInfo, qrTargetUrl: event.target.value })} placeholder="https://" />
          </label>
        </div>
      </section>

      {performerAsset ? (
        <section className="ai-asset-preview">
          <div className="ai-section-title">
            <div>
              <p className="section-eyebrow">PERFORMER ASSET</p>
              <h2>에셋 미리보기</h2>
            </div>
            <span>{assetModeLabel(performerAsset)}</span>
          </div>
          <div className={hasTransparentCutout ? "ai-asset-preview-grid" : "ai-asset-preview-grid is-source-only"}>
            <figure>
              <img src={performerAsset.generatedImageUrl} alt="" />
              <figcaption>{performerAsset.generationMode === "source-lock" ? "업로드 사진 기반 원본" : hasTransparentCutout ? "생성 원본" : "포스터 시안용 이미지"}</figcaption>
            </figure>
            {hasTransparentCutout ? (
              <figure className="is-cutout">
                <img src={performerAsset.cutoutPngUrl} alt="" />
                <figcaption>누끼 PNG</figcaption>
              </figure>
            ) : null}
            <div className="ai-asset-preview-side">
              <strong>{selectedAssetNeedsProfileCandidate ? "이 에셋은 프로필 후보 생성용 재료" : "이 에셋으로 포스터 시안 생성 가능"}</strong>
              <span>
                이미지: {performerAsset.provider} / 누끼: {assetMetadata.cutoutProvider ?? pipelineStatus?.cutout.provider ?? "unknown"}
              </span>
              <p className={`ai-cutout-status is-${assetMetadata.cutoutStatus}`}>
                {cutoutStatusLabel(assetMetadata.cutoutStatus)}
              </p>
              <p className={`ai-cutout-status is-${assetMetadata.faceIdentityStatus ?? "unknown"}`}>
                {faceIdentityStatusLabel(assetMetadata, pipelineStatus)}
              </p>
              {performerAsset.generationMode === "mock" ? (
                <p className="ai-pipeline-note">현재 결과는 AI 사진 보정이 아니라 업로드 이미지를 기반으로 한 mock 결과입니다.</p>
              ) : null}
              <div className="ai-next-action-card">
                <div className="ai-flow-steps" aria-label="포스터 생성 단계">
                  <span className={performerAsset ? "done" : "active"}>에셋</span>
                  <span className={!selectedAssetNeedsProfileCandidate ? "done" : profileVariantAssets.length ? "active" : "pending"}>프로필 후보</span>
                  <span className={performerAssetApproved ? "done" : !selectedAssetNeedsProfileCandidate ? "active" : "pending"}>승인</span>
                  <span className={proposals.length ? "done" : currentAssetCanGenerateProposals ? "active" : "pending"}>포스터 시안</span>
                  <span className={project ? "done" : proposals.length ? "active" : "pending"}>편집</span>
                </div>
                {selectedAssetNeedsProfileCandidate ? (
                  profileVariantAssets.length ? (
                    <>
                      <strong>다음 작업: 프로필 후보 선택</strong>
                      <span>아래 카드 중 얼굴이 가장 안정적인 프로필 후보를 선택하세요.</span>
                    </>
                  ) : (
                    <>
                      <strong>다음 작업: 프로필 후보 생성</strong>
                      <span>선택한 개수만큼 정해진 프로필 템플릿 슬롯을 생성합니다.</span>
                      <Button type="button" onClick={() => handleGenerateProfileVariants()} disabled={Boolean(busy) || !hasTransparentCutout} title={!hasTransparentCutout ? "누끼가 완료된 에셋이 필요합니다." : undefined}>
                        {busy === "profile-variants" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
                        {profileVariantCount}개 프로필 후보 만들기
                      </Button>
                    </>
                  )
                ) : !performerAssetApproved ? (
                  <>
                    <strong>다음 작업: 프로필 후보 승인</strong>
                    <span>이 이미지를 포스터의 잠금 연주자 레이어로 사용합니다.</span>
                    <Button
                      type="button"
                      onClick={() => {
                        setApprovedAssetIds((current) => new Set(current).add(performerAsset.id));
                        setMessage("이 프로필 후보를 포스터용 고정 레이어로 승인했습니다.");
                      }}
                      disabled={Boolean(busy)}
                    >
                      프로필 후보 승인
                    </Button>
                  </>
                ) : needsMoreProfileCandidatesForProposals ? (
                  <>
                    <strong>다음 작업: 프로필 후보 추가</strong>
                    <span>같은 누끼 복붙 포스터 시안을 막기 위해 서로 다른 프로필 후보가 {proposalCount}개 필요합니다.</span>
                    <Button type="button" onClick={() => handleGenerateProfileVariants()} disabled={Boolean(busy) || !hasTransparentCutout}>
                      {busy === "profile-variants" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
                      {proposalCount}개 프로필 후보 만들기
                    </Button>
                  </>
                ) : proposals.length ? (
                  <>
                    <strong>다음 작업: 포스터 시안 선택</strong>
                    <span>아래 포스터 시안 카드를 열면 간단 편집으로 넘어갑니다.</span>
                  </>
                ) : (
                  <>
                    <strong>다음 작업: 포스터 시안 생성</strong>
                    <span>승인한 연주자 에셋은 얼굴/정체성 잠금 레이어로 들어갑니다.</span>
                    <Button type="button" onClick={() => handleGenerateProposals()} disabled={Boolean(busy) || !currentAssetCanGenerateProposals}>
                      {busy === "proposals" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
                      {proposalCount}개 포스터 시안 만들기
                    </Button>
                  </>
                )}
              </div>
              <div className="ai-profile-variant-actions">
                <strong>프로필 후보 수</strong>
                <div className="segmented-control proposal-count-control" role="group" aria-label="프로필 후보 수 선택">
                  {profileVariantCountOptions.map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={profileVariantCount === count ? "active" : ""}
                      onClick={() => setProfileVariantCount(count)}
                      disabled={Boolean(busy)}
                    >
                      {count}개
                    </button>
                  ))}
                </div>
                <div className="ai-template-slot-list" aria-label="생성될 프로필 후보 템플릿">
                  {selectedProfileVariantTemplates.map((template, index) => (
                    <span key={template.label}>
                      {index + 1}. {template.label}
                    </span>
                  ))}
                </div>
                <Button type="button" variant="secondary" onClick={() => handleGenerateProfileVariants()} disabled={Boolean(busy) || !hasTransparentCutout}>
                  {busy === "profile-variants" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
                  프로필 후보 다시 만들기
                </Button>
              </div>
              {selectedAssetNeedsProfileCandidate ? (
                <p className="ai-pipeline-note is-blocked">포스터 시안 전 프로필 후보 선택 필요</p>
              ) : (
                <p className={performerAssetApproved ? "ai-pipeline-note is-ready" : "ai-pipeline-note"}>{performerAssetApproved ? "포스터용 고정 에셋 승인됨" : "승인 대기"}</p>
              )}
            </div>
          </div>
          {profileVariantAssets.length || profileVariantFailures.length ? (
            <div className="ai-profile-variant-panel" ref={profileVariantPanelRef}>
              <div className="ai-profile-variant-head">
                <strong>생성된 프로필 후보</strong>
                <span>
                  성공 {profileVariantAssets.length}개
                  {profileVariantFailures.length ? ` / 실패 ${profileVariantFailures.length}개` : ""} · 가장 닮고 공연 홍보물에 어울리는 프로필 후보를 선택하세요.
                </span>
              </div>
              <div className="ai-profile-variant-grid">
                {profileVariantAssets.map((asset, index) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={performerAsset.id === asset.id ? "ai-profile-variant-card active" : "ai-profile-variant-card"}
                    onClick={() => handleUseProfileVariant(asset)}
                    disabled={Boolean(busy)}
                  >
                    <span>{index + 1}</span>
                    <img src={asset.generatedImageUrl || asset.thumbnailUrl || asset.cutoutPngUrl} alt="" />
                    <strong>{assetModeLabel(asset)}</strong>
                    <em>이 프로필 후보 사용</em>
                  </button>
                ))}
                {profileVariantFailures.map((failure) => (
                  <div key={`${failure.index}-${failure.label}`} className="ai-profile-variant-card is-failed">
                    <span>실패</span>
                    <div className="ai-profile-variant-failure">
                      <strong>생성 실패</strong>
                      <small>{failure.label}</small>
                    </div>
                    <strong>{failure.label}</strong>
                    <em>{failure.reason}</em>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="ai-proposal-section" ref={proposalSectionRef}>
        <div className="ai-section-title">
          <h2>AI 포스터 시안</h2>
          <span>{proposals.length ? `${proposals.length}개` : "사진과 정보를 입력한 뒤 생성"}</span>
        </div>
        <div className="ai-proposal-grid">
          {proposals.map((proposal, index) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              index={index}
              busy={busy === `proposal-${proposal.id}`}
              onSelect={() => handleSelectProposal(proposal)}
            />
          ))}
        </div>
      </section>

      <section className="ai-customizer" ref={editorSectionRef}>
        <div className="ai-section-title ai-editor-title">
          <div>
            <h2>간단 편집</h2>
            <span>{project ? project.title : "시안 선택 또는 포스터 업로드로 시작"}</span>
          </div>
          <div className="ai-editor-toolbar" aria-label="간단 편집 작업">
            <PosterUploadButton busy={busy} onFile={handleImportPosterFile}>
              업로드 포스터 열기
            </PosterUploadButton>
            <Button
              type="button"
              variant="secondary"
              onClick={() => activePosterLayer && handleRunPosterOcr(activePosterLayer)}
              disabled={!activePosterLayer || Boolean(busy)}
              title={activePosterLayer ? "업로드 포스터의 텍스트를 편집 가능한 레이어로 변환" : "업로드 포스터를 먼저 열어 주세요"}
            >
              {busy === "poster-ocr" ? <Loader2 className="spin-icon" size={16} /> : <TextCursorInput size={16} />}
              OCR 텍스트 변환
            </Button>
            <a
              className="ai-file-button ai-detail-editor-link"
              href={`/app/performances/${initialPerformance.id}/pamphlet/editor`}
              target="_blank"
              rel="noreferrer"
              title="레이어 상세 편집, 2단 팜플렛, SNS 규격 변환 열기"
            >
              <ExternalLink size={16} />
              상세 편집 열기
            </a>
          </div>
        </div>
        <SavedProjectShelf
          projects={savedProjects}
          loading={savedProjectsLoading}
          activeProjectId={project?.id}
          onRefresh={refreshSavedProjects}
          onOpen={handleLoadProject}
          busy={busy}
        />
        <div className="ai-customizer-grid">
          <div className="ai-stage-shell" ref={stageShellRef}>
            {design ? (
              <div
                className="ai-stage-viewport"
                style={{
                  width: design.canvas.width * scale,
                  height: design.canvas.height * scale,
                }}
                onWheel={handleWheel}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={() => {
                  setDrag(null);
                  setRegionDrag(null);
                }}
                onPointerCancel={() => {
                  setDrag(null);
                  setRegionDrag(null);
                }}
              >
                <div className="ai-canvas-size-chip">
                  {design.canvas.width} x {design.canvas.height}px
                </div>
                <div
                  className="ai-stage"
                  style={{
                    width: design.canvas.width,
                    height: design.canvas.height,
                    transform: `scale(${scale})`,
                    background: design.canvas.backgroundColor,
                  }}
                  onPointerDown={() => setSelectedLayerId(null)}
                >
                  {design.layers.map((layer) => (
                    <PosterLayerView
                      key={layer.id}
                      layer={layer}
                      selected={selectedLayerId === layer.id}
                      onPointerDown={(event) => handleLayerPointerDown(event, layer)}
                      onRegionPointerDown={handleRegionPointerDown}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="ai-stage-empty">
                <MousePointer2 size={30} />
                <strong>포스터를 업로드하거나 포스터 시안을 선택하세요</strong>
                <span>업로드한 포스터는 간단 편집에서 색감 조정, OCR 텍스트 변환, 레이어 수정을 이어갈 수 있습니다.</span>
                <PosterUploadButton busy={busy} onFile={handleImportPosterFile}>
                  업로드 포스터 열기
                </PosterUploadButton>
              </div>
            )}
          </div>

          <aside className="ai-inspector">
            <div className="ai-action-row">
              <Button type="button" variant="secondary" onClick={addTextLayer} disabled={!design}>
                <TextCursorInput size={16} />
                문구
              </Button>
              <Button type="button" variant="secondary" onClick={addQrLayer} disabled={!design}>
                <QrCode size={16} />
                QR
              </Button>
            </div>
            {selectedLayer && design ? (
              <LayerInspector
                layer={selectedLayer}
                design={design}
                busy={busy}
                updateSelectedLayer={updateSelectedLayer}
                updateTypedLayer={updateTypedLayer}
                fitLayerToCanvas={fitLayerToCanvas}
                updateCanvasSize={updateCanvasSize}
                runPosterOcr={handleRunPosterOcr}
                selectLayer={setSelectedLayerId}
              />
            ) : (
              <div className="ai-empty-inspector">
                <Plus size={18} />
                수정할 레이어를 선택하세요.
              </div>
            )}
            <div className="ai-action-row sticky-actions">
              <Button type="button" variant="secondary" onClick={handleSaveProject} disabled={!project || !design || Boolean(busy)}>
                {busy === "save" ? <Loader2 className="spin-icon" size={16} /> : <Save size={16} />}
                저장
              </Button>
              <Button type="button" onClick={handleExportProject} disabled={!project || !design || Boolean(busy)}>
                {busy === "export" ? <Loader2 className="spin-icon" size={16} /> : <Download size={16} />}
                PNG
              </Button>
            </div>
            {project?.exportUrl ? (
              <a className="ai-export-link" href={project.exportUrl} target="_blank" rel="noreferrer">
                마지막 PNG 열기
              </a>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}

function PosterUploadButton({
  busy,
  primary = false,
  children,
  onFile,
}: {
  busy: string | null;
  primary?: boolean;
  children: React.ReactNode;
  onFile: (file: File | null) => void | Promise<void>;
}) {
  const className = [primary ? "ai-file-button ai-file-button-primary" : "ai-file-button", busy ? "is-disabled" : ""].filter(Boolean).join(" ");
  return (
    <label className={className}>
      {busy === "poster-import" ? <Loader2 className="spin-icon" size={16} /> : <Upload size={16} />}
      {children}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={Boolean(busy)}
        onChange={(event) => {
          void onFile(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function WorkProgress({ progress }: { progress: WorkProgressState }) {
  const percentLabel = progress.percent === null ? "처리 중" : `${Math.round(progress.percent)}%`;
  return (
    <div className="ai-work-progress" role="status" aria-live="polite">
      <div className="ai-work-progress-head">
        <div className="ai-work-progress-title">
          <Loader2 className="spin-icon" size={20} />
          <div>
            <strong>{progress.title}</strong>
            <span>{progress.detail}</span>
          </div>
        </div>
        <em>{percentLabel}</em>
      </div>
      <div className={`ai-work-progress-bar ${progress.percent === null ? "is-indeterminate" : "is-determinate"}`}>
        <span style={progress.percent === null ? undefined : { width: `${progress.percent}%` }} />
      </div>
      <div className="ai-work-progress-foot">
        <span>{progress.meta}</span>
        <div>
          {progress.steps.map((step) => (
            <b key={step}>{step}</b>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildWorkProgress(input: {
  busy: string | null;
  message: string;
  proposalCount: number;
  profileVariantCount: number;
  faceCandidatePoolSize: number;
  proposalCandidatePoolSize: number;
}): WorkProgressState | null {
  if (!input.busy) return null;

  const progress = parseProgressFraction(input.message);
  const percent = progress ? Math.max(4, Math.min(96, (progress.current / progress.total) * 100)) : null;
  const fallbackDetail = input.message || "작업을 처리하는 중입니다.";

  if (input.busy === "reference") {
    return {
      title: "사진 준비 중",
      detail: fallbackDetail,
      meta: "업로드와 썸네일 생성을 처리하고 있습니다.",
      percent,
      steps: ["업로드", "저장", "미리보기"],
    };
  }

  if (input.busy === "asset") {
    return {
      title: "연주자 에셋 생성 중",
      detail: fallbackDetail,
      meta: `Gemini 후보 최대 ${input.faceCandidatePoolSize}개를 만들고 DeepFace 점수 최고 후보를 고릅니다.`,
      percent,
      steps: ["Gemini 생성", "DeepFace 선별", "누끼 저장"],
    };
  }

  if (input.busy === "profile-variants") {
    return {
      title: "프로필 후보 생성 중",
      detail: fallbackDetail,
      meta: `최종 후보 ${input.profileVariantCount}개를 준비합니다. 각 후보는 얼굴 점수 선별을 거칩니다.`,
      percent,
      steps: ["후보 생성", "얼굴 검사", "통과 후보 정렬"],
    };
  }

  if (input.busy === "guided-flow") {
    return {
      title: "전체 시안 준비 중",
      detail: fallbackDetail,
      meta: "사진 준비, 연주자 에셋, 프로필 후보 생성을 이어서 처리합니다.",
      percent,
      steps: ["에셋 생성", "누끼", "후보 준비"],
    };
  }

  if (input.busy === "proposals") {
    return {
      title: "포스터 시안 생성 중",
      detail: fallbackDetail,
      meta: `포스터 ${input.proposalCount}개를 만들고 템플릿별 인물 후보 ${input.proposalCandidatePoolSize}개 중 최고점을 배정합니다.`,
      percent,
      steps: ["후보 선별", "레이아웃", "품질 검사"],
    };
  }

  if (input.busy === "poster-import") {
    return {
      title: "포스터 불러오는 중",
      detail: fallbackDetail,
      meta: "업로드 이미지를 잠금 레이어로 넣고 편집 캔버스를 준비합니다.",
      percent,
      steps: ["업로드", "캔버스 맞춤", "레이어 생성"],
    };
  }

  if (input.busy === "poster-ocr") {
    return {
      title: "OCR 텍스트 변환 중",
      detail: fallbackDetail,
      meta: "포스터 위 문구를 인식해 편집 가능한 텍스트 레이어로 바꿉니다.",
      percent,
      steps: ["문구 인식", "좌표 변환", "레이어 추가"],
    };
  }

  if (input.busy === "save") {
    return {
      title: "작업 저장 중",
      detail: fallbackDetail,
      meta: "현재 레이어와 캔버스 상태를 저장합니다.",
      percent,
      steps: ["직렬화", "저장", "목록 갱신"],
    };
  }

  if (input.busy === "export") {
    return {
      title: "PNG 저장 중",
      detail: fallbackDetail,
      meta: "캔버스를 이미지로 렌더링해 내려받을 파일을 만듭니다.",
      percent,
      steps: ["렌더링", "이미지 생성", "다운로드"],
    };
  }

  if (input.busy.startsWith("proposal-")) {
    return {
      title: "시안 여는 중",
      detail: fallbackDetail,
      meta: "선택한 포스터 시안을 편집 가능한 레이어 프로젝트로 변환합니다.",
      percent,
      steps: ["시안 선택", "레이어 변환", "간단 편집"],
    };
  }

  if (input.busy.startsWith("project-")) {
    return {
      title: "저장 작업 여는 중",
      detail: fallbackDetail,
      meta: "저장된 레이어와 캔버스를 다시 불러옵니다.",
      percent,
      steps: ["불러오기", "레이어 복원", "캔버스 이동"],
    };
  }

  return {
    title: "작업 처리 중",
    detail: fallbackDetail,
    meta: "요청을 처리하고 있습니다.",
    percent,
    steps: ["요청", "처리", "완료"],
  };
}

function parseProgressFraction(message: string) {
  const match = message.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;
  return { current, total };
}

function PosterImportControls({
  busy,
  settings,
  onSettingsChange,
  onFile,
}: {
  busy: string | null;
  settings: PosterImportSettings;
  onSettingsChange: React.Dispatch<React.SetStateAction<PosterImportSettings>>;
  onFile: (file: File | null) => void | Promise<void>;
}) {
  return (
    <>
      <div className="ai-field">
        <span>시작 캔버스</span>
        <div className="segmented-control compact">
          {posterCanvasPresets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={settings.preset === preset.value ? "active" : ""}
              onClick={() =>
                onSettingsChange((current) => ({
                  ...current,
                  preset: preset.value,
                  customWidth: preset.value === "custom" ? current.customWidth : preset.width,
                  customHeight: preset.value === "custom" ? current.customHeight : preset.height,
                }))
              }
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      {settings.preset === "custom" ? (
        <div className="ai-field-grid">
          <NumberField
            label="가로 px"
            value={settings.customWidth}
            onChange={(value) => onSettingsChange((current) => ({ ...current, customWidth: clampBoxValue(value, 240, 3200) }))}
          />
          <NumberField
            label="세로 px"
            value={settings.customHeight}
            onChange={(value) => onSettingsChange((current) => ({ ...current, customHeight: clampBoxValue(value, 240, 3200) }))}
          />
        </div>
      ) : null}
      <div className="ai-field">
        <span>포스터 배치</span>
        <div className="segmented-control compact">
          {(["contain", "cover"] as const).map((fit) => (
            <button key={fit} type="button" className={settings.fit === fit ? "active" : ""} onClick={() => onSettingsChange((current) => ({ ...current, fit }))}>
              {fit === "contain" ? "전체 보이기" : "꽉 채우기"}
            </button>
          ))}
        </div>
      </div>
      <label className="ai-upload-box ai-poster-import-box">
        {busy === "poster-import" ? <Loader2 className="spin-icon" size={28} /> : <ImageIcon size={30} />}
        <strong>기존 포스터 업로드</strong>
        <span>포스터는 잠그고, 텍스트/QR/도형을 위에 추가해서 편집</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={Boolean(busy)}
          onChange={(event) => {
            void onFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </label>
    </>
  );
}

function PosterLayerView({
  layer,
  selected,
  onPointerDown,
  onRegionPointerDown,
}: {
  layer: PosterLayer;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onRegionPointerDown: (
    event: React.PointerEvent<HTMLElement>,
    layer: PosterImageLayer,
    regionKind: RegionDragState["regionKind"],
    regionId: string,
    mode: RegionDragState["mode"],
  ) => void;
}) {
  const style = {
    left: layer.x,
    top: layer.y,
    width: layer.width,
    height: layer.height,
    opacity: layer.opacity ?? 1,
  } as React.CSSProperties;

  if (layer.type === "image") {
    const tintStrength = layer.adjustments?.tintStrength ?? 0;
    return (
      <div className={selected ? "poster-edit-layer selected" : "poster-edit-layer"} style={style} onPointerDown={onPointerDown}>
        <img
          src={layer.src}
          alt=""
          draggable={false}
          style={{
            objectFit: layer.objectFit,
            objectPosition: layer.objectPosition ?? "50% 50%",
            filter: cssImageFilter(layer),
          }}
        />
        {tintStrength > 0 ? (
          <span
            className="poster-image-tint"
            style={{
              background: layer.adjustments?.tintColor ?? "#111111",
              opacity: Math.min(0.8, Math.max(0, tintStrength)),
            }}
          />
        ) : null}
        {(layer.protectedAreas ?? []).map((area) => (
          <span
            key={area.id}
            className={`poster-protected-area is-${area.shape ?? "rect"}`}
            style={{
              left: area.x,
              top: area.y,
              width: area.width,
              height: area.height,
            }}
            onPointerDown={(event) => onRegionPointerDown(event, layer, "protected", area.id, "move")}
          >
            <span
              className="poster-protected-area-clip"
              style={{
                clipPath: protectedAreaClipPath(area.shape),
                backgroundImage: `url(${JSON.stringify(layer.src)})`,
                backgroundPosition: `${-area.x}px ${-area.y}px`,
                backgroundRepeat: "no-repeat",
                backgroundSize: `${layer.width}px ${layer.height}px`,
              }}
            />
            <i aria-hidden="true" onPointerDown={(event) => onRegionPointerDown(event, layer, "protected", area.id, "resize")} />
          </span>
        ))}
        {(layer.coverPatches ?? []).map((patch) => (
          <span
            key={patch.id}
            className="poster-cover-patch"
            style={{
              left: patch.x,
              top: patch.y,
              width: patch.width,
              height: patch.height,
              background: patch.fill,
              opacity: patch.opacity ?? 1,
            }}
            onPointerDown={(event) => onRegionPointerDown(event, layer, "cover", patch.id, "move")}
          >
            {patch.text ? (
              <b
                style={{
                  color: patch.textColor ?? "#111111",
                  fontSize: patch.fontSize ?? 32,
                  fontWeight: patch.fontWeight ?? 800,
                }}
              >
                {patch.text}
              </b>
            ) : null}
            <i aria-hidden="true" onPointerDown={(event) => onRegionPointerDown(event, layer, "cover", patch.id, "resize")} />
          </span>
        ))}
      </div>
    );
  }
  if (layer.type === "shape") {
    return (
      <div className={selected ? "poster-edit-layer selected" : "poster-edit-layer"} style={style} onPointerDown={onPointerDown}>
        <ShapePreview layer={layer} />
      </div>
    );
  }
  if (layer.type === "qr") {
    return (
      <div className={selected ? "poster-edit-layer selected" : "poster-edit-layer"} style={style} onPointerDown={onPointerDown}>
        <QrPreview layer={layer} />
      </div>
    );
  }
  return (
    <div
      className={selected ? "poster-edit-layer poster-text-layer selected" : "poster-edit-layer poster-text-layer"}
      style={{
        ...style,
        color: layer.color,
        fontFamily: posterBrowserFontStack(layer.fontFamily),
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight,
        fontStyle: layer.fontStyle ?? "normal",
        textAlign: layer.align,
        lineHeight: layer.lineHeight,
        textDecoration: layer.underline ? "underline" : "none",
      }}
      onPointerDown={onPointerDown}
    >
      {layer.text}
    </div>
  );
}

function ShapePreview({ layer }: { layer: PosterShapeLayer }) {
  if (layer.shape === "circle") {
    return <div className="shape-fill" style={{ background: layer.fill, border: borderStyle(layer), borderRadius: "999px" }} />;
  }
  if (layer.shape === "line") {
    return <div className="shape-line" style={{ background: layer.stroke || layer.fill, height: layer.strokeWidth ?? layer.height }} />;
  }
  if (layer.shape === "donut") {
    return (
      <div
        className="shape-fill"
        style={{
          background: `radial-gradient(circle, transparent 0 ${(layer.innerRadiusRatio ?? 0.5) * 100}%, ${layer.fill} ${
            (layer.innerRadiusRatio ?? 0.5) * 100 + 1
          }% 100%)`,
          borderRadius: "999px",
          border: borderStyle(layer),
        }}
      />
    );
  }
  return <div className="shape-fill" style={{ background: layer.fill, border: borderStyle(layer), borderRadius: layer.radius ?? 0 }} />;
}

function QrPreview({ layer }: { layer: PosterQrLayer }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(layer.targetUrl || "https://artsaurus.app", {
      width: Math.round(layer.width),
      margin: 1,
      color: { dark: layer.foreground, light: layer.background },
    }).then((value) => {
      if (mounted) setSrc(value);
    });
    return () => {
      mounted = false;
    };
  }, [layer.background, layer.foreground, layer.targetUrl, layer.width]);
  return (
    <div className="qr-preview">
      {src ? <img src={src} alt="" draggable={false} /> : null}
      {layer.caption ? <span>{layer.caption}</span> : null}
    </div>
  );
}

function createDemoPipelineStatus(): PipelineStatus {
  return {
    imageGeneration: {
      mode: "mock",
      provider: "mock",
      liveRequested: false,
      apiKeyPresent: false,
      model: "promo-maker-demo",
      ready: true,
    },
    cutout: {
      provider: "sharp",
      model: "demo-cutout",
      pipelineVersion: "demo",
      ready: true,
    },
    faceIdentity: {
      enabled: true,
      provider: "demo",
      model: "demo-face-gate",
      threshold: 0.68,
      localThreshold: 0.82,
      maxAttempts: 1,
      pipelineVersion: "demo",
      ready: true,
    },
    proposalVariants: {
      mode: "demo",
      provider: "google-ai-studio",
      ready: true,
      googleKeyPresent: false,
      comfyPoseReady: false,
      candidatePoolSize: 4,
    },
  };
}

function createDemoReferenceImage(pose: ReferencePose, sourceUrl: string): ReferenceImageRecord {
  return {
    id: `demo-reference-${pose}-${Date.now()}`,
    originalUrl: sourceUrl,
    thumbnailUrl: sourceUrl,
    faceCropUrl: sourceUrl,
  };
}

function createDemoPerformerAsset(input: {
  imageUrl: string;
  referenceImageId?: string;
  mode: "background-replace" | "portrait-variant";
  label: string;
  index?: number;
}): PerformerAssetRecord {
  const identityMode = input.mode === "portrait-variant" ? "portrait_variant" : "background_replace";
  return {
    id: `demo-asset-${input.mode}-${input.index ?? 0}-${Date.now()}`,
    referenceImageId: input.referenceImageId,
    thumbnailUrl: input.imageUrl,
    cutoutPngUrl: input.imageUrl,
    generatedImageUrl: input.imageUrl,
    generationMode: input.mode,
    provider: "demo",
    createdAt: new Date().toISOString(),
    providerMetadataJson: JSON.stringify({
      cutoutStatus: "generated",
      cutoutProvider: "demo",
      faceIdentityStatus: "passed",
      faceIdentityScore: 0.99,
      faceIdentityLocalScore: 0.88,
      identityMode,
      demoLabel: input.label,
    }),
  };
}

function createDemoProfileVariantAssets(sourceAsset: PerformerAssetRecord, count: number): PerformerAssetRecord[] {
  return Array.from({ length: count }, (_, index) =>
    createDemoPerformerAsset({
      imageUrl: sourceAsset.generatedImageUrl || sourceAsset.thumbnailUrl || sourceAsset.cutoutPngUrl,
      referenceImageId: sourceAsset.referenceImageId,
      mode: "portrait-variant",
      label: `개발용 프로필 후보 ${index + 1}`,
      index,
    }),
  );
}

function createDemoPosterProposals(input: {
  asset: PerformerAssetRecord;
  count: ProposalCount;
  concertInfo: DemoConcertInfo;
  prompt: string;
}): {
  proposals: ProposalRecord[];
  orchestrationPlan: PosterGenerationPlanRecord;
  orchestrationRun: PosterGenerationRunRecord;
} {
  const templates = [
    ["minimal-recital", "Minimal Recital"],
    ["black-editorial", "Black Editorial"],
    ["concert-hall-classic", "Concert Hall Classic"],
    ["modern-typography", "Modern Typography"],
    ["soft-romantic", "Soft Romantic"],
    ["experimental-contemporary", "Experimental Contemporary"],
    ["premium-monochrome", "Premium Monochrome"],
    ["grid-portfolio", "Grid Portfolio"],
  ] as const;
  const proposals = templates.slice(0, input.count).map(([templateId, title], index) => {
    const design = buildDemoPosterDesign({
      asset: input.asset,
      concertInfo: input.concertInfo,
      templateId,
      index,
    });
    return {
      id: `demo-proposal-${templateId}-${Date.now()}`,
      title,
      templateId,
      previewUrl: demoPosterPreviewDataUrl(title, input.concertInfo.title || "Recital", index),
      thumbnailUrl: demoPosterPreviewDataUrl(title, input.concertInfo.title || "Recital", index),
      editableDesignJson: JSON.stringify(design),
      qualityReportJson: JSON.stringify({
        rating: "good",
        score: 86,
        summary: "개발용 데모 시안입니다.",
        issues: [],
      } satisfies ProposalQualityReportRecord),
    };
  });

  return {
    proposals,
    orchestrationPlan: {
      summary: input.prompt ? `데모 계획: ${input.prompt.slice(0, 80)}` : "데모 계획: 클래식 리사이틀 기본 템플릿",
      layoutJob: { templateIds: proposals.map((proposal) => proposal.templateId) },
      performerAssetJob: { posePolicy: "demo-profile-candidates" },
      backgroundJob: { mode: "demo-layout" },
    },
    orchestrationRun: {
      id: `demo-run-${Date.now()}`,
      status: "succeeded",
      plannerProvider: "demo",
      orchestrationPrompt: input.prompt,
      proposalCount: input.count,
      proposalsCreated: proposals.length,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      planSummary: "개발용 데모 시안 생성",
      templateIds: proposals.map((proposal) => proposal.templateId),
      posePolicy: "demo-profile-candidates",
      backgroundMode: "demo-layout",
      layoutDensity: "balanced",
      warnings: [],
    },
  };
}

type DemoConcertInfo = {
  title: string;
  subtitle?: string;
  performerName: string;
  program?: string;
  venueName: string;
  dateText: string;
  qrTargetType: string;
  qrTargetUrl: string;
};

function buildDemoPosterDesign(input: {
  asset: PerformerAssetRecord;
  concertInfo: DemoConcertInfo;
  templateId: PosterDesign["templateId"];
  index: number;
}): PosterDesign {
  const dark = input.index % 2 === 1;
  const accent = ["#d8b65a", "#2f6f73", "#7b5d47", "#24437a"][input.index % 4] ?? "#2f6f73";
  const background = dark ? "#111111" : "#f7f1e7";
  const textColor = dark ? "#ffffff" : "#111111";
  const performerName = input.concertInfo.performerName || "연주자";
  const title = input.concertInfo.title || "피아노 리사이틀";
  return {
    version: 1,
    canvas: {
      width: POSTER_CANVAS.width,
      height: POSTER_CANVAS.height,
      backgroundColor: background,
    },
    templateId: input.templateId,
    title,
    qrTargetType: input.concertInfo.qrTargetType as PosterDesign["qrTargetType"],
    qrTargetUrl: input.concertInfo.qrTargetUrl || "https://www.artsaurus.com",
    layers: [
      {
        id: "demo-bg-accent",
        name: "배경 포인트",
        type: "shape",
        shape: "rect",
        x: input.index % 2 ? 0 : 760,
        y: 0,
        width: 320,
        height: 1350,
        fill: accent,
        opacity: 0.95,
        visible: true,
        locked: true,
      },
      {
        id: "demo-performer",
        name: "승인 연주자 에셋",
        type: "image",
        src: input.asset.cutoutPngUrl || input.asset.generatedImageUrl,
        x: input.index % 2 ? 420 : 120,
        y: 210,
        width: 560,
        height: 700,
        objectFit: "contain",
        objectPosition: "50% 50%",
        imageRole: "performer",
        visible: true,
        lockedIdentity: true,
        lockedFace: true,
        opacity: 1,
      },
      {
        id: "demo-title",
        name: "공연 제목",
        type: "text",
        text: title,
        x: 92,
        y: 900,
        width: 760,
        height: 170,
        fontFamily: "poster-pretendard",
        fontSize: 78,
        fontWeight: 900,
        color: textColor,
        align: "left",
        lineHeight: 1.05,
        letterSpacing: 0,
        visible: true,
      },
      {
        id: "demo-performer-name",
        name: "연주자",
        type: "text",
        text: performerName,
        x: 96,
        y: 1090,
        width: 620,
        height: 64,
        fontFamily: "poster-nanum-myeongjo",
        fontSize: 42,
        fontWeight: 800,
        color: textColor,
        align: "left",
        lineHeight: 1.1,
        visible: true,
      },
      {
        id: "demo-meta",
        name: "공연 정보",
        type: "text",
        text: [input.concertInfo.dateText, input.concertInfo.venueName].filter(Boolean).join("\n"),
        x: 96,
        y: 1180,
        width: 620,
        height: 86,
        fontFamily: "poster-pretendard",
        fontSize: 28,
        fontWeight: 700,
        color: textColor,
        align: "left",
        lineHeight: 1.28,
        visible: true,
      },
      {
        id: "demo-qr",
        name: "QR",
        type: "qr",
        targetType: input.concertInfo.qrTargetType as PosterDesign["qrTargetType"],
        targetUrl: input.concertInfo.qrTargetUrl || "https://www.artsaurus.com",
        x: 888,
        y: 1158,
        width: 112,
        height: 136,
        foreground: dark ? "#111111" : "#111111",
        background: "#ffffff",
        caption: "예매",
        visible: true,
      },
    ],
  };
}

function demoPosterPreviewDataUrl(templateTitle: string, posterTitle: string, index: number) {
  const background = index % 2 ? "#111111" : "#f7f1e7";
  const text = index % 2 ? "#ffffff" : "#111111";
  const accent = ["#d8b65a", "#2f6f73", "#7b5d47", "#24437a"][index % 4] ?? "#2f6f73";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900" viewBox="0 0 720 900">
    <rect width="720" height="900" fill="${background}"/>
    <rect x="${index % 2 ? 0 : 520}" y="0" width="200" height="900" fill="${accent}"/>
    <circle cx="${index % 2 ? 560 : 160}" cy="230" r="120" fill="${text}" opacity="0.08"/>
    <text x="64" y="92" fill="${text}" font-family="Arial, sans-serif" font-size="26" font-weight="700">${escapeSvgText(templateTitle)}</text>
    <text x="64" y="610" fill="${text}" font-family="Arial, sans-serif" font-size="58" font-weight="900">${escapeSvgText(posterTitle.slice(0, 12))}</text>
    <text x="64" y="690" fill="${text}" font-family="Arial, sans-serif" font-size="28" font-weight="700">AI DEMO PROPOSAL</text>
    <rect x="590" y="760" width="76" height="76" fill="#fff"/>
    <rect x="606" y="776" width="14" height="14" fill="#111"/>
    <rect x="636" y="776" width="14" height="14" fill="#111"/>
    <rect x="606" y="806" width="14" height="14" fill="#111"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function createDemoProject(input: { title: string; editableDesign: PosterDesign; proposal?: ProposalRecord }): ProjectRecord {
  const now = new Date().toISOString();
  return {
    id: `demo-project-${Date.now()}`,
    title: input.title,
    exportUrl: input.proposal?.previewUrl ?? null,
    createdAt: now,
    updatedAt: now,
    editableDesign: input.editableDesign,
  };
}

function createDemoUploadedImageRecord(file: File): Promise<UploadedImageRecord> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ url, width: image.naturalWidth || POSTER_CANVAS.width, height: image.naturalHeight || POSTER_CANVAS.height });
    image.onerror = () => resolve({ url, width: POSTER_CANVAS.width, height: POSTER_CANVAS.height });
    image.src = url;
  });
}

function buildImportedPosterDesign(input: {
  imageUrl: string;
  width: number;
  height: number;
  targetCanvas: {
    width: number;
    height: number;
  };
  objectFit: PosterImageLayer["objectFit"];
  title: string;
  qrTargetType: PosterDesign["qrTargetType"];
  qrTargetUrl: string;
}): PosterDesign {
  const canvas = input.targetCanvas;
  return {
    version: 1,
    canvas: {
      width: canvas.width,
      height: canvas.height,
      backgroundColor: "#ffffff",
    },
    templateId: "minimal-recital",
    title: input.title,
    qrTargetType: input.qrTargetType,
    qrTargetUrl: input.qrTargetUrl,
    layers: [
      {
        id: "uploaded-poster",
        name: "업로드 포스터",
        type: "image",
        src: input.imageUrl,
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
        objectFit: input.objectFit,
        objectPosition: "50% 50%",
        imageRole: "poster",
        protectedAreas: [],
        coverPatches: [],
        visible: true,
        locked: true,
        opacity: 1,
        adjustments: {
          brightness: 1,
          contrast: 1,
          saturation: 1,
          hueRotate: 0,
          grayscale: 0,
          tintColor: "#111111",
          tintStrength: 0,
        },
      },
    ],
  };
}

function resolvePosterImportCanvas(
  settings: {
    preset: PosterCanvasPresetValue;
    customWidth: number;
    customHeight: number;
  },
  uploaded: {
    width: number;
    height: number;
  },
) {
  if (settings.preset === "custom") {
    return {
      width: clampBoxValue(settings.customWidth, 240, 3200),
      height: clampBoxValue(settings.customHeight, 240, 3200),
    };
  }
  const preset = posterCanvasPresets.find((item) => item.value === settings.preset);
  if (preset) {
    return {
      width: preset.width,
      height: preset.height,
    };
  }
  return fitPosterCanvas(uploaded.width, uploaded.height);
}

function fitPosterCanvas(width: number, height: number) {
  const sourceWidth = Math.max(1, width);
  const sourceHeight = Math.max(1, height);
  const scale = POSTER_CANVAS.height / Math.max(sourceWidth, sourceHeight);
  return {
    width: Math.max(320, Math.round(sourceWidth * scale)),
    height: Math.max(320, Math.round(sourceHeight * scale)),
  };
}

function createOcrCoverPatch(
  sourceLayer: PosterImageLayer,
  item: PosterOcrItem,
  idPrefix: string,
  index: number,
): NonNullable<PosterImageLayer["coverPatches"]>[number] {
  const box = ocrItemToLayerBox(sourceLayer, item, 10);
  return {
    id: `${idPrefix}${item.id}`,
    name: `OCR 가림 ${index + 1}`,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    fill: item.backgroundColor,
    opacity: 0.96,
  };
}

function createOcrTextLayer(sourceLayer: PosterImageLayer, item: PosterOcrItem, idPrefix: string, index: number): PosterTextLayer {
  const box = ocrItemToLayerBox(sourceLayer, item, 6);
  const fontSize = Math.max(11, Math.min(92, Math.round(box.height * 0.72)));
  const id = `${idPrefix}${item.id}`;
  return {
    id,
    name: `OCR 텍스트 ${index + 1}`,
    type: "text",
    text: item.text,
    ocrSourceLayerId: sourceLayer.id,
    ocrItemId: item.id,
    ocrOriginalText: item.text,
    ocrConfidence: item.confidence,
    ocrCoverPatchId: `ocr-cover-${sourceLayer.id}-${item.id}`,
    x: sourceLayer.x + box.x + 4,
    y: sourceLayer.y + box.y + Math.max(0, Math.round((box.height - fontSize) * 0.25)),
    width: Math.max(70, box.width + 18),
    height: Math.max(24, box.height + 8),
    fontFamily: "poster-nanum-gothic",
    fontSize,
    fontWeight: item.text.length <= 8 ? 800 : 700,
    color: item.textColor,
    align: "left",
    lineHeight: 1.05,
    visible: true,
    opacity: 1,
  };
}

function ocrItemToLayerBox(sourceLayer: PosterImageLayer, item: PosterOcrItem, padding: number) {
  const x = Math.round(item.x * sourceLayer.width);
  const y = Math.round(item.y * sourceLayer.height);
  const width = Math.round(item.width * sourceLayer.width);
  const height = Math.round(item.height * sourceLayer.height);
  const left = Math.max(0, x - padding);
  const top = Math.max(0, y - Math.round(padding * 0.75));
  const right = Math.min(sourceLayer.width, x + width + padding);
  const bottom = Math.min(sourceLayer.height, y + height + padding);
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function protectedAreaClipPath(shape?: NonNullable<NonNullable<PosterImageLayer["protectedAreas"]>[number]["shape"]>) {
  if (shape === "ellipse") return "ellipse(50% 50% at 50% 50%)";
  if (shape === "freeform") return "polygon(8% 16%, 72% 4%, 96% 38%, 86% 86%, 34% 98%, 4% 66%)";
  return undefined;
}

function LayerInspector({
  layer,
  design,
  busy,
  updateSelectedLayer,
  updateTypedLayer,
  fitLayerToCanvas,
  updateCanvasSize,
  runPosterOcr,
  selectLayer,
}: {
  layer: PosterLayer;
  design: PosterDesign;
  busy: string | null;
  updateSelectedLayer: (patch: Partial<PosterLayer>) => void;
  updateTypedLayer: <T extends PosterLayer>(layerId: string, updater: (layer: T) => T) => void;
  fitLayerToCanvas: (layerId: string, fit: PosterImageLayer["objectFit"]) => void;
  updateCanvasSize: (width: number, height: number) => void;
  runPosterOcr: (layer: PosterImageLayer) => void;
  selectLayer: (layerId: string) => void;
}) {
  const isLockedPoster = layer.type === "image" && layer.imageRole === "poster" && layer.locked !== false;
  const ocrTextLayers =
    layer.type === "image" && layer.imageRole === "poster"
      ? design.layers.filter(
          (item): item is PosterTextLayer =>
            item.type === "text" && (item.ocrSourceLayerId === layer.id || item.id.startsWith(`ocr-text-${layer.id}-`)),
        )
      : [];
  return (
    <div className="ai-layer-inspector">
      <p className="section-eyebrow">{layer.type.toUpperCase()} LAYER</p>
      {layer.type === "image" && layer.imageRole === "poster" ? (
        <div className="ai-poster-layer-tools">
          <strong>업로드 포스터</strong>
          <div className="ai-action-row">
            <Button type="button" variant="secondary" onClick={() => fitLayerToCanvas(layer.id, "contain")}>
              전체 맞춤
            </Button>
            <Button type="button" variant="secondary" onClick={() => fitLayerToCanvas(layer.id, "cover")}>
              꽉 채움
            </Button>
          </div>
          <label className="ai-checkbox-field">
            <input type="checkbox" checked={layer.locked !== false} onChange={(event) => updateSelectedLayer({ locked: event.target.checked })} />
            <span>위치 잠금</span>
          </label>
          <div className="ai-canvas-resize-box">
            <strong>캔버스 크기</strong>
            <div className="segmented-control compact">
              {posterCanvasPresets
                .filter((preset) => preset.value !== "custom")
                .map((preset) => (
                  <button key={preset.value} type="button" onClick={() => updateCanvasSize(preset.width, preset.height)}>
                    {preset.label}
                  </button>
                ))}
            </div>
            <div className="ai-field-grid">
              <NumberField label="가로 px" value={design.canvas.width} onChange={(value) => updateCanvasSize(value, design.canvas.height)} />
              <NumberField label="세로 px" value={design.canvas.height} onChange={(value) => updateCanvasSize(design.canvas.width, value)} />
            </div>
          </div>
        </div>
      ) : null}
      <div className="ai-field-grid">
        <NumberField label="X" value={layer.x} disabled={isLockedPoster} onChange={(value) => updateSelectedLayer({ x: value })} />
        <NumberField label="Y" value={layer.y} disabled={isLockedPoster} onChange={(value) => updateSelectedLayer({ y: value })} />
        <NumberField label="W" value={layer.width} disabled={isLockedPoster} onChange={(value) => updateSelectedLayer({ width: value })} />
        <NumberField label="H" value={layer.height} disabled={isLockedPoster} onChange={(value) => updateSelectedLayer({ height: value })} />
      </div>
      {layer.type === "text" ? (
        <>
          <label className="ai-field">
            <span>문구</span>
            <textarea value={layer.text} onChange={(event) => updateTypedLayer<PosterTextLayer>(layer.id, (item) => ({ ...item, text: event.target.value }))} />
          </label>
          <div className="ai-field-grid">
            <NumberField label="글자 크기" value={layer.fontSize} onChange={(value) => updateTypedLayer<PosterTextLayer>(layer.id, (item) => ({ ...item, fontSize: value }))} />
            <NumberField label="굵기" value={layer.fontWeight} onChange={(value) => updateTypedLayer<PosterTextLayer>(layer.id, (item) => ({ ...item, fontWeight: value }))} />
          </div>
          <label className="ai-field">
            <span>폰트</span>
            <select value={normalizePosterFont(layer.fontFamily)} onChange={(event) => updateTypedLayer<PosterTextLayer>(layer.id, (item) => ({ ...item, fontFamily: event.target.value }))}>
              {posterFontOptions.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <div className="poster-font-preview" style={{ fontFamily: posterBrowserFontStack(layer.fontFamily) }}>
            정승혁 리사이틀 Aa 123
          </div>
          <label className="ai-field">
            <span>색상</span>
            <input type="color" value={layer.color} onChange={(event) => updateTypedLayer<PosterTextLayer>(layer.id, (item) => ({ ...item, color: event.target.value }))} />
          </label>
          <div className="segmented-control">
            {(["left", "center", "right"] as const).map((align) => (
              <button
                key={align}
                type="button"
                className={layer.align === align ? "active" : ""}
                onClick={() => updateTypedLayer<PosterTextLayer>(layer.id, (item) => ({ ...item, align }))}
              >
                {align === "left" ? "좌" : align === "center" ? "중" : "우"}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {layer.type === "image" ? (
        <>
          <div className="segmented-control">
            {(["contain", "cover"] as const).map((fit) => (
              <button
                key={fit}
                type="button"
                className={layer.objectFit === fit ? "active" : ""}
                onClick={() => updateTypedLayer<PosterImageLayer>(layer.id, (item) => ({ ...item, objectFit: fit }))}
              >
                {fit === "contain" ? "맞추기" : "채우기"}
              </button>
            ))}
          </div>
          <div className="ai-image-adjustments">
            <div className="ai-adjustment-head">
              <strong>{layer.imageRole === "poster" ? "포스터 색감" : "이미지 색감"}</strong>
              <button type="button" onClick={() => updateTypedLayer<PosterImageLayer>(layer.id, (item) => ({ ...item, adjustments: defaultImageAdjustments() }))}>
                <RotateCcw size={14} />
                초기화
              </button>
            </div>
            <RangeField
              label="밝기"
              value={layer.adjustments?.brightness ?? 1}
              min={0.55}
              max={1.45}
              step={0.01}
              display={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => updateImageAdjustment(updateTypedLayer, layer.id, { brightness: value })}
            />
            <RangeField
              label="대비"
              value={layer.adjustments?.contrast ?? 1}
              min={0.55}
              max={1.55}
              step={0.01}
              display={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => updateImageAdjustment(updateTypedLayer, layer.id, { contrast: value })}
            />
            <RangeField
              label="채도"
              value={layer.adjustments?.saturation ?? 1}
              min={0}
              max={2}
              step={0.01}
              display={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => updateImageAdjustment(updateTypedLayer, layer.id, { saturation: value })}
            />
            <RangeField
              label="색상"
              value={layer.adjustments?.hueRotate ?? 0}
              min={-180}
              max={180}
              step={1}
              display={(value) => `${Math.round(value)}도`}
              onChange={(value) => updateImageAdjustment(updateTypedLayer, layer.id, { hueRotate: value })}
            />
            <RangeField
              label="흑백"
              value={layer.adjustments?.grayscale ?? 0}
              min={0}
              max={1}
              step={0.01}
              display={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => updateImageAdjustment(updateTypedLayer, layer.id, { grayscale: value })}
            />
            <div className="ai-field-grid">
              <label className="ai-field">
                <span>틴트 색</span>
                <input
                  type="color"
                  value={toColorInput(layer.adjustments?.tintColor ?? "#111111")}
                  onChange={(event) => updateImageAdjustment(updateTypedLayer, layer.id, { tintColor: event.target.value })}
                />
              </label>
              <RangeField
                label="틴트"
                value={layer.adjustments?.tintStrength ?? 0}
                min={0}
                max={0.8}
                step={0.01}
                display={(value) => `${Math.round(value * 100)}%`}
                onChange={(value) => updateImageAdjustment(updateTypedLayer, layer.id, { tintStrength: value })}
              />
            </div>
          </div>
          {layer.imageRole === "poster" ? (
            <>
              <div className="ai-poster-ocr-box">
                <strong>텍스트 OCR</strong>
                <p>업로드 포스터의 글자를 인식해서 자동 가림 영역과 편집 가능한 텍스트 레이어로 바꿉니다.</p>
                <Button type="button" onClick={() => runPosterOcr(layer)} disabled={Boolean(busy)} className="w-full">
                  {busy === "poster-ocr" ? <Loader2 className="spin-icon" size={16} /> : <TextCursorInput size={16} />}
                  OCR 텍스트 인식
                </Button>
              </div>
              <OcrTextLayerList
                sourceLayer={layer}
                textLayers={ocrTextLayers}
                updateTypedLayer={updateTypedLayer}
                selectLayer={selectLayer}
              />
              <PosterImageRegionControls layer={layer} updateTypedLayer={updateTypedLayer} />
            </>
          ) : null}
        </>
      ) : null}
      {layer.type === "qr" ? (
        <>
          <label className="ai-field">
            <span>QR URL</span>
            <input value={layer.targetUrl} onChange={(event) => updateTypedLayer<PosterQrLayer>(layer.id, (item) => ({ ...item, targetUrl: event.target.value }))} />
          </label>
          <label className="ai-field">
            <span>캡션</span>
            <input value={layer.caption ?? ""} onChange={(event) => updateTypedLayer<PosterQrLayer>(layer.id, (item) => ({ ...item, caption: event.target.value }))} />
          </label>
        </>
      ) : null}
      {layer.type === "shape" ? (
        <div className="ai-field-grid">
          <label className="ai-field">
            <span>채움</span>
            <input type="color" value={toColorInput(layer.fill)} onChange={(event) => updateTypedLayer<PosterShapeLayer>(layer.id, (item) => ({ ...item, fill: event.target.value }))} />
          </label>
          <label className="ai-field">
            <span>선</span>
            <input type="color" value={toColorInput(layer.stroke ?? "#111111")} onChange={(event) => updateTypedLayer<PosterShapeLayer>(layer.id, (item) => ({ ...item, stroke: event.target.value }))} />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function OcrTextLayerList({
  sourceLayer,
  textLayers,
  updateTypedLayer,
  selectLayer,
}: {
  sourceLayer: PosterImageLayer;
  textLayers: PosterTextLayer[];
  updateTypedLayer: <T extends PosterLayer>(layerId: string, updater: (layer: T) => T) => void;
  selectLayer: (layerId: string) => void;
}) {
  if (!textLayers.length) {
    return (
      <div className="ai-ocr-edit-list is-empty">
        <strong>OCR 문구 편집</strong>
        <p>아직 편집 가능한 OCR 문구가 없습니다. 위의 OCR 텍스트 인식을 먼저 실행하세요.</p>
      </div>
    );
  }

  return (
    <div className="ai-ocr-edit-list">
      <div className="ai-ocr-edit-head">
        <strong>OCR 문구 편집</strong>
        <span>
          {textLayers.length}개 문구 / 가림 {sourceLayer.coverPatches?.length ?? 0}개
        </span>
      </div>
      <div className="ai-ocr-edit-items">
        {textLayers.map((textLayer, index) => (
          <div key={textLayer.id} className="ai-ocr-edit-item">
            <button type="button" onClick={() => selectLayer(textLayer.id)} aria-label={`${index + 1}번 OCR 문구 캔버스에서 선택`}>
              {index + 1}
            </button>
            <label>
              <span>
                {textLayer.ocrConfidence != null ? `신뢰도 ${Math.round(textLayer.ocrConfidence)}%` : "OCR 문구"}
                {textLayer.ocrOriginalText && textLayer.ocrOriginalText !== textLayer.text ? ` · 원문: ${textLayer.ocrOriginalText}` : ""}
              </span>
              <textarea
                value={textLayer.text}
                onChange={(event) =>
                  updateTypedLayer<PosterTextLayer>(textLayer.id, (item) => ({
                    ...item,
                    text: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function PosterImageRegionControls({
  layer,
  updateTypedLayer,
}: {
  layer: PosterImageLayer;
  updateTypedLayer: <T extends PosterLayer>(layerId: string, updater: (layer: T) => T) => void;
}) {
  const addProtectedArea = () => {
    updateTypedLayer<PosterImageLayer>(layer.id, (item) => ({
      ...item,
      protectedAreas: [
        ...(item.protectedAreas ?? []),
        {
          id: `protect-${Date.now()}`,
          name: `색감 제외 ${(item.protectedAreas?.length ?? 0) + 1}`,
          shape: "rect",
          x: Math.round(item.width * 0.58),
          y: Math.round(item.height * 0.1),
          width: Math.round(item.width * 0.28),
          height: Math.round(item.height * 0.28),
        },
      ],
    }));
  };

  return (
    <div className="ai-image-region-tools">
      <div className="ai-region-head">
        <strong>색감 제외 영역</strong>
        <button type="button" onClick={addProtectedArea}>
          <Plus size={14} />
          영역
        </button>
      </div>
      {(layer.protectedAreas ?? []).length ? (
        <div className="ai-region-list">
          {(layer.protectedAreas ?? []).map((area) => (
            <div key={area.id} className="ai-region-card">
              <div className="ai-region-card-head">
                <input
                  value={area.name}
                  onChange={(event) => updateProtectedArea(updateTypedLayer, layer.id, area.id, { name: event.target.value })}
                  aria-label="색감 제외 영역 이름"
                />
                <button type="button" onClick={() => removeProtectedArea(updateTypedLayer, layer.id, area.id)}>
                  삭제
                </button>
              </div>
              <div className="ai-field-grid">
                <NumberField label="X" value={area.x} onChange={(value) => updateProtectedArea(updateTypedLayer, layer.id, area.id, { x: clampBoxValue(value, 0, layer.width) })} />
                <NumberField label="Y" value={area.y} onChange={(value) => updateProtectedArea(updateTypedLayer, layer.id, area.id, { y: clampBoxValue(value, 0, layer.height) })} />
                <NumberField label="W" value={area.width} onChange={(value) => updateProtectedArea(updateTypedLayer, layer.id, area.id, { width: clampBoxValue(value, 1, layer.width) })} />
                <NumberField label="H" value={area.height} onChange={(value) => updateProtectedArea(updateTypedLayer, layer.id, area.id, { height: clampBoxValue(value, 1, layer.height) })} />
              </div>
              <div className="segmented-control">
                {(["rect", "ellipse", "freeform"] as const).map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    className={(area.shape ?? "rect") === shape ? "active" : ""}
                    onClick={() => updateProtectedArea(updateTypedLayer, layer.id, area.id, { shape })}
                  >
                    {shape === "rect" ? "직사각형" : shape === "ellipse" ? "타원" : "자유형"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="ai-region-empty">인물 사진이나 로고처럼 색을 유지할 부분을 추가하세요.</p>
      )}

      {(layer.coverPatches ?? []).length ? (
        <p className="ai-region-empty">OCR 가림 영역 {(layer.coverPatches ?? []).length}개가 적용됐습니다. 문구는 생성된 OCR 텍스트 레이어를 선택해서 수정하세요.</p>
      ) : (
        <p className="ai-region-empty">글자 수정이 필요하면 포스터 레이어에서 OCR 텍스트 인식을 실행하세요.</p>
      )}
    </div>
  );
}

function updateProtectedArea(
  updateTypedLayer: <T extends PosterLayer>(layerId: string, updater: (layer: T) => T) => void,
  layerId: string,
  areaId: string,
  patch: Partial<NonNullable<PosterImageLayer["protectedAreas"]>[number]>,
) {
  updateTypedLayer<PosterImageLayer>(layerId, (item) => ({
    ...item,
    protectedAreas: (item.protectedAreas ?? []).map((area) => (area.id === areaId ? { ...area, ...patch } : area)),
  }));
}

function removeProtectedArea(
  updateTypedLayer: <T extends PosterLayer>(layerId: string, updater: (layer: T) => T) => void,
  layerId: string,
  areaId: string,
) {
  updateTypedLayer<PosterImageLayer>(layerId, (item) => ({
    ...item,
    protectedAreas: (item.protectedAreas ?? []).filter((area) => area.id !== areaId),
  }));
}

function clampBoxValue(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.round(Math.min(max, Math.max(min, value)));
}

function updateDraggedImageRegion(layer: PosterImageLayer, drag: RegionDragState, dx: number, dy: number): PosterImageLayer {
  const nextBox =
    drag.mode === "resize"
      ? {
          x: drag.x,
          y: drag.y,
          width: clampBoxValue(drag.width + dx, 12, layer.width - drag.x),
          height: clampBoxValue(drag.height + dy, 12, layer.height - drag.y),
        }
      : {
          x: clampBoxValue(drag.x + dx, 0, layer.width - drag.width),
          y: clampBoxValue(drag.y + dy, 0, layer.height - drag.height),
          width: drag.width,
          height: drag.height,
        };

  if (drag.regionKind === "protected") {
    return {
      ...layer,
      protectedAreas: (layer.protectedAreas ?? []).map((area) => (area.id === drag.regionId ? { ...area, ...nextBox } : area)),
    };
  }

  return {
    ...layer,
    coverPatches: (layer.coverPatches ?? []).map((patch) => (patch.id === drag.regionId ? { ...patch, ...nextBox } : patch)),
  };
}

function snapLayerToCanvas(
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  canvasWidth: number,
  canvasHeight: number,
) {
  const threshold = 12;
  const next = { ...box };
  if (Math.abs(next.x) <= threshold) next.x = 0;
  if (Math.abs(next.y) <= threshold) next.y = 0;
  if (Math.abs(next.x + next.width - canvasWidth) <= threshold) next.x = canvasWidth - next.width;
  if (Math.abs(next.y + next.height - canvasHeight) <= threshold) next.y = canvasHeight - next.height;
  return next;
}

function updateImageAdjustment(
  updateTypedLayer: <T extends PosterLayer>(layerId: string, updater: (layer: T) => T) => void,
  layerId: string,
  patch: NonNullable<PosterImageLayer["adjustments"]>,
) {
  updateTypedLayer<PosterImageLayer>(layerId, (item) => ({
    ...item,
    adjustments: {
      ...defaultImageAdjustments(),
      ...item.adjustments,
      ...patch,
    },
  }));
}

function defaultImageAdjustments(): NonNullable<PosterImageLayer["adjustments"]> {
  return {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hueRotate: 0,
    grayscale: 0,
    tintColor: "#111111",
    tintStrength: 0,
  };
}

function cssImageFilter(layer: PosterImageLayer) {
  const adjustments = {
    ...defaultImageAdjustments(),
    ...layer.adjustments,
  };
  return [
    `brightness(${adjustments.brightness})`,
    `contrast(${adjustments.contrast})`,
    `saturate(${adjustments.saturation})`,
    `hue-rotate(${adjustments.hueRotate}deg)`,
    `grayscale(${adjustments.grayscale})`,
  ].join(" ");
}

function GenerationRunHistory({
  runs,
  loading,
  onRefresh,
}: {
  runs: PosterGenerationRunRecord[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="ai-generation-history">
      <div className="ai-generation-history-head">
        <strong>
          <History size={16} />
          최근 생성 기록
        </strong>
        <button type="button" onClick={onRefresh} disabled={loading} aria-label="생성 기록 새로고침">
          {loading ? <Loader2 className="spin-icon" size={14} /> : <RefreshCw size={14} />}
        </button>
      </div>
      {runs.length ? (
        <div className="ai-generation-run-list">
          {runs.slice(0, 6).map((run) => (
            <article key={run.id} className={`ai-generation-run is-${run.status}`}>
              <div>
                <strong>{run.planSummary ?? run.orchestrationPrompt ?? "포스터 시안 생성"}</strong>
                <span>
                  {formatRunTime(run.createdAt)} · {runStatusLabel(run.status)} · {run.plannerProvider}
                </span>
              </div>
              <em>
                {run.proposalsCreated ?? 0}/{run.proposalCount}개
              </em>
              {run.templateIds?.length ? <p>템플릿: {run.templateIds.join(", ")}</p> : null}
              {run.fallbackReason ? <p>fallback: {run.fallbackReason}</p> : null}
              {run.errorMessage ? <p>오류: {run.errorMessage}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="ai-generation-history-empty">아직 저장된 포스터 시안 생성 기록이 없습니다.</p>
      )}
    </div>
  );
}

function SavedProjectShelf({
  projects,
  loading,
  activeProjectId,
  busy,
  onRefresh,
  onOpen,
}: {
  projects: SavedProjectRecord[];
  loading: boolean;
  activeProjectId?: string;
  busy: string | null;
  onRefresh: () => void;
  onOpen: (projectId: string) => void;
}) {
  return (
    <div className="ai-saved-projects">
      <div className="ai-saved-projects-head">
        <strong>
          <History size={16} />
          최근 저장 작업
        </strong>
        <span>{projects.length ? `${projects.length}개 중 최근 6개` : "저장된 작업 없음"}</span>
        <button type="button" onClick={onRefresh} disabled={loading || Boolean(busy)} aria-label="저장 작업 새로고침">
          {loading ? <Loader2 className="spin-icon" size={14} /> : <RefreshCw size={14} />}
        </button>
      </div>
      {projects.length ? (
        <div className="ai-saved-project-list">
          {projects.slice(0, 6).map((item) => (
            <article key={item.id} className={activeProjectId === item.id ? "ai-saved-project active" : "ai-saved-project"}>
              <button type="button" className="ai-saved-project-preview" onClick={() => onOpen(item.id)} disabled={Boolean(busy)} aria-label={`${item.title} 열기`}>
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" />
                ) : (
                  <FileText size={22} />
                )}
                <span>{item.sourceKind === "ai_proposal" ? "AI" : "업로드"}</span>
              </button>
              <div className="ai-saved-project-body">
                <strong>{shortProjectTitle(item.title)}</strong>
                <p>{item.sourceTitle && item.sourceTitle !== item.title ? item.sourceTitle : projectSourceLabel(item)}</p>
                <span>{[formatRunTime(item.updatedAt ?? item.createdAt ?? "") || "저장됨", projectSourceLabel(item)].filter(Boolean).join(" · ")}</span>
                <div className="ai-saved-project-actions">
                  {item.exportUrl ? (
                    <a href={item.exportUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                      PNG 보기
                    </a>
                  ) : (
                    <em>PNG 없음</em>
                  )}
                  <button type="button" onClick={() => onOpen(item.id)} disabled={Boolean(busy)}>
                    {busy === `project-${item.id}` ? <Loader2 className="spin-icon" size={14} /> : <MousePointer2 size={14} />}
                    편집 계속
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="ai-generation-history-empty">아직 저장된 편집 작업이 없습니다. 포스터 시안을 열거나 업로드 포스터를 저장하면 여기에 나타납니다.</p>
      )}
    </div>
  );
}

function ProposalCard({
  proposal,
  index,
  busy,
  onSelect,
}: {
  proposal: ProposalRecord;
  index: number;
  busy: boolean;
  onSelect: () => void;
}) {
  const qualityReport = parseProposalQualityReport(proposal.qualityReportJson);
  return (
    <article className="ai-proposal-card">
      <span>{index + 1}</span>
      <img src={proposal.previewUrl || proposal.thumbnailUrl} alt="" />
      <strong>{proposal.title}</strong>
      {qualityReport ? (
        <div className={`ai-quality-badge is-${qualityReport.rating}`}>
          <b>{qualityRatingLabel(qualityReport.rating)}</b>
          <em>{qualityReport.score}점</em>
        </div>
      ) : null}
      {qualityReport?.issues.length ? (
        <div className="ai-quality-issues">
          {qualityReport.issues.slice(0, 2).map((issue) => (
            <small key={issue.id}>{issue.message}</small>
          ))}
        </div>
      ) : null}
      {qualityReport?.autoFixes?.length ? <small className="ai-quality-autofix">자동 보정 {qualityReport.autoFixes.length}개 적용</small> : null}
      <button type="button" className="ai-proposal-open-button" onClick={onSelect} disabled={busy}>
        {busy ? <Loader2 className="spin-icon" size={16} /> : <MousePointer2 size={16} />}
        간단 편집으로 열기
      </button>
    </article>
  );
}

function NumberField({ label, value, disabled = false, onChange }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <label className="ai-field">
      <span>{label}</span>
      <input type="number" value={Math.round(value)} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="ai-field ai-range-field">
      <span>
        {label}
        <b>{display(value)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message ?? "요청을 처리할 수 없습니다.";
    throw new Error(message);
  }
  return data as T;
}

async function fetchGenerationRuns(performanceId: string) {
  const params = new URLSearchParams({
    performanceId,
    limit: "12",
  });
  const data = await apiFetch<{ runs: PosterGenerationRunRecord[] }>(`/api/poster-generation-runs?${params.toString()}`);
  return data.runs;
}

async function fetchPosterProjects(performanceId: string) {
  const params = new URLSearchParams({ performanceId });
  const data = await apiFetch<{ projects: SavedProjectRecord[] }>(`/api/poster-projects?${params.toString()}`);
  return data.projects;
}

function runStatusLabel(status: string) {
  if (status === "succeeded") return "완료";
  if (status === "failed") return "실패";
  if (status === "running") return "생성 중";
  if (status === "planning") return "계획 중";
  return status;
}

function shortProjectTitle(title: string) {
  return title.replace(/\s+업로드 포스터$/u, " · 업로드").replace(/\s+포스터$/u, " · 포스터");
}

function projectSourceLabel(project: SavedProjectRecord) {
  if (project.sourceKind === "ai_proposal") {
    return project.sourceTemplateId ? `AI 시안 · ${posterTemplateLabel(project.sourceTemplateId)}` : "AI 시안";
  }
  return "업로드 포스터";
}

function posterTemplateLabel(templateId: string) {
  const labels: Record<string, string> = {
    "minimal-recital": "미니멀 리사이틀",
    "black-editorial": "블랙 에디토리얼",
    "concert-hall-classic": "콘서트홀 클래식",
    "modern-typography": "모던 타이포",
    "soft-romantic": "소프트 로맨틱",
    "experimental-contemporary": "컨템포러리",
    "premium-monochrome": "프리미엄 모노",
    "grid-portfolio": "그리드 포트폴리오",
  };
  return labels[templateId] ?? templateId;
}

function formatRunTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseProposalQualityReport(value?: string | null): ProposalQualityReportRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ProposalQualityReportRecord;
    if (!parsed || typeof parsed !== "object" || !["good", "review", "problem"].includes(parsed.rating)) return null;
    return {
      rating: parsed.rating,
      score: Number.isFinite(parsed.score) ? Math.round(parsed.score) : 0,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      autoFixes: Array.isArray(parsed.autoFixes) ? parsed.autoFixes : [],
    };
  } catch {
    return null;
  }
}

function qualityRatingLabel(rating: ProposalQualityReportRecord["rating"]) {
  if (rating === "good") return "추천";
  if (rating === "review") return "확인 필요";
  return "문제 있음";
}

function borderStyle(layer: PosterShapeLayer) {
  return layer.stroke ? `${layer.strokeWidth ?? 1}px solid ${layer.stroke}` : undefined;
}

function toColorInput(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#111111";
}

function parseAssetMetadata(value?: string | null): AssetMetadata {
  if (!value) return { cutoutStatus: "unknown" };
  try {
    const parsed = JSON.parse(value) as {
      cutoutStatus?: unknown;
      cutoutProvider?: unknown;
      cutoutModel?: unknown;
      cutoutPipelineVersion?: unknown;
      assetPipelineMode?: unknown;
      faceIdentityStatus?: unknown;
      faceIdentityScore?: unknown;
      faceIdentityLocalScore?: unknown;
      faceIdentityDistance?: unknown;
      faceIdentityDistanceThreshold?: unknown;
      faceIdentityThreshold?: unknown;
      faceIdentityLocalThreshold?: unknown;
      faceIdentityAttempt?: unknown;
      faceIdentityMaxAttempts?: unknown;
      faceIdentityProvider?: unknown;
      faceIdentityReason?: unknown;
      profilePolishFallback?: unknown;
      profilePolishFallbackReason?: unknown;
      profilePolishSkippedReason?: unknown;
      identityMode?: unknown;
    };
    const metadata = {
      cutoutStatus: "unknown",
      cutoutProvider: typeof parsed.cutoutProvider === "string" ? parsed.cutoutProvider : undefined,
      cutoutModel: typeof parsed.cutoutModel === "string" ? parsed.cutoutModel : undefined,
      cutoutPipelineVersion: typeof parsed.cutoutPipelineVersion === "string" ? parsed.cutoutPipelineVersion : undefined,
      assetPipelineMode: typeof parsed.assetPipelineMode === "string" ? parsed.assetPipelineMode : undefined,
      faceIdentityScore: typeof parsed.faceIdentityScore === "number" ? parsed.faceIdentityScore : undefined,
      faceIdentityLocalScore: typeof parsed.faceIdentityLocalScore === "number" ? parsed.faceIdentityLocalScore : undefined,
      faceIdentityDistance: typeof parsed.faceIdentityDistance === "number" ? parsed.faceIdentityDistance : undefined,
      faceIdentityDistanceThreshold: typeof parsed.faceIdentityDistanceThreshold === "number" ? parsed.faceIdentityDistanceThreshold : undefined,
      faceIdentityThreshold: typeof parsed.faceIdentityThreshold === "number" ? parsed.faceIdentityThreshold : undefined,
      faceIdentityLocalThreshold: typeof parsed.faceIdentityLocalThreshold === "number" ? parsed.faceIdentityLocalThreshold : undefined,
      faceIdentityAttempt: typeof parsed.faceIdentityAttempt === "number" ? parsed.faceIdentityAttempt : undefined,
      faceIdentityMaxAttempts: typeof parsed.faceIdentityMaxAttempts === "number" ? parsed.faceIdentityMaxAttempts : undefined,
      faceIdentityProvider: typeof parsed.faceIdentityProvider === "string" ? parsed.faceIdentityProvider : undefined,
      faceIdentityReason: typeof parsed.faceIdentityReason === "string" ? parsed.faceIdentityReason : undefined,
      profilePolishFallback: typeof parsed.profilePolishFallback === "boolean" ? parsed.profilePolishFallback : undefined,
      profilePolishFallbackReason: typeof parsed.profilePolishFallbackReason === "string" ? parsed.profilePolishFallbackReason : undefined,
      profilePolishSkippedReason: typeof parsed.profilePolishSkippedReason === "string" ? parsed.profilePolishSkippedReason : undefined,
      identityMode: typeof parsed.identityMode === "string" ? parsed.identityMode : undefined,
    } as AssetMetadata;
    if (parsed.faceIdentityStatus === "passed" || parsed.faceIdentityStatus === "failed" || parsed.faceIdentityStatus === "unchecked") {
      metadata.faceIdentityStatus = parsed.faceIdentityStatus;
    }
    if (parsed.cutoutStatus === "generated" || parsed.cutoutStatus === "fallback_source" || parsed.cutoutStatus === "not_attempted") {
      return { ...metadata, cutoutStatus: parsed.cutoutStatus };
    }
    return metadata;
  } catch {
    return { cutoutStatus: "unknown" };
  }
  return { cutoutStatus: "unknown" };
}

function compareProfileVariantAssets(left: PerformerAssetRecord, right: PerformerAssetRecord) {
  const leftMetadata = parseAssetMetadata(left.providerMetadataJson);
  const rightMetadata = parseAssetMetadata(right.providerMetadataJson);
  const leftDistanceScore =
    typeof leftMetadata.faceIdentityDistance === "number" && typeof leftMetadata.faceIdentityDistanceThreshold === "number"
      ? 1 - leftMetadata.faceIdentityDistance / Math.max(leftMetadata.faceIdentityDistanceThreshold, 0.001)
      : undefined;
  const rightDistanceScore =
    typeof rightMetadata.faceIdentityDistance === "number" && typeof rightMetadata.faceIdentityDistanceThreshold === "number"
      ? 1 - rightMetadata.faceIdentityDistance / Math.max(rightMetadata.faceIdentityDistanceThreshold, 0.001)
      : undefined;
  const leftScore = leftMetadata.faceIdentityScore ?? leftDistanceScore ?? leftMetadata.faceIdentityLocalScore ?? 0;
  const rightScore = rightMetadata.faceIdentityScore ?? rightDistanceScore ?? rightMetadata.faceIdentityLocalScore ?? 0;
  return rightScore - leftScore;
}

function cutoutStatusLabel(status: AssetMetadata["cutoutStatus"]) {
  if (status === "generated") return "누끼 완료: 프로필 변형 생성에 쓸 수 있습니다.";
  if (status === "fallback_source") return "누끼 실패: 단색 배경 분리가 불안정해 원본으로 보존했습니다.";
  if (status === "not_attempted") return "누끼 분석을 아직 실행하지 않았습니다.";
  return "누끼 상태를 확인할 수 없습니다.";
}

function assetModeLabel(asset: PerformerAssetRecord) {
  if (asset.generationMode === "background-replace") return "배경 교체 baseline + rembg";
  if (asset.generationMode === "pose-synthesis") return "FaceID 포즈 합성 + rembg";
  if (asset.generationMode === "portrait-variant") return "프로필 후보 생성 + rembg";
  if (asset.generationMode === "source-lock") return "업로드 사진 기반 + rembg";
  if (asset.generationMode === "live") return "AI 사진 보정 + rembg";
  return "Mock 이미지 + rembg";
}

function isBackgroundBaselineAsset(asset: PerformerAssetRecord | null) {
  if (!asset) return false;
  const metadata = parseAssetMetadata(asset.providerMetadataJson);
  return asset.generationMode === "background-replace" || metadata.identityMode === "background_replace";
}

function isPosterReadyPerformerAsset(asset: PerformerAssetRecord, metadata: AssetMetadata) {
  return (
    asset.generationMode === "portrait-variant" ||
    asset.generationMode === "pose-synthesis" ||
    metadata.identityMode === "portrait_variant" ||
    metadata.identityMode === "pose_synthesis"
  );
}

function savedAssetUsage(asset: PerformerAssetRecord) {
  const metadata = parseAssetMetadata(asset.providerMetadataJson);
  if (isPosterReadyPerformerAsset(asset, metadata) && metadata.cutoutStatus === "generated") {
    return {
      statusLabel: "바로 포스터 시안 가능",
      actionLabel: "포스터 시안 만들기",
      actionKind: "proposal" as const,
      disabled: false,
    };
  }
  if (metadata.cutoutStatus === "generated") {
    return {
      statusLabel: isBackgroundBaselineAsset(asset) ? "프로필 후보 생성 baseline" : "프로필 후보 생성 재료",
      actionLabel: "프로필 후보 만들기",
      actionKind: "variant" as const,
      disabled: false,
    };
  }
  return {
    statusLabel: "누끼 확인 필요",
    actionLabel: "선택하기",
    actionKind: "select" as const,
    disabled: false,
  };
}

function collectUsablePosterProfileCandidates(assets: PerformerAssetRecord[]) {
  const seen = new Set<string>();
  const candidates: PerformerAssetRecord[] = [];
  for (const asset of assets) {
    const metadata = parseAssetMetadata(asset.providerMetadataJson);
    if (!isPosterReadyPerformerAsset(asset, metadata) || metadata.cutoutStatus !== "generated") continue;
    if (metadata.faceIdentityStatus === "failed") continue;
    const key = `${asset.generatedImageUrl}|${asset.cutoutPngUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(asset);
  }
  return candidates;
}

function pipelineStatusTitle(
  identityMode: string,
  pipelineStatus: PipelineStatus,
  generationIsLive: boolean,
  uploadedPhotoLivePolish: boolean,
  baselineReadyForPose = false,
) {
  if (identityMode === "background_replace") {
    return pipelineStatus.poseSynthesis?.backgroundReady ? "1단계 배경 교체: ComfyUI 준비됨" : "1단계 배경 교체: 기본 생성 사용";
  }
  if (identityMode === "pose_synthesis") {
    if (pipelineStatus.poseSynthesis?.poseReady && !baselineReadyForPose) return "2단계 포즈 합성: 1단계 baseline 필요";
    return pipelineStatus.poseSynthesis?.poseReady ? "2단계 포즈 합성: FaceID/OpenPose 준비됨" : "2단계 포즈 합성: ComfyUI 준비 전";
  }
  if (identityMode === "uploaded_photo" || identityMode === "face_locked") {
    return uploadedPhotoLivePolish ? "업로드 사진 기반 AI 보정 활성화" : "업로드 사진 직접 사용 활성화";
  }
  return generationIsLive ? "AI 사진 보정 활성화" : "Mock 모드";
}

function pipelineStatusDetail(
  identityMode: string,
  pipelineStatus: PipelineStatus,
  generationIsLive: boolean,
  uploadedPhotoLivePolish: boolean,
  baselineReadyForPose = false,
) {
  const cutout = `${pipelineStatus.cutout.provider}${pipelineStatus.cutout.model ? `/${pipelineStatus.cutout.model}` : ""}`;
  if (identityMode === "background_replace") {
    return pipelineStatus.poseSynthesis?.backgroundReady ? `${pipelineStatus.poseSynthesis.provider} 배경 교체 -> ${cutout}` : `${pipelineStatus.imageGeneration.provider} 배경 교체 baseline -> ${cutout}`;
  }
  if (identityMode === "pose_synthesis") {
    if (pipelineStatus.poseSynthesis?.poseReady && !baselineReadyForPose) return "먼저 1단계 배경 교체에서 누끼 완료 baseline을 생성하거나 선택";
    return pipelineStatus.poseSynthesis?.poseReady ? `${pipelineStatus.poseSynthesis.provider} FaceID/OpenPose -> ${cutout}` : "COMFYUI_BASE_URL / COMFYUI_POSE_WORKFLOW_PATH 필요";
  }
  if (identityMode === "uploaded_photo" || identityMode === "face_locked") {
    return uploadedPhotoLivePolish ? `${pipelineStatus.imageGeneration.provider} 보정 -> ${cutout}` : `업로드 원본 -> ${cutout}`;
  }
  return generationIsLive ? `${pipelineStatus.imageGeneration.provider} -> ${cutout}` : `생성 API 키 없음 -> 업로드 이미지 정리 -> ${cutout}`;
}

function assetGenerationProgressMessage(identityMode: string, generationIsLive: boolean) {
  if (identityMode === "background_replace") return "얼굴과 포즈를 고정하고 배경 교체 baseline 생성 중";
  if (identityMode === "pose_synthesis") return "FaceID + OpenPose 포즈 합성 후 rembg 누끼 처리 중";
  if (identityMode === "uploaded_photo" || identityMode === "face_locked") return "업로드 사진을 프로필용으로 정리하고 rembg 누끼 처리 중";
  return generationIsLive ? "AI 사진 보정 후 rembg 누끼 처리 중" : "Mock 에셋 정리 후 rembg 누끼 처리 중";
}

function assetActionLabel(identityMode: string, generationIsLive: boolean) {
  if (identityMode === "background_replace") return "1단계 배경 교체";
  if (identityMode === "pose_synthesis") return "2단계 포즈 합성";
  if (identityMode === "uploaded_photo" || identityMode === "face_locked") return "사진 기반 에셋 생성";
  return generationIsLive ? "AI 보정 에셋 생성" : "Mock 에셋 준비";
}

function proposalVariantStatusLabel(
  status: NonNullable<PipelineStatus["proposalVariants"]>,
  proposalCount: number,
) {
  if (!status.ready) {
    if (status.provider === "google-ai-studio") return "Google AI Studio 포스터 시안용 연주자 변형이 선택됐지만 API 키가 없어 프로필 후보를 먼저 충분히 만들어야 합니다.";
    if (status.provider === "comfyui-faceid-controlnet") return "ComfyUI 포스터 시안용 연주자 변형이 선택됐지만 FaceID/OpenPose 워크플로가 준비되지 않아 프로필 후보를 먼저 충분히 만들어야 합니다.";
  }
  if (status.provider === "comfyui-faceid-controlnet") {
    return `${proposalCount}개 포스터 시안마다 FaceID/OpenPose 기반 연주자 변형을 ${status.candidatePoolSize ?? 10}개 후보 중 최고점으로 고릅니다.`;
  }
  if (status.provider === "google-ai-studio") {
    return `${proposalCount}개 포스터 시안마다 Google AI Studio 후보 ${status.candidatePoolSize ?? 10}개를 만들고 얼굴 점수 최고 후보를 씁니다.`;
  }
  if (status.mode === "off") {
    return "포스터 시안별 연주자 변형이 꺼져 있습니다. 같은 누끼 복붙을 막기 위해 저장된 프로필 후보가 포스터 시안 수만큼 필요합니다.";
  }
  return "생성형 포스터 시안 변형 엔진이 준비되지 않았습니다. API 키 또는 ComfyUI 포즈 워크플로가 없으면 먼저 프로필 후보를 충분히 만들어야 합니다.";
}

function faceIdentityStatusLabel(metadata: AssetMetadata, pipelineStatus: PipelineStatus | null) {
  const score = typeof metadata.faceIdentityScore === "number" ? `${Math.round(metadata.faceIdentityScore * 100)}%` : null;
  const localScore = typeof metadata.faceIdentityLocalScore === "number" ? `${Math.round(metadata.faceIdentityLocalScore * 100)}%` : null;
  const distance =
    typeof metadata.faceIdentityDistance === "number" && typeof metadata.faceIdentityDistanceThreshold === "number"
      ? ` / DeepFace 거리 ${metadata.faceIdentityDistance.toFixed(3)}≤${metadata.faceIdentityDistanceThreshold.toFixed(3)}`
      : "";
  const provider = metadata.faceIdentityProvider === "deepface" ? "DeepFace " : "";
  const threshold =
    typeof metadata.faceIdentityThreshold === "number"
      ? `${Math.round(metadata.faceIdentityThreshold * 100)}%`
      : pipelineStatus?.faceIdentity
        ? `${Math.round(pipelineStatus.faceIdentity.threshold * 100)}%`
        : null;
  const localThreshold =
    typeof metadata.faceIdentityLocalThreshold === "number"
      ? `${Math.round(metadata.faceIdentityLocalThreshold * 100)}%`
      : pipelineStatus?.faceIdentity
        ? `${Math.round(pipelineStatus.faceIdentity.localThreshold * 100)}%`
        : null;
  const attempt =
    metadata.faceIdentityAttempt && metadata.faceIdentityMaxAttempts
      ? ` ${metadata.faceIdentityAttempt}/${metadata.faceIdentityMaxAttempts}회`
      : "";

  if (metadata.faceIdentityStatus === "passed") {
    if (metadata.faceIdentityProvider === "source-lock") return "업로드 사진을 원본 기준으로 사용했습니다.";
    return `${provider}얼굴 검사 통과${score ? `: ${score}` : ""}${distance}${localScore ? ` / 로컬 ${localScore}` : ""}${threshold ? ` / 기준 ${threshold}` : ""}${localThreshold ? ` / 로컬 기준 ${localThreshold}` : ""}${attempt}`;
  }
  if (metadata.faceIdentityStatus === "failed") {
    return `${provider}얼굴 유사도 낮음${score ? `: ${score}` : ""}${distance}${localScore ? ` / 로컬 ${localScore}` : ""}${threshold ? ` / 기준 ${threshold}` : ""}${localThreshold ? ` / 로컬 기준 ${localThreshold}` : ""}`;
  }
  if (metadata.faceIdentityStatus === "unchecked") {
    return "얼굴 검사는 실행되지 않았습니다. 생성 API 또는 검증 모델 상태를 확인해 주세요.";
  }
  if (pipelineStatus?.faceIdentity?.ready) {
    return `얼굴 검사 대기 중: 기준 ${threshold ?? "설정값"}로 생성 결과를 확인합니다.`;
  }
  return "얼굴 검사 정보가 없습니다.";
}

function assetReadyMessage(asset: PerformerAssetRecord, pipelineStatus: PipelineStatus | null) {
  const metadata = parseAssetMetadata(asset.providerMetadataJson);
  const cutoutProvider = metadata.cutoutProvider ?? pipelineStatus?.cutout.provider ?? "unknown";
  if (asset.generationMode === "background-replace") {
    if (metadata.cutoutStatus === "generated") {
      return `얼굴과 포즈를 고정한 배경 교체 baseline과 ${cutoutProvider} 누끼까지 완료했습니다.`;
    }
    return "배경 교체 baseline은 만들었지만 누끼가 불안정해 원본 보존 상태입니다.";
  }
  if (asset.generationMode === "pose-synthesis") {
    if (metadata.cutoutStatus === "generated") {
      return `FaceID + OpenPose 포즈 합성과 ${cutoutProvider} 누끼까지 완료했습니다. 얼굴 정합성을 확인한 뒤 포스터 시안을 생성하세요.`;
    }
    return "포즈 합성은 완료했지만 누끼가 불안정합니다. 배경이 단순한 포즈 참고 사진으로 다시 시도해 주세요.";
  }
  if (asset.generationMode === "portrait-variant") {
    if (metadata.cutoutStatus === "generated") {
      return `승인 에셋 기반 프로필 후보와 ${cutoutProvider} 누끼까지 완료했습니다. 가장 닮은 프로필 후보를 선택해 포스터 시안을 만드세요.`;
    }
    return "프로필 후보는 생성됐지만 누끼가 불안정합니다. 얼굴/의상 경계가 단순한 프로필 후보를 다시 만들어 주세요.";
  }
  if (asset.generationMode === "source-lock") {
    const fallbackReason = metadata.profilePolishFallbackReason ? ` (${metadata.profilePolishFallbackReason})` : "";
    if (metadata.cutoutStatus === "generated") {
      if (metadata.profilePolishFallback) {
        return `AI 보정 결과가 안전 기준을 통과하지 못해 업로드 원본을 보존하고 ${cutoutProvider} 누끼를 적용했습니다.${fallbackReason}`;
      }
      return `업로드 사진 기반 프로필 에셋과 ${cutoutProvider} 누끼까지 완료했습니다.`;
    }
    if (metadata.cutoutStatus === "fallback_source") {
      if (metadata.profilePolishFallback) {
        return `AI 보정 결과가 안전 기준을 통과하지 못했고 누끼도 불안정해 업로드 원본으로 보존했습니다.${fallbackReason}`;
      }
      return "업로드 사진은 보존했지만 누끼가 불안정해 원본으로 보존했습니다. 배경이 단순한 사진으로 다시 시도하면 좋아집니다.";
    }
    if (metadata.profilePolishFallback) {
      return `AI 보정 결과가 안전 기준을 통과하지 못해 업로드 원본으로 돌아왔고 ${cutoutProvider} 누끼 상태를 확인 중입니다.${fallbackReason}`;
    }
    return `업로드 사진 기반 프로필 에셋을 만들고 ${cutoutProvider} 누끼 상태를 확인 중입니다.`;
  }
  const facePrefix = metadata.faceIdentityStatus === "passed" ? "얼굴 검사 통과 후 " : "";
  if (asset.generationMode === "live") {
    if (metadata.cutoutStatus === "generated") {
      return `${facePrefix}AI 사진 보정과 ${cutoutProvider} 누끼까지 완료했습니다.`;
    }
    if (metadata.cutoutStatus === "fallback_source") {
      return `${facePrefix}AI 사진 보정은 완료했지만 누끼가 불안정해 원본으로 보존했습니다. 다시 생성하면 새 누끼 기준으로 재시도합니다.`;
    }
    return `${facePrefix}AI 사진 보정 후 ${cutoutProvider} 누끼 상태를 확인 중입니다.`;
  }
  if (metadata.cutoutStatus === "generated") {
    return `현재는 생성 API 키가 없어 mock 이미지에 ${cutoutProvider} 누끼만 적용했습니다.`;
  }
  return "현재는 생성 API 키가 없어 mock 이미지를 보존했습니다. 누끼가 불안정하면 실제 생성 환경에서 다시 시도하세요.";
}
