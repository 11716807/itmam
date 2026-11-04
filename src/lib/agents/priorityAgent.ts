import type { Enrichment } from "../enrich";
import type { Specialty, Urgency } from "../../types";

/** Priority agent — urgency, SLA, specialty from enrichment (deterministic). */
export function priorityAgent(enrichment: Enrichment): {
  urgency: Urgency;
  slaHours: number;
  specialty: Specialty;
  priorityReason: string;
  notes: string;
} {
  return {
    urgency: enrichment.urgency,
    slaHours: enrichment.slaHours,
    specialty: enrichment.specialty,
    priorityReason: enrichment.priorityReason,
    notes: `${enrichment.urgency} · SLA ${enrichment.slaHours}h · ${enrichment.specialty.replaceAll("_", " ")}`,
  };
}
