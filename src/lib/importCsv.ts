import type {
  FindingCode,
  InsuranceNetwork,
  Patient,
  ScreeningResult,
} from "../types";

export type ImportRow = {
  patient: Patient;
  result: ScreeningResult;
  /** Any extra columns from the extract — enrichment reads these flexibly. */
  metrics: Record<string, string>;
};

const CODE_LABEL: Record<FindingCode, { en: string; ar: string; unit: string }> = {
  hba1c: { en: "HbA1c", ar: "السكر التراكمي", unit: "%" },
  bp: { en: "Blood pressure", ar: "ضغط الدم", unit: "mmHg" },
  fit: { en: "FIT (stool occult blood)", ar: "فحص الدم الخفي في البراز", unit: "" },
  ldl: { en: "LDL cholesterol", ar: "كوليسترول LDL", unit: "mmol/L" },
  bmi: { en: "BMI", ar: "مؤشر كتلة الجسم", unit: "kg/m²" },
  moca: { en: "MoCA screen", ar: "فحص موكا", unit: "/30" },
  vision: { en: "Vision screen", ar: "فحص النظر", unit: "" },
};

const CODE_ALIASES: Record<string, FindingCode> = {
  hba1c: "hba1c",
  a1c: "hba1c",
  bp: "bp",
  blood_pressure: "bp",
  fit: "fit",
  occult: "fit",
  ldl: "ldl",
  cholesterol: "ldl",
  bmi: "bmi",
  moca: "moca",
  vision: "vision",
  eye: "vision",
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
      continue;
    }
    if (ch === "," && !q) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function asCode(value: string): FindingCode {
  const key = value.trim().toLowerCase().replace(/\s+/g, "_");
  const mapped = CODE_ALIASES[key] ?? (key in CODE_LABEL ? (key as FindingCode) : null);
  if (!mapped) throw new Error(`Unknown finding code: ${value}`);
  return mapped;
}

function asNetwork(value: string): InsuranceNetwork {
  const v = value.toLowerCase().trim();
  if (v === "network_a" || v === "a" || v.endsWith("_a")) return "network_a";
  if (v === "network_b" || v === "b" || v.endsWith("_b")) return "network_b";
  if (v === "network_c" || v === "c" || v.endsWith("_c")) return "network_c";
  return "network_a";
}

function pick(header: string[], cols: string[], names: string[], fallback = ""): string {
  for (const name of names) {
    const i = header.indexOf(name);
    if (i >= 0 && cols[i] != null && cols[i] !== "") return cols[i];
  }
  return fallback;
}

/** Sample extract — raw findings only; enrichment classifies actionable vs borderline. */
export const SAMPLE_IMPORT_CSV = `patient_id,name_en,name_ar,age,sex,lang,insurance_plan,network,program,code,value,recorded_at,facility,days_waiting,prior_no_shows,wearable_flag,family_risk,notes
p-yusuf,Yusuf Rahman,يوسف رحمن,58,M,en,Daman Basic,network_b,EAS,fit,Positive,2026-10-18,EAS — Al Dhafra,12,1,no,yes,Cancer-path FIT; prior no-show
p-fatima,Fatima Al Ketbi,فاطمة الكتبي,51,F,en,Thiqa Family,network_a,IFHAS,bp,168/102,2026-10-08,IFHAS — Al Ain,22,0,yes,no,Wearable high resting BP 22 days waiting
p-mariam,Mariam Al Hashimi,مريم الهاشمي,44,F,en,Thiqa Family,network_a,IFHAS,hba1c,7.4,2026-10-12,IFHAS — Mussafah Center,18,0,no,no,No owner after extract
p-noura,Noura Al Suwaidi,نورة السويدي,62,F,en,Thiqa Family,network_a,IFHAS,moca,22,2026-10-15,IFHAS — Al Bahia,15,0,no,yes,Brain-health screen; family risk
p-ahmed,Ahmed Al Mazrouei,أحمد المزروعي,39,M,en,ADNIC Care,network_a,EAS,ldl,4.9,2026-10-22,EAS — Abu Dhabi Gate,8,0,no,yes,Family CVD history
p-khalid,Khalid Al Nuaimi,خالد النعيمي,47,M,en,Daman Enhanced,network_c,EAS,bmi,33.1,2026-10-05,EAS — ICAD,25,2,yes,no,Two prior no-shows; wearable low activity
p-hassan,Hassan Al Blooshi,حسن البلوشي,55,M,en,Daman Basic,network_b,IFHAS,hba1c,6.6,2026-10-25,IFHAS — Baniyas,5,0,yes,no,Recent result; wearable glucose reminder
p-layla,Layla Al Qubaisi,ليلى القبيسي,41,F,en,Thiqa Family,network_a,IFHAS,vision,Failed,2026-10-20,IFHAS — Khalifa City,9,0,no,no,Vision screen failed referral
p-omar,Omar Al Dhaheri,عمر الظاهري,36,M,en,ADNIC Care,network_a,EAS,bp,138/88,2026-10-27,EAS — Al Reem,3,0,no,no,Isolated BP 138/88
p-sara,Sara Al Mansoori,سارة المنصوري,33,F,en,Thiqa Family,network_a,EAS,ldl,3.1,2026-10-28,EAS — Reem,2,0,no,no,Isolated LDL 3.1
p-bad-bp,Rashid Al Mazrouei,راشد المزروعي,49,M,en,Thiqa Family,network_a,IFHAS,bp,high,2026-10-26,IFHAS — Khalifa City,6,0,no,no,Bad value — agents should tag invalid_bp_format
p-bad-empty,Hind Al Shamsi,هند الشامسي,40,F,en,Daman Basic,network_b,EAS,hba1c,,2026-10-24,EAS — Mussafah,4,0,no,no,Missing value — agents should tag missing_value`;

