import type { AgentRun } from "./types";

const DIAGNOSIS_RE =
  /\b(diagnos|you have|prescribe|medication|cancer confirmed|definitely have)\b/i;

/** Local fallback narration — no network required. */
export function localExplain(run: AgentRun): string {
  const errors = run.issues.filter((i) => i.severity === "error");
  if (run.status === "needs_fix") {
    return `Agents stopped for ${run.patientName}: ${errors.map((e) => e.message).join("; ") || "data quality issues"}. Fix tagged fields and re-run.`;
  }
  if (run.status === "filtered") {
    return `${run.patientName} (${run.finding}) was filtered as ${run.classifiedFlag || "low priority"}: ${run.gateReason || run.priorityReason || "no closed loop"}. Visible on the Not on board tray — not dropped.`;
  }
  return `${run.patientName} placed as ${run.urgency || "routine"} (${run.specialty?.replaceAll("_", " ") || "unassigned"}, SLA ${run.slaHours ?? "?"}h). Reason: ${run.priorityReason || "actionable finding"}. Rules decided rank; Gemini only narrates.`;
}

function safeNarration(text: string, run: AgentRun): string {
  const trimmed = text.trim();
  if (!trimmed || DIAGNOSIS_RE.test(trimmed)) return localExplain(run);
  return trimmed;
}

/**
 * Optional Gemini narration of an already-decided graph.
 * Guardrail: narrate only — never change priority or diagnose.
 */
export async function explainAgent(run: AgentRun): Promise<string> {
  try {
    const pack = {
      purpose: "Narrate an already-decided agent graph. Do not change priority or diagnose.",
      patient: run.patientName,
      finding: run.finding,
      status: run.status,
      issues: run.issues,
      gateReason: run.gateReason,
      priorityReason: run.priorityReason,
      urgency: run.urgency,
      specialty: run.specialty,
      nodes: run.nodes.map((n) => ({
        id: n.id,
        status: n.status,
        notes: n.notes,
      })),
      rules: [
        "One short paragraph in English",
        "Do not diagnose or prescribe",
        "State that rules decided; you only explain",
        "Do not invent urgency, specialty, or SLA",
      ],
    };
    const res = await fetch("/api/itmam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack }),
    });
    if (!res.ok) return localExplain(run);
    const data = (await res.json()) as { brief?: { explainEn?: string; headlineEn?: string } };
    const text =
      data.brief?.explainEn ||
      data.brief?.headlineEn ||
      "";
    return safeNarration(text, run);
  } catch {
    return localExplain(run);
  }
}
