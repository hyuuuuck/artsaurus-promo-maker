import type { PromoDocument, PromoDocumentKind } from "./types";

type PromoDesignRow = {
  kind: string;
  documentJson: string;
};

const allowedKinds = new Set<string>(["poster", "pamphlet-bifold", "instagram-feed", "instagram-story"]);

export function promoDesignRowsToDocuments(rows: PromoDesignRow[]): Partial<Record<PromoDocumentKind, PromoDocument>> {
  const documents: Partial<Record<PromoDocumentKind, PromoDocument>> = {};

  for (const row of rows) {
    if (!allowedKinds.has(row.kind)) continue;

    try {
      const document = JSON.parse(row.documentJson) as unknown;
      if (isPromoDocument(row.kind, document)) {
        documents[row.kind as PromoDocumentKind] = document;
      }
    } catch {
      continue;
    }
  }

  return documents;
}

function isPromoDocument(kind: string, value: unknown): value is PromoDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as { kind?: unknown; canvas?: unknown; layers?: unknown };
  return document.kind === kind && Boolean(document.canvas) && typeof document.canvas === "object" && Array.isArray(document.layers);
}
