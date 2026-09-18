import { db } from "@/src/storage/database";

const NOTIFICATIONS_KEY = "notifications";
const AUTOMATIC_PROTECTION_KEY = "automatic-protection";
const ALERT_SENSITIVITY_KEY = "alert-sensitivity";
const DIGEST_FREQUENCY_KEY = "digest-frequency";
const IGNORED_DOMAINS_KEY = "ignored-domains";
const SHORTCUT_PROMO_KEY = "shortcut-promo";
const SHORTCUT_USED_KEY = "shortcut-used-at";
const NEW_TAB_KEY = "newtab-widget";
const FREE_AUDIT_DAY_KEY = "free-audit-day";

export type AlertSensitivity = "important" | "all";
export type DigestFrequency = "daily" | "weekly";

export async function notificationsEnabled(): Promise<boolean> {
  const row = await db.settings.get(NOTIFICATIONS_KEY);
  if (!row) return false;
  return row.value === "true";
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await db.settings.put({ key: NOTIFICATIONS_KEY, value: enabled ? "true" : "false" });
}

export type NotificationMode = "none" | "important" | "weekly" | "important-weekly";
export async function notificationMode(): Promise<NotificationMode> {
  if (!(await notificationsEnabled())) return "none";
  const value = (await db.settings.get("notification-mode"))?.value;
  return value === "none" || value === "weekly" || value === "important-weekly" ? value : "important";
}
export async function setNotificationMode(value: NotificationMode): Promise<void> {
  await db.transaction("rw", db.settings, async () => {
    await db.settings.put({ key: "notification-mode", value });
    await setNotificationsEnabled(value !== "none");
    if (value === "weekly" || value === "important-weekly") await setDigestFrequency("weekly");
  });
}

export type ProtectionPromptState = "never-seen" | "dismissed" | "enabled";
export async function protectionPromptState(): Promise<ProtectionPromptState> {
  const value = (await db.settings.get("automatic-protection-prompt"))?.value;
  return value === "dismissed" || value === "enabled" ? value : "never-seen";
}
export async function setProtectionPromptState(value: ProtectionPromptState): Promise<void> {
  await db.settings.put({ key: "automatic-protection-prompt", value });
}

export async function automaticProtectionEnabled(): Promise<boolean> {
  const row = await db.settings.get(AUTOMATIC_PROTECTION_KEY);
  return row?.value === "true";
}

export async function setAutomaticProtectionEnabled(enabled: boolean): Promise<void> {
  await db.settings.put({ key: AUTOMATIC_PROTECTION_KEY, value: enabled ? "true" : "false" });
}

export async function alertSensitivity(): Promise<AlertSensitivity> {
  const row = await db.settings.get(ALERT_SENSITIVITY_KEY);
  return row?.value === "all" ? "all" : "important";
}

export async function setAlertSensitivity(value: AlertSensitivity): Promise<void> {
  await db.settings.put({ key: ALERT_SENSITIVITY_KEY, value });
}

export async function digestFrequency(): Promise<DigestFrequency> {
  const row = await db.settings.get(DIGEST_FREQUENCY_KEY);
  return row?.value === "daily" ? "daily" : "weekly";
}

export async function setDigestFrequency(value: DigestFrequency): Promise<void> {
  await db.settings.put({ key: DIGEST_FREQUENCY_KEY, value });
}

export async function listIgnoredDomains(): Promise<string[]> {
  const row = await db.settings.get(IGNORED_DOMAINS_KEY);
  if (!row?.value) return [];
  try {
    const value = JSON.parse(row.value) as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function setDomainIgnored(domain: string, ignored: boolean): Promise<void> {
  const normalized = domain.trim().toLowerCase();
  const domains = new Set(await listIgnoredDomains());
  if (ignored) domains.add(normalized);
  else domains.delete(normalized);
  await db.settings.put({ key: IGNORED_DOMAINS_KEY, value: JSON.stringify(Array.from(domains).sort()) });
}

export async function isDomainIgnored(domain: string): Promise<boolean> {
  return (await listIgnoredDomains()).includes(domain.trim().toLowerCase());
}

/** The browser's normal new-tab page remains the default until opted in. */
export async function newTabEnabled(): Promise<boolean> {
  return (await db.settings.get(NEW_TAB_KEY))?.value === "true";
}

export async function setNewTabEnabled(enabled: boolean): Promise<void> {
  await db.settings.put({ key: NEW_TAB_KEY, value: enabled ? "true" : "false" });
}

function localCalendarDay(now = Date.now()): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type FreeAuditQuotaState = { day: string };

function readFreeAuditQuotaState(value: string | undefined): FreeAuditQuotaState | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<FreeAuditQuotaState>;
    return typeof parsed.day === "string" ? { day: parsed.day } : undefined;
  } catch {
    return undefined;
  }
}

/** Free users get one site audit per local calendar day. */
export async function hasUsedFreeAuditToday(now = Date.now()): Promise<boolean> {
  const state = readFreeAuditQuotaState((await db.settings.get(FREE_AUDIT_DAY_KEY))?.value);
  return state?.day === localCalendarDay(now);
}

/**
 * Atomically claims today's free site-audit allowance. An audit that already
 * claimed the allowance can be resumed after a worker restart without
 * consuming a second allowance.
 */
export async function claimFreeAuditToday(auditId: number, now = Date.now()): Promise<boolean> {
  return await db.transaction("rw", db.settings, db.audits, async () => {
    const audit = await db.audits.get(auditId);
    if (audit?.freeAuditClaimed) return true;

    const day = localCalendarDay(now);
    const state = readFreeAuditQuotaState((await db.settings.get(FREE_AUDIT_DAY_KEY))?.value);
    if (state?.day === day) return false;

    await db.settings.put({ key: FREE_AUDIT_DAY_KEY, value: JSON.stringify({ day }) });
    if (audit) await db.audits.update(auditId, { freeAuditClaimed: true });
    return true;
  });
}

type ShortcutPromoState = { impressions: number; lastShownAt?: number };
export async function shouldShowShortcutPromo(now = Date.now()): Promise<boolean> {
  if (await db.settings.get(SHORTCUT_USED_KEY)) return false;
  const row = await db.settings.get(SHORTCUT_PROMO_KEY);
  let state: ShortcutPromoState = { impressions: 0 };
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as Partial<ShortcutPromoState>;
      if (typeof parsed.impressions === "number") {
        state = { impressions: parsed.impressions, lastShownAt: parsed.lastShownAt };
      }
    } catch {
      // A damaged promo preference should not stop the popup from opening.
    }
  }
  return state.impressions === 0 || (state.impressions === 1 && now - (state.lastShownAt ?? 0) >= 7 * 24 * 60 * 60 * 1000);
}
export async function recordShortcutPromoImpression(now = Date.now()): Promise<void> {
  const row = await db.settings.get(SHORTCUT_PROMO_KEY);
  let impressions = 0;
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as Partial<ShortcutPromoState>;
      if (typeof parsed.impressions === "number") impressions = parsed.impressions;
    } catch {
      // Start a fresh bounded counter if an old preference was malformed.
    }
  }
  await db.settings.put({ key: SHORTCUT_PROMO_KEY, value: JSON.stringify({ impressions: Math.min(2, impressions + 1), lastShownAt: now }) });
}
export async function recordShortcutUsed(): Promise<void> {
  await db.settings.put({ key: SHORTCUT_USED_KEY, value: String(Date.now()) });
}
