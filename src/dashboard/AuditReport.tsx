import { Link, useParams } from "react-router-dom";
import { isTrackerCategory } from "@/src/analysis/categorizer";
import { billingStatus } from "@/src/billing/client";
import { gradeFromScore } from "@/src/analysis/score";
import { ownerGroupsForAudit } from "@/src/audit/aggregate";
import { PrivacyScoreMark } from "@/src/components/PrivacyScoreMark";
import { Button } from "@/src/components/ui/button";
import { exportAuditCsv, exportAuditJson } from "@/src/export/auditExport";
import { formatCount, formatRelativeTime } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import { getAudit, listAuditDomains, listAuditPages } from "@/src/storage/audits";
import { CATEGORY_LABELS } from "@/src/types/graph";

export function AuditReportPage() {
  const auditId = Number(useParams().auditId);
  const audit = useAsync(() => getAudit(auditId), [auditId]);
  const pages = useAsync(() => listAuditPages(auditId), [auditId]);
  const domains = useAsync(() => listAuditDomains(auditId), [auditId]);
  const billing = useAsync(() => billingStatus(), []);

  if (!Number.isFinite(auditId)) return <p className="px-10 py-10 text-mute">Invalid audit.</p>;
  if (audit.loading || pages.loading || domains.loading) return <p className="px-10 py-10 text-mute">Building audit report…</p>;
  if (!audit.data) return <p className="px-10 py-10 text-mute">Audit not found.</p>;
  const row = audit.data;
  if (row.status !== "completed") return <p className="px-10 py-10"><Link className="underline" to={`/audits/${String(auditId)}/running`}>Return to the running audit</Link></p>;

  const pageRows = pages.data ?? [];
  const domainRows = (domains.data ?? []).filter((domain) => !domain.isFirstParty);
  const owners = ownerGroupsForAudit(domainRows).slice(0, 12);
  const heaviest = pageRows.filter((page) => page.status === "completed").sort((a, b) => b.trackerCount - a.trackerCount || b.thirdPartyCount - a.thirdPartyCount).slice(0, 8);
  const pageSpecific = domainRows.filter((domain) => domain.pageCount <= Math.max(1, Math.ceil(row.pagesScanned * 0.1))).sort((a, b) => a.pageCount - b.pageCount).slice(0, 12);
  const categories = Array.from(new Set(domainRows.map((domain) => domain.category))).map((category) => ({
    category,
    count: domainRows.filter((domain) => domain.category === category).length,
  })).sort((a, b) => b.count - a.count);
  const scriptCount = domainRows.filter((domain) => domain.types.includes("script")).length;
  const iframeCount = domainRows.filter((domain) => domain.types.includes("iframe")).length;
  const completedAt = row.completedAt ?? row.startedAt;

  return (
    <div className="px-10 py-10">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-[12px] tracking-[0.14em] text-mute uppercase">Site audit · {formatRelativeTime(completedAt, Date.now())}</p>
          <h1 className="font-display mt-2 text-4xl">{row.domain}</h1>
          <p className="mt-2 text-[13px] text-mute">{formatCount(row.pagesScanned)} of {formatCount(row.pagesDiscovered)} discovered pages checked</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {row.previousAuditId !== undefined ? <Link className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-[13px]" to={`/audits/compare/${String(row.previousAuditId)}/${String(auditId)}`}>Compare audit</Link> : null}
          {billing.data?.paid ? <>
            <Button variant="ghost" onClick={() => exportAuditCsv(row, domainRows)}>Export CSV</Button>
            <Button variant="ghost" onClick={() => exportAuditJson(row, pageRows, domainRows)}>Export JSON</Button>
          </> : <Link className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-[13px]" to="/pro">Export · Pro</Link>}
        </div>
      </header>

      <section className="mt-10 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        <ScoreCard score={row.score ?? 100} average={row.averagePageScore} footprint={row.footprintScore} />
        <Stat label="External domains" value={row.thirdPartyCount} />
        <Stat label="Tracker domains" value={row.trackerCount} />
        <Stat label="Companies" value={row.ownerCount} />
        <Stat label="Unknown services" value={row.unknownCount} />
        <Stat label="Script domains" value={scriptCount} />
        <Stat label="Iframe domains" value={iframeCount} />
        <Stat label="Pages scanned" value={row.pagesScanned} />
      </section>

      <section className="mt-12">
        <div className="flex items-end justify-between"><h2 className="font-display text-2xl">Most widespread third parties</h2><Link to={`/audits/${String(auditId)}/domains`} className="text-[13px] text-mute hover:text-ink">View domains</Link></div>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {owners.map((owner) => <div key={owner.owner} className="flex items-start justify-between gap-6 py-4"><div><p className="text-[15px] font-medium">{owner.owner}</p><p className="mt-1 max-w-2xl text-[12px] text-mute">{owner.domains.map((domain) => domain.domain).join(" · ")}</p></div><p className="shrink-0 text-[13px] tabular-nums">{owner.pageCount} / {row.pagesScanned} pages</p></div>)}
        </div>
      </section>

      <section className="mt-12 grid gap-10 xl:grid-cols-2">
        <div>
          <div className="flex items-end justify-between"><h2 className="font-display text-2xl">Where tracking is heaviest</h2><Link to={`/audits/${String(auditId)}/pages`} className="text-[13px] text-mute hover:text-ink">View pages</Link></div>
          <div className="mt-4 divide-y divide-line border-y border-line">{heaviest.map((page) => <div key={page.url} className="flex justify-between gap-4 py-3 text-[13px]"><span className="truncate font-mono">{page.path}</span><span className="shrink-0 text-mute">{page.trackerCount} trackers · {page.score ?? 100}</span></div>)}</div>
        </div>
        <div>
          <h2 className="font-display text-2xl">Page-specific findings</h2>
          <div className="mt-4 divide-y divide-line border-y border-line">{pageSpecific.map((domain) => <div key={domain.domain} className="py-3"><div className="flex justify-between gap-4 text-[13px]"><span>{domain.domain}</span><span className="text-mute">{CATEGORY_LABELS[domain.category]}</span></div><p className="mt-1 truncate font-mono text-[11px] text-mute">{domain.pages.slice(0, 4).join(" · ")}</p></div>)}</div>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Third-party footprint</h2>
        <div className="mt-4 flex flex-wrap gap-2">{categories.map((item) => <span key={item.category} className="rounded-full border border-line px-3 py-1.5 text-[12px]">{CATEGORY_LABELS[item.category]} {item.count}</span>)}</div>
        {domainRows.some((domain) => isTrackerCategory(domain.category) && domain.pageCount / Math.max(1, row.pagesScanned) >= 0.8) ? <p className="mt-5 text-[13px] text-amber">Attention: at least one tracker appears on 80% or more of audited pages.</p> : null}
      </section>
      {!billing.data?.paid ? (
        <section className="mt-10 flex max-w-3xl flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <p className="text-[13px] text-mute">
            {formatCount(row.trackerCount)} tracker {row.trackerCount === 1 ? "domain" : "domains"} across {formatCount(row.pagesScanned)} {row.pagesScanned === 1 ? "page" : "pages"}. Pro adds scheduled monitoring and multi-site exports.
          </p>
          <Link className="text-[13px] text-ink underline underline-offset-2" to="/pro">See Pro</Link>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="bg-canvas px-5 py-5"><p className="text-[12px] text-mute">{label}</p><p className="font-display mt-1 text-3xl">{formatCount(value)}</p></div>;
}

function ScoreCard({ score, average, footprint }: { score: number; average?: number; footprint?: number }) {
  return <div className="bg-canvas px-5 py-5"><p className="text-[12px] text-mute">Overall privacy</p><div className="mt-1"><PrivacyScoreMark score={score} grade={gradeFromScore(score)} /></div><p className="mt-2 text-[11px] text-mute">Average page {average ?? "—"} · Footprint {footprint ?? "—"}</p></div>;
}
