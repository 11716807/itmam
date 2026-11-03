import { useEffect, useState } from "react";
import { CareTimeline } from "../components/CareTimeline";
import { clinicianById, patientById, resultById, slotById } from "../data/seed";
import { isRtl, langMeta } from "../lib/languages";
import { bookSlot, compatibleSlots, rescheduleSlot } from "../lib/loop";
import type { AuditEvent, CareCase, LoopStage, Message } from "../types";
import { STAGE_LABEL } from "../types";

type Props = {
  cases: CareCase[];
  selectedId: string | null;
  messages: Message[];
  onSelect: (caseId: string) => void;
  onClearSelect: () => void;
  onPatch: (next: CareCase, events: AuditEvent[]) => void;
  onOpenCase: () => void;
};

type StageCopy = {
  headline: string;
  body: string;
  means: string;
  next: string;
  tone: "info" | "ok" | "warn" | "mint";
};

function copyFor(stage: LoopStage, name: string, finding: string, noShows: number): StageCopy {
  switch (stage) {
    case "result_in":
    case "stratified":
      return {
        headline: "Waiting for your Sahhatna message",
        body: `Hi ${name}. Your screening for ${finding} is with the care team. Booking stays locked until you are informed — this is not a diagnosis.`,
        means: "A screening value needs a short clinic look. It does not mean you have a disease.",
        next: "Wait for the coordinator message. Booking opens only after that.",
        tone: "info",
      };
    case "told":
      return {
        headline: "You’ve been informed — you can book now",
        body: `Please read your Sahhatna note about ${finding}. Network-safe visit times are open only after this message.`,
        means: "You have been told about a finding that needs follow-up. You can now choose a visit time.",
        next: "Pick an appointment below on your insurance network.",
        tone: "ok",
      };
    case "owned":
      return noShows > 0
        ? {
            headline: "Please rebook your visit",
            body: `Your previous appointment for ${finding} was missed. Care is still open — pick a new time on your insurance network.`,
            means: "Missing a visit did not close your follow-up. The care path is still open.",
            next: "Choose a new appointment below.",
            tone: "warn",
          }
        : {
            headline: "Clinician assigned — book your visit",
            body: `A clinician owns your ${finding} follow-up. Pick a time on your insurance network.`,
            means: "A doctor is accountable for your follow-up. Booking with them keeps one clear path.",
            next: "Book an appointment below.",
            tone: "ok",
          };
    case "booked":
      return {
        headline: "Appointment booked",
        body: "Your visit is confirmed. Please attend on time — the clinic will review your screening then.",
        means: "Your time is held. The visit is to review the screening — not a diagnosis by itself.",
        next: "Bring Emirates ID. Reschedule here if the time no longer works.",
        tone: "mint",
      };
    case "seen":
      return {
        headline: "Visit completed",
        body: "Your clinic visit is recorded. The care team is documenting the outcome so your loop can close.",
        means: "You attended. The team is confirming that follow-up care happened.",
        next: "You’ll see verified when the outcome is confirmed.",
        tone: "ok",
      };
    case "verified":
      return {
        headline: "Follow-up complete",
        body: "Your screening-to-care loop is closed. Care happened and was verified — nothing left open.",
        means: "This screening result was followed through to documented care.",
        next: "No further action on this result.",
        tone: "mint",
      };
    case "lost":
      return {
        headline: "Follow-up paused",
        body: "We could not complete your follow-up yet. Please contact the clinic through Sahhatna if you still need a visit.",
        means: "The loop stopped before verified care. You can ask to restart booking.",
        next: "Message the clinic if you still want a visit.",
        tone: "warn",
      };
  }
}

