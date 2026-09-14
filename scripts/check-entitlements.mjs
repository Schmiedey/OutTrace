import { readFileSync } from "node:fs";

const files = {
  billing: "src/billing/extpay.ts",
  background: "entrypoints/background.ts",
  watched: "src/extension/watchedSites.ts",
  auditReport: "src/dashboard/AuditReport.tsx",
  graph: "src/graph/GraphViewer.tsx",
  settings: "src/dashboard/Settings.tsx",
  popup: "entrypoints/popup/App.tsx",
  audit: "src/audit/runner.ts",
};

const requirements = [
  ["billing", "extpay.openPaymentPage()", "Checkout must open through ExtensionPay."],
  ["background", "Scheduled background checks require LinkScope Pro.", "Schedule updates must require Pro."],
  ["watched", "if (!(await getBillingStatus()).paid) return;", "Scheduled background scans must require Pro."],
  ["auditReport", "Export · Pro", "Audit exports must be locked."],
  ["graph", "Export · Pro", "Graph exports must be locked."],
  ["settings", "Export all · Pro", "Archive exports must be locked."],
  ["popup", "Deep scan · Pro", "Popup deep scans must be locked."],
  ["audit", "Deep audits require LinkScope Pro.", "Deep site audits must require Pro."],
];

const failures = requirements
  .filter(([file, expected]) => !readFileSync(files[file], "utf8").includes(expected))
  .map(([, , message]) => message);

if (failures.length > 0) {
  console.error(`Entitlement guard check failed:\n${failures.map((message) => `- ${message}`).join("\n")}`);
  process.exit(1);
}

console.log("Entitlement guard check passed.");
