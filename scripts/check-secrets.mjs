import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const ignored = new Set([".git", ".output", ".wxt", "graphify-out", "node_modules"]);
const secretPattern = /\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+/;
const hits = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    const contents = await readFile(path, "utf8").catch(() => "");
    if (secretPattern.test(contents)) hits.push(relative(root, path));
  }
}

await scan(root);
if (hits.length > 0) {
  console.error(`Refusing to build: possible Stripe secret found in ${hits.join(", ")}`);
  process.exit(1);
}
console.log("Secret scan passed.");
