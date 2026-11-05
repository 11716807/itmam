# Itmam — Competitive & landscape analysis

**One-liner:** We help care coordinators close IFHAS/EAS actionable screening results — told → owned → booked → seen → verified — using a rules-first multi-agent import harness with visible guardrails; assist agents narrate and suggest — humans confirm.

Reviewers compare prototypes to what exists. This note states that comparison explicitly.

---

## Problem today

Abu Dhabi already **detects** at scale (IFHAS / EAS). Orphan risk appears **after** the result: patient not told, no owner, no booking, visit not verified. Generic EHR inboxes and spreadsheets do not show *why* a row was prioritized or *why* it was filtered.

---

## What exists (landscape)

| Approach | What it does well | Gap vs closed-loop need |
|---|---|---|
| **Program registries / Excel extracts** | Exportable lists of findings | No agent trail; silent skips; weak SLA ownership |
| **EHR / Malaffi-style charts** | Clinical record of truth | Not built as coordinator queue for screening→care completion |
| **Generic task / ticket tools** | Assignment & reminders | No screening enrichment, insurance-aware slots, or verification outcome |
| **Consumer symptom checkers / chatbots** | Patient Q&A | Wrong user; diagnosis-shaped; not IFHAS/EAS loop closure |
| **Differential-diagnosis agent demos** | Expert assist on symptoms | Complements clinics; does not close population screening follow-up |
| **Black-box “AI triage”** | Fast ranking | Hard to audit; risk of silent drops; weak judgeability |

---

## Itmam differentiation

| Dimension | Itmam |
|---|---|
| **User** | Care coordinator first (patient Sahhatna view second) |
| **Job** | Close the screening loop — not diagnose |
| **Input** | Raw IFHAS/EAS-shaped extract (+ waiting / no-show / wearable flags) |
| **Decision path** | Named agents with guardrails; every hop inspectable |
| **Honesty** | Filtered & needs_fix stay on board trays — never silent drop |
| **Agent posture** | Rules decide urgency/SLA/specialty; assist agents narrate / translate / suggest (confirm-first) |
| **Outcome** | Told → owned → booked → visit completed → verified (+ lost with reason) |
| **Evidence** | Offline hard pack: Validate / Gate / Priority **100%** (see EVAL.md) |

---

## Why this wins for population health (not another chatbot)

1. Matches DOH screening reality: detection exists; accountability does not.
2. Judgeable agent graph (Nabeel webinar: show input → each agent → output).
3. Benchmark edge on Validate (bad data), Gate (borderline/normal), Priority (urgent FIT/BP).
4. Path to pilot is integration with extracts + Sahhatna-style channels — not replacing the EHR.

---

## Non-goals (on purpose)

- Not a diagnostic AI or medical device claim
- Not a full HIS / scheduling product replacement
- Not unsupervised patient self-triage
