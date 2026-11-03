# Itmam — Demo script (≈ 4–5 minutes)

**Product one-liner:**  
Itmam closes the IFHAS/EAS screening-to-care loop — every actionable result gets **told → owned → booked → visit completed → verified**.

**Before you start**
1. Open http://127.0.0.1:5173/
2. Clear board if anything is left over
3. Have ready: `itmam-demo-ifhas-extract.csv`  
   (or use **Use example extract** on the board)

**Hero patient for the live loop:** Fatima Al Ketbi (BP 168/102)  
**Hero for “why ranking matters”:** Yusuf Rahman (FIT Positive — should sit at top)

---

## 0. Setup line (10 sec)

> “Judges, Abu Dhabi already screens at scale with IFHAS and EAS. The gap is not detection — it’s **closing the loop**. Itmam makes sure an actionable result never dies as an orphan row.”

---

## 1. Empty board → import (45 sec)

**Click:** Board → **Use example extract** (or Import CSV)

**Say:**
> “Board starts empty. We don’t pre-populate. We import a raw extract — values plus waiting days, no-shows, wearables.  
> Enrichment decides what is actionable vs borderline from the finding itself — not a human pre-label. Borderline rows are skipped; only actionable loops land on the board.”

**Point at stream:**
- Yusuf / Fatima → urgent  
- Sara / Omar → skipped (borderline)

**Say:**
> “Import finished. Eight loops opened. One glance: who is urgent, who is waiting, who has no owner.”

---

## 2. Board ranking (30 sec)

**Point at top card — Yusuf (FIT)**

**Say:**
> “Cancer-path FIT rises first — pathway risk, delay, prior no-show.  
> Fatima’s BP is also urgent — wearable context and 22 days waiting.  
> This is coordination priority, not a diagnosis.”

**Click:** Fatima’s card → Case

---

## 3. Case — confirm priority (40 sec)

**Point at:** Patient timeline (top)

**Say:**
> “One timeline for the whole journey. Right now we’re at Result in.  
> Before we message anyone, we review the patient and confirm priority.”

**Click:** Confirm priority

**Say:**
> “Priority locked. Timeline moves. Next action is Tell patient.”

---

## 4. Tell patient — English compose + translate (45 sec)

**Say:**
> “Draft opens in English by default. Coordinator can edit freely, or translate to Arabic, Hindi, Urdu — then send from here.”

**Optional flourish:** Translate to Arabic → show draft → Translate back to English if needed  
**Click:** Send in English

**Say:**
> “Sahhatna outbox shows exactly what the patient received. Audit trail is written. Still no silent auto-booking.”

---

## 5. Patient books only after told (50 sec)

**Say:**
> “AI helped draft the message. Until that message is sent, Patient view keeps booking locked.  
> Consent-first: informed, then book.”

**Click:** Patient (before told, if you showed earlier) — booking locked  
**After Send:** Patient again  

**Say:**
> “Now booking unlocks. Slots are network-safe. Patient picks a time; a clinician owns the visit.”

**Click:** a Book time button  

**Optional:** On Case, Assign owner first, then let patient book — either works after told.

**Say:**
> “Timeline shows Appointment booked. Sahhatna now only shows the appointment.”

---

## 6. Confirm patient card (20 sec)

**Stay on Patient**

**Say:**
> “Clear status: Appointment booked — time and clinician.  
> When the visit is done, this becomes Visit completed, then Verified.”

**Click back:** Case (or Clinician)

---

## 7. Visit completed → verify (40 sec)

**On Case (stage Booked):**  
Add a short visit note, e.g. `BP reviewed; lifestyle plan; repeat in 3 months.`

**Click:** Mark visit completed  

**Say:**
> “Same language everywhere — Mark visit completed. Not ‘seen’ in one place and something else in another.”

**Click:** Verify outcome  

**Say:**
> “Loop closed. Timeline at 100%. No orphan result. That’s the product.”

---

## 8. Clinician view (20 sec — optional)

**Click:** Clinician  

**Say:**
> “Clinician gets the packet, the same timeline, and the same Mark visit completed / Verify outcome actions. Coordinators and clinicians share one loop language.”

---

## 9. Outcomes close (20 sec)

**Click:** Outcomes  

**Say:**
> “Outcomes prove care happened — completion, told → booked → visit completed, and any lost-to-follow-up with reason.  
> Screening without verification is unfinished population health. Itmam finishes it.”

---

## Optional: path branch after visit (25 sec)

**On a seen case, point to:** the path graph (main line + side branch)  

**Say:**
> “Same path graph — result to visit stays one line.  
> After visit it can continue straight to verify, or branch: refer → confirmatory book → done → verify.  
> Decision-based fork, not a second product.”

---

## Optional: SLA tags on the board list (15 sec)

**On Board, point to:** SLA tags on case rows (`SLA +Xh` / `SLA soon`)  

**Say:**
> “Same ranked list — when SLA is breached or approaching, the row gets an SLA tag plus the AI recovery action (tell, assign, book, confirm, or verify). Breach is visible in the list, not a second panel.”

---

## Optional: no-show loop (20 sec)

**On a booked case, click:** Patient no-show — rebook  

**Say:**
> “Booking is not the finish line. If the patient doesn’t attend, we don’t pretend the loop closed — we clear the slot, return to Owned, and rebook.  
> Mark lost only when we truly stop pursuing them. The track report shows that rebook loop on the path.”

**Then:** use **Ask about this case** (“What if they no-show?” / “Is the loop closed?”) on open or closed cases.

---

## Closing line (15 sec)

> “Itmam doesn’t invent new screening. It makes IFHAS/EAS results **accountable** — imported, enriched, told, owned, booked, visit completed, verified — with a rebook loop when someone misses.  
> That’s closed-loop population health for Abu Dhabi.”

---

## Demo path cheat-sheet

| Step | Screen | Click |
|------|--------|--------|
| 1 | Board | Use example extract |
| 2 | Board | Open **Fatima** |
| 3 | Case | Confirm priority |
| 4 | Case | Send in English |
| 5 | Case | Assign visit clinician (same specialty) → Book their slots |
| 6 | Patient | Show “Appointment booked” |
| 6b | Case | Optional: **Patient no-show — rebook** → path loops to Owned (not an end) |
| 7 | Case | Mark visit completed → Verify outcome · Ask about this case |
| 8 | Outcomes | Show completion |

**Backup patient if Fatima is already closed:** Mariam (HbA1c) or Hassan (HbA1c + wearable).  
**Always leave Yusuf at top of board** to show cancer-path ranking.

---

## If something breaks

- Board empty / weird state → **Clear board** → re-run example extract  
- No Gemini / slow brief → local enrichment still fills board and drafts English text  
- No slots → pick another clinician/network patient (Ahmed / network_a)  
- Script file path: `health/DEMO_SCRIPT.md`  
- CSV path: `/Users/rahulduggal/Downloads/itmam-demo-ifhas-extract.csv`
