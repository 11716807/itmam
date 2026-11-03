import { enrichRow, enrichmentToCase, type Enrichment } from "./enrich";
import type { CareCase } from "../types";
import type { ImportRow } from "./importCsv";

export type ImportDecision = Enrichment;

export type PrepareEvent =
  | { type: "start"; total: number }
  | { type: "reading"; index: number; total: number; name: string; finding: string }
  | {
      type: "decided";
      index: number;
      total: number;
      name: string;
      finding: string;
      decision: Enrichment;
      care: CareCase | null;
      skipped: boolean;
    }
  | { type: "done"; placed: number; skipped: number };

export function decisionToCase(row: ImportRow, decision: Enrichment): CareCase {
  return enrichmentToCase(row, decision);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Stream enrichment onto the board one finding at a time.
 * Enrichment is local and metric-driven so any extract shape can feed the board.
 */
export async function* streamPrepareBoard(rows: ImportRow[]): AsyncGenerator<PrepareEvent> {
  const ordered = [...rows].sort((a, b) => {
    const af = a.result.flag === "actionable" ? 0 : 1;
    const bf = b.result.flag === "actionable" ? 0 : 1;
    return af - bf;
  });

  yield { type: "start", total: ordered.length };
  let placed = 0;
  let skipped = 0;

  for (let i = 0; i < ordered.length; i++) {
    const row = ordered[i];
    yield {
      type: "reading",
      index: i + 1,
      total: ordered.length,
      name: row.patient.nameEn,
      finding: `${row.result.labelEn} ${row.result.value}${row.result.unit ? ` ${row.result.unit}` : ""}`,
    };

    await sleep(280);
    const decision = enrichRow(row);
    await sleep(160);

    if (!decision.include) {
      skipped += 1;
      yield {
        type: "decided",
        index: i + 1,
        total: ordered.length,
        name: row.patient.nameEn,
        finding: row.result.labelEn,
        decision,
        care: null,
        skipped: true,
      };
      continue;
    }

    const care = enrichmentToCase(row, decision);
    placed += 1;
    yield {
      type: "decided",
      index: i + 1,
      total: ordered.length,
      name: row.patient.nameEn,
      finding: `${row.result.labelEn} ${row.result.value}`,
      decision,
      care,
      skipped: false,
    };
  }

  yield { type: "done", placed, skipped };
}