function PatientDirectory({
  cases,
  selectedId,
  onSelect,
}: {
  cases: CareCase[];
  selectedId: string | null;
  onSelect: (caseId: string) => void;
}) {
  if (!cases.length) {
    return (
      <div className="patient-directory empty">
        <p className="eyebrow">Patients</p>
        <h3>No patients on the board yet</h3>
        <p className="muted">Import an extract on the Board first, then pick a patient here.</p>
      </div>
    );
  }

  return (
    <div className="patient-directory">
      <div className="patient-directory-head">
        <p className="eyebrow">Patients</p>
        <h3>{selectedId ? "Switch patient" : "Choose a patient"}</h3>
        <p className="muted">
          {selectedId
            ? "Sahhatna view below is for the selected person. Tap another name to switch."
            : "Open Patient from the menu without a board pick — select who you want to see."}
        </p>
      </div>
      <ul className="patient-directory-list">
        {cases.map((row) => {
          const patient = patientById(row.patientId);
          const result = resultById(row.resultId);
          const on = row.id === selectedId;
          return (
            <li key={row.id}>
              <button
                type="button"
                className={`patient-directory-item ${on ? "on" : ""}`}
                onClick={() => onSelect(row.id)}
              >
                <span>
                  <strong>{patient.nameEn}</strong>
                  <em>{patient.nameAr}</em>
                </span>
                <span>
                  {result.labelEn} {result.value}
                  {result.unit ? ` ${result.unit}` : ""}
                </span>
                <span className={`chip ${row.urgency}`}>{STAGE_LABEL[row.stage].en}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PatientDetail({
  care,
  messages,
  onPatch,
  onOpenCase,
  onBackToList,
}: {
  care: CareCase;
  messages: Message[];
  onPatch: (next: CareCase, events: AuditEvent[]) => void;
  onOpenCase: () => void;
  onBackToList: () => void;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const patient = patientById(care.patientId);
  const result = resultById(care.resultId);
  const latest = [...messages].filter((m) => m.caseId === care.id).at(-1);
  const slots = compatibleSlots(care.specialty, patient.network, care.ownerId);
  const bookSlots = slots.slice(0, 4);
  const altSlots = slots.filter((s) => s.id !== care.slotId).slice(0, 4);
  const finding = result.labelEn;
  const noShows = care.noShowCount ?? 0;
  const copy = copyFor(care.stage, patient.nameEn, finding, noShows);
  const owner = care.ownerId ? clinicianById(care.ownerId) : null;
  const slot = care.slotId ? slotById(care.slotId) : null;
  const visitDoctor = slot
    ? clinicianById(slot.clinicianId)
    : owner && bookSlots.every((s) => s.clinicianId === owner.id)
      ? owner
      : null;
  const slotsPinnedToOwner = Boolean(
    owner && bookSlots.length > 0 && bookSlots.every((s) => s.clinicianId === owner.id),
  );

  const informed = Boolean(care.toldAt) || care.stage === "told" || care.stage === "owned";
  const canBook =
    informed && !care.slotId && (care.stage === "told" || care.stage === "owned");
  const showBookedOnly = care.stage === "booked";
  const showSeen = care.stage === "seen" || care.stage === "verified";
  const waitingToBeTold = care.stage === "result_in" || care.stage === "stratified";

  return (
    <div className="patient-detail">
      <div className="patient-detail-head">
        <div>
          <button type="button" className="text-link" onClick={onBackToList}>
            ← All patients
          </button>
          <p className="eyebrow">Sahhatna</p>
          <h3>
            {patient.nameEn} <span className="name-ar-inline">{patient.nameAr}</span>
          </h3>
          <p className="lede">Status: {STAGE_LABEL[care.stage].en}</p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn" onClick={onBackToList}>
            Change patient
          </button>
          <button type="button" className="btn" onClick={onOpenCase}>
            Open case
          </button>
        </div>
      </div>

      <div className={`patient-status ${copy.tone}`}>
        <p className="eyebrow">Current message</p>
        <h3>{copy.headline}</h3>
        <p>{copy.body}</p>
        <div className="patient-plain">
          <div>
            <p className="patient-plain-kicker">What this means</p>
            <p>{copy.means}</p>
          </div>
          <div>
            <p className="patient-plain-kicker">Next step</p>
            <p>{copy.next}</p>
          </div>
        </div>
      </div>

      <CareTimeline care={care} compact />

      <div className="split" style={{ marginTop: 14 }}>
        <div className="phone">
          <div className="app-bar">
            <span>Sahhatna</span>
            <span>{STAGE_LABEL[care.stage].en}</span>
          </div>
          <h3>{patient.nameEn}</h3>

          {waitingToBeTold ? (
            <>
              <p className="phone-badge">Booking locked</p>
              <p>
                Itmam is preparing your follow-up. You will only see booking times after the care
                team sends your Sahhatna message.
              </p>
            </>
          ) : null}

          {showBookedOnly && slot ? (
            <>
              <p className="phone-badge">Appointment booked</p>
              <p>
                <strong>{slot.when.replace("T", " ")}</strong>
                {visitDoctor ? <> · {visitDoctor.nameEn}</> : null}
              </p>
              <p>
                Facility: {visitDoctor?.facility || result.facility}. Please arrive a few minutes
                early.
              </p>
              {altSlots.length ? (
                !rescheduling ? (
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: 10 }}
                    onClick={() => setRescheduling(true)}
                  >
                    Reschedule
                  </button>
                ) : (
                  <>
                    <p className="phone-badge" style={{ marginTop: 12 }}>
                      Pick another available time
                    </p>
                    <div className="actions">
                      {altSlots.map((s) => {
                        const clinician = clinicianById(s.clinicianId);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className="btn"
                            onClick={() => {
                              const res = rescheduleSlot(care, s.id);
                              setRescheduling(false);
                              onPatch(res.case, res.events);
                            }}
                          >
                            Move to {s.when.slice(5, 16).replace("T", " ")}
                            <span style={{ opacity: 0.8 }}> · {clinician.nameEn}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="text-link"
                      style={{ marginTop: 8 }}
                      onClick={() => setRescheduling(false)}
                    >
                      Keep current time
                    </button>
                  </>
                )
              ) : null}
            </>
          ) : null}

          {showSeen ? (
            <>
              <p className="phone-badge ok">Visit completed</p>
              <p>
                {care.visitNote
                  ? care.visitNote
                  : "Your clinic visit was recorded. Outcome verification is in progress."}
              </p>
              {care.stage === "verified" ? (
                <p>
                  <strong>Verified — loop closed.</strong>
                </p>
              ) : (
                <p>Waiting for outcome verification.</p>
              )}
            </>
          ) : null}

          {canBook ? (
            <>
              {latest ? (
                <p
                  className={isRtl(latest.lang) ? "ar" : undefined}
                  dir={isRtl(latest.lang) ? "rtl" : "ltr"}
                >
                  <strong>Your note ({langMeta(latest.lang).label}):</strong> {latest.bodyEn}
                </p>
              ) : (
                <p>{copy.body}</p>
              )}
              {slotsPinnedToOwner && owner ? (
                <p>
                  Your clinician: <strong>{owner.nameEn}</strong> · {owner.facility}
                </p>
              ) : owner && !slotsPinnedToOwner ? (
                <p>
                  Pick a time with a network-safe doctor for this finding. Booking sets that doctor
                  as your clinician (replacing {owner.nameEn} if different).
                </p>
              ) : (
                <p>Pick a time — that doctor becomes your clinician for this follow-up.</p>
              )}
              <p className="phone-badge">
                {noShows > 0
                  ? slotsPinnedToOwner && owner
                    ? `Rebook with ${owner.nameEn}`
                    : "Rebook your visit"
                  : slotsPinnedToOwner && owner
                    ? `Book with ${owner.nameEn}`
                    : "Book your visit"}
              </p>
              {noShows > 0 ? (
                <p>Previous visit missed ({noShows}×). Pick a new time — follow-up is still open.</p>
              ) : null}
              {!bookSlots.length ? (
                <p>No slots on your insurance network right now. The coordinator will help.</p>
              ) : (
                <div className="actions">
                  {bookSlots.map((s) => {
                    const clinician = clinicianById(s.clinicianId);
                    const sameDoctor = slotsPinnedToOwner;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className="btn"
                        onClick={() => {
                          const res = bookSlot(care, s.id);
                          onPatch(res.case, res.events);
                        }}
                      >
                        {noShows > 0 ? "Rebook" : "Book"} {s.when.slice(5, 16).replace("T", " ")}
                        {!sameDoctor ? (
                          <span style={{ opacity: 0.8 }}> · {clinician.nameEn}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}

          {!waitingToBeTold && !canBook && !showBookedOnly && !showSeen ? (
            <p>{copy.body}</p>
          ) : null}
        </div>

        <div className="block">
          <h3>How Itmam uses AI here</h3>
          <ol className="patient-flow">
            <li className={care.stage !== "result_in" ? "on" : ""}>
              Enrichment ranks your finding (not a diagnosis)
            </li>
            <li className={care.toldAt ? "on" : ""}>
              Coordinator sends your Sahhatna message — <strong>then booking unlocks</strong>
            </li>
            <li className={care.bookedAt || noShows > 0 ? "on" : ""}>
              You book a network-safe visit
              {noShows > 0 ? ` · rebook after miss ×${noShows}` : ""}
            </li>
            <li className={care.seenAt ? "on" : ""}>Visit completed</li>
            <li className={care.verifiedAt ? "on" : ""}>Outcome verified — loop closed</li>
          </ol>
          <p className="muted" style={{ marginTop: 12 }}>
            Patients never see book buttons before they are told. A missed visit loops back to
            rebook — it does not close the path by itself.
          </p>
        </div>
      </div>
    </div>
  );
}

export function PatientView({
  cases,
  selectedId,
  messages,
  onSelect,
  onClearSelect,
  onPatch,
  onOpenCase,
}: Props) {
  const care = selectedId ? cases.find((c) => c.id === selectedId) ?? null : null;

  useEffect(() => {
    document.querySelector(".workspace")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [selectedId]);

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Patient · Sahhatna</h2>
          <p className="lede">
            {care
              ? "Follow-up for the selected patient."
              : "Pick a patient to open their Sahhatna view."}
          </p>
        </div>
      </header>

      <div className="panel-body">
        {care ? (
          <PatientDetail
            care={care}
            messages={messages}
            onPatch={onPatch}
            onOpenCase={onOpenCase}
            onBackToList={onClearSelect}
          />
        ) : (
          <PatientDirectory cases={cases} selectedId={selectedId} onSelect={onSelect} />
        )}
      </div>
    </section>
  );
}
