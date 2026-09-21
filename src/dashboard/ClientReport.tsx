import { useEffect } from "react";
import { noteUsage } from "@/src/telemetry/usage";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/src/components/ui/button";
import { useAsync } from "@/src/lib/useAsync";
import { getScan, getScanGraph, listScansForSite } from "@/src/storage/scans";
import {
  buildSiteReport,
  REPORT_LIMITATION,
  siteReportText,
} from "@/src/reporting/siteReport";
import { downloadBlob } from "@/src/export/scanExport";
import { CATEGORY_LABELS } from "@/src/types/graph";

export function ClientReportPage() {
  const { scanId: rawId, fromId: rawFrom } = useParams();
  const scanId = Number(rawId);
  const report = useAsync(async () => {
    if (!Number.isSafeInteger(scanId) || scanId < 1)
      throw new Error("Invalid report.");
    const [scan, graph] = await Promise.all([
      getScan(scanId),
      getScanGraph(scanId),
    ]);
    if (!scan || !graph)
      throw new Error("This capture is no longer stored in this browser.");
    const previousScan =
      rawFrom !== undefined
        ? await getScan(Number(rawFrom))
        : (await listScansForSite(scan.siteId))
            .filter((item) => item.timestamp < scan.timestamp)
            .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (rawFrom !== undefined && !previousScan)
      throw new Error("The comparison capture is no longer available.");
    const previousGraph =
      previousScan?.id !== undefined
        ? await getScanGraph(previousScan.id)
        : undefined;
    if (rawFrom !== undefined && !previousGraph)
      throw new Error("The comparison evidence is no longer available.");
    return buildSiteReport(
      scan,
      graph,
      previousScan && previousGraph
        ? { scan: previousScan, graph: previousGraph }
        : undefined,
    );
  }, [scanId, rawFrom]);
  useEffect(() => {
    if (report.data) noteUsage("client-report-opened");
  }, [report.data]);
  if (report.loading) return <p className="p-8">Preparing report…</p>;
  if (report.error || !report.data)
    return (
      <div className="p-8">
        <p role="alert">{report.error ?? "Report unavailable."}</p>
        <Link to="/sites" className="mt-4 inline-block underline">
          Back to portfolio
        </Link>
      </div>
    );
  const data = report.data;
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link
          to={`/sites/${data.scan.siteId}`}
          className="text-[13px] underline"
        >
          Back to site
        </Link>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              noteUsage("client-report-download-requested");
              downloadBlob(
                `outtrace-report-${data.scan.domain.replace(/[^a-z0-9.-]/gi, "-")}.txt`,
                new Blob([siteReportText(data)], {
                  type: "text/plain;charset=utf-8",
                }),
              );
            }}
          >
            Download text
          </Button>
          <Button
            onClick={() => {
              noteUsage("client-report-print-requested");
              window.print();
            }}
          >
            Print / save PDF
          </Button>
        </div>
      </div>
      <p className="text-[11px] tracking-[0.16em] text-mute uppercase">
        OutTrace · Website connection report
      </p>
      <h1 className="font-display mt-3 break-words text-4xl">
        {data.scan.domain}
      </h1>
      <p className="mt-3 text-[13px] text-mute">
        Captured {new Date(data.scan.timestamp).toLocaleString()}
      </p>
      <p className="mt-1 text-[13px] text-mute">
        {data.previous
          ? `Compared with ${new Date(data.previous.timestamp).toLocaleString()}`
          : "Initial capture · a starting point for future comparisons"}
      </p>
      <section className="my-8 grid grid-cols-3 gap-4 border-y border-line py-6">
        <Metric label="Exposure score" value={`${data.score.score}/100`} />
        <Metric
          label="Resource domains"
          value={String(data.resources.length)}
        />
        <Metric
          label="New since previous"
          value={data.previous ? String(data.added.length) : "—"}
        />
      </section>
      <h2 className="font-display text-2xl">What we observed</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-mute">
        {data.score.reasons.join(" · ")}
      </p>
      {data.previous ? (
        <div className="mt-4 rounded-md border border-line p-4">
          <p className="font-medium">
            {data.change.importance === "routine"
              ? "No important change detected"
              : "Changes to review"}
          </p>
          <ul className="mt-2 space-y-1 text-[13px]">
            {data.change.reasons.map((reason) => (
              <li key={reason.code}>{reason.label}</li>
            ))}
          </ul>
          <p className="mt-3 text-[13px]">
            Added resource domains:{" "}
            {data.added.map((node) => node.domain).join(", ") || "None"}
          </p>
          <p className="mt-1 text-[13px]">
            Removed resource domains:{" "}
            {data.removed.map((node) => node.domain).join(", ") || "None"}
          </p>
        </div>
      ) : null}
      <h2 className="font-display mt-8 text-2xl">Recommended follow-up</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px]">
        {data.nextSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h2 className="font-display mt-8 text-2xl">Observed services</h2>
      <p className="mt-2 text-[12px] text-mute">
        Third-party resource connections only. Passive hyperlinks are excluded.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-line">
              <th className="py-2">Domain / owner</th>
              <th>Category</th>
              <th>Classification</th>
            </tr>
          </thead>
          <tbody>
            {data.resources.map((node) => (
              <tr key={node.domain} className="border-b border-line">
                <td className="py-3 pr-3 break-all">
                  {node.domain}
                  {node.owner ? (
                    <span className="block text-mute">{node.owner}</span>
                  ) : null}
                </td>
                <td className="pr-3">{CATEGORY_LABELS[node.category]}</td>
                <td>{node.classificationSource ?? "unknown"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.resources.length ? (
        <p className="mt-3 text-mute">
          No third-party resource domains observed in this capture.
        </p>
      ) : null}
      <footer className="mt-10 border-t border-line pt-5 text-[12px] leading-relaxed text-mute">
        <p>{REPORT_LIMITATION}</p>
        <p className="mt-3">
          Full page URLs, titles, and raw evidence are omitted. Site and service
          domains are included. Review before sharing.
        </p>
        <p className="mt-3">
          Prepared with OutTrace · scan data stays in your browser.
        </p>
      </footer>
    </main>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-mute">{label}</p>
      <p className="font-display mt-1 text-3xl">{value}</p>
    </div>
  );
}
