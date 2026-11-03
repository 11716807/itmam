import { useEffect, useState } from "react";
import { CareTimeline } from "../components/CareTimeline";
import { clinicianById, patientById, resultById, slotById } from "../data/seed";
import {
  chooseConfirmatory,
  chooseDirectClose,
  markSeen,
  verifyOutcome,
} from "../lib/loop";
import { canVerify as pathwayCanVerify, referralOf } from "../lib/pathway";
import type { AuditEvent, CareCase, LoopStage } from "../types";
import { STAGE_LABEL } from "../types";

type Props = {
  cases: CareCase[];
  selectedId: string | null;
  onSelect: (caseId: string) => void;
  onClearSelect: () => void;
  onPatch: (next: CareCase, events: AuditEvent[]) => void;
  onOpenCase: () => void;
};

function clinicianMessage(stage: LoopStage): { title: string; detail: string } {
  switch (stage) {
    case "result_in":
    case "stratified":
    case "told":
      return {
        title: "Not ready for visit documentation",
        detail: "Patient still needs ownership and booking before you close the visit.",
      };
    case "owned":
      return {
        title: "You own this loop",
        detail: "Waiting for a booked slot. After the visit, mark seen and verify the outcome.",
      };
    case "booked":
      return {
        title: "Visit booked — ready when patient attends",
        detail: "After the encounter, mark visit completed, then verify the outcome.",
      };
    case "seen":
      return {
        title: "Visit completed",
        detail: "Visit is recorded. Verify the outcome to close the screening loop.",
      };
    case "verified":
      return {
        title: "Outcome verified — loop closed",
        detail: "No further clinician action on this screening result.",
      };
    case "lost":
      return {
        title: "Lost to follow-up",
        detail: "Loop stopped before verification. Gap remains visible on Outcomes.",
      };
  }
}

