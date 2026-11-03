import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

const BRIEF_PROMPT = `You are Itmam, a closed-loop screening-to-care assistant for Abu Dhabi IFHAS/EAS follow-up.
You receive a JSON evidence pack only. Return JSON only:
{"headlineEn":"","headlineAr":"","explainEn":"","explainAr":"","priorityReason":"","nextSteps":["",""],"patientMessageEn":"","patientMessageAr":"","caveats":["",""]}

Rules:
- Do not diagnose, confirm disease names as fact, or prescribe.
- Speak as routing/follow-up help: clinician must review.
- Patient messages: calm, short, actionable; no scary labels; mention Sahhatna-style confirm.
- Arabic must be natural Gulf-friendly Modern Standard, not transliteration.
- priorityReason: one sentence on loop risk (owner, SLA, pathway).
- nextSteps: 3-5 concrete coordinator actions.
- Use only facts in the pack.`;

const PREPARE_PROMPT = `You are Itmam board prep for Abu Dhabi IFHAS/EAS extracts.
Given one screening row + extra metrics (days_waiting, prior_no_shows, wearable_flag, family_risk, notes), decide if it belongs on the care coordination board.

Return JSON only:
{"include":true,"urgency":"routine|soon|urgent","specialty":"family_medicine|endocrinology|cardiology|gastroenterology|neurology|ophthalmology","slaHours":48,"priorityReason":"one sentence","boardNote":"short note"}

Rules:
- include=false for normal/borderline findings that do not need a closed loop.
- include=true for actionable findings that need told→owned→booked→seen→verified.
- FIT / cancer-path and severe BP lean urgent with shorter SLA.
- Higher days_waiting, prior_no_shows, wearable_flag=yes, family_risk=yes increase urgency / lower slaHours.
- Do not diagnose. priorityReason is routing risk only.
- specialty: fit→gastroenterology, moca→neurology, hba1c/bmi→family_medicine, bp/ldl→cardiology unless notes say otherwise.`;

const TRANSLATE_PROMPT = `You translate patient outreach messages for Abu Dhabi screening follow-up (Sahhatna).
Input JSON: { text, from, to, fromCode, toCode }.
Return JSON only: {"text":"translated message"}

Rules:
- Preserve meaning: calm, no diagnosis, no prescriptions, invite clinic review / Sahhatna confirm.
- Natural target language (Gulf-friendly Arabic when to is Arabic).
- Do not add new clinical claims.
- Keep names and product word Sahhatna / صحةنا as appropriate.`;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function callModel(
  apiKey: string,
  model: string,
  system: string,
  pack: unknown,
): Promise<unknown> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(pack) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`${model} ${response.status} ${detail}`);
  }
  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(raw);
}

export function geminiPlugin(apiKey: string, model: string): Plugin {
  const models = [model || "gemini-3.8-flash", "gemini-2.5-flash"].filter(
    (name, index, all) => name && all.indexOf(name) === index,
  );

  const handle: Connect.NextHandleFunction = async (req, res, next) => {
    const path = req.url?.split("?")[0];
    if (path !== "/api/itmam" && path !== "/api/itmam-prepare" && path !== "/api/itmam-translate") {
      next();
      return;
    }
    if (req.method !== "POST") {
      send(res, 405, { error: "POST only" });
      return;
    }
    if (!apiKey) {
      send(res, 503, { error: "GEMINI_API_KEY is not set" });
      return;
    }
    try {
      const payload = JSON.parse(await readBody(req)) as { pack?: unknown };
      if (!payload.pack) {
        send(res, 400, { error: "Missing pack" });
        return;
      }
      const system =
        path === "/api/itmam-prepare"
          ? PREPARE_PROMPT
          : path === "/api/itmam-translate"
            ? TRANSLATE_PROMPT
            : BRIEF_PROMPT;
      let last = "Translate failed";
      for (const name of models) {
        try {
          const out = await callModel(apiKey, name, system, payload.pack);
          if (path === "/api/itmam-prepare") {
            send(res, 200, { model: name, decision: out });
          } else if (path === "/api/itmam-translate") {
            const text =
              typeof out === "object" && out && "text" in out
                ? String((out as { text: string }).text)
                : "";
            send(res, 200, { text });
          } else {
            send(res, 200, { model: name, brief: out });
          }
          return;
        } catch (error) {
          last = error instanceof Error ? error.message : "Request failed";
        }
      }
      send(res, 502, { error: last.slice(0, 300) });
    } catch {
      send(res, 400, { error: "Bad request" });
    }
  };

  return {
    name: "itmam-gemini",
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}
