import { clinicianById, patientById, resultById } from "../../data/seed";
import type { CareCase } from "../../types";
import { compatibleSlots, hoursOpen, ownerCandidates } from "../loop";
import { confirmatorySpecialty, referralOf } from "../pathway";
import { planSlaRecovery } from "../slaAction";
import { evaluateLoopGuardrails } from "./guardrails";
import type { LoopAgentApiResponse, LoopAgentId, LoopAgentSuggestion } from "./types";

function agentForStage(stage: CareCase["stage"]): LoopAgentId {
  switch (stage) {
    case "result_in":
      return "watch";
    case "stratified":
      return "draftTell";
    case "told":
      return "matchOwner";
    case "owned":
    case "booked":
      return "suggestSlot";
    default:
      return "outcomeGate";
  }
}

function specialtyWords(value: string) {
  return value.replaceAll("_", " ");
}

function buildPack(care: CareCase, agent: LoopAgentId) {
  const patient = patientById(care.patientId);
  const result = resultById(care.resultId);
  const sla = planSlaRecovery(care, result);
  const ref = referralOf(care);

  const clinicians = ownerCandidates(care.specialty, patient.network).map((c) => ({
    id: c.id,
    nameEn: c.nameEn,
    specialty: c.specialty,
    facility: c.facility,
    networks: c.networks,
  }));

  const slots = compatibleSlots(care.specialty, patient.network, null).map((s) => {
    const c = clinicianById(s.clinicianId);
    return {
      id: s.id,
      when: s.when,
      clinicianId: s.clinicianId,
      clinicianName: c.nameEn,
      clinicianSpecialty: c.specialty,
      facility: c.facility,
    };
  });

  return {
    agent,
    case: {
      id: care.id,
      stage: care.stage,
      specialty: care.specialty,
      urgency: care.urgency,
      slaHours: care.slaHours,
      hoursOpen: hoursOpen(care),
      ownerId: care.ownerId,
      slotId: care.slotId,
      referral: {
        branch: ref.branch,
        bookedAt: ref.bookedAt ?? null,
        doneAt: ref.doneAt ?? null,
      },
      slaStatus: sla.status,
    },
    patient: {
      id: patient.id,
      nameEn: patient.nameEn,
      network: patient.network,
      preferredLang: patient.preferredLang,
    },
    finding: {
      code: result.code,
      labelEn: result.labelEn,
      value: result.value,
      unit: result.unit,
    },
    roster: {
      clinicians,
      slots,
      confirmatorySpecialty: confirmatorySpecialty(result.code),
    },
    allowedOutcomes: ["direct_close", "confirmatory", "verify"] as const,
  };
}

async function callLoopApi(pack: unknown): Promise<LoopAgentApiResponse> {
  const response = await fetch("/api/itmam-loop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pack }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail.slice(0, 200) || `HTTP ${response.status}`);
  }
  return (await response.json()) as LoopAgentApiResponse;
}

/**
 * Runs the stage-active loop agent via Gemini, then applies roster/outcome guardrails.
 * Never auto-advances the loop — returns a suggestion the human must confirm.
 */
