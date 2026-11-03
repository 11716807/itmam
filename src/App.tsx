import { useCallback, useEffect, useMemo, useState } from "react";
import { Toast, type ToastItem } from "./components/Toast";
import { Board } from "./screens/Board";
import { CaseView } from "./screens/CaseView";
import { ClinicianView } from "./screens/ClinicianView";
import { AuditLog } from "./screens/AuditLog";
import { Outcomes } from "./screens/Outcomes";
import { PatientView } from "./screens/PatientView";
import { initialRiskWeights, RiskRules } from "./screens/RiskRules";
import {
  loadState,
  resetState,
  saveState,
  snapshotRegistry,
  type Persisted,
} from "./store";
import type { RiskWeights } from "./lib/riskWeights";
import type { AppScreen, AuditEvent, CareCase, Message } from "./types";

const TOAST_COPY: Record<string, { title: string; detail: string; tone: ToastItem["tone"] }> = {
  stratified: {
    title: "Priority set",
    detail: "Loop enriched from extract metrics. A clinician still decides care.",
    tone: "info",
  },
  prioritized: {
    title: "Priority set",
    detail: "Urgency and specialty confirmed. A clinician still decides care.",
    tone: "info",
  },
  imported: {
    title: "Case imported",
    detail: "Finding enriched onto the board — confirm priority to continue.",
    tone: "info",
  },
  patient_told: {
    title: "Patient informed",
    detail: "Sahhatna-style message queued in their language.",
    tone: "ok",
  },
  owned: {
    title: "Owner assigned",
    detail: "Someone is accountable until the outcome is verified.",
    tone: "ok",
  },
  booked: {
    title: "Visit booked",
    detail: "Slot respects the patient’s insurance network.",
    tone: "ok",
  },
  seen: {
    title: "Visit completed",
    detail: "Clinical note saved — ready to verify the loop.",
    tone: "ok",
  },
  verified: {
    title: "Loop closed",
    detail: "Outcome documented. No orphan result left behind.",
    tone: "ok",
  },
  lost: {
    title: "Marked lost to follow-up",
    detail: "Reason saved so the gap stays visible.",
    tone: "warn",
  },
};

const NAV: { id: AppScreen; label: string; hint: string }[] = [
  { id: "board", label: "Board", hint: "Import & prioritize" },
  { id: "case", label: "Case", hint: "Close the loop" },
  { id: "patient", label: "Patient", hint: "Sahhatna view" },
  { id: "clinician", label: "Clinician", hint: "Visit & verify" },
  { id: "outcomes", label: "Outcomes", hint: "Completion proof" },
  { id: "audit", label: "Audit", hint: "Trail by patient" },
  { id: "rules", label: "Risk rules", hint: "Editable score weights" },
];

