import type { CareCase, FindingCode, PathwayBranch, ReferralState, Specialty } from "../types";

export const EMPTY_REFERRAL: ReferralState = {
  branch: "undecided",
  specialty: null,
  slotId: null,
  bookedAt: null,
  doneAt: null,
  note: null,
};

export function referralOf(care: CareCase): ReferralState {
  return care.referral ?? EMPTY_REFERRAL;
}

/** Default confirmatory specialty from the screening code (metro line B). */
export function confirmatorySpecialty(code: FindingCode): Specialty {
  switch (code) {
    case "fit":
      return "gastroenterology";
    case "bp":
    case "ldl":
      return "cardiology";
    case "hba1c":
      return "endocrinology";
    case "moca":
      return "neurology";
    case "vision":
      return "ophthalmology";
    default:
      return "family_medicine";
  }
}

export function canVerify(care: CareCase): boolean {
  if (care.stage === "verified") return true;
  if (care.stage !== "seen") return false;
  const r = referralOf(care);
  if (r.branch === "direct_close") return true;
  if (r.branch === "confirmatory" && r.doneAt) return true;
  return false;
}

export function pathwayLabel(branch: PathwayBranch): string {
  switch (branch) {
    case "undecided":
      return "Decision pending";
    case "direct_close":
      return "Main path · close";
    case "confirmatory":
      return "Branch · confirmatory referral";
  }
}
