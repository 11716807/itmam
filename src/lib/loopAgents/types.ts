import type { AgentGuardrailCheck } from "../agents/guardrails";
import type { LoopStage } from "../../types";

export type LoopAgentId = "watch" | "draftTell" | "matchOwner" | "suggestSlot" | "outcomeGate";

export type LoopAgentSuggestion = {
  agent: LoopAgentId;
  stage: LoopStage;
  /** Model that produced the pick, when available. */
  model?: string;
  status: "loading" | "ready" | "blocked" | "error";
  /** Human-readable status line. */
  detail: string;
  pickId?: string;
  pickLabel?: string;
  why?: string;
  draftMessage?: string;
  outcome?: "direct_close" | "confirmatory" | "verify";
  guardrails: AgentGuardrailCheck[];
  /** True when a local emergency fallback was used after model/guardrail failure. */
  usedFallback?: boolean;
};

export type LoopAgentApiResponse = {
  model?: string;
  pick?: {
    pickId?: string;
    why?: string;
    draftEn?: string;
    outcome?: "direct_close" | "confirmatory" | "verify";
    confidence?: number;
  };
  error?: string;
};
