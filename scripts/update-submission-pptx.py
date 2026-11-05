#!/usr/bin/env python3
"""Refresh Future Health submission PPT with latest product / UX / eval copy."""

from __future__ import annotations

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parents[1]
PPT = ROOT / "docs" / "Itmam_Future_Health_Digital_Innovation_Challenge_Submission.pptx"

LIVE = "https://itmam-216812516383.asia-south1.run.app"
GITHUB = "https://github.com/11716807/itmam"
REV = "itmam-00011-d4k"

SLIDE3 = (
    "Itmam is a production-ready closed-loop care coordination prototype for Abu Dhabi "
    "IFHAS/EAS screening follow-up. It imports raw extracts, runs a named agent harness "
    "(Ingest → Validate → Enrich → Gate → Priority → Route → Explain) with per-agent "
    "guardrails, places only actionable loops on a ranked board, and drives tell → own → "
    "book → visit → verify with Sahhatna-style messaging, audit, and Firestore shared state "
    "for judges. Coordinators expand How decided, click any agent tile for a full "
    "input / output / guardrails popup, and re-run needs_fix rows with a progressive harness "
    "transition. Gemini assists briefs/translate only — rules decide priority. Offline eval "
    "on the 12-row hard pack: Validate 100%, Gate 100%, Priority 100%, destination accuracy 100%."
)

SLIDE4 = (
    "Left: Cloud architecture (Cloud Run · Firestore · Gemini) — live revision "
    f"{REV}.\n"
    "Center: Agent harness — Ingest → Validate → Enrich → Gate → Priority → Route → Explain; "
    "click a tile to open input · output · guardrails; fix & re-run walks the path with loaders.\n"
    "Right: Closed-loop workflow told → owned → booked → visit completed → verified "
    "(optional confirmatory branch)."
)

SLIDE5 = (
    "Primary users\n"
    "• Care coordinators / population-health ops — triage IFHAS/EAS extracts, assign owners, "
    "book network-safe slots, verify outcomes.\n"
    "• Patients (Sahhatna-style) — receive told messages and book after informed.\n"
    "• Clinical owners — complete visit notes and verification on the Case screen.\n\n"
    "Product surfaces (app nav)\n"
    "• Work: Board · Case · Patient\n"
    "• Review: Outcomes · Audit · Risk rules\n"
    "• Board: How decided harness + Not on board (filtered / needs_fix) with fix & re-run\n\n"
    "Intended outcome\n"
    "Zero orphan actionable screening results: every loop is either verified or explicitly "
    "lost-to-follow-up with reason. Filtered/needs-fix rows stay visible — never silently dropped."
)

SLIDE6 = (
    "Product KPIs\n"
    "• % actionable results with patient_told within SLA\n"
    "• % with clinical owner assigned\n"
    "• % booked → visit completed → verified\n"
    "• Lost-to-follow-up with documented reason\n\n"
    "Agent harness KPIs (offline hard pack, n=12)\n"
    "• Validate Agent accuracy: 100% (hard-fail bad BP / missing value)\n"
    "• Gate Agent accuracy: 100% (borderline/normal filtered, actionable placed)\n"
    "• Priority Agent urgency match: 100% on labeled urgent FIT/BP\n"
    "• Destination accuracy (placed/filtered/needs_fix): 100%\n"
    "• Batch split: 8 placed · 2 filtered · 2 needs_fix · 0 silent drops\n"
    "• Replay: npm run eval (scripts/run-eval.mjs)"
)

SLIDE7 = (
    "Clinical / program context\n"
    "• Abu Dhabi IFHAS / EAS population screening generates high volumes of findings; "
    "the operational gap is closed-loop follow-up, not detection.\n\n"
    "Prototype evidence (see EVAL.md)\n"
    "• 12-row synthetic IFHAS-shaped hard pack including urgent FIT/BP, borderline BP, "
    "normal LDL, invalid BP (“high”), missing HbA1c.\n"
    "• Validate / Gate / Priority agents each 100% vs expected destinations on this pack.\n"
    "• Live Cloud Run demo with Firestore shared board for reproducible judge walkthrough.\n"
    "• Guardrails documented per agent; agent popup shows input → decision → output.\n"
    "• Needs_fix re-run: progressive harness animation, then place onto the board when fixed."
)

