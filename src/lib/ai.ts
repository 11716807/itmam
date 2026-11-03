import type { CareCase, Patient, ScreeningResult } from "../types";

export type ItmamBrief = {
  headlineEn: string;
  headlineAr: string;
  explainEn: string;
  explainAr: string;
  priorityReason: string;
  nextSteps: string[];
  patientMessageEn: string;
  patientMessageAr: string;
  caveats: string[];
};

export function evidencePack(patient: Patient, result: ScreeningResult, care: CareCase) {
  return {
    product: "Itmam",
    purpose: "closed-loop screening to care",
    patient: {
      id: patient.id,
      nameEn: patient.nameEn,
      preferredLang: patient.preferredLang,
      network: patient.network,
      plan: patient.insurancePlan,
    },
    result: {
      program: result.program,
      code: result.code,
      labelEn: result.labelEn,
      labelAr: result.labelAr,
      value: result.value,
      unit: result.unit,
      flag: result.flag,
      recordedAt: result.recordedAt,
      facility: result.facility,
    },
    loop: {
      stage: care.stage,
      urgency: care.urgency,
      specialty: care.specialty,
      ownerId: care.ownerId,
      slaHours: care.slaHours,
      openedAt: care.openedAt,
    },
    rules: [
      "Do not diagnose or name a disease as confirmed",
      "Do not prescribe treatment",
      "Explain that a clinician must review",
      "Keep patient message calm and actionable",
    ],
  };
}

export function localBrief(patient: Patient, result: ScreeningResult, care: CareCase): ItmamBrief {
  const whenHint = "within the next few days";
  return {
    headlineEn: `Close the loop for ${result.labelEn}`,
    headlineAr: `إتمام حلقة ${result.labelAr}`,
    explainEn: `An actionable ${result.program} finding (${result.labelEn}: ${result.value}${result.unit ? ` ${result.unit}` : ""}) is on file from ${result.facility}. This is a signal for clinician review — not a diagnosis.`,
    explainAr: `نتيجة قابلة للمتابعة من ${result.program} (${result.labelAr}: ${result.value}${result.unit ? ` ${result.unit}` : ""}) من ${result.facility}. هذه إشارة لمراجعة الطبيب وليست تشخيصاً.`,
    priorityReason:
      care.aiPriorityReason ||
      `${result.labelEn} is actionable; stage is ${care.stage}; network ${patient.network}; SLA ${care.slaHours}h.`,
    nextSteps: [
      "Inform the patient in preferred language via Sahhatna",
      `Assign a ${care.specialty.replaceAll("_", " ")} owner on the patient's insurance network`,
      "Book a visit and track attendance",
      "Document outcome or mark lost-to-follow-up with reason",
    ],
    patientMessageEn: `Hello ${patient.nameEn}. Your recent screening needs a short clinic review of ${result.labelEn}. This does not diagnose you. Please confirm a time in Sahhatna (${whenHint}).`,
    patientMessageAr: `مرحباً ${patient.nameAr}. فحصك الأخير يحتاج زيارة قصيرة لمراجعة ${result.labelAr}. هذه الرسالة ليست تشخيصاً. أكّدي الموعد في صحةنا (${whenHint}).`,
    caveats: [
      "Values shown are screening flags for follow-up routing only",
      "Insurance network filters which facilities can be offered",
    ],
  };
}

export async function fetchBrief(
  patient: Patient,
  result: ScreeningResult,
  care: CareCase,
  signal?: AbortSignal,
): Promise<{ brief: ItmamBrief }> {
  const pack = evidencePack(patient, result, care);
  const fallback = { brief: localBrief(patient, result, care) };
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 4500);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const response = await fetch("/api/itmam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack }),
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error("brief failed");
    const body = (await response.json()) as { brief?: ItmamBrief };
    if (!body.brief?.headlineEn) throw new Error("bad brief");
    return { brief: body.brief };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
