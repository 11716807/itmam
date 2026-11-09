import { useEffect, useMemo, useRef, useState } from "react";
import { AgentGraph, AgentGraphStrip } from "../components/AgentGraph";
import { CareTimeline } from "../components/CareTimeline";
import { CaseAsk } from "../components/CaseAsk";
import { ChoiceList } from "../components/ChoiceList";
import { LoopAssistBar } from "../components/LoopAssist";
import type { AgentRun } from "../lib/agents/types";
import {
  clinicianById,
  patientById,
  resultById,
  slotById,
} from "../data/seed";
import { localBrief, type ItmamBrief } from "../lib/ai";
import { isRtl, langMeta, MESSAGE_LANGS } from "../lib/languages";
import {
  assignOwner,
  bookReferralSlot,
  bookSlot,
  chooseConfirmatory,
  chooseDirectClose,
  compatibleSlots,
  isOpen,
  markConfirmatoryDone,
  markLost,
  markNoShow,
  markSeen,
  ownerCandidates,
  rescheduleSlot,
  stratifyCase,
  tellPatient,
  verifyOutcome,
} from "../lib/loop";
import { runLoopAgent } from "../lib/loopAgents";
import type { LoopAgentSuggestion } from "../lib/loopAgents";
import { buildLoopAssist, mergeLoopSuggestion } from "../lib/loopAssist";
import { canVerify, confirmatorySpecialty, referralOf } from "../lib/pathway";
import { planSlaRecovery } from "../lib/slaAction";
import { translateMessage } from "../lib/translate";
import type { AuditEvent, CareCase, LostReason, LoopStage, Message } from "../types";
import { STAGE_LABEL } from "../types";

type Props = {
  care: CareCase;
  messages: Message[];
  audit: AuditEvent[];
  agentRun?: AgentRun | null;
  onPatch: (next: CareCase, events: AuditEvent[], message?: Message) => void;
  onPatient: () => void;
  onBack: () => void;
};

const FLOW: LoopStage[] = [
  "result_in",
  "stratified",
  "told",
  "owned",
  "booked",
  "seen",
  "verified",
];

function specialtyLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function CaseView(props: Props) {
  const patient = patientById(props.care.patientId);
  const result = resultById(props.care.resultId);
  const [brief, setBrief] = useState<ItmamBrief>(() =>
    localBrief(patientById(props.care.patientId), resultById(props.care.resultId), props.care),
  );
  const [lostReason, setLostReason] = useState<LostReason>("no_reply");
  const [visitNote, setVisitNote] = useState(props.care.visitNote ?? "");
  const [ownerId, setOwnerId] = useState(props.care.ownerId ?? "");
  const [slotId, setSlotId] = useState(props.care.slotId ?? "");
  const [referralSlotId, setReferralSlotId] = useState(props.care.referral?.slotId ?? "");
  const [confirmNote, setConfirmNote] = useState(props.care.referral?.note ?? "");
  const [showLost, setShowLost] = useState(false);
  const [showAgentGraph, setShowAgentGraph] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftApplied, setDraftApplied] = useState(false);
  const [composeLang, setComposeLang] = useState<string>("en");
  const [translateTo, setTranslateTo] = useState<string>("ar");
  const [translating, setTranslating] = useState(false);
  const [translateNote, setTranslateNote] = useState<string | null>(null);
  /** Once the user edits (or we finish initial seed), never auto-overwrite the draft. */
  const draftLocked = useRef(false);

  /** Owner-pinned slots (reschedule / current clinician path). */
  const slots = useMemo(
    () =>
      compatibleSlots(props.care.specialty, patient.network, props.care.ownerId),
    [props.care.specialty, patient.network, props.care.ownerId],
  );

  /** Full network specialty roster for booking — not just one suggested doctor. */
  const bookingSlots = useMemo(
    () => compatibleSlots(props.care.specialty, patient.network, null),
    [props.care.specialty, patient.network],
  );

  const referralSpecialty =
    props.care.referral?.specialty ?? confirmatorySpecialty(result.code);
  const referralSlots = useMemo(
    () => compatibleSlots(referralSpecialty, patient.network),
    [referralSpecialty, patient.network],
  );

  const owners = useMemo(
    () => ownerCandidates(props.care.specialty, patient.network),
    [props.care.specialty, patient.network],
  );

  const [loopSuggestion, setLoopSuggestion] = useState<LoopAgentSuggestion | null>(null);

  const assist = useMemo(
    () => mergeLoopSuggestion(buildLoopAssist(props.care), loopSuggestion),
    [props.care, loopSuggestion],
  );

  useEffect(() => {
    let cancelled = false;
    const needsLlm =
      props.care.stage === "stratified" ||
      props.care.stage === "told" ||
      props.care.stage === "owned" ||
      props.care.stage === "seen";

    if (!needsLlm) {
      setLoopSuggestion(null);
      return;
    }

    setLoopSuggestion({
      agent:
        props.care.stage === "stratified"
          ? "draftTell"
          : props.care.stage === "told"
            ? "matchOwner"
            : props.care.stage === "owned"
              ? "suggestSlot"
              : "outcomeGate",
      stage: props.care.stage,
      status: "loading",
      detail: "Agent working…",
      guardrails: [],
    });

    void runLoopAgent(props.care).then((result) => {
      if (!cancelled) setLoopSuggestion(result);
    });

    return () => {
      cancelled = true;
    };
  }, [props.care.id, props.care.stage, props.care.specialty, props.care.urgency, props.care.ownerId]);

  useEffect(() => {
    setVisitNote(props.care.visitNote ?? "");
    setOwnerId(props.care.ownerId ?? "");
    setSlotId(props.care.slotId ?? "");
    setReferralSlotId(props.care.referral?.slotId ?? "");
    setConfirmNote(props.care.referral?.note ?? "");
    setShowLost(false);
    setShowReschedule(false);
  }, [
    props.care.id,
    props.care.stage,
    props.care.ownerId,
    props.care.slotId,
    props.care.visitNote,
    props.care.referral?.slotId,
    props.care.referral?.note,
    props.care.referral?.branch,
  ]);

  useEffect(() => {
    draftLocked.current = false;
    setDraftApplied(false);
    const next = localBrief(patient, result, props.care);
    setBrief(next);
    setComposeLang("en");
    setTranslateTo("ar");
    setTranslateNote(null);
    setDraft(next.patientMessageEn || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.care.id]);

  useEffect(() => {
    if (translateTo === composeLang) {
      const next = MESSAGE_LANGS.find((l) => l.code !== composeLang);
      if (next) setTranslateTo(next.code);
    }
  }, [composeLang, translateTo]);

  useEffect(() => {
    if (
      props.care.stage === "stratified" &&
      assist.draftMessage &&
      assist.llmStatus === "ready" &&
      !draftLocked.current &&
      !draftApplied
    ) {
      setTranslateNote("Agent draft ready — tap Use draft to apply");
    }
  }, [props.care.stage, assist.draftMessage, assist.llmStatus, draftApplied]);

  function updateDraft(value: string) {
    draftLocked.current = true;
    setDraft(value);
    setTranslateNote(null);
    if (assist.draftMessage && value.trim() !== assist.draftMessage.trim()) {
      setDraftApplied(false);
    }
  }

  function activeBrief(): ItmamBrief {
    return brief;
  }

  function runPrioritize() {
    const res = stratifyCase(props.care, result, activeBrief().priorityReason);
    props.onPatch(res.case, res.events);
  }

  function runTell() {
    const text = draft.trim();
    if (!text) return;
    const arTwin =
      composeLang === "ar" ? text : activeBrief().patientMessageAr || text;
    const enTwin =
      composeLang === "en" ? text : activeBrief().patientMessageEn || text;
    const res = tellPatient(
      props.care,
      patient,
      composeLang === "ar" ? enTwin : text,
      composeLang === "ar" ? text : arTwin,
      composeLang,
    );
    // Always store the exact sent text as bodyEn for display; keep ar twin when Arabic
    if (res.message) {
      res.message.bodyEn = text;
      res.message.bodyAr = composeLang === "ar" ? text : arTwin;
      res.message.lang = composeLang;
    }
    props.onPatch(res.case, res.events, res.message);
  }

  async function runTranslate() {
    if (!draft.trim() || translating) return;
    setTranslating(true);
    setTranslateNote(null);
    try {
      const resultTx = await translateMessage({
        text: draft,
        from: composeLang,
        to: translateTo,
        patientName: patient.nameEn,
        findingLabel: result.labelEn,
      });
      draftLocked.current = true;
      setDraft(resultTx.text);
      setComposeLang(translateTo);
      setTranslateNote(
        resultTx.source === "remote"
          ? `Translated to ${langMeta(translateTo).label}`
          : `Ready in ${langMeta(translateTo).label}`,
      );
    } finally {
      setTranslating(false);
    }
  }

  function runOwn() {
    if (!ownerId) return;
    const res = assignOwner(props.care, ownerId);
    props.onPatch(res.case, res.events);
  }

  function runBook() {
    if (!slotId) return;
    const res = bookSlot(props.care, slotId);
    props.onPatch(res.case, res.events);
  }

  function runReschedule() {
    if (!slotId || slotId === props.care.slotId) return;
    const res = rescheduleSlot(props.care, slotId);
    setShowReschedule(false);
    props.onPatch(res.case, res.events);
  }

  function runSeen() {
    const res = markSeen(
      props.care,
      visitNote.trim() || "Visit completed; plan documented with the patient.",
    );
    props.onPatch(res.case, res.events);
  }

  function runVerify() {
    if (!canVerify(props.care)) return;
    const res = verifyOutcome(props.care);
    props.onPatch(res.case, res.events);
  }

  function runLineA() {
    const res = chooseDirectClose(props.care);
    props.onPatch(res.case, res.events);
  }

  function runLineB() {
    const res = chooseConfirmatory(props.care, result.code);
    props.onPatch(res.case, res.events);
  }

  function runBookReferral() {
    if (!referralSlotId) return;
    const res = bookReferralSlot(props.care, referralSlotId);
    props.onPatch(res.case, res.events);
  }

  function runConfirmatoryDone() {
    const res = markConfirmatoryDone(
      props.care,
      confirmNote.trim() || "Confirmatory visit completed.",
    );
    props.onPatch(res.case, res.events);
  }

  function runLost() {
    const res = markLost(props.care, lostReason);
    props.onPatch(res.case, res.events);
  }

  function runNoShow() {
    const res = markNoShow(props.care);
    setSlotId("");
    props.onPatch(res.case, res.events);
  }

  const stage = props.care.stage;
  const open = isOpen(stage);
  const noShows = props.care.noShowCount ?? 0;
  const refPath = referralOf(props.care);
  const slaPlan = planSlaRecovery(props.care, result);
  const caseMessages = props.messages.filter((m) => m.caseId === props.care.id);
  const findingLine = `${result.labelEn} ${result.value}${result.unit ? ` ${result.unit}` : ""}`;
  const nextLabel = assist.actionLabel;

  const draftIsApplied = draftApplied;

  const assistApply =
    stage === "stratified" && assist.draftMessage
      ? {
          label: draftIsApplied ? "Draft applied" : "Use draft",
          disabled: false,
          run: () => {
            draftLocked.current = true;
            setDraft(assist.draftMessage || "");
            setDraftApplied(true);
            setComposeLang("en");
            setTranslateNote("Draft applied — edit before send");
          },
        }
      : stage === "told" && assist.ownerId
        ? {
            label:
              ownerId === assist.ownerId ? "Owner selected" : "Use suggested owner",
            disabled: false,
            run: () => setOwnerId(assist.ownerId || ""),
          }
        : stage === "owned" && assist.slotId
          ? {
              label: slotId === assist.slotId ? "Slot selected" : "Use suggested slot",
              disabled: false,
              run: () => setSlotId(assist.slotId || ""),
            }
          : null;

  return (
    <section className="panel">
      <header className="panel-head case-head">
        <div>
          <button type="button" className="text-link" onClick={props.onBack}>
            ← Board
          </button>
          <h2>
            {patient.nameEn}{" "}
            <span className="name-ar-inline">{patient.nameAr}</span>
          </h2>
          <p className="lede">
            {result.program} · {findingLine} · {result.facility}
          </p>
          <div className="case-head-tags">
            <span
              className={`chip ${stage === "verified" ? "ok" : stage === "lost" ? "warn" : props.care.urgency}`}
            >
              {STAGE_LABEL[stage].en}
            </span>
            <span className={`chip ${props.care.urgency}`}>{props.care.urgency}</span>
            <span className="case-next-pill">
              Assist · {nextLabel}
            </span>
          </div>
        </div>
      </header>

      <div className="panel-body">
        {slaPlan.status !== "ok" ? (
          <div className={`sla-case-banner ${slaPlan.status}`} role="alert">
            <div>
              <p className="eyebrow">
                Assist · SLA {slaPlan.status === "breached" ? "recovery" : "watch"}
              </p>
              <strong>{slaPlan.actionLabel}</strong>
              <p>{slaPlan.verdict}</p>
              <p className="muted">{slaPlan.why}</p>
            </div>
            <div className="sla-case-meta">
              <span>
                {slaPlan.hoursOpen.toFixed(0)}h / {slaPlan.slaHours}h
              </span>
              <span>Unlocks {slaPlan.unlocks}</span>
              {slaPlan.status === "breached" ? (
                <span className="chip urgent">Escalate to {slaPlan.suggestedUrgency}</span>
              ) : (
                <span className="chip soon">Approaching</span>
              )}
            </div>
          </div>
        ) : null}

        <div className="case-layout">
          <CareTimeline care={props.care} />

          <div className="split case-work-split">
          <div className="block case-work">
            <div className="action-panel">
              <div className="action-panel-head">
                <div>
                  <p className="eyebrow">Next action</p>
                  <h3>{nextLabel}</h3>
                </div>
              </div>

              {open || stage === "verified" || stage === "lost" ? (
                <div data-tour-id="tour-assist">
                <LoopAssistBar
                  assist={assist}
                  applyLabel={assistApply?.label}
                  applyDisabled={assistApply?.disabled}
                  onApply={assistApply ? () => assistApply.run() : undefined}
                  pickLabel={
                    stage === "told"
                      ? assist.ownerLabel
                      : stage === "owned"
                        ? assist.slotLabel
                        : stage === "stratified" && assist.draftMessage
                          ? draftIsApplied
                            ? "Draft applied to message"
                            : "Calm Sahhatna draft ready"
                          : stage === "seen" && assist.outcomeLabel
                            ? assist.outcomeLabel
                            : undefined
                  }
                  pickWhy={
                    stage === "told"
                      ? assist.ownerWhy
                      : stage === "owned"
                        ? assist.slotWhy
                        : stage === "stratified" && draftIsApplied
                          ? "Copied into the compose box — edit before send"
                          : stage === "seen"
                            ? assist.outcomeWhy
                            : undefined
                  }
                  pickSelected={
                    stage === "told"
                      ? ownerId === assist.ownerId
                      : stage === "owned"
                        ? slotId === assist.slotId
                        : stage === "stratified"
                          ? draftIsApplied
                          : false
                  }
                />
                </div>
              ) : null}

              <ol className="action-progress">
                {FLOW.map((step) => {
                  const done =
                    stage === "verified" ||
                    (stage !== "lost" && FLOW.indexOf(stage) > FLOW.indexOf(step));
                  const current = stage === step;
                  return (
                    <li key={step} className={done ? "done" : current ? "current" : ""}>
                      {STAGE_LABEL[step].en}
                    </li>
                  );
                })}
              </ol>

              {stage === "result_in" ? (
                <div className="action-card">
                  <p className="action-kicker">Review patient before locking priority</p>
                  <div className="action-patient">
                    <div>
                      <strong>{patient.nameEn}</strong>
                      <span>{patient.nameAr}</span>
                    </div>
                    <p>
                      {patient.age}y · {patient.sex} · {patient.preferredLang.toUpperCase()} ·{" "}
                      {patient.insurancePlan}
                    </p>
                    <p>
                      {findingLine} from {result.facility} on {result.recordedAt}
                    </p>
                  </div>
                  <p className="muted">
                    {props.care.aiPriorityReason || activeBrief().priorityReason}
                  </p>
                  <div className="action-card-footer">
                    <button type="button" className="btn primary" onClick={runPrioritize}>
                      Confirm priority
                    </button>
                  </div>
                </div>
              ) : null}

              {stage === "stratified" ? (
                <div className="action-card">
                  <p className="action-kicker">Compose & send via Sahhatna</p>
                  <div className="compose-box">
                    <div className="compose-toolbar">
                      <label className="compose-lang">
                        <span>Write in</span>
                        <select
                          value={composeLang}
                          onChange={(e) => {
                            setComposeLang(e.target.value);
                            setTranslateNote(null);
                          }}
                        >
                          {MESSAGE_LANGS.map((l) => (
                            <option key={l.code} value={l.code}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="compose-pref">Default English</span>
                    </div>

                    <textarea
                      className={`compose-input ${isRtl(composeLang) ? "rtl" : ""}`}
                      rows={4}
                      value={draft}
                      onChange={(e) => updateDraft(e.target.value)}
                      placeholder="Type the message in any language…"
                      dir={isRtl(composeLang) ? "rtl" : "ltr"}
                    />

                    <div className="compose-translate">
                      <label>
                        <span>Translate to</span>
                        <select
                          value={translateTo}
                          onChange={(e) => setTranslateTo(e.target.value)}
                        >
                          {MESSAGE_LANGS.filter((l) => l.code !== composeLang).map((l) => (
                            <option key={l.code} value={l.code}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={translating || !draft.trim()}
                        onClick={() => void runTranslate()}
                      >
                        {translating ? "Translating…" : "Translate"}
                      </button>
                      {translateNote ? <span className="compose-note">{translateNote}</span> : null}
                    </div>

                    <div className="action-card-footer">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!draft.trim() || translating}
                        onClick={runTell}
                      >
                        Send in {langMeta(composeLang).label}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {stage === "told" ? (
                <div className="action-card">
                  <p className="action-kicker">Patient booking is now unlocked</p>
                  <p className="muted">
                    Choose from clinicians on {specialtyLabel(props.care.specialty)} ·{" "}
                    {patient.network.replaceAll("_", " ")}. Assist ranks one — you can pick any.
                  </p>
                  <ChoiceList
                    label="Visit clinicians"
                    emptyText="No clinician matches this specialty and network."
                    value={ownerId}
                    onChange={setOwnerId}
                    options={[...owners]
                      .sort((a, b) => {
                        if (a.id === assist.ownerId) return -1;
                        if (b.id === assist.ownerId) return 1;
                        return a.nameEn.localeCompare(b.nameEn);
                      })
                      .map((c) => ({
                        id: c.id,
                        title: c.nameEn,
                        meta: `${specialtyLabel(c.specialty)} · ${c.facility}`,
                        suggested: c.id === assist.ownerId,
                        why: c.id === assist.ownerId ? assist.ownerWhy : undefined,
                      }))}
                  />
                  <div className="action-card-footer">
                    <button type="button" className="btn" onClick={props.onPatient}>
                      Open patient booking
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={!ownerId}
                      onClick={runOwn}
                    >
                      Assign visit clinician
                    </button>
                  </div>
                </div>
              ) : null}

              {stage === "owned" ? (
                <div className="action-card">
                  <p className="action-kicker">
                    {noShows > 0
                      ? `Patient missed ×${noShows} — pick a new visit time`
                      : "Book a network-safe visit"}
                  </p>
                  <p className="muted">
                    Times across {specialtyLabel(props.care.specialty)} clinicians on{" "}
                    {patient.network.replaceAll("_", " ")}. Assist suggests one slot — booking aligns
                    the visit doctor as owner.
                  </p>
                  <ChoiceList
                    label="Available appointments"
                    emptyText="No slot in this insurance network for the assigned specialty."
                    value={slotId}
                    onChange={setSlotId}
                    options={[...bookingSlots]
                      .sort((a, b) => {
                        if (a.id === assist.slotId) return -1;
                        if (b.id === assist.slotId) return 1;
                        return a.when.localeCompare(b.when);
                      })
                      .map((s) => {
                        const c = clinicianById(s.clinicianId);
                        return {
                          id: s.id,
                          title: s.when.replace("T", " "),
                          meta: `${c.nameEn} · ${specialtyLabel(c.specialty)} · ${c.facility}`,
                          suggested: s.id === assist.slotId,
                          why: s.id === assist.slotId ? assist.slotWhy : undefined,
                        };
                      })}
                  />
                  <div className="action-card-footer">
                    <button type="button" className="btn" onClick={props.onPatient}>
                      Open patient booking
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={!slotId}
                      onClick={runBook}
                    >
                      Book visit
                    </button>
                  </div>
                </div>
              ) : null}

              {stage === "booked" ? (
                <div className="action-card">
                  <p className="action-kicker">Did the patient attend?</p>
                  <p className="muted">
                    If they came: document the visit. If the time no longer works: reschedule from
                    available slots. If they missed: no-show loops back to Owned.
                  </p>
                  {props.care.slotId ? (
                    <p className="visit-quote">
                      Current:{" "}
                      {slotById(props.care.slotId).when.replace("T", " ")} ·{" "}
                      {clinicianById(slotById(props.care.slotId).clinicianId).nameEn}
                    </p>
                  ) : null}

                  {!showReschedule ? (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        setShowReschedule(true);
                        setSlotId("");
                      }}
                    >
                      Reschedule to another available time
                    </button>
                  ) : (
                    <div className="reschedule-box">
                      <label className="field">
                        Available times (same clinician / pathway)
                        <select value={slotId} onChange={(e) => setSlotId(e.target.value)}>
                          <option value="">Pick a new slot…</option>
                          {slots
                            .filter((s) => s.id !== props.care.slotId)
                            .map((s) => {
                              const c = clinicianById(s.clinicianId);
                              return (
                                <option key={s.id} value={s.id}>
                                  {s.when.replace("T", " ")} · {c.nameEn}
                                </option>
                              );
                            })}
                        </select>
                      </label>
                      {!slots.filter((s) => s.id !== props.care.slotId).length ? (
                        <p className="banner bad">No other open slots on this network right now.</p>
                      ) : null}
                      <div className="action-card-footer">
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            setShowReschedule(false);
                            setSlotId(props.care.slotId ?? "");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn primary"
                          disabled={!slotId || slotId === props.care.slotId}
                          onClick={runReschedule}
                        >
                          Confirm reschedule
                        </button>
                      </div>
                    </div>
                  )}

                  <label className="field">
                    Visit note
                    <textarea
                      rows={3}
                      value={visitNote}
                      onChange={(e) => setVisitNote(e.target.value)}
                      placeholder="Findings reviewed with patient, plan agreed…"
                    />
                  </label>
                  <div className="action-card-footer">
                    <button type="button" className="btn ghost" onClick={runNoShow}>
                      Patient no-show — rebook
                    </button>
                    <button type="button" className="btn primary" onClick={runSeen}>
                      Mark visit completed
                    </button>
                  </div>
                </div>
              ) : null}

              {stage === "seen" ? (
                <div className="action-card">
                  <p className="action-kicker">Visit done — continue on path or branch to referral</p>
                  {props.care.visitNote ? (
                    <p className="visit-quote">{props.care.visitNote}</p>
                  ) : null}

                  {refPath.branch === "undecided" ? (
                    <>
                      <p className="muted">
                        Same path can close now, or branch to confirmatory referral (e.g. FIT →{" "}
                        {specialtyLabel(confirmatorySpecialty(result.code))}) then return to verify.
                      </p>
                      <div className="path-decide">
                        <button
                          type="button"
                          className={`path-decide-card direct ${assist.outcome === "direct_close" ? "suggested" : ""}`}
                          onClick={runLineA}
                        >
                          <span className="eyebrow">
                            Continue{assist.outcome === "direct_close" ? " · assist" : ""}
                          </span>
                          <strong>Close without referral</strong>
                          <p>Stay on the main path → verify.</p>
                        </button>
                        <button
                          type="button"
                          className={`path-decide-card branch ${assist.outcome === "confirmatory" ? "suggested" : ""}`}
                          onClick={runLineB}
                        >
                          <span className="eyebrow">
                            Branch{assist.outcome === "confirmatory" ? " · assist" : ""}
                          </span>
                          <strong>Confirmatory referral</strong>
                          <p>
                            Branch to {specialtyLabel(confirmatorySpecialty(result.code))} → book →
                            done → verify.
                          </p>
                        </button>
                      </div>
                    </>
                  ) : null}

                  {refPath.branch === "direct_close" ? (
                    <>
                      <p className="muted">Staying on the main path — verify to close.</p>
                      <div className="action-card-footer">
                        <button type="button" className="btn mint" onClick={runVerify}>
                          Verify outcome
                        </button>
                      </div>
                    </>
                  ) : null}

                  {refPath.branch === "confirmatory" && !refPath.bookedAt ? (
                    <>
                      <p className="muted">
                        Branched to confirmatory ·{" "}
                        {specialtyLabel(referralSpecialty)} on {patient.network.replace("_", " ")}.
                      </p>
                      <label className="field">
                        Confirmatory slot
                        <select
                          value={referralSlotId}
                          onChange={(e) => setReferralSlotId(e.target.value)}
                        >
                          <option value="">Select slot…</option>
                          {referralSlots.map((s) => {
                            const c = clinicianById(s.clinicianId);
                            return (
                              <option key={s.id} value={s.id}>
                                {s.when.replace("T", " ")} · {c.nameEn}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      {!referralSlots.length ? (
                        <p className="banner bad">No confirmatory slots on this network.</p>
                      ) : null}
                      <div className="action-card-footer">
                        <button
                          type="button"
                          className="btn primary"
                          disabled={!referralSlotId}
                          onClick={runBookReferral}
                        >
                          Book confirmatory visit
                        </button>
                      </div>
                    </>
                  ) : null}

                  {refPath.branch === "confirmatory" && refPath.bookedAt && !refPath.doneAt ? (
                    <>
                      <p className="muted">
                        Confirmatory booked
                        {refPath.slotId
                          ? ` · ${slotById(refPath.slotId).when.replace("T", " ")}`
                          : ""}
                        . Document it, then verify.
                      </p>
                      <label className="field">
                        Confirmatory note
                        <textarea
                          rows={3}
                          value={confirmNote}
                          onChange={(e) => setConfirmNote(e.target.value)}
                          placeholder="e.g. Colonoscopy completed; plan agreed…"
                        />
                      </label>
                      <div className="action-card-footer">
                        <button type="button" className="btn primary" onClick={runConfirmatoryDone}>
                          Mark confirmatory done
                        </button>
                      </div>
                    </>
                  ) : null}

                  {refPath.branch === "confirmatory" && refPath.doneAt ? (
                    <>
                      <p className="muted">
                        Referral branch complete
                        {refPath.note ? ` — ${refPath.note}` : ""}. Verify to close.
                      </p>
                      <div className="action-card-footer">
                        <button type="button" className="btn mint" onClick={runVerify}>
                          Verify outcome
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {stage === "verified" ? (
                <div className="action-card done-state">
                  <p className="action-kicker">Outcome verified</p>
                  <p>
                    Closed
                    {refPath.branch === "confirmatory"
                      ? " after confirmatory referral branch"
                      : " on the main path"}
                    . No orphan loop left.
                  </p>
                </div>
              ) : null}

              {stage === "lost" ? (
                <div className="action-card done-state warn-state">
                  <p className="action-kicker">Lost to follow-up</p>
                  <p>
                    Reason: {props.care.lostReason?.replaceAll("_", " ") || "recorded"}. Gap stays
                    visible on outcomes.
                  </p>
                </div>
              ) : null}

              {open ? (
                <div className="lost-escape">
                  {!showLost ? (
                    <button type="button" className="text-link" onClick={() => setShowLost(true)}>
                      Cannot close loop? Mark lost to follow-up
                    </button>
                  ) : (
                    <div className="action-card warn-state">
                      <p className="action-kicker">Lost to follow-up</p>
                      <label className="field">
                        Reason
                        <select
                          value={lostReason}
                          onChange={(e) => setLostReason(e.target.value as LostReason)}
                        >
                          <option value="no_reply">No reply</option>
                          <option value="no_show">No show</option>
                          <option value="declined">Declined</option>
                          <option value="moved_facility">Moved facility</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <div className="action-card-footer">
                        <button type="button" className="btn ghost" onClick={() => setShowLost(false)}>
                          Cancel
                        </button>
                        <button type="button" className="btn warn" onClick={runLost}>
                          Mark lost
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <details className="case-context">
              <summary>Finding & coverage</summary>
              <dl className="facts">
                <div>
                  <dt>Result</dt>
                  <dd>{findingLine}</dd>
                </div>
                <div>
                  <dt>Recorded</dt>
                  <dd>{result.recordedAt}</dd>
                </div>
                <div>
                  <dt>Insurance</dt>
                  <dd>
                    {patient.insurancePlan} · {patient.network.replace("_", " ")}
                  </dd>
                </div>
                <div>
                  <dt>Specialty</dt>
                  <dd>{specialtyLabel(props.care.specialty)}</dd>
                </div>
                <div>
                  <dt>Visit clinician</dt>
                  <dd>
                    {props.care.ownerId ? clinicianById(props.care.ownerId).nameEn : "Unassigned"}
                  </dd>
                </div>
                <div>
                  <dt>Appointment</dt>
                  <dd>
                    {props.care.slotId
                      ? (() => {
                          const s = slotById(props.care.slotId);
                          const doc = clinicianById(s.clinicianId);
                          return `${s.when.replace("T", " ")} · ${doc.nameEn}`;
                        })()
                      : "Not booked"}
                  </dd>
                </div>
              </dl>
            </details>

            <details className="case-context">
              <summary>Case brief</summary>
              <div className="ai-card nested">
                <p>
                  <strong>{brief.headlineEn}</strong>
                </p>
                <p className="muted">{brief.explainEn}</p>
                <p>
                  <strong>Why now:</strong> {brief.priorityReason}
                </p>
                <ul>
                  {brief.nextSteps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </details>
          </div>

          <div className="case-side">
            <CaseAsk
              care={props.care}
              patient={patient}
              result={result}
              messages={props.messages}
              audit={props.audit}
            />
            <div className="block">
              <h3>Sahhatna outbox</h3>
              {!caseMessages.length ? (
                <p className="muted">No patient message yet.</p>
              ) : (
                caseMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`phone ${isRtl(m.lang) ? "ar" : ""}`}
                    style={{ marginBottom: 10 }}
                  >
                    <div className="app-bar">
                      <span>Sahhatna · {langMeta(m.lang).label}</span>
                      <span>{m.sentAt.slice(11, 16)}</span>
                    </div>
                    <p>{m.bodyEn}</p>
                  </div>
                ))
              )}
            </div>
          </div>
          </div>

          {props.agentRun ? (
            <div className="case-agent-block">
              <AgentGraphStrip
                run={props.agentRun}
                onOpen={() => setShowAgentGraph((v) => !v)}
              />
              {showAgentGraph ? (
                <AgentGraph
                  run={props.agentRun}
                  onClose={() => setShowAgentGraph(false)}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
