import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["vitest", "run", "src/billing/entitlements.test.ts"], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
