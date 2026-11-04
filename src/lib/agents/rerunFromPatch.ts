import type { ImportRow } from "../importCsv";
import type { AgentEditablePatch } from "./types";

/** Apply coordinator fixes onto a cloned ImportRow before re-running agents. */
export function applyPatchToRow(row: ImportRow, patch: AgentEditablePatch): ImportRow {
  const next: ImportRow = {
    patient: { ...row.patient },
    result: { ...row.result },
    metrics: { ...row.metrics },
  };

  if (patch.name_en != null && patch.name_en.trim()) {
    next.patient.nameEn = patch.name_en.trim();
  }
  if (patch.age != null && patch.age.trim() !== "") {
    const n = Number(patch.age);
    if (Number.isFinite(n)) next.patient.age = n;
  }
  if (patch.value != null) {
    next.result.value = patch.value.trim();
  }
  if (patch.code != null && patch.code.trim()) {
    next.result.code = patch.code.trim() as ImportRow["result"]["code"];
  }
  if (patch.days_waiting != null) {
    next.metrics.days_waiting = patch.days_waiting.trim();
  }
  if (patch.notes != null) {
    next.metrics.notes = patch.notes.trim();
  }
  return next;
}
