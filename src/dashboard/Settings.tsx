import { useRef, useState } from "react";
import { billingStatus, launchCheckout, launchLogin } from "@/src/billing/client";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { LIST_ATTRIBUTION } from "@/src/analysis/categorizer";
import { downloadJson } from "@/src/export/scanExport";
import { importArchive, parseArchive } from "@/src/storage/archive";
import { clearAllData, exportAllData } from "@/src/storage/scans";
import {
  listIgnoredDomains,
  setDomainIgnored,
} from "@/src/storage/settings";
import { useAsync } from "@/src/lib/useAsync";
import { createCompleteBackup, restoreCompleteBackup, pendingBlockDomains, dismissPendingBlock } from "@/src/storage/backup";
import { parseCompleteBackup } from "@/src/storage/backupSchema";
import { historyCleanupPaused, resumeHistoryCleanup } from "@/src/storage/retention";
import { blockDomain } from "@/src/extension/block";
import { usageStatus } from "@/src/telemetry/usage";
import { QuietProtection } from "@/src/components/QuietProtection";
import { newTabEnabled, notificationMode, setNewTabEnabled, setNotificationMode, type NotificationMode } from "@/src/storage/settings";
import { useUpgradePrompt } from "@/src/components/UpgradePrompt";
import { noteUsage } from "@/src/telemetry/usage";

