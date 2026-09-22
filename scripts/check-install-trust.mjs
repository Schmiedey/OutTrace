import { readFileSync } from "node:fs";

const manifestPath = process.argv[2] === "--manifest" ? process.argv[3] : process.argv[2];

if (!manifestPath) {
  console.error("Install-trust guard requires a generated manifest path.");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(
    `Install-trust guard could not read ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const requiredPermissions = new Set(manifest.permissions ?? []);
const failures = [];

for (const permission of [
  "tabs",
  "notifications",
  "webNavigation",
  "declarativeNetRequest",
]) {
  if (requiredPermissions.has(permission)) {
    failures.push(`move the install-time ${permission} permission out of the required permission set`);
  }
}

if (manifest.chrome_url_overrides?.newtab) {
  failures.push("remove the New Tab page override");
}

if ((manifest.host_permissions ?? []).length > 0) {
  failures.push("request website access at runtime instead of declaring required host permissions");
}

const contentMatches = (manifest.content_scripts ?? []).flatMap(
  (entry) => entry.matches ?? [],
);
if (contentMatches.length > 0) {
  failures.push(`remove install-time content-script access: ${contentMatches.join(", ")}`);
}

if (!requiredPermissions.has("activeTab")) {
  failures.push("restore activeTab so manual scans do not need broad website access");
}

if (failures.length > 0) {
  console.error(
    `Install-trust guard failed for ${manifestPath}:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
  );
  process.exit(1);
}

console.log("Install-trust guard passed.");
