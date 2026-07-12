import { POSTER_CANVAS, type PosterImageLayer } from "../poster/types";

export const posterCanvasPresets = [
  { value: "performance", label: "공연 포스터", width: POSTER_CANVAS.width, height: POSTER_CANVAS.height },
  { value: "a4-portrait", label: "A4 세로", width: 1240, height: 1754 },
  { value: "a4-landscape", label: "A4 가로", width: 1754, height: 1240 },
  { value: "square", label: "정사각형", width: 1080, height: 1080 },
  { value: "custom", label: "직접 입력", width: POSTER_CANVAS.width, height: POSTER_CANVAS.height },
] as const;

export type PosterCanvasPresetValue = (typeof posterCanvasPresets)[number]["value"];

export type PosterImportSettings = {
  preset: PosterCanvasPresetValue;
  customWidth: number;
  customHeight: number;
  fit: PosterImageLayer["objectFit"];
};
