import { CLINICIANS, SLOTS } from "../data/seed";
import { EMPTY_REFERRAL, confirmatorySpecialty, referralOf } from "./pathway";
import type {
  AuditEvent,
  CareCase,
  InsuranceNetwork,
  LostReason,
  LoopStage,
  Message,
  Patient,
  ScreeningResult,
  Specialty,
  Urgency,
} from "../types";
import { STAGE_ORDER } from "../types";

export function nowStamp(): string {
  return "2026-10-30T09:15";
}

export function stageIndex(stage: LoopStage): number {
  if (stage === "lost") return -1;
  return STAGE_ORDER.indexOf(stage);
}

export function isOpen(stage: LoopStage): boolean {
  return stage !== "verified" && stage !== "lost";
}

export function hoursOpen(caseRow: CareCase, asOf = nowStamp()): number {
  const a = Date.parse(caseRow.openedAt);
  const b = Date.parse(asOf);
  return Math.max(0, (b - a) / 36e5);
}

export function slaBreached(caseRow: CareCase, asOf = nowStamp()): boolean {
  if (!isOpen(caseRow.stage)) return false;
  return hoursOpen(caseRow, asOf) > caseRow.slaHours;
}

export function specialtyForCode(code: ScreeningResult["code"]): Specialty {
  switch (code) {
    case "hba1c":
      return "endocrinology";
    case "fit":
      return "gastroenterology";
    case "ldl":
    case "bp":
      return "cardiology";
    case "moca":
      return "neurology";
    case "vision":
      return "ophthalmology";
    default:
      return "family_medicine";
  }
}

/** Prefer family medicine for metabolic unless FIT/MoCA pathway. */
export function preferredSpecialty(result: ScreeningResult): Specialty {
  if (result.code === "fit" || result.code === "moca") return specialtyForCode(result.code);
  if (result.code === "hba1c" || result.code === "bmi") return "family_medicine";
  return specialtyForCode(result.code);
}

export function urgencyFor(result: ScreeningResult, caseRow: CareCase): Urgency {
  if (result.code === "fit" || result.code === "bp") return "urgent";
  if (slaBreached(caseRow) || result.code === "moca") return "soon";
  if (result.code === "hba1c" || result.code === "ldl") return "soon";
  return "routine";
}

export function compatibleClinicians(specialty: Specialty, network: InsuranceNetwork) {
  return CLINICIANS.filter(
    (c) => c.specialty === specialty && c.networks.includes(network),
  );
}

/**
 * Who can own this loop: prefer specialty match on the patient's network.
 * Family medicine is only a fallback when no specialty clinician exists.
 * (Avoids assigning FM owner while booking a gastro slot — two names, one patient.)
 */
export function ownerCandidates(specialty: Specialty, network: InsuranceNetwork) {
  const matched = compatibleClinicians(specialty, network);
  if (matched.length) return matched;
  return CLINICIANS.filter(
    (c) => c.specialty === "family_medicine" && c.networks.includes(network),
  );
}

export function compatibleSlots(
  specialty: Specialty,
  network: InsuranceNetwork,
  ownerId?: string | null,
) {
  const specialtyIds = new Set(compatibleClinicians(specialty, network).map((c) => c.id));
  const famIds = CLINICIANS.filter(
    (c) => c.specialty === "family_medicine" && c.networks.includes(network),
  ).map((c) => c.id);
  const networkSlots = SLOTS.filter(
    (s) =>
      s.network === network &&
      (specialtyIds.has(s.clinicianId) || (specialtyIds.size === 0 && famIds.includes(s.clinicianId))),
  );

  if (!ownerId) return networkSlots;

  const owner = CLINICIANS.find((c) => c.id === ownerId);
  // Pin slots to owner only when they match the case specialty (or FM fallback path).
  const ownerMatchesPathway =
    owner &&
    (owner.specialty === specialty ||
      (specialtyIds.size === 0 && owner.specialty === "family_medicine"));
  if (!ownerMatchesPathway) return networkSlots;

  const ownerSlots = networkSlots.filter((s) => s.clinicianId === ownerId);
  if (ownerSlots.length) return ownerSlots;
  return networkSlots;
}

