import type { AuditDomainRow, AuditPageRow, AuditRow } from "@/src/audit/types";
import { downloadBlob, downloadJson } from "@/src/export/scanExport";

function stamp(domain: string): string {
  return `outtrace-audit-${domain}-${new Date().toISOString().slice(0, 10)}`;
}

function csvCell(value: string | number | boolean | undefined): string {
  const text = value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportAuditJson(audit: AuditRow, pages: AuditPageRow[], domains: AuditDomainRow[]): void {
  downloadJson(`${stamp(audit.domain)}.json`, {
    exportedAt: new Date().toISOString(),
    audit,
    pages,
    domains,
  });
}

export function exportAuditCsv(audit: AuditRow, domains: AuditDomainRow[]): void {
  const lines = ["domain,category,owner,pageCount,coverage,referenceCount,types,pages"];
  for (const domain of domains) {
    lines.push([
      csvCell(domain.domain),
      csvCell(domain.category),
      csvCell(domain.owner),
      csvCell(domain.pageCount),
      csvCell(audit.pagesScanned > 0 ? Math.round((domain.pageCount / audit.pagesScanned) * 100) : 0),
      csvCell(domain.referenceCount),
      csvCell(domain.types.join(" ")),
      csvCell(domain.pages.join(" ")),
    ].join(","));
  }
  downloadBlob(`${stamp(audit.domain)}.csv`, new Blob([`${lines.join("\n")}\n`], { type: "text/csv" }));
}
