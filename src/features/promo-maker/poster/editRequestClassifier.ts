export type EditRequestType =
  | "safe_layout_edit"
  | "safe_visual_edit"
  | "text_edit"
  | "unsafe_identity_edit"
  | "new_asset_required"
  | "unclear";

export type EditRequestClassification = EditRequestType;

export type EditRequestClassificationDetails = {
  requestType: EditRequestType;
  allowed: boolean;
  reason: string;
  affectedLayers: string[];
  requiresNewAssetGeneration: boolean;
  safeRewrite?: string;
};

export const LOCKED_ASSET_EDIT_BLOCK_MESSAGE =
  "현재 선택된 이미지는 고정된 연주자 asset입니다. 얼굴, 자세, 의상, 악기, 표정을 바꾸려면 새 asset 생성 단계로 이동해야 합니다. 현재 포스터 편집 단계에서는 위치, 크기, 배경, 색감, 조명, 타이포그래피만 수정할 수 있습니다.";

export const LOCKED_ASSET_SAFE_REWRITE =
  "연주자 이미지는 위치, 크기, 크롭, 불투명도, 그림자, 림라이트, 색감, 배경, 타이포그래피 중심으로 수정해 주세요.";

const unsafeIdentityPatterns = [
  /얼굴|face|facial/i,
  /예쁘게|잘생기|미화|beaut/i,
  /다른 사람|타인|정체성|identity|person/i,
  /닮게|유사도|similar/i,
  /나이|age|어리게|어려 보|젊게|늙게|young|old/i,
];

const newAssetRequiredPatterns = [
  /자세|포즈|pose|몸|body/i,
  /의상|옷|드레스|정장|outfit|clothing|dress|suit/i,
  /악기|instrument|피아노|piano|바이올린|violin|첼로|cello/i,
  /표정|웃게|미소|expression|smile/i,
  /머리|헤어|hairstyle|hair/i,
];

const textPatterns = [/문구|글자|텍스트|제목|폰트|이름|날짜|시간|장소|공연장|프로그램|티켓|text|title|font|name|date|venue|program|ticket/i];
const layoutPatterns = [
  /위치|크기|크게|작게|확대|축소|배치|정렬|여백|자르|옮기|옮겨|왼쪽|오른쪽|위쪽|아래쪽|좌측|우측|crop|scale|position|layout|align|margin/i,
];
const visualPatterns = [
  /배경|색|색감|조명|그림자|림라이트|팔레트|분위기|어둡|밝|고급|미니멀|클래식|background|color|lighting|shadow|palette|tone|mood|dark|bright|minimal|classical|luxury/i,
];

export function classifyPosterEditRequest(request: string): EditRequestClassification {
  const normalized = request.trim();
  if (!normalized) return "unclear";
  if (unsafeIdentityPatterns.some((pattern) => pattern.test(normalized))) return "unsafe_identity_edit";
  if (newAssetRequiredPatterns.some((pattern) => pattern.test(normalized))) return "new_asset_required";
  if (textPatterns.some((pattern) => pattern.test(normalized))) return "text_edit";
  if (layoutPatterns.some((pattern) => pattern.test(normalized))) return "safe_layout_edit";
  if (visualPatterns.some((pattern) => pattern.test(normalized))) return "safe_visual_edit";
  return "unclear";
}

export function isBlockedForLockedPerformerAsset(classification: EditRequestClassification) {
  return classification === "unsafe_identity_edit" || classification === "new_asset_required";
}

export function classifyPosterEditRequestDetailed(
  request: string,
  affectedLayers: string[] = ["performer_asset"],
): EditRequestClassificationDetails {
  const requestType = classifyPosterEditRequest(request);
  const blocked = isBlockedForLockedPerformerAsset(requestType);
  return {
    requestType,
    allowed: !blocked,
    reason: classificationReason(requestType),
    affectedLayers,
    requiresNewAssetGeneration: blocked,
    safeRewrite: blocked ? LOCKED_ASSET_SAFE_REWRITE : undefined,
  };
}

function classificationReason(requestType: EditRequestType) {
  switch (requestType) {
    case "safe_layout_edit":
      return "연주자 에셋의 위치, 크기, 크롭 같은 비파괴 레이아웃 편집입니다.";
    case "safe_visual_edit":
      return "배경, 색감, 조명, 그림자, 전체 무드 같은 포스터 시각 편집입니다.";
    case "text_edit":
      return "공연명, 날짜, 장소, 프로그램 등 편집 가능한 텍스트 레이어 수정입니다.";
    case "unsafe_identity_edit":
      return LOCKED_ASSET_EDIT_BLOCK_MESSAGE;
    case "new_asset_required":
      return LOCKED_ASSET_EDIT_BLOCK_MESSAGE;
    case "unclear":
      return "요청이 명확하지 않아 안전한 포스터 편집으로만 처리해야 합니다.";
  }
}
