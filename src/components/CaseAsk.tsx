import { useEffect, useRef, useState } from "react";
import { clinicianById, slotById } from "../data/seed";
import type { AuditEvent, CareCase, LoopStage, Message, Patient, ScreeningResult } from "../types";
import { STAGE_LABEL, STAGE_ORDER } from "../types";

type Props = {
  care: CareCase;
  patient: Patient;
  result: ScreeningResult;
  messages: Message[];
  audit: AuditEvent[];
};

const SUGGESTIONS = [
  "Summary of the complete process",
  "Where is this patient in the loop?",
  "Was the patient told?",
  "Is there an appointment?",
  "What if they no-show?",
  "Who owns this case?",
  "Is the loop closed?",
];

type AskBrief = {
  title: string;
  meaning: string;
  next: string;
  showFlow: boolean;
  highlightLoop?: boolean;
  facts: { label: string; value: string }[];
};

function findingLine(result: ScreeningResult) {
  return `${result.labelEn} ${result.value}${result.unit ? ` ${result.unit}` : ""}`;
}

function stamp(value: string | null): string {
  if (!value) return "Not yet";
  return value.replace("T", " ").slice(0, 16);
}

function visitName(care: CareCase): string {
  if (!care.ownerId) return "Not assigned";
  try {
    return clinicianById(care.ownerId).nameEn;
  } catch {
    return care.ownerId;
  }
}

function appointmentLine(care: CareCase): string {
  if (!care.slotId) return "No appointment yet";
  try {
    const s = slotById(care.slotId);
    const doc = clinicianById(s.clinicianId);
    return `${s.when.replace("T", " ")} · ${doc.nameEn}`;
  } catch {
    return care.slotId;
  }
}

function nextStepFor(care: CareCase): string {
  switch (care.stage) {
    case "result_in":
      return "Confirm priority on the case.";
    case "stratified":
      return "Send the Sahhatna message (booking stays locked until told).";
    case "told":
      return "Assign the visit clinician, or let the patient book.";
    case "owned":
      return (care.noShowCount ?? 0) > 0
        ? "Rebook a network-safe slot after the miss."
        : "Book a visit with the assigned clinician.";
    case "booked":
      return "Attend / record the visit — or reschedule / mark no-show if needed.";
    case "seen":
      return "Verify the outcome to close the loop.";
    case "verified":
      return "Nothing left — loop is closed.";
    case "lost":
      return "Documented gap. Restart outreach only if clinically appropriate.";
  }
}

function processBrief(care: CareCase, patient: Patient, result: ScreeningResult): AskBrief {
  const here = STAGE_LABEL[care.stage].en;
  return {
    title: `${patient.nameEn} · ${findingLine(result)}`,
    meaning:
      care.stage === "verified"
        ? "Screening-to-care is complete: told, owned, seen, and verified."
        : care.stage === "lost"
          ? "Follow-up stopped and recorded as lost — not successful closure."
          : `They are at “${here}”. This is a care loop, not a diagnosis.`,
    next: nextStepFor(care),
    showFlow: true,
    highlightLoop: (care.noShowCount ?? 0) > 0,
    facts: [
      { label: "Now", value: here },
      { label: "Urgency", value: care.urgency },
      { label: "Clinician", value: visitName(care) },
      { label: "Appointment", value: appointmentLine(care) },
      { label: "Told", value: stamp(care.toldAt) },
      { label: "Booked", value: stamp(care.bookedAt) },
      { label: "Seen", value: stamp(care.seenAt) },
      { label: "Verified", value: stamp(care.verifiedAt) },
    ],
  };
}

