# Itmam

**We help care coordinators close IFHAS/EAS actionable screening results — told → owned → booked → seen → verified — using a rules-first multi-agent import harness with visible guardrails; Gemini only narrates.**

Abu Dhabi already screens at scale. The gap is **orphan results**. Itmam imports a screening extract, runs a named agent harness, places only actionable loops on a ranked board, and drives the closed loop to verification (or documented lost-to-follow-up).

**Live demo:** https://itmam-216812516383.asia-south1.run.app  
**GitHub:** https://github.com/11716807/itmam

---

## Who / task / data (locked framing)

| | |
|---|---|
| **Who we help** | Care coordinators (primary); patients via Sahhatna-style view; clinicians on Case |
| **Task** | Close every actionable screening result — not diagnose |
| **Information from** | IFHAS/EAS-shaped extract (CSV); demo data is **100% synthetic** |

---

## Agent harness

```
Ingest → Validate → Enrich → Gate → Priority → Route → Explain
```

Each agent has standing **guardrails** (no invent, hard-fail blocks, no silent drop, rules beat model, narrate-only). Tap **How decided** on any board row to inspect input / output / guardrails.

Offline hard-pack scores (n=12): **Validate 100% · Gate 100% · Priority 100% · destination 100%** — see [EVAL.md](./EVAL.md).

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # set GEMINI_API_KEY (optional for rules-only path)
npm run dev
```

Open http://127.0.0.1:5173/

```bash
npm run eval                 # replay hard-pack benchmark
```

---

## Judge walkthrough

1. Open live URL (or local). Board may already show the shared Firestore demo.
2. **Clear board** → **Use example extract** (or Restore demo board).
3. Point at Yusuf (FIT) / Fatima (BP) at top; open **How decided**.
4. Expand **Not on board** — filtered + needs_fix (Rashid BP `high`, Hind empty HbA1c).
5. Open Fatima → **Case** — patient path at top → Confirm priority → Tell → book → visit → verify.
6. Optional: Patient / Outcomes / Audit / Risk rules.

Full script: [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) · Hard cases: [HARD_CASES.md](./HARD_CASES.md)

---

## Submission docs

| Doc | Purpose |
|---|---|
| [EVAL.md](./EVAL.md) | Benchmark numbers, expected vs actual, agent scores |
| [ASSUMPTIONS.md](./ASSUMPTIONS.md) | Assumptions, limitations, provenance, RAI, path to pilot |
| [COMPETITIVE.md](./COMPETITIVE.md) | Landscape vs Itmam |
| [HARD_CASES.md](./HARD_CASES.md) | Named hard-case pack for video |
| [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) | 4–5 min live demo |
| [docs/Itmam_Future_Health_Digital_Innovation_Challenge_Submission.pptx](./docs/Itmam_Future_Health_Digital_Innovation_Challenge_Submission.pptx) | Official submission slides |

---

## Data provenance

- Demo extract: **100% synthetic** IFHAS/EAS-*shaped* CSV (fictional names; no real Emirates IDs / PHI).
- No production Malaffi feed in this build.
- Details: [ASSUMPTIONS.md](./ASSUMPTIONS.md#data-provenance)

---

## Stack

| Piece | Role |
|---|---|
| Vite + React + TS | Coordinator / patient UI |
| Cloud Run | Static app + `/api/itmam*` + `/api/state` |
| Firestore | Shared board + audit for judges |
| Gemini | Brief / translate / explain narration only |
| Local rules | Enrich · gate · priority · guardrails (demo-safe without Gemini) |

Deploy (same pattern as Golden Frame):

```bash
npm run deploy:cloudrun
```

---

## Responsible AI (short)

Rules decide rank; humans confirm priority, message, own, book, and verify. Bad data is tagged for fix — never silently rewritten. Filtered rows stay visible. Gemini cannot change urgency. See [ASSUMPTIONS.md](./ASSUMPTIONS.md#responsible-ai-safety--governance).

---

## Path to pilot

Hackathon → DOH extract integration + SSO + messaging adapter → multi-facility SLA ops. See [ASSUMPTIONS.md](./ASSUMPTIONS.md#path-to-pilot-doh).
