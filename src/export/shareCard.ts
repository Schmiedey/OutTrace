import { scoreSnapshot, scoreSummary, scoreVerdict } from "@/src/analysis/score";
import type { ScanGraphSnapshot, ScanRow } from "@/src/types/graph";

export const SHARE_CARD_URL = "linkscope.dev";

export function shareCardData(scan: ScanRow, snapshot: ScanGraphSnapshot) {
  const score = scoreSnapshot(snapshot);
  // Explicit public surface: never include page paths, titles, queries, or evidence.
  return { site: scan.domain, score: score.score, verdict: scoreVerdict(score), summary: scoreSummary(score), trackers: score.trackers, unknown: score.unknown, captured: new Date(scan.timestamp).toISOString().slice(0, 10), modelVersion: score.modelVersion };
}

function fitText(ctx: CanvasRenderingContext2D, value: string, width: number): string {
  let text = value;
  while (text.length && ctx.measureText(text).width > width) text = text.slice(0, -1);
  return text === value ? text : `${text.slice(0, -1)}…`;
}

export async function createShareCard(scan: ScanRow, snapshot: ScanGraphSnapshot): Promise<Blob> {
  await document.fonts.ready;
  const data = shareCardData(scan, snapshot);
  const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not create a share card.");
  ctx.fillStyle = "#faf9f6"; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#171717"; ctx.fillRect(0, 0, 14, 630);
  ctx.font = "600 24px 'IBM Plex Sans', sans-serif"; ctx.fillText("OUTTRACE", 60, 64);
  ctx.fillStyle = "#737373"; ctx.font = "20px 'IBM Plex Sans', sans-serif"; ctx.fillText(`Captured ${data.captured}`, 850, 64);
  ctx.fillStyle = "#171717"; ctx.font = "48px 'IBM Plex Sans', sans-serif"; ctx.fillText(fitText(ctx, data.site, 1070), 60, 148);
  const color = data.score >= 70 ? "#3f6212" : data.score >= 40 ? "#92400e" : "#b91c1c";
  ctx.fillStyle = color; ctx.font = "600 150px 'IBM Plex Sans', sans-serif"; ctx.fillText(String(data.score), 60, 330);
  ctx.fillStyle = "#737373"; ctx.font = "28px 'IBM Plex Sans', sans-serif"; ctx.fillText("/ 100", 320, 330);
  ctx.fillStyle = "#171717"; ctx.font = "28px 'IBM Plex Sans', sans-serif"; ctx.fillText("Tracking exposure score", 60, 384);
  ctx.font = "600 31px 'IBM Plex Sans', sans-serif"; ctx.fillText(fitText(ctx, data.verdict, 650), 490, 255);
  ctx.font = "27px 'IBM Plex Sans', sans-serif"; ctx.fillText(`${data.trackers} classified tracking ${data.trackers === 1 ? "domain" : "domains"}`, 490, 310);
  ctx.fillStyle = "#737373"; ctx.font = "23px 'IBM Plex Sans', sans-serif"; ctx.fillText(`${data.unknown} unclassified resource ${data.unknown === 1 ? "domain" : "domains"}`, 490, 350);
  ctx.strokeStyle = "#d4d4d4"; ctx.beginPath(); ctx.moveTo(60, 442); ctx.lineTo(1140, 442); ctx.stroke();
  ctx.fillStyle = "#171717"; ctx.font = "24px 'IBM Plex Sans', sans-serif"; ctx.fillText("See what a client page connects to. Keep scans local.", 60, 490);
  ctx.fillStyle = "#737373"; ctx.font = "18px 'IBM Plex Sans', sans-serif";
  ctx.fillText(`Heuristic model v${data.modelVersion} · One capture, not a safety certification.`, 60, 542);
  ctx.fillText("Higher = less classified tracking found. Unknown does not mean safe.", 60, 574);
  // A simple linked-node brand mark; all rendering is local and deterministic.
  ctx.strokeStyle = "#171717"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(1080, 525); ctx.lineTo(1120, 565); ctx.stroke();
  for (const [x, y] of [[1080, 525], [1120, 565]]) { ctx.beginPath(); ctx.arc(x!, y!, 12, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = "#737373"; ctx.font = "600 18px 'IBM Plex Sans', sans-serif"; ctx.textAlign = "right"; ctx.fillText(SHARE_CARD_URL, 1140, 610); ctx.textAlign = "left";
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png"));
}