export default function App() {
  const [state, setState] = useState<Persisted>(() => loadState());
  const [screen, setScreen] = useState<AppScreen>("board");
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [riskWeights, setRiskWeights] = useState<RiskWeights>(() => initialRiskWeights());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const dismissToast = useCallback(() => setToast(null), []);

  const selected = useMemo(
    () => state.cases.find((c) => c.id === state.selectedCaseId) ?? null,
    [state.cases, state.selectedCaseId],
  );

  function showFromEvents(events: AuditEvent[]) {
    const last = events[events.length - 1];
    if (!last) return;
    const copy = TOAST_COPY[last.action];
    if (!copy) return;
    setToast({
      id: `${last.id}-${Date.now()}`,
      title: copy.title,
      detail: copy.detail,
      tone: copy.tone,
    });
  }

  function patchCase(next: CareCase, events: AuditEvent[], message?: Message) {
    setState((current) => ({
      ...current,
      cases: current.cases.map((c) => (c.id === next.id ? next : c)),
      audit: [...current.audit, ...events],
      messages: message ? [...current.messages, message] : current.messages,
      selectedCaseId: next.id,
    }));
    showFromEvents(events);
  }

  function openCase(id: string) {
    setState((current) => ({ ...current, selectedCaseId: id }));
    setScreen("case");
  }

  const openCount = state.cases.filter(
    (c) => c.stage !== "verified" && c.stage !== "lost",
  ).length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="brand-mark">Itmam</p>
          <p className="brand-sub">Close every actionable screening result.</p>
        </div>

        <nav className="side-nav" aria-label="Primary">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={screen === item.id ? "on" : undefined}
              onClick={() => setScreen(item.id)}
              disabled={preparing && item.id !== "board"}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <p className="side-meta">
            <span className="live-dot" aria-hidden />
            {preparing ? "Working on your file…" : `${openCount} open loops`}
          </p>
          <p className="side-note">IFHAS / EAS · tell · own · book · see · verify</p>
        </div>
      </aside>

      <div className="shell-main">
        <main key={screen} className="screen-enter workspace">
          {screen === "board" ? (
            <Board
              cases={state.cases}
              importSource={state.importSource}
              preparing={preparing}
              riskWeights={riskWeights}
              onOpen={openCase}
              onReset={() => {
                setPreparing(false);
                setState(resetState());
                setScreen("board");
                setToast({
                  id: `reset-${Date.now()}`,
                  title: "Board cleared",
                  detail: "Import an extract — rows will be enriched onto the board.",
                  tone: "info",
                });
              }}
              onPrepareStart={() => {
                setPreparing(true);
                setState({
                  ...resetState(),
                  importSource: null,
                });
              }}
              onPrepareCase={(care, source) => {
                const snap = snapshotRegistry();
                setState((current) => ({
                  ...current,
                  importSource: source,
                  patients: snap.patients,
                  results: snap.results,
                  cases: [...current.cases.filter((c) => c.id !== care.id), care],
                  selectedCaseId: current.selectedCaseId || care.id,
                audit: [
                  ...current.audit,
                  {
                    id: `aud-import-${care.id}-${Date.now()}`,
                    caseId: care.id,
                    at: new Date().toISOString().slice(0, 16),
                    actor: "system",
                    action: "imported",
                    detail: care.aiPriorityReason || "Enriched from import extract",
                  },
                ],
                }));
              }}
              onPrepareDone={(placed, skipped) => {
                setPreparing(false);
                setToast({
                  id: `prep-${Date.now()}`,
                  title: placed ? "Board prepared" : "Nothing placed",
                  detail: `${placed} loops opened · ${skipped} rows skipped.`,
                  tone: placed ? "ok" : "warn",
                });
              }}
            />
          ) : null}

          {screen === "case" && selected ? (
            <CaseView
              care={selected}
              messages={state.messages}
              audit={state.audit}
              onPatch={patchCase}
              onPatient={() => setScreen("patient")}
              onClinician={() => setScreen("clinician")}
              onBack={() => setScreen("board")}
            />
          ) : null}

          {screen === "case" && !selected ? (
            <section className="panel">
              <div className="panel-body empty-board">
                <p>No case selected.</p>
                <p className="muted">Import an extract on the board first.</p>
                <button type="button" className="btn" onClick={() => setScreen("board")}>
                  Go to board
                </button>
              </div>
            </section>
          ) : null}

          {screen === "patient" ? (
            <PatientView
              cases={state.cases}
              selectedId={selected?.id ?? null}
              messages={state.messages}
              onSelect={(id) => {
                setState((current) => ({ ...current, selectedCaseId: id }));
              }}
              onClearSelect={() => {
                setState((current) => ({ ...current, selectedCaseId: "" }));
              }}
              onPatch={patchCase}
              onOpenCase={() => setScreen("case")}
            />
          ) : null}

          {screen === "clinician" ? (
            <ClinicianView
              cases={state.cases}
              selectedId={selected?.id ?? null}
              onSelect={(id) => {
                setState((current) => ({ ...current, selectedCaseId: id }));
              }}
              onClearSelect={() => {
                setState((current) => ({ ...current, selectedCaseId: "" }));
              }}
              onPatch={patchCase}
              onOpenCase={() => setScreen("case")}
            />
          ) : null}

          {screen === "outcomes" ? <Outcomes cases={state.cases} /> : null}

          {screen === "audit" ? (
            <AuditLog
              cases={state.cases}
              audit={state.audit}
              onOpenCase={(id) => {
                setState((current) => ({ ...current, selectedCaseId: id }));
                setScreen("case");
              }}
            />
          ) : null}

          {screen === "rules" ? (
            <RiskRules weights={riskWeights} onChange={setRiskWeights} />
          ) : null}
        </main>
      </div>

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