export function SettingsPage() {
  const openUpgrade = useUpgradePrompt();
  const [cleared, setCleared] = useState(false);
  const [exported, setExported] = useState(false);
  const [imported, setImported] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const pendingBlocks = useAsync(pendingBlockDomains, []);
  const cleanup = useAsync(historyCleanupPaused, []);
  const storage = useAsync(async () => ({ estimate: await navigator.storage?.estimate(), persistent: await navigator.storage?.persisted() }), []);
  const usage = useAsync(usageStatus, []);
  const [usageBusy, setUsageBusy] = useState(false);
  const [usageMessage, setUsageMessage] = useState<string | null>(null);
  const [contextMenuBusy, setContextMenuBusy] = useState(false);
  const [contextMenuMessage, setContextMenuMessage] = useState<string | null>(null);
  const toggleUsage = async (): Promise<void> => {
    setUsageBusy(true);
    try {
      const enabled = !usage.data?.enabled;
      const response = await browser.runtime.sendMessage({ type: "SET_USAGE_CONSENT", enabled }) as { ok?: boolean; error?: string };
      if (!response?.ok) throw new Error(response?.error ?? "Could not update usage consent.");
      usage.reload();
      setUsageMessage(enabled ? "Local usage counts enabled. Nothing is sent automatically." : "Usage counts disabled and local counters erased.");
    } catch (error) { setUsageMessage(error instanceof Error ? error.message : "Could not update consent."); }
    finally { setUsageBusy(false); }
  };
  const delivery = useAsync(notificationMode, []);
  const ignored = useAsync(() => listIgnoredDomains(), []);
  const billing = useAsync(() => billingStatus(true), []);
  const newTab = useAsync(newTabEnabled, []);
  const [billingBusy, setBillingBusy] = useState<"checkout" | "restore" | "refresh" | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [newTabMessage, setNewTabMessage] = useState<string | null>(null);

  const clear = async (): Promise<void> => {
    const confirmed = window.confirm("Delete every saved scan, domain, and graph from this browser?");
    if (!confirmed) return;
    await clearAllData();
    setCleared(true);
    setImported(null);
  };

  const downloadBackup = async (): Promise<void> => {
    setBackupBusy(true); setBackupError(null);
    try {
      const backup = await createCompleteBackup();
      downloadJson("linkscope-complete-backup.json", backup);
      setBackupMessage("Backup download requested. Keep this private file somewhere safe; it contains website URLs and scan evidence.");
    } catch (error) { setBackupError(error instanceof Error ? error.message : "Could not create backup."); }
    finally { setBackupBusy(false); }
  };

  const restoreBackup = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setBackupBusy(true); setBackupMessage(null); setBackupError(null);
    try {
      if (file.size > 200 * 1024 * 1024) throw new Error("This backup is too large to restore here (maximum 200 MB).");
      const backup = parseCompleteBackup(JSON.parse(await file.text()) as unknown);
      const confirmed = window.confirm(`Replace this browser's scans, audits, watched sites, alerts, and preferences with this backup (${backup.tables.scans.length} scans, ${backup.tables.audits.length} audits)? Download a backup of your current data first. Close other LinkScope reports and wait for running scans to finish. Automatic protection and restored watching will be off. Existing browser blocks and payment access remain unchanged.`);
      if (!confirmed) return;
      await restoreCompleteBackup(backup);
      delivery.reload(); ignored.reload(); pendingBlocks.reload(); cleanup.reload(); storage.reload();
      setBackupMessage("Backup restored. Watching and automatic protection are off. History cleanup is paused so you can review restored scans. Re-enable blocks individually below; refresh other open reports.");
    } catch (error) { setBackupError(error instanceof Error ? error.message : "Restore failed. No partial restore was committed."); }
    finally { setBackupBusy(false); if (backupRef.current) backupRef.current.value = ""; }
  };

  const activateBlock = async (domain: string): Promise<void> => {
    setBackupError(null);
    try {
      const result = await blockDomain(domain);
      if (result === "blocked") { await dismissPendingBlock(domain); pendingBlocks.reload(); }
      else setBackupMessage("Block filter copied; browser blocking was not activated.");
    } catch (error) { setBackupError(error instanceof Error ? error.message : "Could not activate block."); }
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

  const billingAction = async (action: "checkout" | "restore" | "refresh"): Promise<void> => {
    setBillingBusy(action);
    setBillingMessage(null);
    try {
      if (action === "checkout") {
        await launchCheckout();
        setBillingMessage("Checkout opened. LinkScope will return you to the Pro page after payment.");
      } else if (action === "restore") {
        await launchLogin();
        setBillingMessage("Restore opened. LinkScope will return you to the Pro page after activation.");
      } else {
        await billingStatus(true);
        billing.reload();
        setBillingMessage("Pro status refreshed.");
      }
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : "Could not update Pro status.");
    } finally {
      setBillingBusy(null);
    }
  };

  const toggleNewTab = async (): Promise<void> => {
    try {
      const enabled = !(newTab.data ?? false);
      await setNewTabEnabled(enabled);
      newTab.reload();
      setNewTabMessage(enabled ? "New-tab widget enabled. Chrome may ask you to confirm the override." : "New-tab widget off. Your normal new-tab page will be used.");
    } catch {
      setNewTabMessage("Could not update the new-tab preference.");
    }
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
          Manual checks use temporary current-tab access. Optional Quiet Protection quietly re-checks visited sites after a 6-second dwell, at most twice per site per day. It is off by default and requires optional site access.
          Sites you explicitly add to Watching can be revisited daily or weekly from this browser. LinkScope itself has no account and never sends scan content anywhere; ExtensionPay and Stripe handle only the payment email/card details and Pro verification. Manual scans and local history use the same device-safety boundary on every plan. No cloud scan account or sync is used.
        </p>
        <QuietProtection />
        <p className="mt-2 text-[12px] text-mute">The toolbar normally stays blank. +N means unseen notable activity; ! means an important change. Hover for the last saved score and capture time.</p>
        <p className="mt-2 text-[12px] text-mute">Watching is separate: choose when you visit, daily, or weekly. Scheduled checks may briefly load the website in an inactive tab.</p>
        <div className="mt-4 rounded-md border border-line bg-panel p-3">
          <p className="text-[13px] text-ink">Right-click scan</p>
          <p className="mt-1 text-[12px] text-mute">Enable “Scan with LinkScope” in the page menu. This adds no website access; choosing it uses the current page’s temporary access.</p>
          <Button size="sm" variant="ghost" className="mt-2" disabled={contextMenuBusy} onClick={() => { setContextMenuBusy(true); setContextMenuMessage(null); void browser.permissions.request({ permissions: ["contextMenus"] }).then((granted) => setContextMenuMessage(granted ? "Right-click scanning enabled." : "Right-click scanning was not enabled.")).catch(() => setContextMenuMessage("Could not enable right-click scanning.")).finally(() => setContextMenuBusy(false)); }}>{contextMenuBusy ? "Enabling…" : "Enable right-click scan"}</Button>
          {contextMenuMessage ? <p role="status" className="mt-2 text-[11px] text-mute">{contextMenuMessage}</p> : null}
        </div>
        <div className="mt-4 rounded-md border border-line bg-panel p-3">
          <p className="text-[13px] text-ink">New-tab widget</p>
          <p className="mt-1 text-[12px] text-mute">Off by default. When enabled, a lightweight LinkScope page shows your latest local scan, watched-site alert count, and a dashboard link. Turn it off any time to return to your normal new-tab page.</p>
          <Button size="sm" variant="ghost" className="mt-2" disabled={newTab.loading} onClick={() => void toggleNewTab()}>{newTab.data ? "New-tab widget on · turn off" : "Show LinkScope on new tab"}</Button>
          {newTabMessage ? <p role="status" className="mt-2 text-[11px] text-mute">{newTabMessage}</p> : null}
        </div>
      </section>
      <section className="mb-8" aria-label="Pro access">
        <h2 className="text-[15px] font-medium">Pro access</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-mute">LinkScope itself has no account and never receives your scan history. A one-time $14.99 payment is processed by ExtensionPay and Stripe, including the email and card details needed for your receipt.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!billing.data?.paid ? <Button className="whitespace-nowrap" disabled={billingBusy !== null || billing.data?.configured === false} onClick={() => void billingAction("checkout")}>{billingBusy === "checkout" ? "Opening checkout…" : "Upgrade to Pro"}</Button> : <Badge tone="lime" className="px-2 py-1 font-medium" role="status">Pro active</Badge>}
          <Button variant="ghost" disabled={billingBusy !== null || billing.data?.configured === false} onClick={() => void billingAction("restore")}>{billingBusy === "restore" ? "Opening…" : "Restore purchase"}</Button>
          <Button variant="ghost" disabled={billingBusy !== null} onClick={() => void billingAction("refresh")}>{billingBusy === "refresh" ? "Checking…" : "Refresh Pro status"}</Button>
        </div>
        {billingMessage ? <p role="status" className="mt-3 text-[12px] text-mute">{billingMessage}</p> : null}
        {billing.data?.error ? <p role="alert" className="mt-2 text-[12px] text-rose">{billing.data.error}</p> : null}
      </section>
      <section className="mb-8" aria-label="Optional usage counts">
        <h2 className="text-[15px] font-medium">Local usage counts</h2>
        <p className="mt-2 text-[13px] text-mute">Off by default. Record feature counts on this device only: opens, first/second scans, a return in week two after consent, watchlist adds, share exports, digests, and upgrade opens. No URLs, domains, page data, scores, user IDs, or exact timestamps enter the exported counts. Nothing from before consent is reconstructed. Turning this off erases local counters.</p>
        <p className="mt-2 text-[12px] text-mute">Nothing is sent automatically. You can export and review the counts, then choose whether to share the file yourself.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button variant="ghost" disabled={usageBusy || usage.loading} onClick={() => void toggleUsage()}>{usageBusy ? "Updating…" : usage.data?.enabled ? "Usage counts on · turn off" : "Enable local usage counts"}</Button><Button variant="ghost" disabled={!usage.data?.enabled || usageBusy} onClick={() => { void usageStatus().then((value) => { downloadJson("linkscope-usage-counts.json", { formatVersion: 1, counts: value.counts }); usage.reload(); }).catch(() => setUsageMessage("Could not export usage counts.")); }}>Export counts for review</Button></div>
        {usageMessage ? <p role="status" className="mt-3 text-[12px] text-mute">{usageMessage}</p> : null}
      </section>
      <section className="mb-8" aria-label="Local backups">
        <h2 className="text-[15px] font-medium">Local backups & storage</h2>
        <p className="mt-2 mb-4 text-[14px] text-mute">Complete backups are available on every plan. They include scans, saved items, audits, alerts, watched sites, followed and ignored domains, preferences, and portable block domains. Payment tokens and browser permissions are never included. Updates keep your data local; uninstalling or losing this device can remove it.</p>
        <p className="mb-4 text-[12px] text-mute">{storage.data?.estimate?.usage !== undefined ? `Using ${(storage.data.estimate.usage / 1024 / 1024).toFixed(1)} MB. ` : ""}{storage.data?.persistent ? "Browser persistence protection is enabled; backups are still necessary." : "Browser persistence protection is not enabled or unavailable."}</p>
        {storage.error ? <p role="alert" className="mb-3 text-[12px] text-rose">Storage information unavailable: {storage.error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={backupBusy} onClick={() => void downloadBackup()}>{backupBusy ? "Working…" : "Download complete backup"}</Button>
          <Button variant="ghost" disabled={backupBusy} onClick={() => backupRef.current?.click()}>Restore complete backup</Button>
          <Button variant="ghost" disabled={backupBusy || storage.data?.persistent} onClick={() => { void navigator.storage?.persist().then((granted) => { setBackupMessage(granted ? "Browser persistence enabled. Keep backups for device loss or uninstall." : "The browser did not grant persistence. Keep regular backups."); storage.reload(); }).catch(() => setBackupError("The browser could not enable storage persistence.")); }}>Protect local storage</Button>
          <input ref={backupRef} type="file" accept="application/json,.json" className="hidden" aria-label="Choose complete backup" onChange={(event) => void restoreBackup(event.target.files?.[0])} />
        </div>
        {backupMessage ? <p role="status" className="mt-3 text-[13px] text-lime">{backupMessage}</p> : null}
        {backupError ? <p role="alert" className="mt-3 text-[13px] text-rose">{backupError}</p> : null}
        {cleanup.data ? <div className="mt-4 border border-line p-3"><p className="text-[13px] text-mute">History cleanup is paused after a restore. Saved scans remain protected when cleanup resumes.</p><Button variant="ghost" className="mt-2" disabled={backupBusy} onClick={() => { if (window.confirm("Resume automatic history cleanup? Unsaved scans outside LinkScope’s shared one-year device-storage window may be deleted on the next scan. Download a backup first.")) void resumeHistoryCleanup().then(() => cleanup.reload()).catch(() => setBackupError("Could not resume cleanup.")); }}>Resume history cleanup</Button></div> : null}
        {pendingBlocks.data?.length ? <div className="mt-4"><h3 className="text-[13px] font-medium">Restored blocks awaiting permission</h3><ul className="mt-2 divide-y divide-line">{pendingBlocks.data.map((domain) => <li key={domain} className="flex items-center justify-between gap-3 py-2"><span className="text-[12px]">{domain}</span><Button variant="ghost" disabled={backupBusy} onClick={() => void activateBlock(domain)}>Enable block</Button></li>)}</ul></div> : null}
      </section>
      <section className="mb-8">
        <h2 className="text-[15px] font-medium">Change alerts</h2>
        <p className="mt-2 mb-4 text-[14px] leading-relaxed text-mute">
          Notifications are off by default. Important watched-site or followed-domain changes can notify after a five-minute coalescing window, at most once per site per day. Notable activity stays in the local inbox. Recurring notifications retain Pro entitlements.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="text-[13px] text-mute">Notify me about
            <select className="ml-3 rounded-md border border-line bg-canvas p-2" value={delivery.data ?? "none"} disabled={delivery.loading} onChange={(event) => { void setNotificationMode(event.target.value as NotificationMode).then(delivery.reload).catch(() => setUsageMessage("Could not save notification preference.")); }}>
              <option value="none">Nothing</option><option value="important">Major tracker changes only</option><option value="weekly">Weekly summary</option><option value="important-weekly">Major changes + weekly summary</option>
            </select>
          </label>
        </div>
        <p className="mt-2 text-[12px] text-mute">Immediate and weekly delivery overlap only when you explicitly choose both. Weekly summaries stay quiet if no meaningful changes occurred.</p>
      </section>
      <section className="mb-8">
        <h2 className="text-[15px] font-medium">Ignored domains</h2>
        {ignored.data?.length ? (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {ignored.data.map((domain) => (
              <li key={domain} className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-[13px] text-ink">{domain}</span>
                <button
                  type="button"
                  className="text-[12px] text-mute underline hover:text-ink"
                  onClick={() => void setDomainIgnored(domain, false).then(() => ignored.reload())}
                >
                  Include again
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-mute">Domains you ignore from a report will appear here.</p>
        )}
      </section>
      <section className="mb-8">
        <h2 className="text-[15px] font-medium">Classification sources</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-mute">
          {LIST_ATTRIBUTION.domainCount.toLocaleString("en-US")} domains from {LIST_ATTRIBUTION.source} ({LIST_ATTRIBUTION.generatedAt}).
          Unknown still means unknown — not clean. Pattern matches are labeled separately as medium confidence.
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
          Pro can download every saved scan as one JSON archive. Single-scan exports and complete backups are available on every plan; duplicate imported scans are skipped.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={false} onClick={() => { if (!billing.data?.paid) { noteUsage("export-locked-clicked"); openUpgrade(); return; } void exportAll(); }}>
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
        {!billing.data?.paid ? <p className="mt-3 text-[12px] text-mute">Pro adds recurring monitoring and bulk exports. Complete local backups remain free.</p> : null}
      </section>
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