function audit(
  caseId: string,
  actor: AuditEvent["actor"],
  action: string,
  detail: string,
): AuditEvent {
  return {
    id: `aud-${caseId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    caseId,
    at: nowStamp(),
    actor,
    action,
    detail,
  };
}

export type LoopActionResult = {
  case: CareCase;
  events: AuditEvent[];
  message?: Message;
};

export function stratifyCase(
  caseRow: CareCase,
  result: ScreeningResult,
  reason: string,
): LoopActionResult {
  const specialty = preferredSpecialty(result);
  const next: CareCase = {
    ...caseRow,
    stage: "stratified",
    specialty,
    urgency: urgencyFor(result, caseRow),
    aiPriorityReason: reason,
  };
  return {
    case: next,
    events: [audit(caseRow.id, "system", "prioritized", reason)],
  };
}

export function tellPatient(
  caseRow: CareCase,
  _patient: Patient,
  bodyEn: string,
  bodyAr: string,
  lang = "en",
): LoopActionResult {
  const message: Message = {
    id: `msg-${caseRow.id}-${Date.now()}`,
    caseId: caseRow.id,
    channel: "sahhatna",
    lang,
    bodyEn,
    bodyAr: bodyAr || bodyEn,
    sentAt: nowStamp(),
    readAt: null,
  };
  return {
    case: { ...caseRow, stage: "told", toldAt: nowStamp() },
    events: [
      audit(caseRow.id, "system", "patient_told", `Sahhatna message queued (${lang})`),
    ],
    message,
  };
}

export function assignOwner(caseRow: CareCase, ownerId: string): LoopActionResult {
  return {
    case: {
      ...caseRow,
      stage: caseRow.stage === "verified" || caseRow.stage === "lost" ? caseRow.stage : "owned",
      ownerId,
      ownedAt: nowStamp(),
    },
    events: [audit(caseRow.id, "coordinator", "owned", `Owner set to ${ownerId}`)],
  };
}

export function bookSlot(caseRow: CareCase, slotId: string): LoopActionResult {
  const slot = SLOTS.find((s) => s.id === slotId);
  const visitClinicianId = slot?.clinicianId ?? caseRow.ownerId;
  const ownerChanged =
    Boolean(visitClinicianId) && visitClinicianId !== caseRow.ownerId;
  const events = [
    audit(
      caseRow.id,
      "patient",
      "booked",
      `Slot ${slotId}${visitClinicianId ? ` with ${visitClinicianId}` : ""}`,
    ),
  ];
  if (ownerChanged && visitClinicianId) {
    events.push(
      audit(
        caseRow.id,
        "system",
        "owned",
        `Owner aligned to visit clinician ${visitClinicianId}`,
      ),
    );
  }
  return {
    case: {
      ...caseRow,
      stage: "booked",
      slotId,
      bookedAt: nowStamp(),
      // One face for the patient: visit doctor owns the loop after booking.
      ownerId: visitClinicianId ?? caseRow.ownerId,
      ownedAt: caseRow.ownedAt ?? nowStamp(),
    },
    events,
  };
}

/** Change visit time while staying booked — pick another available slot. */
export function rescheduleSlot(caseRow: CareCase, slotId: string): LoopActionResult {
  const prev = caseRow.slotId;
  const slot = SLOTS.find((s) => s.id === slotId);
  const visitClinicianId = slot?.clinicianId ?? caseRow.ownerId;
  const events = [
    audit(
      caseRow.id,
      "patient",
      "rescheduled",
      `Moved ${prev || "prior slot"} → ${slotId}${slot ? ` (${slot.when.replace("T", " ")})` : ""}`,
    ),
  ];
  if (visitClinicianId && visitClinicianId !== caseRow.ownerId) {
    events.push(
      audit(
        caseRow.id,
        "system",
        "owned",
        `Owner aligned to visit clinician ${visitClinicianId}`,
      ),
    );
  }
  return {
    case: {
      ...caseRow,
      stage: "booked",
      slotId,
      bookedAt: nowStamp(),
      ownerId: visitClinicianId ?? caseRow.ownerId,
      ownedAt: caseRow.ownedAt ?? nowStamp(),
    },
    events,
  };
}

export function markSeen(caseRow: CareCase, note: string): LoopActionResult {
  return {
    case: {
      ...caseRow,
      stage: "seen",
      seenAt: nowStamp(),
      visitNote: note,
      // Visit done — next decision: continue to close, or branch to referral.
      referral: caseRow.referral ?? { ...EMPTY_REFERRAL },
    },
    events: [audit(caseRow.id, "clinician", "seen", note || "Visit completed")],
  };
}

/** Continue main path: no confirmatory referral — proceed to verify. */
export function chooseDirectClose(caseRow: CareCase): LoopActionResult {
  return {
    case: {
      ...caseRow,
      referral: {
        ...referralOf(caseRow),
        branch: "direct_close",
        specialty: null,
        slotId: null,
        bookedAt: null,
        doneAt: null,
        note: "No confirmatory referral required after screening visit.",
      },
    },
    events: [
      audit(
        caseRow.id,
        "clinician",
        "pathway_direct",
        "Path continue — close without confirmatory referral.",
      ),
    ],
  };
}

/** Branch: start confirmatory / diagnostic referral. */
export function chooseConfirmatory(
  caseRow: CareCase,
  code: ScreeningResult["code"],
): LoopActionResult {
  const specialty = confirmatorySpecialty(code);
  return {
    case: {
      ...caseRow,
      referral: {
        ...EMPTY_REFERRAL,
        branch: "confirmatory",
        specialty,
        note: `Confirmatory pathway · ${specialty.replaceAll("_", " ")}`,
      },
    },
    events: [
      audit(
        caseRow.id,
        "clinician",
        "pathway_referral",
        `Path branch — confirmatory referral to ${specialty.replaceAll("_", " ")}.`,
      ),
    ],
  };
}

export function bookReferralSlot(caseRow: CareCase, slotId: string): LoopActionResult {
  const ref = referralOf(caseRow);
  return {
    case: {
      ...caseRow,
      referral: {
        ...ref,
        branch: "confirmatory",
        slotId,
        bookedAt: nowStamp(),
      },
    },
    events: [
      audit(caseRow.id, "coordinator", "referral_booked", `Confirmatory slot ${slotId}`),
    ],
  };
}

export function markConfirmatoryDone(caseRow: CareCase, note: string): LoopActionResult {
  const ref = referralOf(caseRow);
  return {
    case: {
      ...caseRow,
      referral: {
        ...ref,
        branch: "confirmatory",
        doneAt: nowStamp(),
        note: note || ref.note || "Confirmatory visit completed.",
      },
    },
    events: [
      audit(
        caseRow.id,
        "clinician",
        "confirmatory_done",
        note || "Confirmatory / diagnostic step completed.",
      ),
    ],
  };
}

export function verifyOutcome(caseRow: CareCase): LoopActionResult {
  const ref = referralOf(caseRow);
  const via =
    ref.branch === "confirmatory"
      ? "after confirmatory referral branch"
      : ref.branch === "direct_close"
        ? "on main path (no referral)"
        : "";
  return {
    case: {
      ...caseRow,
      stage: "verified",
      verifiedAt: nowStamp(),
      referral: ref.branch === "undecided" ? { ...ref, branch: "direct_close" } : ref,
    },
    events: [
      audit(
        caseRow.id,
        "clinician",
        "verified",
        `Outcome documented — loop closed ${via}`.trim(),
      ),
    ],
  };
}

export function markLost(caseRow: CareCase, reason: LostReason): LoopActionResult {
  return {
    case: {
      ...caseRow,
      stage: "lost",
      lostAt: nowStamp(),
      lostReason: reason,
    },
    events: [audit(caseRow.id, "coordinator", "lost", reason)],
  };
}

/**
 * Patient missed a booked visit. Loop does not end —
 * clear the slot and return to owned so they can rebook.
 */
export function markNoShow(caseRow: CareCase): LoopActionResult {
  const count = (caseRow.noShowCount ?? 0) + 1;
  return {
    case: {
      ...caseRow,
      stage: "owned",
      slotId: null,
      bookedAt: null,
      noShowCount: count,
    },
    events: [
      audit(
        caseRow.id,
        "coordinator",
        "no_show",
        `Patient missed appointment (no-show #${count}). Loop reopened for rebook.`,
      ),
    ],
  };
}

/** One-click demo happy path helpers for Mariam */
export function applyAiPlan(
  caseRow: CareCase,
  result: ScreeningResult,
  patient: Patient,
  ownerId: string,
  slotId: string,
  bodyEn: string,
  bodyAr: string,
): { case: CareCase; events: AuditEvent[]; message: Message } {
  let current = caseRow;
  const events: AuditEvent[] = [];
  const s1 = stratifyCase(
    current,
    result,
    `Actionable ${result.labelEn} with no owner for ${hoursOpen(current).toFixed(0)}h — close the loop.`,
  );
  current = s1.case;
  events.push(...s1.events);

  const s2 = tellPatient(current, patient, bodyEn, bodyAr);
  current = s2.case;
  events.push(...s2.events);
  const message = s2.message!;

  const s3 = assignOwner(current, ownerId);
  current = s3.case;
  events.push(...s3.events);

  const s4 = bookSlot(current, slotId);
  current = s4.case;
  events.push(...s4.events);

  return { case: current, events, message };
}
