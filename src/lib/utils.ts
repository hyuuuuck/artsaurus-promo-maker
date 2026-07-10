import { clsx, type ClassValue } from "clsx";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { twMerge } from "tailwind-merge";

const ROUTE_PARAM_MAX_LENGTH = 256;
const UNSAFE_ROUTE_PARAM_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const UNSAFE_URL_LAYOUT_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ufeff]/;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "item";
}

export function isFallbackSlug(value?: string | null) {
  return /^item(?:-\d+)?$/.test(value?.trim().toLowerCase() ?? "");
}

export function decodeRouteParam(value: string, maxLength = ROUTE_PARAM_MAX_LENGTH) {
  const boundedLength = Number.isFinite(maxLength) ? Math.max(1, Math.floor(maxLength)) : ROUTE_PARAM_MAX_LENGTH;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }

  return decoded
    .replace(UNSAFE_ROUTE_PARAM_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, boundedLength);
}

export function normalizeHttpUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (UNSAFE_URL_LAYOUT_CHARACTERS.test(trimmed)) return "";

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
) {
  const cleanBase = slugify(base);
  let candidate = cleanBase;
  let suffix = 2;

  while (await exists(candidate)) {
    candidate = `${cleanBase}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function formatDateTime(value: Date | string) {
  return format(new Date(value), "yyyy년 M월 d일 a h:mm", { locale: ko });
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  return format(new Date(value), "yyyy년 M월 d일", { locale: ko });
}

export function toInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function appUrl(path = "") {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
