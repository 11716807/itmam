import type { Persisted } from "../store";
import type { RiskWeights } from "./riskWeights";

export type CloudEnvelope = {
  version: 1;
  savedAt: string;
  state: Persisted;
  riskWeights?: RiskWeights;
};

export async function pullCloudBoard(): Promise<CloudEnvelope | null> {
  try {
    const res = await fetch("/api/state", { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as { envelope?: CloudEnvelope | null };
    return data.envelope ?? null;
  } catch {
    return null;
  }
}

export async function pushCloudBoard(
  state: Persisted,
  riskWeights?: RiskWeights,
): Promise<boolean> {
  try {
    const envelope: CloudEnvelope = {
      version: 1,
      savedAt: state.savedAt || new Date().toISOString(),
      state,
      riskWeights,
    };
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envelope }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function clearCloudBoard(): Promise<boolean> {
  try {
    const res = await fetch("/api/state", { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}