SLIDE9 = (
    "Privacy & security\n"
    "• Demo/synthetic data only in current deploy; secrets via Cloud Run env (not committed).\n\n"
    "Responsible AI\n"
    "• Rules decide urgency/SLA/specialty; Gemini narrates only and is guardrailed against "
    "diagnosis language.\n"
    "• Per-agent guardrails (validate hard-fail, gate no silent drop, explain narrate-only).\n"
    "• Explainability: click any agent tile → popup with input, output, guardrails, timestamps.\n"
    "• Human oversight: coordinator confirms priority, sends message, assigns owner, verifies.\n"
    "• Failure modes: bad values → needs_fix tray (fix & re-run); borderline → filtered tray; "
    "lost marked with reason — never pretend the loop closed."
)

SLIDE11 = (
    "Phase 0 — now (hackathon)\n"
    f"• Live Cloud Run ({REV}) with demo extract, Gemini assist, Firestore audit, "
    "agent harness + EVAL.md benchmarks + agent detail popup + needs_fix re-run UX.\n\n"
    "Phase 1 — DOH pilot (3–6 months)\n"
    "• Integrate approved IFHAS/EAS extract feeds; SSO for coordinators; Sahhatna/SMS channel "
    "adapters; clinical SME review of enrichment thresholds.\n\n"
    "Phase 2 — scale\n"
    "• Multi-facility queues, SLA dashboards, Malaffi/EHR write-back where permitted, "
    "Arabic-first messaging packs, continuous eval harness in CI.\n\n"
    "Stakeholders: DOH population health, facility care coordination, insurers (network slots), "
    "patients via Sahhatna-style channels."
)

SLIDE14 = (
    "Additional — stack, live links, UX, eval\n"
    f"Live: {LIVE}\n"
    f"GitHub: {GITHUB}\n"
    f"Prod revision: {REV}\n"
    "Docs: README · EVAL · ASSUMPTIONS · COMPETITIVE · HARD_CASES\n\n"
    "Agent harness: Ingest → Validate → Enrich → Gate → Priority → Route → Explain\n"
    "Inspect: How decided → click agent → input / output / guardrails popup\n"
    "Fix path: needs_fix → edit value → Re-run agents (loader + progressive reveal)\n\n"
    "Hard pack: 8 placed · 2 filtered · 2 needs_fix · Validate/Gate/Priority/destination 100%\n"
    "Replay eval: npm run eval"
)

SLIDE15 = (
    "Judge demo walkthrough (4–5 min)\n\n"
    f"1. Open {LIVE} (shared Firestore board).\n"
    "2. Clear board → Example file (or Restore demo board).\n"
    "3. Yusuf (FIT) / Fatima (BP) at top — expand How decided → click Priority / Gate tiles "
    "to show input · output · guardrails popup.\n"
    "4. Not on board — Rashid BP “high”, Hind empty HbA1c; fix value → Re-run agents "
    "(harness animates, scrolls, places when valid).\n"
    "5. Open Fatima → Case — patient path on top → Confirm priority → Tell → own → book → "
    "visit → verify.\n"
    "6. Optional: Patient / Outcomes / Audit / Risk rules.\n\n"
    "Talk track: Rules decide; Gemini narrates; no silent drops; offline hard pack 100%."
)


