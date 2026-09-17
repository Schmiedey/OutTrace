import { db } from "@/src/storage/database";

const NOTIFICATIONS_KEY = "notifications";
const AUTOMATIC_PROTECTION_KEY = "automatic-protection";
const ALERT_SENSITIVITY_KEY = "alert-sensitivity";
const DIGEST_FREQUENCY_KEY = "digest-frequency";
const IGNORED_DOMAINS_KEY = "ignored-domains";

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
