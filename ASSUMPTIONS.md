# Itmam — Assumptions & limitations

Required submission note for the Future Health Digital Innovation Challenge.

**One-liner:** We help care coordinators close IFHAS/EAS actionable screening results — told → owned → booked → seen → verified — using a rules-first multi-agent import harness with visible guardrails; assist agents narrate and suggest — humans confirm.

---

## Assumptions

1. **Problem scope.** The operational gap after IFHAS/EAS screening is closed-loop follow-up (tell → own → book → see → verify), not detection or differential diagnosis.
2. **Primary user.** Care coordinators / population-health ops run the board; patients use a Sahhatna-style view after being told; clinicians complete visit/verify on the Case screen.
3. **Input.** A CSV (or equivalent extract) with patient identity + finding code/value is available from screening programs. Extra columns (days waiting, no-shows, wearable flags) improve ranking when present.
4. **Actionability.** Deterministic enrichment rules can classify findings as actionable / borderline / normal for *coordination* purposes. Clinical meaning remains with licensed clinicians.
5. **Insurance networks.** Visit slots can be filtered by patient network (demo uses seeded slots).
6. **Messaging.** Coordinators compose and send patient messages (English default; optional translate). Sending is human-initiated — no silent auto-booking.
7. **Shared demo state.** Firestore holds a shared board so judges see the same cases without re-import.
8. **Assist-agent role.** Loop-assist and explain agents draft briefs, translation, narration, and confirm-first suggestions. Urgency, SLA, specialty, gate, and route stay rules-first.

---

## Limitations

1. **Not a medical device / not a diagnosis engine.** Itmam does not diagnose, prescribe, or replace clinical judgment.
2. **Synthetic data only in this build.** Sample extract is 100% fictional IFHAS/EAS-*shaped* data. No live Malaffi / production PHI.
3. **Enrichment thresholds are pilot heuristics.** BP/HbA1c/LDL/FIT cutoffs are for demo coordination ranking; a DOH pilot needs SME-approved thresholds and versioning.
4. **Slot inventory is seeded.** Real scheduling APIs / EHR calendars are out of scope for the hackathon prototype.
5. **Sahhatna is simulated.** Outbox UI demonstrates message content/audit; it is not a production messaging gateway.
6. **Benchmark size.** Offline eval is n=12 hard-pack rows (100% destination accuracy). This is reproducibility evidence, not clinical validation.
7. **Languages.** UI is bilingual-aware (EN + Arabic names); full localization of all coordinator copy is incomplete.
8. **Auth / RBAC.** Public Cloud Run demo is unauthenticated for judge convenience — production needs SSO and role separation.
9. **Hardware.** Software-only; wearables appear only as extract flags, not live device streams.
10. **Scale testing.** Prototype is sized for demo concurrency, not city-wide extract volumes.

---

## Data provenance

| Source | Type | Owner | Sensitivity | Rights |
|---|---|---|---|---|
| `public/sample-ifhas-extract.csv` / `SAMPLE_IMPORT_CSV` | Synthetic screening extract | Team Itmam | Non-PHI fictional persons | Team-authored for hackathon demo/eval |
| Seed clinicians & slots | Synthetic | Team Itmam | Non-PHI | Team-authored |
| Assist agent API | Inference for narrate / translate / loop suggest | Team key | Prompt may include demo case text | Confirm-first suggestions only |

**Synthetic share in demo dataset: 100%.**

Path to real data: DOH-approved IFHAS/EAS extracts under a data-processing agreement; no real identifiers in public repos.

---

## Responsible AI, safety & governance

- **Human in the loop:** Confirm priority, send message, assign clinician, book/verify — all require coordinator action.
- **Guardrails per agent:** No invent on ingest; validate hard-fail; enrich rules-only / no diagnosis; gate no silent drop; priority rules-first; route never places bad data; explain narrate-only.
- **Explainability:** Agent harness shows input → decision → output and guardrail held/applied/breached.
- **Failure honesty:** Needs-fix and filtered trays; lost-to-follow-up requires a reason.
- **Bias / fairness:** Ranking uses clinical pathway signals + delay/no-show metrics — not demographics as priority features. Age/sex are identity context only.
- **Security:** Secrets in Cloud Run env; demo uses synthetic data; production needs auth, audit retention policy, and DPA.

---

## Path to pilot (DOH)

| Phase | What | Outcome |
|---|---|---|
| **0 — Hackathon** | Live Cloud Run + Firestore + harness + EVAL.md | Judge-reproducible closed loop |
| **1 — Pilot (3–6 mo)** | Approved extract feed, coordinator SSO, messaging adapter, SME threshold review | Measured told/owned/booked/verified rates in 1–2 facilities |
| **2 — Scale** | Multi-facility queues, SLA ops dashboards, optional EHR write-back, Arabic packs, CI eval gates | Program-level orphan-result reduction |

**Success for a screening pathway:** completed visit / verification (or documented lost) counts as loop closure; follow-up branches (e.g. confirmatory referral) when pathway rules require them.
