import { buildDemoState } from "./lib/demoBoard";
import {
  allOverlayResults,
  overlayPatient,
  resetRegistry,
  upsertPatient,
  upsertResult,
} from "./lib/registry";
import type { AuditEvent, CareCase, Message, Patient, ScreeningResult } from "./types";

const KEY = "itmam-v3";
const LEGACY_KEYS = ["itmam-v2", "itmam-v1"];

export type Persisted = {
  version: 3;
  /** ISO timestamp — used to pick newer of local vs cloud. */
  savedAt: string;
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

/** Empty board — use after Clear, before a fresh import. */
export function emptyState(): Persisted {
  resetRegistry();
  return {
    version: 3,
    savedAt: new Date().toISOString(),
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

/** @deprecated Prefer emptyState() or buildDemoState() */
export function defaultState(): Persisted {
  return emptyState();
}

function hydrateRegistry(patients: Patient[], results: ScreeningResult[]) {
  resetRegistry();
  for (const p of patients) upsertPatient(p);
  for (const r of results) upsertResult(r);
}

function normalize(parsed: Record<string, unknown>): Persisted | null {
  const ver = parsed.version;
  if (ver !== 2 && ver !== 3) return null;
  const cases = (parsed.cases as CareCase[]) ?? [];
  const patients = (parsed.patients as Patient[]) ?? [];
  const results = (parsed.results as ScreeningResult[]) ?? [];
  hydrateRegistry(patients, results);
  return {
    version: 3,
    savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    cases,
    messages: (parsed.messages as Message[]) ?? [],
    audit: (parsed.audit as AuditEvent[]) ?? [],
    selectedCaseId:
      typeof parsed.selectedCaseId === "string"
        ? parsed.selectedCaseId
        : cases[0]?.id || "",
    role:
      parsed.role === "patient" || parsed.role === "clinician"
        ? parsed.role
        : "coordinator",
    importSource:
      typeof parsed.importSource === "string" ? parsed.importSource : null,
    patients,
    results,
  };
}

export function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const next = normalize(JSON.parse(raw) as Record<string, unknown>);
      if (next) return next;
    }
    // Migrate v2 if present
    for (const legacy of LEGACY_KEYS) {
      const old = localStorage.getItem(legacy);
      if (!old) continue;
      const next = normalize(JSON.parse(old) as Record<string, unknown>);
      if (next) {
        saveState(next);
        localStorage.removeItem(legacy);
        return next;
      }
    }
  } catch {
    /* fall through */
  }
  // First visit: seed demo so judges never land on an empty board
  const demo = buildDemoState();
  saveState(demo);
  return demo;
}

export function saveState(state: Persisted) {
  const patients = state.patients.length
    ? state.patients
    : collectPatients(state.cases);
  const results = state.results.length ? state.results : allOverlayResults();
  const stamped: Persisted = {
    ...state,
    version: 3,
    savedAt: state.savedAt || new Date().toISOString(),
    patients,
    results,
  };
  localStorage.setItem(KEY, JSON.stringify(stamped));
}

export function resetState(): Persisted {
  localStorage.removeItem(KEY);
  for (const legacy of LEGACY_KEYS) localStorage.removeItem(legacy);
  return emptyState();
}

export function applyRemoteState(remote: Persisted): Persisted {
  const next = normalize(remote as unknown as Record<string, unknown>) ?? emptyState();
  saveState(next);
  return next;
}

export function snapshotRegistry(): { patients: Patient[]; results: ScreeningResult[] } {
  const results = allOverlayResults();
  const patientIds = [...new Set(results.map((r) => r.patientId))];
  const patients = patientIds
    .map((id) => overlayPatient(id))
    .filter((p): p is Patient => Boolean(p));
  return { patients, results };
}

export function stamp(state: Persisted): Persisted {
  return { ...state, version: 3, savedAt: new Date().toISOString() };
}
