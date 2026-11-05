import { enrichRow, type Enrichment } from "../enrich";
import type { ImportRow } from "../importCsv";

/** Enrichment agent — signals + classify finding (deterministic rules). */
export function enrichAgent(row: ImportRow): {
  enrichment: Enrichment;
  notes: string;
} {
  const enrichment = enrichRow(row);
  return {
    enrichment,
    notes: `Classified ${enrichment.classifiedFlag} · ${Object.keys(enrichment.signals).length} signals`,
  };
}
