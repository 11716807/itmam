/**
 * Offline eval of the agent harness against SAMPLE_IMPORT_CSV expectations.
 * Run: node --experimental-strip-types scripts/run-eval.mjs
 * (Uses tsx via: npx tsx scripts/run-eval.ts)
 */
import { parseImportCsv, SAMPLE_IMPORT_CSV } from "../src/lib/importCsv.ts";
import { runAgentPipeline } from "../src/lib/agents/runPipeline.ts";

const EXPECTED = {
  "p-yusuf": { status: "placed", urgency: "urgent" },
  "p-fatima": { status: "placed", urgency: "urgent" },
  "p-mariam": { status: "placed" },
  "p-noura": { status: "placed" },
  "p-ahmed": { status: "placed" },
  "p-khalid": { status: "placed" },
  "p-hassan": { status: "placed" },
  "p-layla": { status: "placed" },
  "p-omar": { status: "filtered" },
  "p-sara": { status: "filtered" },
  "p-bad-bp": { status: "needs_fix", issue: "invalid_bp_format" },
  "p-bad-empty": { status: "needs_fix", issue: "missing_value" },
};

async function main() {
  const rows = parseImportCsv(SAMPLE_IMPORT_CSV);
  const results = [];
  for (const row of rows) {
    const { run } = await runAgentPipeline(row, { explain: false, fast: true });
    const exp = EXPECTED[row.patient.id] || {};
    const validate = run.nodes.find((n) => n.id === "validate");
    const gate = run.nodes.find((n) => n.id === "gate");
    const priority = run.nodes.find((n) => n.id === "priority");
    const statusOk = run.status === exp.status;
    const urgencyOk = !exp.urgency || run.urgency === exp.urgency;
    const issueOk = !exp.issue || run.issues.some((i) => i.code === exp.issue);
    results.push({
      id: row.patient.id,
      name: row.patient.nameEn,
      finding: `${row.result.code}=${row.result.value || "(empty)"}`,
      expectedStatus: exp.status,
      expectedUrgency: exp.urgency || null,
      expectedIssue: exp.issue || null,
      actualStatus: run.status,
      actualUrgency: run.urgency || null,
      actualIssues: run.issues.map((i) => i.code),
      statusOk,
      urgencyOk,
      issueOk,
      validate: validate?.status,
      gate: gate?.status,
      priority: priority?.status,
      classified: run.classifiedFlag || null,
      gateReason: run.gateReason || null,
    });
  }

  const n = results.length;
  const statusAcc = results.filter((r) => r.statusOk).length / n;
  const urgRows = results.filter((r) => EXPECTED[r.id]?.urgency);
  const urgAcc = urgRows.filter((r) => r.urgencyOk).length / (urgRows.length || 1);
  const issueRows = results.filter((r) => EXPECTED[r.id]?.issue);
  const issueAcc = issueRows.filter((r) => r.issueOk).length / (issueRows.length || 1);
  const validateOk =
    results.filter((r) => {
      const exp = EXPECTED[r.id];
      if (exp.status === "needs_fix") return r.validate === "blocked";
      return r.validate === "ok" || r.validate === "warn";
    }).length / n;
  const gateOk =
    results.filter((r) => {
      const exp = EXPECTED[r.id];
      if (exp.status === "needs_fix") return r.gate === "skipped";
      if (exp.status === "filtered") return r.gate === "filtered";
      return r.gate === "ok";
    }).length / n;
  const priOk =
    results.filter((r) => {
      const exp = EXPECTED[r.id];
      if (exp.status !== "placed") return r.priority === "skipped";
      return r.priority === "ok";
    }).length / n;

  console.log(
    JSON.stringify(
      {
        n,
        statusAcc,
        urgAcc,
        issueAcc,
        validateOk,
        gateOk,
        priOk,
        placed: results.filter((r) => r.actualStatus === "placed").length,
        filtered: results.filter((r) => r.actualStatus === "filtered").length,
        needsFix: results.filter((r) => r.actualStatus === "needs_fix").length,
        fails: results.filter((r) => !r.statusOk || !r.urgencyOk || !r.issueOk),
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