export async function runLoopAgent(care: CareCase): Promise<LoopAgentSuggestion> {
  const agent = agentForStage(care.stage);
  const pack = buildPack(care, agent);
  const allowedIds =
    agent === "matchOwner"
      ? pack.roster.clinicians.map((c) => c.id)
      : agent === "suggestSlot"
        ? pack.roster.slots.map((s) => s.id)
        : [];

  // Watch / closed stages: no model pick needed.
  if (agent === "watch" || care.stage === "verified" || care.stage === "lost") {
    const { checks } = evaluateLoopGuardrails(agent, { allowedIds: [] });
    return {
      agent,
      stage: care.stage,
      status: "ready",
      detail:
        care.stage === "verified"
          ? "Loop closed — no further suggestion."
          : care.stage === "lost"
            ? "Lost case — review only."
            : "Watch agent: lock priority before outreach.",
      guardrails: checks,
    };
  }

  if (care.stage === "booked") {
    const { checks } = evaluateLoopGuardrails("suggestSlot", {
      pickId: care.slotId || undefined,
      why: "Visit already booked — confirm attendance.",
      allowedIds: care.slotId ? [care.slotId] : [],
    });
    return {
      agent: "suggestSlot",
      stage: care.stage,
      status: "ready",
      detail: "Confirm attendance, reschedule, or no-show — assist never closes alone.",
      guardrails: checks.map((c) =>
        c.status === "breached" ? { ...c, status: "held", detail: "Booked stage — no new pick" } : c,
      ),
    };
  }

  try {
    const api = await callLoopApi(pack);
    const pick = api.pick || {};
    const { ok, checks } = evaluateLoopGuardrails(agent, {
      pickId: pick.pickId,
      why: pick.why,
      draftEn: pick.draftEn,
      outcome: pick.outcome,
      allowedIds,
    });

    if (!ok) {
      return {
        agent,
        stage: care.stage,
        model: api.model,
        status: "blocked",
        detail: "Guardrails blocked the model pick — choose manually from the roster.",
        why: pick.why,
        guardrails: checks,
      };
    }

    if (agent === "matchOwner" && pick.pickId) {
      const c = clinicianById(pick.pickId);
      return {
        agent,
        stage: care.stage,
        model: api.model,
        status: "ready",
        detail: `Match owner agent ranked ${c.nameEn} from the live roster.`,
        pickId: pick.pickId,
        pickLabel: `${c.nameEn} · ${specialtyWords(c.specialty)}`,
        why: pick.why?.trim(),
        guardrails: checks,
      };
    }

    if (agent === "suggestSlot" && pick.pickId) {
      const slot = pack.roster.slots.find((s) => s.id === pick.pickId);
      const when = slot?.when.replace("T", " ") || "";
      return {
        agent,
        stage: care.stage,
        model: api.model,
        status: "ready",
        detail: `Suggest slot agent chose among ${pack.roster.slots.length} network-safe times.`,
        pickId: pick.pickId,
        pickLabel: slot ? `${when} · ${slot.clinicianName}` : pick.pickId,
        why: pick.why?.trim(),
        guardrails: checks,
      };
    }

    if (agent === "draftTell" && pick.draftEn) {
      return {
        agent,
        stage: care.stage,
        model: api.model,
        status: "ready",
        detail: "Draft tell agent prepared Sahhatna copy — you still press Send.",
        draftMessage: pick.draftEn.trim(),
        why: pick.why?.trim(),
        guardrails: checks,
      };
    }

    if (agent === "outcomeGate" && pick.outcome) {
      const labels: Record<string, string> = {
        direct_close: "Close without referral",
        confirmatory: `Refer · ${specialtyWords(pack.roster.confirmatorySpecialty)}`,
        verify: "Verify outcome",
      };
      return {
        agent,
        stage: care.stage,
        model: api.model,
        status: "ready",
        detail: "Outcome agent recommends a pathway — confirm to apply.",
        outcome: pick.outcome,
        pickLabel: labels[pick.outcome] || pick.outcome,
        why: pick.why?.trim(),
        guardrails: checks,
      };
    }

    return {
      agent,
      stage: care.stage,
      model: api.model,
      status: "blocked",
      detail: "Model returned an incomplete pick — choose manually.",
      guardrails: checks,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const { checks } = evaluateLoopGuardrails(agent, { allowedIds });
    return {
      agent,
      stage: care.stage,
      status: "error",
      detail: `Loop agent unavailable (${message.slice(0, 80)}). Choose manually from the roster.`,
      guardrails: checks.map((c) => ({ ...c, status: "held" as const, detail: "Skipped — API error" })),
    };
  }
}

export { agentForStage };