function briefFor(
  question: string,
  care: CareCase,
  patient: Patient,
  result: ScreeningResult,
  messages: Message[],
): AskBrief {
  const q = question.toLowerCase().trim();
  const noShows = care.noShowCount ?? 0;
  const latestMsg = messages.filter((m) => m.caseId === care.id).at(-1);
  const process = processBrief(care, patient, result);
  const wantsProcess =
    q.includes("summary") ||
    q.includes("process") ||
    q.includes("overview") ||
    q.includes("end to end") ||
    q.includes("end-to-end") ||
    q.includes("how does") ||
    q.includes("explain");

  if (wantsProcess) return process;

  if (
    q.includes("no-show") ||
    q.includes("no show") ||
    q.includes("missed") ||
    q.includes("didn't come") ||
    q.includes("did not come")
  ) {
    return {
      title: "If the patient misses the visit",
      meaning:
        noShows > 0
          ? `This case already has ${noShows} no-show(s). A miss is not closed care.`
          : "A missed appointment does not close the loop.",
      next: "Use “Patient no-show — rebook”: slot clears → Owned → book again. Mark lost only if you stop pursuing them.",
      showFlow: true,
      highlightLoop: true,
      facts: [
        { label: "No-shows", value: String(noShows) },
        { label: "Now", value: STAGE_LABEL[care.stage].en },
        { label: "Appointment", value: appointmentLine(care) },
      ],
    };
  }

  if (
    /\b(closed|closure|verified|finished)\b/.test(q) ||
    q.includes("loop closed") ||
    /\bis (the )?loop (closed|done|complete)\b/.test(q)
  ) {
    return {
      title: care.stage === "verified" ? "Yes — loop closed" : "Not closed yet",
      meaning:
        care.stage === "verified"
          ? `Verified ${stamp(care.verifiedAt)}. Care happened and is documented.`
          : care.stage === "lost"
            ? `Recorded as lost (${care.lostReason?.replaceAll("_", " ")}).`
            : `Still open at “${STAGE_LABEL[care.stage].en}”.`,
      next: nextStepFor(care),
      showFlow: true,
      facts: [
        { label: "Stage", value: STAGE_LABEL[care.stage].en },
        { label: "Verified", value: stamp(care.verifiedAt) },
        { label: "Seen", value: stamp(care.seenAt) },
      ],
    };
  }

  if (/\b(told|message|informed|sahhatna)\b/.test(q)) {
    return {
      title: care.toldAt ? "Yes — patient was told" : "Not told yet",
      meaning: care.toldAt
        ? `Sahhatna sent ${stamp(care.toldAt)}. Booking unlocks only after this.`
        : "Booking stays locked until the coordinator message goes out.",
      next: care.toldAt
        ? latestMsg
          ? `Last note: “${latestMsg.bodyEn.slice(0, 120)}${latestMsg.bodyEn.length > 120 ? "…" : ""}”`
          : "Patient can book or you can assign a clinician."
        : "Compose and send the Sahhatna message.",
      showFlow: true,
      facts: [
        { label: "Told", value: stamp(care.toldAt) },
        { label: "Stage", value: STAGE_LABEL[care.stage].en },
      ],
    };
  }

  if (/\b(appoint|book|slot|reschedule)\b/.test(q)) {
    return {
      title: care.slotId ? "Appointment on the books" : "No appointment yet",
      meaning: care.slotId
        ? "Visit time is held on the patient’s insurance network."
        : care.toldAt
          ? "They’ve been told — booking is unlocked."
          : "Cannot book until the patient is told.",
      next: care.slotId
        ? "Reschedule if needed, or mark visit completed / no-show after the time."
        : nextStepFor(care),
      showFlow: true,
      facts: [
        { label: "Appointment", value: appointmentLine(care) },
        { label: "Clinician", value: visitName(care) },
        { label: "Booked at", value: stamp(care.bookedAt) },
      ],
    };
  }

  if (/\b(own|owner|doctor|clinician|who owns)\b/.test(q)) {
    return {
      title: care.ownerId ? "Visit clinician set" : "No clinician yet",
      meaning:
        "One face for the patient: the doctor they book with also owns the loop.",
      next: care.ownerId
        ? `Currently ${visitName(care)}. Booking realigns owner to the slot doctor if needed.`
        : "Assign a specialty-matched clinician, or let booking set them.",
      showFlow: false,
      facts: [
        { label: "Clinician", value: visitName(care) },
        { label: "Owned", value: stamp(care.ownedAt) },
        { label: "Specialty", value: care.specialty.replaceAll("_", " ") },
      ],
    };
  }

  if (
    q.includes("where") ||
    q.includes("status") ||
    q.includes("in the loop") ||
    /\b(stage|progress)\b/.test(q)
  ) {
    return {
      title: `Now at “${STAGE_LABEL[care.stage].en}”`,
      meaning: `${patient.nameEn} · ${findingLine(result)}. Urgency: ${care.urgency}.`,
      next: nextStepFor(care),
      showFlow: true,
      facts: [
        { label: "Stage", value: STAGE_LABEL[care.stage].en },
        { label: "Urgency", value: care.urgency },
        { label: "Appointment", value: appointmentLine(care) },
      ],
    };
  }

  return process;
}

