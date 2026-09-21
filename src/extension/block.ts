import { db } from "@/src/storage/database";

const UBLOCK_IDS = [
  "cjpalhdlnbpafiamejdnhcphjbkeiagm",
  "ddkjiahejlhfcafbddmgiahcphecmpfh",
];

const RESOURCE_TYPES = [
  "script",
  "image",
  "xmlhttprequest",
  "sub_frame",
  "ping",
  "media",
  "websocket",
  "font",
  "stylesheet",
  "other",
] as const;

const BLOCKED_DOMAINS_KEY = "blocked-domains";

export function uBlockFilter(domain: string): string {
  return `||${domain}^`;
}

function ruleIdFor(domain: string): number {
  let hash = 0;
  for (const char of domain) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return (Math.abs(hash) % 900_000) + 100;
}

function originsFor(domain: string): string[] {
  return [`*://${domain}/*`, `*://*.${domain}/*`];
}

function ruleFor(domain: string) {
  return {
    id: ruleIdFor(domain),
    priority: 1,
    action: { type: "block" as const },
    condition: {
      requestDomains: [domain],
      resourceTypes: [...RESOURCE_TYPES],
    },
  };
}

async function readRememberedBlocks(): Promise<string[]> {
  const row = await db.settings.get(BLOCKED_DOMAINS_KEY);
  try {
    const value: unknown = JSON.parse(row?.value ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function writeRememberedBlocks(domains: string[]): Promise<void> {
  await db.settings.put({
    key: BLOCKED_DOMAINS_KEY,
    value: JSON.stringify([...new Set(domains)].sort()),
  });
}

async function rememberBlockedDomain(domain: string): Promise<void> {
  const domains = await readRememberedBlocks();
  if (domains.includes(domain)) return;
  await writeRememberedBlocks([...domains, domain]);
}

async function forgetBlockedDomain(domain: string): Promise<void> {
  await writeRememberedBlocks(
    (await readRememberedBlocks()).filter((item) => item !== domain),
  );
}

async function currentRuleDomains(): Promise<string[]> {
  if (!browser.declarativeNetRequest?.getDynamicRules) return [];
  const rules = await browser.declarativeNetRequest.getDynamicRules();
  return Array.from(
    new Set(
      rules
        .filter((rule) => rule.action.type === "block")
        .flatMap((rule) => rule.condition.requestDomains ?? []),
    ),
  );
}

async function applyBlockRule(domain: string): Promise<boolean> {
  if (!browser.declarativeNetRequest?.updateDynamicRules) return false;
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleIdFor(domain)],
    addRules: [ruleFor(domain)],
  });
  await rememberBlockedDomain(domain);
  return true;
}

export async function isDomainBlocked(domain: string): Promise<boolean> {
  const normalized = domain.toLowerCase();
  if ((await readRememberedBlocks()).includes(normalized)) return true;
  if (!browser.declarativeNetRequest?.getDynamicRules) return false;
  const id = ruleIdFor(normalized);
  const rules = await browser.declarativeNetRequest.getDynamicRules();
  return rules.some((rule) => rule.id === id);
}

export async function unblockDomain(domain: string): Promise<void> {
  const normalized = domain.toLowerCase();
  if (browser.declarativeNetRequest?.updateDynamicRules) {
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ruleIdFor(normalized)],
    });
  }
  await forgetBlockedDomain(normalized);
}

export async function copyBlockRule(domain: string): Promise<void> {
  await navigator.clipboard.writeText(uBlockFilter(domain));
}

export async function blockDomain(
  domain: string,
): Promise<"blocked" | "copied"> {
  const normalized = domain.toLowerCase();
  try {
    const granted = await browser.permissions.request({
      origins: originsFor(normalized),
    });
    if (!granted || !(await applyBlockRule(normalized))) {
      await copyBlockRule(normalized);
      return "copied";
    }
    return "blocked";
  } catch {
    await copyBlockRule(normalized);
    return "copied";
  }
}

/** Re-apply host-scoped block rules after updates or permission changes. */
export async function restorePersistedBlockRules(): Promise<void> {
  if (!browser.declarativeNetRequest?.updateDynamicRules) return;
  const remembered = await readRememberedBlocks();
  const active = await currentRuleDomains();
  const combined = [...new Set([...remembered, ...active])];
  await writeRememberedBlocks(combined);
  for (const domain of combined) {
    if (active.includes(domain)) continue;
    const granted = browser.permissions?.contains
      ? await browser.permissions.contains({ origins: originsFor(domain) })
      : false;
    if (!granted) continue;
    await applyBlockRule(domain).catch(() => undefined);
  }
}

export async function openUBlockDashboard(): Promise<boolean> {
  for (const id of UBLOCK_IDS) {
    try {
      await browser.tabs.create({
        url: `chrome-extension://${id}/dashboard.html#1`,
      });
      return true;
    } catch {
      // Extension missing or the URL is blocked.
    }
  }
  return false;
}
