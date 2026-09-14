import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const forbiddenFiles = [
  "src/analysis/data/disconnect.json",
  "scripts/build-disconnect.mjs",
];
const forbiddenText = [
  "disconnect-tracking-protection",
  "CC BY-NC-SA",
  "disconnect-list",
];
const roots = ["src", "entrypoints", "scripts"];
const readableExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json"]);

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const failures = forbiddenFiles.filter(existsSync);
for (const file of roots.flatMap(filesBelow)) {
  if (file === "scripts/check-classification-license.mjs") continue;
  if (!readableExtensions.has(extname(file))) continue;
  const contents = readFileSync(file, "utf8");
  if (forbiddenText.some((value) => contents.includes(value))) failures.push(file);
}

if (failures.length > 0) {
  console.error(`Commercial classification guard failed:\n${[...new Set(failures)].map((file) => `- ${file}`).join("\n")}`);
  process.exit(1);
}

console.log("Commercial classification guard passed.");
