/** Itmam — Malaffi / IFHAS-shaped contracts for screening → care loop */

export type Lang = "en" | "ar";

export type LoopStage =
  | "result_in"
  | "stratified"
  | "told"
  | "owned"
  | "booked"
  | "seen"
  | "verified"
  | "lost";

export type Urgency = "routine" | "soon" | "urgent";

export type FindingCode =
  | "hba1c"
  | "bp"
  | "fit"
  | "ldl"
  | "bmi"
  | "moca"
  | "vision";

export type Specialty =
  | "family_medicine"
  | "endocrinology"
  | "cardiology"
  | "gastroenterology"
  | "neurology"
  | "ophthalmology";

export type InsuranceNetwork = "network_a" | "network_b" | "network_c";

export type LostReason =
  | "no_reply"
  | "no_show"
  | "declined"
  | "moved_facility"
  | "other";

/** After visit completed, path forks like a metro map. */
export type PathwayBranch = "undecided" | "direct_close" | "confirmatory";

export type ReferralState = {
  branch: PathwayBranch;
  specialty: Specialty | null;
  slotId: string | null;
  bookedAt: string | null;
  doneAt: string | null;
  note: string | null;
};

export type Patient = {
  id: string;
  nameEn: string;
  nameAr: string;
  age: number;
  sex: "F" | "M";
  phoneMasked: string;
  preferredLang: Lang;
  insurancePlan: string;
  network: InsuranceNetwork;
  emiratesIdMasked: string;
};

export type Clinician = {
  id: string;
  nameEn: string;
  nameAr: string;
  specialty: Specialty;
  facility: string;
  networks: InsuranceNetwork[];
};

export type ScreeningResult = {
  id: string;
  patientId: string;
  program: "IFHAS" | "EAS" | "WellChild";
  code: FindingCode;
  labelEn: string;
  labelAr: string;
  value: string;
  unit: string;
  flag: "actionable" | "borderline" | "normal";
  recordedAt: string; // ISO date
  facility: string;
};

export type Slot = {
  id: string;
  clinicianId: string;
  when: string; // local stamp
  network: InsuranceNetwork;
};

export type Message = {
  id: string;
  caseId: string;
  channel: "sahhatna";
  /** Language code of the text that was sent (en, ar, hi, …). */
  lang: string;
  /** Sent message body (authoritative). */
  bodyEn: string;
  /** Arabic twin when available; otherwise mirrors bodyEn. */
  bodyAr: string;
  sentAt: string;
  readAt: string | null;
};

export type AuditEvent = {
  id: string;
  caseId: string;
  at: string;
  actor: "system" | "ai" | "coordinator" | "clinician" | "patient";
  action: string;
  detail: string;
};

export type CareCase = {
  id: string;
  patientId: string;
  resultId: string;
  stage: LoopStage;
  urgency: Urgency;
  specialty: Specialty;
  ownerId: string | null;
  slotId: string | null;
  slaHours: number;
  openedAt: string;
  toldAt: string | null;
  ownedAt: string | null;
  bookedAt: string | null;
  seenAt: string | null;
  verifiedAt: string | null;
  lostAt: string | null;
  lostReason: LostReason | null;
  visitNote: string | null;
  aiPriorityReason: string | null;
  consentShare: boolean;
  /** How many times a booked visit was missed before rebook/closure. */
  noShowCount?: number;
  /** Post-visit metro fork: direct close vs confirmatory referral. */
  referral?: ReferralState;
  /** Link back to the agent pipeline run that placed this case. */
  agentRunId?: string | null;
};

export type AppScreen =
  | "board"
  | "case"
  | "patient"
  | "outcomes"
  | "audit"
  | "rules";

export const STAGE_ORDER: LoopStage[] = [
  "result_in",
  "stratified",
  "told",
  "owned",
  "booked",
  "seen",
  "verified",
];

export const STAGE_LABEL: Record<LoopStage, { en: string; ar: string }> = {
  result_in: { en: "Result in", ar: "نتيجة واردة" },
  stratified: { en: "Prioritized", ar: "مُرتَّب" },
  told: { en: "Patient told", ar: "أُبلِغ المريض" },
  owned: { en: "Owned", ar: "مُسنَد" },
  booked: { en: "Booked", ar: "موعد محجوز" },
  seen: { en: "Visit completed", ar: "تمت الزيارة" },
  verified: { en: "Verified", ar: "مُوثَّق" },
  lost: { en: "Lost to follow-up", ar: "فقد المتابعة" },
};
