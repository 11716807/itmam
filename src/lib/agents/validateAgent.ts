import type { ImportRow } from "../importCsv";
import type { AgentIssue } from "./types";

function parseNumber(value: string): number | null {
  const m = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Data-quality agent — tags what is wrong so coordinators can fix and re-run.
 * Hard errors block the pipeline; warnings continue with a warn status.
 */
export function validateAgent(row: ImportRow): {
  issues: AgentIssue[];
  hardFail: boolean;
  notes: string;
} {
  const issues: AgentIssue[] = [];
  const { patient, result } = row;
  const raw = result.value.trim();

  if (!patient.nameEn.trim()) {
    issues.push({
      code: "missing_name",
      field: "name_en",
      message: "Patient name is empty",
      severity: "error",
    });
  }

  if (!Number.isFinite(patient.age) || patient.age < 1 || patient.age > 120) {
    issues.push({
      code: "invalid_age",
      field: "age",
      message: `Age ${patient.age} is out of range (1–120)`,
      severity: "error",
    });
  }

  if (!raw) {
    issues.push({
      code: "missing_value",
      field: "value",
      message: `${result.labelEn} value is missing`,
      severity: "error",
    });
  }

  if (!result.code) {
    issues.push({
      code: "unknown_code",
      field: "code",
      message: "Finding code is missing or unrecognized",
      severity: "error",
    });
  }

  // Format checks by code
  if (raw && result.code === "bp") {
    const parts = raw.split(/[\/\s]+/).map((p) => parseNumber(p)).filter((n): n is number => n != null);
    if (parts.length < 1 || /^(high|low|elevated|abnormal)$/i.test(raw)) {
      issues.push({
        code: "invalid_bp_format",
        field: "value",
        message: `BP value "${raw}" is not numeric systolic[/diastolic] — e.g. 168/102`,
        severity: "error",
      });
    } else if (parts[0] != null && (parts[0] < 50 || parts[0] > 300)) {
      issues.push({
        code: "bp_out_of_range",
        field: "value",
        message: `Systolic ${parts[0]} looks implausible`,
        severity: "error",
      });
    }
  }

  if (raw && (result.code === "hba1c" || result.code === "ldl" || result.code === "bmi" || result.code === "moca")) {
    const n = parseNumber(raw);
    if (n == null && !/pos|neg|fail|pass/i.test(raw)) {
      issues.push({
        code: "non_numeric_value",
        field: "value",
        message: `${result.labelEn} expects a number; got "${raw}"`,
        severity: "error",
      });
    }
  }

  if (!result.recordedAt) {
    issues.push({
      code: "missing_recorded_at",
      field: "recorded_at",
      message: "Recorded date missing — SLA aging may be wrong",
      severity: "warn",
    });
  }

  if (!patient.network) {
    issues.push({
      code: "missing_network",
      field: "network",
      message: "Insurance network missing — booking filters will be limited",
      severity: "warn",
    });
  }

  const hardFail = issues.some((i) => i.severity === "error");
  const notes = hardFail
    ? `Blocked — ${issues.filter((i) => i.severity === "error").length} error(s) to fix`
    : issues.length
      ? `OK with ${issues.length} warning(s)`
      : "Row looks valid";

  return { issues, hardFail, notes };
}
