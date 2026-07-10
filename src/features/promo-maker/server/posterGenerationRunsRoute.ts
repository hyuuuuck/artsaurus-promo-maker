import { serializePosterGenerationRun } from "../poster/generationRun";
import { ok, parseError } from "./http";
import { readDb, standaloneUserId } from "./localStore";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const performanceId = url.searchParams.get("performanceId")?.trim();
    const db = await readDb();
    const runs = db.runs
      .filter((run) => run.userId === standaloneUserId())
      .filter((run) => !performanceId || run.performanceId === performanceId)
      .slice(0, limit)
      .map(serializePosterGenerationRun);
    return ok({ runs });
  } catch (error) {
    return parseError(error);
  }
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 12;
  return Math.min(30, Math.max(1, parsed));
}