/**
 * Parse a screening extract. Core identity + finding columns are required;
 * every other column becomes enrichment metrics (any names welcome).
 */
export function parseImportCsv(text: string): ImportRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("CSV needs a header and at least one row");

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());

  const needOneOf = (options: string[], label: string) => {
    if (!options.some((o) => header.includes(o))) {
      throw new Error(`Missing column for ${label} (tried: ${options.join(", ")})`);
    }
  };
  needOneOf(["patient_id", "patientid", "emirates_id", "id"], "patient id");
  needOneOf(["name_en", "name", "patient_name"], "patient name");
  needOneOf(["code", "finding", "metric", "test"], "finding code");
  needOneOf(["value", "result", "result_value"], "finding value");

  const core = new Set([
    "patient_id",
    "patientid",
    "emirates_id",
    "id",
    "name_en",
    "name",
    "patient_name",
    "name_ar",
    "age",
    "sex",
    "lang",
    "language",
    "insurance_plan",
    "plan",
    "network",
    "program",
    "code",
    "finding",
    "metric",
    "test",
    "value",
    "result",
    "result_value",
    "recorded_at",
    "date",
    "result_date",
    "facility",
    "site",
    "label_en",
    "label_ar",
    "unit",
  ]);

  return lines.slice(1).map((line, rowIndex) => {
    const cols = splitCsvLine(line);
    const get = (...names: string[]) => pick(header, cols, names);

    const code = asCode(get("code", "finding", "metric", "test"));
    const labels = CODE_LABEL[code];
    const patientId = get("patient_id", "patientid", "emirates_id", "id") || `p-row-${rowIndex}`;
    const resultId = `r-import-${patientId}-${code}-${rowIndex}`;
    const nameEn = get("name_en", "name", "patient_name") || patientId;

    const patient: Patient = {
      id: patientId,
      nameEn,
      nameAr: get("name_ar", "name_arabic") || nameEn,
      age: Number(get("age") || "40") || 40,
      sex: get("sex", "gender").toUpperCase().startsWith("F") ? "F" : "M",
      phoneMasked: "+971 •• ••• ••••",
      // Product UI defaults to English; CSV lang is stored only if explicitly needed later.
      preferredLang: "en",
      insurancePlan: get("insurance_plan", "plan") || "Thiqa Family",
      network: asNetwork(get("network") || "network_a"),
      emiratesIdMasked: "784-••••-•••••••",
    };

    const programRaw = (get("program", "scheme") || "IFHAS").toUpperCase();
    const program =
      programRaw.includes("WELL") ? "WellChild" : programRaw.includes("EAS") ? "EAS" : "IFHAS";

    const result: ScreeningResult = {
      id: resultId,
      patientId,
      program,
      code,
      labelEn: get("label_en") || labels.en,
      labelAr: get("label_ar") || labels.ar,
      value: get("value", "result", "result_value"),
      unit: get("unit") || labels.unit,
      // Placeholder until enrichment classifies from value.
      flag: "actionable",
      recordedAt: get("recorded_at", "date", "result_date") || "2026-10-20",
      facility: get("facility", "site") || "IFHAS / EAS extract",
    };

    const metrics: Record<string, string> = {};
    header.forEach((h, i) => {
      if (!cols[i]) return;
      if (!core.has(h)) metrics[h] = cols[i];
      // Always keep known enrichment keys even if also "core-adjacent"
      if (
        [
          "days_waiting",
          "wait_days",
          "prior_no_shows",
          "no_shows",
          "wearable_flag",
          "wearable",
          "family_risk",
          "family_history",
          "social_risk",
          "notes",
          "note",
          "comment",
        ].includes(h)
      ) {
        metrics[h] = cols[i];
      }
    });

    return { patient, result, metrics };
  });
}
