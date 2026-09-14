import { LIST_ATTRIBUTION } from "@/src/analysis/categorizer";
import type { ConnectionType, ScanGraphSnapshot, ScanRow } from "@/src/types/graph";
import type { Core } from "cytoscape";

function stamp(domain: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `linkscope-${domain}-${day}`;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(filename, new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" }));
}

export function exportScanJson(scan: ScanRow | undefined, snapshot: ScanGraphSnapshot): void {
  downloadJson(`${stamp(snapshot.originDomain)}.json`, {
    exportedAt: new Date().toISOString(),
    list: LIST_ATTRIBUTION,
    scan: scan ?? null,
    snapshot,
  });
}

function csvCell(value: string | number | boolean | undefined): string {
  const text = value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function exportScanCsv(snapshot: ScanGraphSnapshot): void {
  const typesByDomain = new Map<string, Set<ConnectionType>>();
  for (const edge of snapshot.edges) {
    const set = typesByDomain.get(edge.target) ?? new Set<ConnectionType>();
    set.add(edge.type);
    typesByDomain.set(edge.target, set);
  }

  const lines = [
    [
      "domain",
      "category",
      "classificationSource",
      "classificationConfidence",
      "owner",
      "listed",
      "firstParty",
      "origin",
      "references",
      "types",
    ].join(","),
  ];
  for (const node of snapshot.nodes) {
    const types = Array.from(typesByDomain.get(node.domain) ?? []).sort().join(" ");
    lines.push(
      [
        csvCell(node.domain),
        csvCell(node.category),
        csvCell(node.classificationSource),
        csvCell(node.classificationConfidence),
        csvCell(node.owner),
        csvCell(node.listed ? "yes" : "no"),
        csvCell(node.isFirstParty ? "yes" : "no"),
        csvCell(node.isOrigin ? "yes" : "no"),
        csvCell(node.referenceCount),
        csvCell(types),
      ].join(","),
    );
  }

  downloadBlob(`${stamp(snapshot.originDomain)}.csv`, new Blob([`${lines.join("\n")}\n`], { type: "text/csv" }));
}

export function exportGraphPng(cy: Core | null, originDomain: string): boolean {
  if (!cy) return false;
  const png = cy.png({
    output: "base64uri",
    bg: "#ffffff",
    full: true,
    scale: 2,
    maxWidth: 3600,
    maxHeight: 3600,
  });
  const anchor = document.createElement("a");
  anchor.href = png;
  anchor.download = `${stamp(originDomain)}.png`;
  anchor.click();
  return true;
}
