import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toast, type ToastItem } from "./components/Toast";
import { Board } from "./screens/Board";
import { CaseView } from "./screens/CaseView";
import { AuditLog } from "./screens/AuditLog";
import { Outcomes } from "./screens/Outcomes";
import { PatientView } from "./screens/PatientView";
import { initialRiskWeights, RiskRules } from "./screens/RiskRules";
import {
  applyRemoteState,
  loadState,
  resetState,
  saveState,
  snapshotRegistry,
  stamp,
  type Persisted,
} from "./store";
import { buildDemoState } from "./lib/demoBoard";
import {
  clearCloudBoard,
  pullCloudBoard,
  pushCloudBoard,
} from "./lib/cloudState";
import { saveRiskWeights, type RiskWeights } from "./lib/riskWeights";
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

const NAV: { id: AppScreen; label: string; hint: string; group: "work" | "review" }[] = [
  { id: "board", label: "Board", hint: "Import & prioritize", group: "work" },
  { id: "case", label: "Case", hint: "Close the loop", group: "work" },
  { id: "patient", label: "Patient", hint: "Sahhatna view", group: "work" },
  { id: "outcomes", label: "Outcomes", hint: "Completion proof", group: "review" },
  { id: "audit", label: "Audit", hint: "Trail by patient", group: "review" },
  { id: "rules", label: "Risk rules", hint: "Score weights", group: "review" },
];