function ClinicianDirectory({
  cases,
  onSelect,
}: {
  cases: CareCase[];
  onSelect: (caseId: string) => void;
}) {
  if (!cases.length) {
    return (
      <div className="patient-directory empty">
        <p className="eyebrow">Clinician inbox</p>
        <h3>No patients on the board yet</h3>
        <p className="muted">Import an extract on the Board first, then pick a case here.</p>
      </div>
    );
  }

  return (
    <div className="patient-directory">
      <div className="patient-directory-head">
        <p className="eyebrow">Clinician inbox</p>
        <h3>Choose a patient</h3>
        <p className="muted">Pick who you need to see or verify — opens their clinical packet.</p>
      </div>
      <ul className="patient-directory-list">
        {cases.map((row) => {
          const patient = patientById(row.patientId);
          const result = resultById(row.resultId);
          const owner = row.ownerId ? clinicianById(row.ownerId) : null;
          return (
            <li key={row.id}>
              <button
                type="button"
                className="patient-directory-item"
                onClick={() => onSelect(row.id)}
              >
                <span>
                  <strong>{patient.nameEn}</strong>
                  <em>{patient.nameAr}</em>
                </span>
                <span>
                  {result.labelEn} {result.value}
                  {result.unit ? ` ${result.unit}` : ""}
                  {owner ? ` · ${owner.nameEn}` : " · Unassigned"}
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

function ClinicianDetail({
  care,
  onPatch,
  onOpenCase,
  onBackToList,
}: {
  care: CareCase;
  onPatch: (next: CareCase, events: AuditEvent[]) => void;
  onOpenCase: () => void;
  onBackToList: () => void;
}) {
  const patient = patientById(care.patientId);
  const result = resultById(care.resultId);
  const [note, setNote] = useState(care.visitNote ?? "");
  const msg = clinicianMessage(care.stage);
  const owner = care.ownerId ? clinicianById(care.ownerId) : null;
  const slot = care.slotId ? slotById(care.slotId) : null;
  const canMarkSeen = care.stage === "booked" || care.stage === "owned";
  const refPath = referralOf(care);
  const mayVerify = pathwayCanVerify(care);

  useEffect(() => {
    setNote(care.visitNote ?? "");
  }, [care.id, care.visitNote]);

  return (
    <div className="patient-detail">
      <div className="patient-detail-head">
        <div>
          <button type="button" className="text-link" onClick={onBackToList}>
            ← All patients
          </button>
          <p className="eyebrow">Clinician packet</p>
          <h3>
            {patient.nameEn} <span className="name-ar-inline">{patient.nameAr}</span>
          </h3>
          <p className="lede">
            {result.labelEn} {result.value}
            {result.unit ? ` ${result.unit}` : ""} · {STAGE_LABEL[care.stage].en}
          </p>
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

      <div
        className={`patient-status ${care.stage === "verified" ? "mint" : care.stage === "lost" ? "warn" : "info"}`}
      >
        <p className="eyebrow">Clinician status</p>
        <h3>{msg.title}</h3>
        <p>{msg.detail}</p>
        {slot ? (
          <p className="patient-status-next">
            <strong>Appointment:</strong> {slot.when.replace("T", " ")}
            {owner ? ` · ${owner.nameEn}` : ""}
          </p>
        ) : null}
        {care.seenAt ? (
          <p className="patient-status-next">
            <strong>Seen:</strong> {care.seenAt.replace("T", " ")}
            {care.visitNote ? ` — ${care.visitNote}` : ""}
          </p>
        ) : null}
      </div>

      <CareTimeline care={care} compact />

      <div className="split" style={{ marginTop: 14 }}>
        <div className="block">
          <h3>Clinical packet</h3>
          <dl className="facts">
            <div>
              <dt>Program</dt>
              <dd>{result.program}</dd>
            </div>
            <div>
              <dt>Finding</dt>
              <dd>
                {result.labelEn} {result.value}
                {result.unit ? ` ${result.unit}` : ""}
              </dd>
            </div>
            <div>
              <dt>Facility</dt>
              <dd>{result.facility}</dd>
            </div>
            <div>
              <dt>Enrichment note</dt>
              <dd>
                {care.aiPriorityReason || "No enrichment note yet — import an extract on the board."}
              </dd>
            </div>
          </dl>
          <p className="banner">
            Screening flag for review — not a confirmed diagnosis. Document what you did so the loop
            can verify.
          </p>
        </div>
        <div className="block">
          <h3>Close the visit</h3>
          <label className="field">
            Visit / plan note
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Counseled on lifestyle; labs repeated; return 3 months"
              disabled={care.stage === "verified" || care.stage === "lost"}
            />
          </label>
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              disabled={!canMarkSeen && care.stage !== "seen"}
              onClick={() => {
                const res = markSeen(care, note || "Visit completed.");
                onPatch(res.case, res.events);
              }}
            >
              Mark visit completed
            </button>
            <button
              type="button"
              className="btn mint"
              disabled={!mayVerify && care.stage !== "verified"}
              onClick={() => {
                if (!pathwayCanVerify(care)) return;
                const res = verifyOutcome({ ...care, visitNote: note || care.visitNote });
                onPatch(res.case, res.events);
              }}
            >
              Verify outcome
            </button>
          </div>
          {care.stage === "booked" ? (
            <p className="hint">After the visit, mark completed — then close or branch to referral.</p>
          ) : null}
          {care.stage === "seen" && refPath.branch === "undecided" ? (
            <>
              <p className="hint">
                Visit done — stay on the path to close, or branch to confirmatory (full booking on
                Case).
              </p>
              <div className="path-decide" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="path-decide-card direct"
                  onClick={() => {
                    const res = chooseDirectClose(care);
                    onPatch(res.case, res.events);
                  }}
                >
                  <span className="eyebrow">Continue</span>
                  <strong>Close without referral</strong>
                  <p>Main path → verify.</p>
                </button>
                <button
                  type="button"
                  className="path-decide-card branch"
                  onClick={() => {
                    const res = chooseConfirmatory(care, result.code);
                    onPatch(res.case, res.events);
                    onOpenCase();
                  }}
                >
                  <span className="eyebrow">Branch</span>
                  <strong>Confirmatory referral</strong>
                  <p>Open Case to book the branch.</p>
                </button>
              </div>
            </>
          ) : null}
          {care.stage === "seen" && refPath.branch === "direct_close" ? (
            <p className="hint">Main path — verify to close.</p>
          ) : null}
          {care.stage === "seen" && refPath.branch === "confirmatory" && !refPath.doneAt ? (
            <p className="hint">
              On referral branch — open Case to book / complete confirmatory, then verify.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ClinicianView({
  cases,
  selectedId,
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
          <h2>Clinician inbox</h2>
          <p className="lede">
            {care
              ? "Clinical packet for the selected patient."
              : "Pick a patient to open their visit packet."}
          </p>
        </div>
      </header>

      <div className="panel-body">
        {care ? (
          <ClinicianDetail
            care={care}
            onPatch={onPatch}
            onOpenCase={onOpenCase}
            onBackToList={onClearSelect}
          />
        ) : (
          <ClinicianDirectory cases={cases} onSelect={onSelect} />
        )}
      </div>
    </section>
  );
}
