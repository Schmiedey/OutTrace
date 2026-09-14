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

export async function copyBlockRule(domain: string): Promise<void> {
  await navigator.clipboard.writeText(uBlockFilter(domain));
}

export async function blockDomain(domain: string): Promise<"blocked" | "copied"> {
  const normalized = domain.toLowerCase();
  try {
    const granted = await browser.permissions.request({ origins: originsFor(normalized) });
    if (!granted || !browser.declarativeNetRequest?.updateDynamicRules) {
      await copyBlockRule(normalized);
      return "copied";
    }
    const id = ruleIdFor(normalized);
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [id],
      addRules: [
        {
          id,
          priority: 1,
          action: { type: "block" },
          condition: {
            requestDomains: [normalized],
            resourceTypes: [...RESOURCE_TYPES],
          },
        },
      ],
    });
    return "blocked";
  } catch {
    await copyBlockRule(normalized);
    return "copied";
  }
}

export async function openUBlockDashboard(): Promise<boolean> {
  for (const id of UBLOCK_IDS) {
    try {
      await browser.tabs.create({ url: `chrome-extension://${id}/dashboard.html#1` });
      return true;
    } catch {
      // Extension missing or the URL is blocked.
    }
  }
  return false;
}
