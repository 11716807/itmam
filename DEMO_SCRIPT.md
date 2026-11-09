# Itmam — Virtual video demo script

**Length:** ~3:30–4:00 · **URL:** https://itmam-216812516383.asia-south1.run.app  
**Tone:** Conversational, confident, warm — like explaining to a smart colleague, not reading slides.  
**Rule:** Say “agents,” never “LLM” or model names.

---

# BEFORE THE DEMO

*Title card or quiet board on screen. Look at camera / speak to mic. No clicking yet. Breathe between paragraphs.*

> Hi — thanks for watching. I’m going to walk you through Itmam.  
>  
> Abu Dhabi already screens at scale with programs like IFHAS and EAS.  
> What breaks more often is what happens *after* the result lands —  
> nobody tells the patient, nobody owns it, nobody books, nobody verifies.  
> That’s an orphan result — and it turns screening into unfinished care.  
>  
> Itmam helps care coordinators close every actionable finding:  
> told, owned, booked, seen, verified.  
> We don’t diagnose. Agents assist. Humans confirm.  
>  
> Let me show you how that feels in practice.

---

# DEMO — SECTION BY SECTION

*Start moving through the product. Speak a little ahead of each click, then pause so the UI can “answer” you.*

---

## Section 1 — The board comes alive  
**~45–50 seconds**  
**Do:** Clear board → Use example extract → wait for agents → slowly scan the ranked list

> We start the way a real ops team would start — with a screening extract.  
> I’ll load our example IFHAS-shaped file. Everything you see is synthetic demo data, built to look like real program output.  
>  
> As it imports, you are not watching a single black-box score.  
> You are watching a harness of named agents, in order:  
> Ingest brings the row in.  
> Validate checks whether the data is even usable.  
> Enrich reads the clinical signal for *coordination* — not for diagnosis.  
> Gate decides: does this finding deserve a closed loop, or should it stay off the board?  
> Priority sets urgency and SLA.  
> Route places it.  
> Explain narrates what just happened, without changing the decision.  
>  
> When the dust settles, the board is ranked.  
> Yusuf — FIT positive — sits high, because cancer-path follow-up cannot wait.  
> Fatima — a clearly marked blood-pressure finding — is also urgent.  
> A coordinator looking at this screen immediately knows where the morning starts.

---

## Section 2 — Trust the decision  
**~40 seconds**  
**Do:** Open How decided on Yusuf → linger on path, I/O, guardrails → close

> Ranking without trust is just another dashboard.  
> So every placed case can open How decided.  
>  
> Here you see the agent path for Yusuf — what went in, what came out, and which guardrails held.  
> We do not invent patient values.  
> We do not silently “fix” bad data.  
> We do not drop people off the side of the screen.  
> Rules decide urgency and placement. The explain step only tells the story.  
>  
> That matters for judges, for DOH pilots, and for the coordinator who has to defend a call at 9 a.m.  
> If you can see the decision, you can trust the board.

---

## Section 3 — What we refuse to hide  
**~35–40 seconds**  
**Do:** Expand Not on board → show filtered rows → show needs-fix (Rashid / Hind)

> Closed-loop systems fail when they only celebrate what they placed — so look here: Not on board.  
> Borderline and normal stay visible as filtered, because “not now” is still information.  
> Bad data — like a blood pressure that says “high,” or a missing HbA1c — is tagged needs fix. We never quietly rewrite it.  
> On our twelve-case hard pack, Validate, Gate, Priority, and destination all score one hundred percent.

---

## Section 4 — Close one real loop  
**~70–90 seconds**  
**Do:** Open Fatima → show path/timeline → confirm priority → wait for Assist → Use draft (show Applied) → Send if you want → Use suggested owner → show list/why → Use suggested slot → advance visit / verify as time allows

> Now the part that matters most — closing a loop for one person.  
> I’ll open Fatima.  
>  
> At the top, her path is always visible: where she is in the journey, and what “done” looks like.  
> Coordinators should never wonder what the next responsible action is.  
>  
> Beside that path sits Assist — stage-aware agents that suggest the next move, with guardrails, and never auto-advance the loop.  
>  
> First we lock priority — a human confirmation.  
> Then Draft tell prepares calm Sahhatna-style language a patient can actually receive.  
> I still have to press Use draft. You can see it apply.  
> And I still have to send. Nothing messages a patient without a person.  
>  
> Next, Match owner looks across the live clinician roster — specialty, network, fit for this finding — and gives a one-line why.  
> The pick must be a real clinician on that roster. If an agent invents an id, guardrails block it, and I choose manually.  
>  
> Then Suggest slot does the same for appointments: network-safe times only, confirm-first.  
> I accept the suggestion — or I pick another slot from the full list.  
>  
> From here the loop continues the way care should continue: the visit is recorded, the pathway is chosen, and verification closes the case — or we document lost-to-follow-up so the gap stays visible.  
>  
> That is the difference between a screening report and a finished episode of coordination.

---

## Section 5 — The trail we leave behind  
**~25–30 seconds**  
**Do:** Open Audit → scroll the timeline slowly (optional quick cut to Outcomes)

> Finally, open Audit.  
> You get a clean, day-grouped timeline of who did what — coordinator, system, assist agents — without noise.  
>  
> If we had more time we would also show Outcomes: whether care actually completed, how fast ownership happened, and where loops were lost.  
>  
> The design principle stays the same end to end:  
> rules hold the rank and the SLA;  
> agents draft and suggest;  
> humans confirm the real-world action.

---

# AFTER THE DEMO

*Stop on the end card. No more clicking. Soft close — like finishing a story.*

> Screening without closure is unfinished care — Itmam finishes the loop.  
> Agents assist. Humans confirm. Thank you for watching.

**End card:**

```
Itmam
Close every actionable screening result

Told → Owned → Booked → Seen → Verified
Agents assist · Humans confirm

https://itmam-216812516383.asia-south1.run.app
Demo data: 100% synthetic
```

---

# FLOW CHEAT SHEET

| Part | Feeling | One breath summary |
|---|---|---|
| **Before** | Set the stakes | Screening works — closure doesn’t. We fix orphan results. |
| **1 Board** | Show the system wake up | Extract in → named agents → urgent cases rise. |
| **2 How decided** | Earn trust | Open the decision. Guardrails. No silent rewrite. |
| **3 Not on board** | Show integrity | Filtered + needs-fix stay visible. 100% hard pack. |
| **4 Fatima** | Make it human | Confirm-first: draft → owner → slot → verify. |
| **5 Audit** | Leave proof | Timeline of who did what. |
| **After** | Land the message | Finish the loop. Thank you. |

---

# SPEAKING TIPS

- Read each section once out loud; if you stumble, shorten that *one sentence* — don’t flatten the whole script.  
- Pause after “orphan result,” after “one hundred percent,” and after “Use draft” so the UI can land.  
- Smile on “Let me show you” and on the thank-you — virtual demos still need warmth.  
- If Assist is slow, say: “Assist is ranking with guardrails — still confirm-first.” Then continue when Applied appears.
