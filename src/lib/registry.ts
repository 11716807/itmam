import type { Patient, ScreeningResult } from "../types";

/** Runtime overlays from import — seed static lists stay in data/seed. */
const patients = new Map<string, Patient>();
const results = new Map<string, ScreeningResult>();

export function resetRegistry() {
  patients.clear();
  results.clear();
}

export function upsertPatient(p: Patient) {
  patients.set(p.id, p);
}

export function upsertResult(r: ScreeningResult) {
  results.set(r.id, r);
}

export function overlayPatient(id: string): Patient | undefined {
  return patients.get(id);
}

export function overlayResult(id: string): ScreeningResult | undefined {
  return results.get(id);
}

export function allOverlayResults(): ScreeningResult[] {
  return [...results.values()];
}
