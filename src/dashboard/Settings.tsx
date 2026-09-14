import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { billingStatus } from "@/src/billing/client";
import { Button } from "@/src/components/ui/button";
import { LIST_ATTRIBUTION } from "@/src/analysis/list";
import { downloadJson } from "@/src/export/scanExport";
import { importArchive, parseArchive } from "@/src/storage/archive";
import { clearAllData, exportAllData } from "@/src/storage/scans";
import { notificationsEnabled, setNotificationsEnabled } from "@/src/storage/settings";
import { seedLiveTen } from "@/src/storage/seed";
import { useAsync } from "@/src/lib/useAsync";

export function SettingsPage() {
  const [cleared, setCleared] = useState(false);
  const [liveSeeded, setLiveSeeded] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [exported, setExported] = useState(false);
  const [imported, setImported] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const notify = useAsync(() => notificationsEnabled(), []);
  const billing = useAsync(() => billingStatus(), []);
  const isLocalhost = location.hostname === "localhost";

  const clear = async (): Promise<void> => {
    const confirmed = window.confirm("Delete every saved scan, domain, and graph from this browser?");
    if (!confirmed) return;
    await clearAllData();
    sessionStorage.removeItem("linkscope-live-ten");
    setCleared(true);
    setLiveSeeded(false);
    setImported(null);
  };

  const seedLive = async (): Promise<void> => {
    setLiveBusy(true);
    try {
      await seedLiveTen();
      sessionStorage.setItem("linkscope-live-ten", "1");
      setLiveSeeded(true);
      setCleared(false);
    } finally {
      setLiveBusy(false);
    }
  };

  const exportAll = async (): Promise<void> => {
    if (!billing.data?.paid) return;
    const data = await exportAllData();
    downloadJson("linkscope-archive.json", {
      ...data,
      list: LIST_ATTRIBUTION,
    });
    setExported(true);
  };

  const toggleNotify = async (): Promise<void> => {
    const next = !(notify.data ?? true);
    await setNotificationsEnabled(next);
    notify.reload();
  };

  const onImportFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setImportBusy(true);
    setImportError(null);
    setImported(null);
    try {
      const text = await file.text();
      const archive = parseArchive(JSON.parse(text) as unknown);
      const result = await importArchive(archive);
      setImported(
        `Imported ${String(result.scans)} scan${result.scans === 1 ? "" : "s"}` +
          (result.sites ? ` across ${String(result.sites)} new site${result.sites === 1 ? "" : "s"}` : "") +
          (result.skipped ? ` · skipped ${String(result.skipped)} duplicate${result.skipped === 1 ? "" : "s"}` : "") +
          ".",
      );
      setCleared(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import this file.");
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="max-w-xl px-10 py-10">
      <header className="mb-8">
        <h1 className="font-display text-4xl">Settings</h1>
      </header>
      <section className="mb-8">
        <h2 className="text-[15px] font-medium">Privacy</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-mute">
          Manual scans run only when you open LinkScope or use its shortcut. Sites you explicitly add to Watching are
          revisited daily or weekly from this browser. Scan contents stay on this device; ExtensionPay receives only
          the account and subscription information needed to verify Pro. Free history keeps up to 20 scans for 30
          days; Pro keeps up to 1,000 scans for one year.
        </p>
      </section>
      <section className="mb-8">
        <h2 className="text-[15px] font-medium">Change alerts</h2>
        <p className="mt-2 mb-4 text-[14px] leading-relaxed text-mute">
          LinkScope sends a weekly summary when watched sites changed. It can also notify you when a domain you follow
          appears on another site you check. It stays quiet when nothing changed.
        </p>
        <Button variant="ghost" onClick={() => void toggleNotify()}>
          {(notify.data ?? true) ? "Notifications on" : "Notifications off"}
        </Button>
      </section>
      <section className="mb-8">
        <h2 className="text-[15px] font-medium">Tracker list</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-mute">
          {LIST_ATTRIBUTION.domainCount.toLocaleString("en-US")} domains from {LIST_ATTRIBUTION.source} ({LIST_ATTRIBUTION.generatedAt}),
          licensed {LIST_ATTRIBUTION.license}. Unknown still means unknown — not clean.
        </p>
        <a
          className="mt-2 inline-block text-[13px] text-ink underline"
          href={LIST_ATTRIBUTION.homepage}
          target="_blank"
          rel="noreferrer"
        >
          Source on GitHub
        </a>
      </section>
      <section className="mb-8">
        <h2 className="text-[15px] font-medium">Export & import</h2>
        <p className="mt-2 mb-4 text-[14px] text-mute">
          Pro can download every saved scan as JSON. Archives can be restored in any plan; duplicate scans are skipped.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={!billing.data?.paid} onClick={() => void exportAll()}>
            {exported ? "Archive downloaded" : billing.data?.paid ? "Export all scans" : "Export all · Pro"}
          </Button>
          <Button variant="ghost" disabled={importBusy} onClick={() => fileRef.current?.click()}>
            {importBusy ? "Importing…" : "Import archive"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void onImportFile(event.target.files?.[0])}
          />
        </div>
        {imported ? <p className="mt-3 text-[13px] text-lime">{imported}</p> : null}
        {importError ? <p className="mt-3 text-[13px] text-rose">{importError}</p> : null}
        {!billing.data?.paid ? <p className="mt-3 text-[12px] text-mute"><Link to="/pro" className="underline">View Pro</Link> for one-year history and export.</p> : null}
      </section>
      {isLocalhost ? (
        <section className="mb-8">
          <h2 className="text-[15px] font-medium">Development fixtures</h2>
          <p className="mt-2 mb-4 text-[14px] text-mute">Load captured page data while developing locally.</p>
          <Button className="ml-2" variant="ghost" disabled={liveBusy} onClick={() => void seedLive()}>
            {liveSeeded ? "10 live scans saved" : liveBusy ? "Saving…" : "Load 10 live scans"}
          </Button>
        </section>
      ) : null}
      <section>
        <h2 className="text-[15px] font-medium">Danger zone</h2>
        <p className="mt-2 mb-4 text-[14px] text-mute">This cannot be undone.</p>
        <Button variant="danger" onClick={() => void clear()}>
          {cleared ? "All data cleared" : "Clear all local data"}
        </Button>
      </section>
    </div>
  );
}
