# Itmam — Hard-case pack

Named test suite for demos, EVAL.md, and the demo video.  
**Data:** 100% synthetic IFHAS/EAS-shaped rows in `public/sample-ifhas-extract.csv`.

**Locked framing:** We help care coordinators close IFHAS/EAS actionable screening results — told → owned → booked → seen → verified — using a rules-first multi-agent import harness with visible guardrails; assist agents narrate and suggest — humans confirm.

Full scores: [EVAL.md](./EVAL.md) · Replay: `npx tsx scripts/run-eval.mjs`

---

## Suite map

### A. Must place (actionable)

| ID | Patient | Finding | Expect |
|---|---|---|---|
| HC-01 | Yusuf Rahman | FIT Positive | placed · **urgent** (cancer-path) |
| HC-02 | Fatima Al Ketbi | BP 168/102 | placed · **urgent** |
| HC-03 | Mariam Al Hashimi | HbA1c 7.4 | placed |
| HC-04 | Noura Al Suwaidi | MoCA 22 | placed |
| HC-05 | Ahmed Al Mazrouei | LDL 4.9 | placed |
| HC-06 | Khalid Al Nuaimi | BMI 33.1 | placed |
| HC-07 | Hassan Al Blooshi | HbA1c 6.6 | placed |
| HC-08 | Layla Al Qubaisi | Vision Failed | placed |

### B. Must filter (no closed loop — still visible)

| ID | Patient | Finding | Expect | Why |
|---|---|---|---|---|
| HC-09 | Omar Al Dhaheri | BP 138/88 | **filtered** | borderline |
| HC-10 | Sara Al Mansoori | LDL 3.1 | **filtered** | normal |

### C. Must needs_fix (bad / missing data — never silent rewrite)

| ID | Patient | Finding | Expect | Issue code |
|---|---|---|---|---|
| HC-11 | Rashid Al Mazrouei | BP **`high`** | **needs_fix** | `invalid_bp_format` |
| HC-12 | Hind Al Shamsi | HbA1c **empty** | **needs_fix** | `missing_value` |

---

## Demo video cues

1. Import example extract → show 8 open loops.
2. Open **How decided** on Yusuf → named agents + guardrails.
3. Expand **Not on board** → Omar/Sara filtered; Rashid/Hind needs_fix.
4. Fix Rashid BP to `168/102` → Re-run agents → places on board.
5. Quote EVAL: Validate / Gate / Priority **100%** on this pack.
