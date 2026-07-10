export function ok<T>(payload: T, init?: ResponseInit) {
  return Response.json(payload, init);
}

export function errorResponse(code: string, message: string, status = 400, details?: unknown) {
  return Response.json({ error: { code, message, details } }, { status });
}

export function notFound(message: string) {
  return errorResponse("NOT_FOUND", message, 404);
}

export async function readJson(request: Request) {
  return request.json().catch(() => ({}));
}

export async function readFormData(request: Request) {
  return request.formData();
}

export function parseError(error: unknown) {
  if (error instanceof StandaloneApiError) {
    return errorResponse(error.code, error.message, error.status, error.details);
  }
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  return errorResponse("UNEXPECTED_SERVER_ERROR", message, 500);
}

export class StandaloneApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function requiredString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function oneOf<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

export function numberIn(value: unknown, options: readonly number[], fallback: number) {
  const numeric = Number(value);
  return options.includes(numeric) ? numeric : fallback;
}

export function parseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
