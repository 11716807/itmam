# Itmam — Evaluation & benchmark report

**One-liner:** We help care coordinators close IFHAS/EAS actionable screening results — told → owned → booked → seen → verified — using a rules-first multi-agent import harness with visible guardrails; Gemini only narrates.

**Eval date:** 2026-11-04  
**Harness version:** main (`scripts/run-eval.mjs`)  
**Dataset:** Synthetic IFHAS/EAS-shaped hard pack (`SAMPLE_IMPORT_CSV` / `public/sample-ifhas-extract.csv`) — **100% synthetic**

Replay:

```bash
npx tsx scripts/run-eval.mjs
```

---

## Summary scores (n = 12)

| Metric | Score | Definition |
|---|---|---|
| **Destination accuracy** | **12/12 (100%)** | Expected `placed` / `filtered` / `needs_fix` matches actual |
| **Validate Agent** | **12/12 (100%)** | Hard-fail rows blocked; clean rows pass/warn |
| **Gate Agent** | **12/12 (100%)** | Actionable → pass; borderline/normal → filtered; bad data → skipped |
| **Priority Agent** | **12/12 (100%)** | Runs only on placed path; urgent FIT/BP labeled urgent |
| **Urgency match (labeled)** | **2/2 (100%)** | Yusuf FIT + Fatima BP expected `urgent` |
| **Issue-code match** | **2/2 (100%)** | Bad BP → `invalid_bp_format`; empty HbA1c → `missing_value` |
| **Silent drops** | **0** | Filtered + needs_fix remain visible on “Not on board” |

**Batch split:** 8 placed · 2 filtered · 2 needs_fix

---

## Hard-case pack (named suite)

| ID | Case | Intent | Expected | Agent under test |
|---|---|---|---|---|
| HC-01 | Yusuf · FIT Positive | Cancer-path urgent place | `placed` / `urgent` | Priority |
| HC-02 | Fatima · BP 168/102 | Marked BP urgent place | `placed` / `urgent` | Priority |
| HC-03 | Mariam · HbA1c 7.4 | Metabolic actionable | `placed` | Gate |
| HC-04 | Noura · MoCA 22 | Brain-health actionable | `placed` | Gate |
| HC-05 | Ahmed · LDL 4.9 | Lipid actionable | `placed` | Gate |
| HC-06 | Khalid · BMI 33.1 | Metabolic actionable | `placed` | Gate |
| HC-07 | Hassan · HbA1c 6.6 | Metabolic actionable | `placed` | Gate |
| HC-08 | Layla · Vision Failed | Specialty actionable | `placed` | Gate |
| HC-09 | Omar · BP 138/88 | Borderline — no loop | `filtered` | Gate |
| HC-10 | Sara · LDL 3.1 | Normal — no loop | `filtered` | Gate |
| HC-11 | Rashid · BP `high` | Non-numeric BP | `needs_fix` / `invalid_bp_format` | Validate |
| HC-12 | Hind · HbA1c empty | Missing value | `needs_fix` / `missing_value` | Validate |

---

## Case-level results

| Patient | Finding | Expected | Actual | Validate | Gate | Priority | Pass? |
|---|---|---|---|---|---|---|---|
| Yusuf Rahman | fit=Positive | placed/urgent | placed/urgent | ok | ok | ok | ✅ |
| Fatima Al Ketbi | bp=168/102 | placed/urgent | placed/urgent | ok | ok | ok | ✅ |
| Mariam Al Hashimi | hba1c=7.4 | placed | placed | ok | ok | ok | ✅ |
| Noura Al Suwaidi | moca=22 | placed | placed | ok | ok | ok | ✅ |
| Ahmed Al Mazrouei | ldl=4.9 | placed | placed | ok | ok | ok | ✅ |
| Khalid Al Nuaimi | bmi=33.1 | placed | placed | ok | ok | ok | ✅ |
| Hassan Al Blooshi | hba1c=6.6 | placed | placed | ok | ok | ok | ✅ |
| Layla Al Qubaisi | vision=Failed | placed | placed | ok | ok | ok | ✅ |
| Omar Al Dhaheri | bp=138/88 | filtered | filtered | ok | filtered | skipped | ✅ |
| Sara Al Mansoori | ldl=3.1 | filtered | filtered | ok | filtered | skipped | ✅ |
| Rashid Al Mazrouei | bp=high | needs_fix | needs_fix | blocked | skipped | skipped | ✅ |
| Hind Al Shamsi | hba1c=(empty) | needs_fix | needs_fix | blocked | skipped | skipped | ✅ |

**Fails:** none. **Error source column:** N/A (no mismatches).

---

## What each decision agent is scored on

### Validate Agent
- Hard-fail on non-numeric BP (`high`) and missing HbA1c
- Never silently rewrites values — tags `field` + `code` for re-run
- Downstream agents skipped until fix

### Gate Agent
- Only `actionable` opens a closed loop
- Borderline / normal → `filtered` with explicit reason (visible tray)
- Never silent drop

### Priority Agent
- Urgency / SLA / specialty from deterministic enrichment rules
- Gemini does **not** set urgency
- Scored on FIT Positive + BP 168/102 → `urgent`

### Route Agent (destination)
- Place only after gate pass
- Never place `needs_fix` or `filtered`

### Explain Agent (qualitative)
- Narrate-only; diagnosis-like model output is replaced with local safe copy
- Does not change rank or stage

---

## Method notes

1. Expectations are fixed in `scripts/run-eval.mjs` (same labels used for the demo script heroes).
2. Pipeline run with `{ explain: false, fast: true }` so scoring is deterministic rules only.
3. This is a **pilot benchmark**, not a clinical validation study. Thresholds are coordination heuristics for hackathon reproducibility.
4. For a DOH pilot we would expand to SME-labeled extracts, SLA clock metrics, and CI gates on this suite.

---

## Demo video talking points (30 sec)

> “On this 12-row hard pack — including wrong BP text, missing HbA1c, borderline and normal rows — Validate, Gate, and Priority each score 100%. Filtered and needs-fix stay visible. Rules decide; Gemini only narrates.”
