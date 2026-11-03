import {
  allOverlayResults,
  overlayPatient,
  resetRegistry,
  upsertPatient,
  upsertResult,
} from "./lib/registry";
import type { AuditEvent, CareCase, Message, Patient, ScreeningResult } from "./types";

const KEY = "itmam-v2";

export type Persisted = {
  version: 2;
  cases: CareCase[];
  messages: Message[];
  audit: AuditEvent[];
  selectedCaseId: string;
  role: "coordinator" | "patient" | "clinician";
  importSource: string | null;
  patients: Patient[];
  results: ScreeningResult[];
};

function collectPatients(cases: CareCase[]): Patient[] {
  const ids = [...new Set(cases.map((c) => c.patientId))];
  return ids
    .map((id) => overlayPatient(id))
    .filter((p): p is Patient => Boolean(p));
}

/** Empty board — cases appear only after an extract is enriched. */
export function defaultState(): Persisted {
  resetRegistry();
  return {
    version: 2,
    cases: [],
    messages: [],
    audit: [],
    selectedCaseId: "",
    role: "coordinator",
    importSource: null,
    patients: [],
    results: [],
  };
}

function hydrateRegistry(patients: Patient[], results: ScreeningResult[]) {
  resetRegistry();
  for (const p of patients) upsertPatient(p);
  for (const r of results) upsertResult(r);
}

export function loadState(): Persisted {
  const base = defaultState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.version !== 2) return base;
    hydrateRegistry(parsed.patients ?? [], parsed.results ?? []);
    return {
      ...base,
      ...parsed,
      cases: parsed.cases ?? [],
      messages: parsed.messages ?? [],
      audit: parsed.audit ?? [],
      patients: parsed.patients ?? [],
      results: parsed.results ?? [],
    };
  } catch {
    return base;
  }
}

export function saveState(state: Persisted) {
  const patients = state.patients.length
    ? state.patients
    : collectPatients(state.cases);
  const results = state.results.length ? state.results : allOverlayResults();
  localStorage.setItem(
    KEY,
    JSON.stringify({ ...state, patients, results }),
  );
}

export function resetState(): Persisted {
  localStorage.removeItem(KEY);
  localStorage.removeItem("itmam-v1");
  return defaultState();
}

export function snapshotRegistry(): { patients: Patient[]; results: ScreeningResult[] } {
  const results = allOverlayResults();
  const patientIds = [...new Set(results.map((r) => r.patientId))];
  const patients = patientIds
    .map((id) => overlayPatient(id))
    .filter((p): p is Patient => Boolean(p));
  return { patients, results };
}
