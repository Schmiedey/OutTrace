export const POPUP_FRESH_MS = 30 * 60 * 1000;
export function popupScanIsDue(
  timestamp: number | undefined,
  now = Date.now(),
): boolean {
  return timestamp === undefined || now - timestamp >= POPUP_FRESH_MS;
}
/** Render local content before scanning; a failed refresh never clears it. */
export async function loadCachedFirst<
  T extends { latest: { timestamp: number } },
>(options: {
  load: () => Promise<T | null>;
  render: (value: T | null) => void;
  refresh: () => Promise<void>;
  isAlive?: () => boolean;
  now?: number;
  /** Keep the popup read-only until the user explicitly starts a check. */
  autoRefresh?: boolean;
}): Promise<void> {
  const alive = options.isAlive ?? (() => true);
  const cached = await options.load();
  if (!alive()) return;
  options.render(cached);
  if (options.autoRefresh === false) return;
  if (!popupScanIsDue(cached?.latest.timestamp, options.now)) return;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (!alive()) return;
  await options.refresh();
  if (!alive()) return;
  const refreshed = await options.load();
  if (alive()) options.render(refreshed ?? cached);
}
