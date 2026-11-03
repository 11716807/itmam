import { enrichRow, enrichmentToCase } from "./enrich";
import { parseImportCsv, SAMPLE_IMPORT_CSV } from "./importCsv";
import { resetRegistry, upsertPatient, upsertResult } from "./registry";
import type { Persisted } from "../store";
import type { AuditEvent } from "../types";

/** Build a judge-ready board from the sample IFHAS extract (no CSV click needed). */
export function buildDemoState(): Persisted {
  const rows = parseImportCsv(SAMPLE_IMPORT_CSV);
  resetRegistry();
  for (const row of rows) {
    upsertPatient(row.patient);
    upsertResult(row.result);
  }

  const cases = [];
  const audit: AuditEvent[] = [];
  const at = new Date().toISOString().slice(0, 16);

  for (const row of rows) {
    const decision = enrichRow(row);
    if (!decision.include) continue;
    const care = enrichmentToCase(row, decision);
    cases.push(care);
    audit.push({
      id: `aud-import-${care.id}`,
      caseId: care.id,
      at,
      actor: "system",
      action: "imported",
      detail: care.aiPriorityReason || "Enriched from demo IFHAS extract",
    });
  }

  const rankedFirst = cases[0]?.id ?? "";
  return {
    version: 3,
    savedAt: new Date().toISOString(),
    cases,
    messages: [],
    audit,
    selectedCaseId: rankedFirst,
    role: "coordinator",
    importSource: "demo-ifhas-extract.csv",
    patients: rows.map((r) => r.patient),
    results: rows.map((r) => r.result),
  };
}
