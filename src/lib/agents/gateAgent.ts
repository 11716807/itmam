import type { Enrichment } from "../enrich";

/** Gate agent — place vs filter; never silent drop. */
export function gateAgent(enrichment: Enrichment): {
  include: boolean;
  gateReason: string;
  status: "ok" | "filtered";
  notes: string;
} {
  if (!enrichment.include || enrichment.classifiedFlag !== "actionable") {
    const gateReason =
      enrichment.boardNote ||
      enrichment.priorityReason ||
      `Filtered — ${enrichment.classifiedFlag} does not open a closed loop`;
    return {
      include: false,
      gateReason,
      status: "filtered",
      notes: `Filtered (${enrichment.classifiedFlag})`,
    };
  }
  return {
    include: true,
    gateReason: "Actionable — continue to priority",
    status: "ok",
    notes: "Passed gate · actionable finding",
  };
}
