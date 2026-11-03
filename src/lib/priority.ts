import { hoursOpen, isOpen, slaBreached } from "./loop";
import { DEFAULT_RISK_WEIGHTS, type RiskWeights } from "./riskWeights";
import type { CareCase, ScreeningResult } from "../types";

export type RankedCase = {
  case: CareCase;
  result: ScreeningResult;
  score: number;
  reasons: string[];
};

export function rankCases(
  cases: CareCase[],
  resultsById: Record<string, ScreeningResult>,
  weights: RiskWeights = DEFAULT_RISK_WEIGHTS,
): RankedCase[] {
  return cases
    .filter((c) => isOpen(c.stage))
    .map((c) => {
      const result = resultsById[c.resultId];
      const reasons: string[] = [];
      let score = 0;

      if (result?.code === "fit") {
        score += weights.fit;
        reasons.push("Cancer-path screening flag (FIT)");
      }
      if (result?.code === "bp") {
        score += weights.bp;
        reasons.push("Marked blood-pressure finding");
      }
      if (result?.code === "hba1c") {
        score += weights.hba1c;
        reasons.push("Metabolic screening actionable");
      }
      if (result?.code === "moca") {
        score += weights.moca;
        reasons.push("Brain-health screen needs timed follow-up");
      }

      if (!c.ownerId) {
        score += weights.noOwner;
        reasons.push("No clinical owner");
      }
      if (c.stage === "result_in" || c.stage === "stratified") {
        score += weights.notInformed;
        reasons.push("Patient not yet informed");
      }
      if (c.stage === "told" && !c.ownerId) {
        score += weights.toldUnowned;
        reasons.push("Told but unowned — break risk");
      }
      if (c.stage === "owned" && !c.slotId) {
        score += weights.ownedNotBooked;
        reasons.push("Owned but not booked");
      }
      if (slaBreached(c)) {
        score += weights.slaBreached;
        reasons.push(`SLA breached (${c.slaHours}h)`);
      } else if (hoursOpen(c) > c.slaHours * 0.7) {
        score += weights.approachingSla;
        reasons.push("Approaching SLA");
      }

      if (c.urgency === "urgent") score += weights.urgencyUrgent;
      if (c.urgency === "soon") score += weights.urgencySoon;

      return { case: c, result, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export function defaultMessage(
  patientName: string,
  label: string,
  facility: string,
  whenHint: string,
  _lang: "en" | "ar",
): { en: string; ar: string } {
  const en = `Hello ${patientName}. Your recent ${facility} screening needs a short clinic visit to review ${label}. This message does not diagnose you. Suggested window: ${whenHint}. Open Sahhatna to confirm a time. Reply STOP if you did not consent to screening follow-up.`;
  const ar = `مرحباً ${patientName}. فحصك الأخير في ${facility} يحتاج زيارة قصيرة لمراجعة ${label}. هذه الرسالة ليست تشخيصاً. الفترة المقترحة: ${whenHint}. افتحي صحةنا لتأكيد الموعد. ردي STOP إذا لم توافقي على متابعة الفحص.`;
  return { en, ar };
}