def set_text_keep_style(shape, text: str) -> None:
    """Replace shape text while preserving the first run's basic font where possible."""
    tf = shape.text_frame
    # Capture style from first existing run
    font_name = None
    font_size = None
    bold = None
    color = None
    for p in tf.paragraphs:
        for r in p.runs:
            if r.font.name:
                font_name = r.font.name
            if r.font.size:
                font_size = r.font.size
            if r.font.bold is not None:
                bold = r.font.bold
            try:
                if r.font.color and r.font.color.rgb:
                    color = r.font.color.rgb
            except Exception:
                pass
            break
        if font_size or font_name:
            break

    tf.clear()
    lines = text.split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        run = p.add_run()
        run.text = line
        if font_name:
            run.font.name = font_name
        if font_size:
            run.font.size = font_size
        elif len(text) > 500:
            run.font.size = Pt(11)
        else:
            run.font.size = Pt(12)
        if bold is not None and i == 0 and line.endswith("*"):
            run.font.bold = True
        if color is not None:
            run.font.color.rgb = color


def replace_body_shapes(slide, new_text: str, min_len: int = 80) -> int:
    """Replace long body text boxes (template often duplicates the body)."""
    n = 0
    for shape in slide.shapes:
        if not shape.has_text_frame:
            continue
        cur = shape.text_frame.text.strip()
        if len(cur) < min_len:
            continue
        # Skip short titles / section headers
        if cur.count("\n") == 0 and len(cur) < 120 and cur.endswith("*"):
            continue
        set_text_keep_style(shape, new_text)
        n += 1
    return n


def add_slide15_body(prs: Presentation) -> None:
    slide = prs.slides[14]
    # Remove prior free text boxes we may have added (keep template chrome)
    # Just add / overwrite a body box in a known position.
    existing = [s for s in slide.shapes if s.has_text_frame and "Judge demo" in s.text_frame.text]
    if existing:
        set_text_keep_style(existing[0], SLIDE15)
        return

    box = slide.shapes.add_textbox(Inches(0.55), Inches(0.85), Inches(8.9), Inches(4.4))
    tf = box.text_frame
    tf.word_wrap = True
    for i, line in enumerate(SLIDE15.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        run = p.add_run()
        run.text = line
        run.font.size = Pt(13) if i == 0 else Pt(12)
        run.font.bold = i == 0
        run.font.color.rgb = RGBColor(0x0D, 0x5C, 0x63) if i == 0 else RGBColor(0x1A, 0x2B, 0x2E)
        p.alignment = PP_ALIGN.LEFT
        p.space_after = Pt(2)


def main() -> None:
    prs = Presentation(str(PPT))
    assert len(prs.slides) >= 15, f"expected ≥15 slides, got {len(prs.slides)}"

    # Slide 1 — cover text shape
    for shape in prs.slides[0].shapes:
        if shape.has_text_frame and "Team Name: Itmam" in shape.text_frame.text:
            set_text_keep_style(
                shape,
                "Team Name: Itmam\n"
                "Team Size: 1\n"
                "Problem Statement: Abu Dhabi already screens at scale with IFHAS and EAS — "
                "the gap is closing the loop so actionable results are told → owned → booked → "
                "visit completed → verified.\n\n"
                "We help care coordinators close IFHAS/EAS actionable screening results "
                "(told → owned → booked → seen → verified) using a rules-first multi-agent "
                "import harness with visible guardrails; Gemini only narrates.\n\n"
                f"Live: {LIVE}\n"
                f"Prod: {REV}",
            )

    updates = [
        (2, SLIDE3, 100),
        (3, SLIDE4, 60),
        (4, SLIDE5, 100),
        (5, SLIDE6, 100),
        (6, SLIDE7, 100),
        (8, SLIDE9, 80),
        (10, SLIDE11, 100),
        (13, SLIDE14, 80),
    ]
    for idx, text, min_len in updates:
        n = replace_body_shapes(prs.slides[idx], text, min_len=min_len)
        print(f"slide {idx + 1}: updated {n} body shape(s)")

    add_slide15_body(prs)
    print("slide 15: demo walkthrough body set")

    prs.save(str(PPT))
    print(f"saved {PPT}")


if __name__ == "__main__":
    main()
