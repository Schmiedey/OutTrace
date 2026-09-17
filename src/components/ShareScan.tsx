import { useEffect, useRef, useState } from "react";
import { createShareCard } from "@/src/export/shareCard";
import { downloadBlob } from "@/src/export/scanExport";
import { noteUsage } from "@/src/telemetry/usage";
import type { ScanRow, ScanGraphSnapshot } from "@/src/types/graph";
import { Button } from "./ui/button";

export function ShareScan({ scan, snapshot }: { scan: ScanRow; snapshot: ScanGraphSnapshot }) {
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (preview) dialog.current?.showModal();
    return () => { if (preview) URL.revokeObjectURL(preview.url); };
  }, [preview]);
  const close = () => { dialog.current?.close(); setPreview(null); };
  return <>
    <Button variant="ghost" disabled={busy} onClick={() => {
      setBusy(true); setError(null);
      void createShareCard(scan, snapshot).then((blob) => setPreview({ blob, url: URL.createObjectURL(blob) })).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not make share card.")).finally(() => setBusy(false));
    }}>{busy ? "Creating card…" : "Share this scan"}</Button>
    {error ? <p role="alert" className="text-[12px] text-rose">{error}</p> : null}
    <dialog ref={dialog} aria-label="Preview scan share card" className="m-auto max-w-3xl rounded-lg border border-line bg-canvas p-5 text-ink backdrop:bg-black/40" onCancel={() => setPreview(null)}>
      <h2 className="font-display text-2xl">Share this scan</h2>
      <p className="my-3 text-[13px] text-mute">This public card includes the site domain, capture date, score, and counts—not the page path, title, or scan evidence. Nothing is uploaded. Download the PNG, then share it wherever you choose.</p>
      {preview ? <img src={preview.url} width={1200} height={630} alt={`LinkScope scan of ${scan.domain}`} className="mb-4 w-full rounded border border-line" /> : null}
      <div className="flex gap-2"><Button disabled={!preview} onClick={() => { if (preview) { downloadBlob(`linkscope-${scan.domain}-scan.png`, preview.blob); noteUsage("share-card-exported"); close(); } }}>Download PNG · 1200 × 630</Button><Button variant="ghost" onClick={close}>Cancel</Button></div>
    </dialog>
  </>;
}