function flowStatus(care: CareCase, stage: LoopStage): "done" | "now" | "todo" {
  if (care.stage === "verified") return "done";
  if (care.stage === "lost") {
    if (stage === "result_in") return "done";
    if (stage === "stratified") return "done";
    if (stage === "told" && care.toldAt) return "done";
    if (stage === "owned" && care.ownedAt) return "done";
    if (stage === "booked" && care.bookedAt) return "done";
    if (stage === "seen" && care.seenAt) return "done";
    return "todo";
  }
  const cur = STAGE_ORDER.indexOf(care.stage);
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < cur) return "done";
  if (idx === cur) return "now";
  return "todo";
}

function AskFlow({ care, highlightLoop }: { care: CareCase; highlightLoop?: boolean }) {
  const noShows = care.noShowCount ?? 0;
  return (
    <div className="ask-flow" aria-label="Care loop diagram">
      <ol className="ask-flow-track">
        {STAGE_ORDER.map((stage, i) => {
          const status = flowStatus(care, stage);
          return (
            <li key={stage} className={`ask-flow-node ${status}`}>
              {i > 0 ? <span className="ask-flow-join" aria-hidden /> : null}
              <span className="ask-flow-dot" aria-hidden>
                {status === "done" ? "✓" : status === "now" ? "●" : i + 1}
              </span>
              <strong>{STAGE_LABEL[stage].en}</strong>
            </li>
          );
        })}
      </ol>
      {(highlightLoop || noShows > 0) && (
        <div className="ask-flow-loop">
          <span className="ask-flow-loop-mark">↻</span>
          <p>
            No-show loop{noShows > 0 ? ` ×${noShows}` : ""}:{" "}
            <strong>Booked → missed → Owned → rebook</strong> (not an end)
          </p>
        </div>
      )}
      {care.stage === "lost" ? (
        <div className="ask-flow-loop lost">
          <span className="ask-flow-loop-mark">!</span>
          <p>Path interrupted — lost to follow-up</p>
        </div>
      ) : null}
    </div>
  );
}

export function CaseAsk({ care, patient, result, messages }: Omit<Props, "audit"> & { audit?: AuditEvent[] }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [brief, setBrief] = useState<AskBrief | null>(null);
  const [answerKey, setAnswerKey] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuestion("");
    setAsked(null);
    setBrief(null);
    setAnswerKey(0);
  }, [care.id]);

  useEffect(() => {
    if (!brief || !outputRef.current) return;
    outputRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [answerKey, brief]);

  function ask(raw: string) {
    const q = raw.trim();
    if (!q) {
      setAsked(null);
      setBrief({
        title: "Waiting for a question",
        meaning: "Type above or tap a suggestion, then press Ask.",
        next: nextStepFor(care),
        showFlow: false,
        facts: [],
      });
      setAnswerKey((k) => k + 1);
      return;
    }
    setQuestion(q);
    setAsked(q);
    setBrief(briefFor(q, care, patient, result, messages));
    setAnswerKey((k) => k + 1);
  }

  return (
    <div className="case-ask block">
      <div className="case-ask-head">
        <h3>Ask about this case</h3>
        <p className="muted">Plain-language answer with a path diagram appears below.</p>
      </div>

      <div className="case-ask-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ask(question);
            }
          }}
          placeholder="e.g. Summary of the complete process"
          aria-label="Ask about this case"
        />
        <button type="button" className="btn primary" onClick={() => ask(question)}>
          Ask
        </button>
      </div>

      <div
        ref={outputRef}
        key={answerKey}
        className={`case-ask-output ${brief ? "has-answer" : "is-empty"}`}
        role="status"
        aria-live="polite"
      >
        <div className="case-ask-output-label">
          <span>Answer</span>
          {asked ? <em>for “{asked}”</em> : <em>waiting for a question</em>}
        </div>

        {brief ? (
          <div className="ask-brief">
            <h4 className="ask-brief-title">{brief.title}</h4>
            <div className="ask-brief-cards">
              <div className="ask-brief-card">
                <p className="ask-brief-kicker">What this means</p>
                <p>{brief.meaning}</p>
              </div>
              <div className="ask-brief-card next">
                <p className="ask-brief-kicker">Next step</p>
                <p>{brief.next}</p>
              </div>
            </div>
            {brief.showFlow ? (
              <AskFlow care={care} highlightLoop={brief.highlightLoop} />
            ) : null}
            {brief.facts.length ? (
              <dl className="ask-facts">
                {brief.facts.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : (
          <p className="case-ask-output-placeholder">
            Press Ask or tap a chip — a clear answer and path diagram show here.
          </p>
        )}
      </div>

      <p className="case-ask-chips-label">Suggested questions</p>
      <div className="case-ask-suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip-btn ${asked === s ? "active" : ""}`}
            onClick={() => ask(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