export default function App() {
  const [state, setState] = useState<Persisted>(() => loadState());
  const [screen, setScreen] = useState<AppScreen>("board");
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [riskWeights, setRiskWeights] = useState<RiskWeights>(() => initialRiskWeights());
  const [cloudReady, setCloudReady] = useState(false);
  const skipPush = useRef(true);
  const riskRef = useRef(riskWeights);
  riskRef.current = riskWeights;

  // Pull shared board/audit from Cloud Run (Firestore) so judges see the same data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadState();
      const remote = await pullCloudBoard();
      if (cancelled) return;

      if (remote?.state) {
        const remoteAt = remote.savedAt || remote.state.savedAt || "";
        const localAt = local.savedAt || "";
        const preferRemote =
          !local.cases.length ||
          remote.state.cases.length > local.cases.length ||
          remoteAt >= localAt;
        if (preferRemote) {
          setState(applyRemoteState(remote.state));
          if (remote.riskWeights) {
            saveRiskWeights(remote.riskWeights);
            setRiskWeights(remote.riskWeights);
          }
        } else {
          await pushCloudBoard(local, riskRef.current);
        }
      } else if (local.cases.length) {
        await pushCloudBoard(local, riskRef.current);
      } else {
        const demo = buildDemoState();
        setState(demo);
        await pushCloudBoard(demo, riskRef.current);
      }

      skipPush.current = false;
      setCloudReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveState(state);
    if (skipPush.current) return;
    const timer = window.setTimeout(() => {
      void pushCloudBoard(state, riskRef.current);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (skipPush.current || !cloudReady) return;
    const timer = window.setTimeout(() => {
      void pushCloudBoard(state, riskWeights);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [riskWeights, cloudReady, state]);

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
    setState((current) =>
      stamp({
        ...current,
        cases: current.cases.map((c) => (c.id === next.id ? next : c)),
        audit: [...current.audit, ...events],
        messages: message ? [...current.messages, message] : current.messages,
        selectedCaseId: next.id,
      }),
    );
    showFromEvents(events);
  }

  function openCase(id: string) {
    setState((current) => stamp({ ...current, selectedCaseId: id }));
    setScreen("case");
  }

  function loadDemoBoard() {
    setPreparing(false);
    const demo = buildDemoState();
    setState(demo);
    void pushCloudBoard(demo, riskRef.current);
    setScreen("board");
    setToast({
      id: `demo-${Date.now()}`,
      title: "Demo board ready",
      detail: "Sample IFHAS extract loaded with audit trail — no CSV needed.",
      tone: "ok",
    });
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
          <p className="nav-group-label">Work</p>
          {NAV.filter((item) => item.group === "work").map((item) => (
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
          <p className="nav-group-label">Review</p>
          {NAV.filter((item) => item.group === "review").map((item) => (
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
            {preparing
              ? "Working on your file…"
              : cloudReady
                ? `${openCount} open loops · synced`
                : `${openCount} open loops`}
          </p>
          <p className="side-note">IFHAS / EAS · tell · own · book · see · verify</p>
        </div>
      </aside>

      <div className="shell-main">
        <main key={screen} className="screen-enter workspace">
          {screen === "board" ? (
            <Board
              cases={state.cases}
              agentRuns={state.agentRuns}
              importSource={state.importSource}
              preparing={preparing}
              riskWeights={riskWeights}
              onOpen={openCase}
              onLoadDemo={loadDemoBoard}
              onReset={() => {
                setPreparing(false);
                void clearCloudBoard();
                setState(stamp(resetState()));
                setScreen("board");
                setToast({
                  id: `reset-${Date.now()}`,
                  title: "Board cleared",
                  detail: "Import an extract, or restore the demo board.",
                  tone: "info",
                });
              }}
              onPrepareStart={() => {
                setPreparing(true);
                setState(
                  stamp({
                    ...resetState(),
                    importSource: null,
                    agentRuns: [],
                  }),
                );
              }}
              onAgentRun={(run, care, source) => {
                const snap = snapshotRegistry();
                setState((current) => {
                  const agentRuns = [
                    ...current.agentRuns.filter((r) => r.id !== run.id && r.rowKey !== run.rowKey),
                    run,
                  ];
                  if (!care) {
                    return stamp({
                      ...current,
                      importSource: source,
                      patients: snap.patients,
                      results: snap.results,
                      agentRuns,
                    });
                  }
                  return stamp({
                    ...current,
                    importSource: source,
                    patients: snap.patients,
                    results: snap.results,
                    agentRuns,
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
                        detail: care.aiPriorityReason || "Agent pipeline placed finding",
                      },
                    ],
                  });
                });
              }}
              onReplaceAgentRun={(run, care) => {
                const snap = snapshotRegistry();
                setState((current) => {
                  const agentRuns = current.agentRuns.map((r) => (r.id === run.id ? run : r));
                  if (!agentRuns.some((r) => r.id === run.id)) agentRuns.push(run);
                  let cases = current.cases.filter((c) => c.agentRunId !== run.id && c.id !== care?.id);
                  const audit = [...current.audit];
                  if (care) {
                    cases = [...cases, care];
                    audit.push({
                      id: `aud-rerun-${care.id}-${Date.now()}`,
                      caseId: care.id,
                      at: new Date().toISOString().slice(0, 16),
                      actor: "coordinator",
                      action: "imported",
                      detail: `Re-ran agents after fix — ${care.aiPriorityReason || "placed"}`,
                    });
                  }
                  return stamp({
                    ...current,
                    patients: snap.patients,
                    results: snap.results,
                    agentRuns,
                    cases,
                    audit,
                    selectedCaseId: care?.id || current.selectedCaseId,
                  });
                });
                setToast({
                  id: `rerun-${Date.now()}`,
                  title:
                    run.status === "placed"
                      ? "Agents re-ran — placed"
                      : run.status === "filtered"
                        ? "Agents re-ran — filtered"
                        : "Still needs fix",
                  detail: run.explainEn || run.priorityReason || run.gateReason || "",
                  tone: run.status === "needs_fix" ? "warn" : "ok",
                });
              }}
              onPrepareDone={(placed, filtered, needsFix) => {
                setPreparing(false);
                setToast({
                  id: `prep-${Date.now()}`,
                  title: placed ? "Agent pipeline done" : "Nothing placed",
                  detail: `${placed} placed · ${filtered} filtered · ${needsFix} need fix.`,
                  tone: placed || filtered ? "ok" : "warn",
                });
              }}
            />
          ) : null}

          {screen === "case" && selected ? (
            <CaseView
              care={selected}
              messages={state.messages}
              audit={state.audit}
              agentRun={
                state.agentRuns.find(
                  (r) => r.id === selected.agentRunId || r.careId === selected.id,
                ) ?? null
              }
              onPatch={patchCase}
              onPatient={() => setScreen("patient")}
              onBack={() => setScreen("board")}
            />
          ) : null}

          {screen === "case" && !selected ? (
            <section className="panel">
              <div className="panel-body empty-board">
                <p>No case selected.</p>
                <p className="muted">Open a case from the board, or restore the demo board.</p>
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
                setState((current) => stamp({ ...current, selectedCaseId: id }));
              }}
              onClearSelect={() => {
                setState((current) => stamp({ ...current, selectedCaseId: "" }));
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
                setState((current) => stamp({ ...current, selectedCaseId: id }));
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
