import { describeDomain } from "@/src/analysis/categorizer";
import {
  CATEGORY_LABELS,
  type ClassificationConfidence,
  type ClassificationSource,
  type DomainCategory,
} from "@/src/types/graph";

export type DomainRisk = "low" | "medium" | "high";

export type DomainIdentity = {
  domain: string;
  name: string;
  category: DomainCategory;
  typeLabel: string;
  owner?: string;
  listed: boolean;
  classificationSource: ClassificationSource;
  classificationConfidence: ClassificationConfidence;
  risk: DomainRisk;
  usedFor: string;
};

const NAMES: Record<string, string> = {
  "google-analytics.com": "Google Analytics",
  "googletagmanager.com": "Google Tag Manager",
  "analytics.google.com": "Google Analytics",
  "doubleclick.net": "Google DoubleClick",
  "googlesyndication.com": "Google Ads",
  "googleadservices.com": "Google Ads",
  "googletagservices.com": "Google Publisher Tags",
  "gstatic.com": "Google Static",
  "googleapis.com": "Google APIs",
  "google.com": "Google",
  "youtube.com": "YouTube",
  "ytimg.com": "YouTube images",
  "googlevideo.com": "YouTube video",
  "facebook.com": "Facebook",
  "facebook.net": "Meta Pixel",
  "fbcdn.net": "Facebook CDN",
  "instagram.com": "Instagram",
  "twitter.com": "X / Twitter",
  "ads-twitter.com": "X Ads",
  "twimg.com": "X images",
  "linkedin.com": "LinkedIn",
  "segment.io": "Segment",
  "segment.com": "Segment",
  "mixpanel.com": "Mixpanel",
  "amplitude.com": "Amplitude",
  "hotjar.com": "Hotjar",
  "fullstory.com": "FullStory",
  "posthog.com": "PostHog",
  "plausible.io": "Plausible",
  "clarity.ms": "Microsoft Clarity",
  "scorecardresearch.com": "Comscore",
  "newrelic.com": "New Relic",
  "nr-data.net": "New Relic",
  "sentry.io": "Sentry",
  "datadoghq.com": "Datadog",
  "cloudflare.com": "Cloudflare",
  "cloudflareinsights.com": "Cloudflare Insights",
  "cloudfront.net": "Amazon CloudFront",
  "akamaihd.net": "Akamai",
  "fastly.net": "Fastly",
  "jsdelivr.net": "jsDelivr",
  "stripe.com": "Stripe",
  "stripe.network": "Stripe",
  "js.stripe.com": "Stripe.js",
  "paypal.com": "PayPal",
  "amazon-adsystem.com": "Amazon Ads",
  "criteo.com": "Criteo",
  "taboola.com": "Taboola",
  "outbrain.com": "Outbrain",
  "adnxs.com": "Xandr / AppNexus",
  "adsrvr.org": "The Trade Desk",
  "intercom.io": "Intercom",
  "zendesk.com": "Zendesk",
  "auth0.com": "Auth0",
  "okta.com": "Okta",
  "recaptcha.net": "reCAPTCHA",
  "onetrust.com": "OneTrust",
  "cookielaw.org": "OneTrust",
  "shopify.com": "Shopify",
  "vercel.com": "Vercel",
  "githubassets.com": "GitHub assets",
  "redditstatic.com": "Reddit static",
  "redditmedia.com": "Reddit media",
};

const NAME_SUFFIXES = Object.keys(NAMES).sort((a, b) => b.length - a.length);

const USED_FOR: Record<DomainCategory, string> = {
  origin: "This is the website you opened.",
  analytics: "Measures how people use the page.",
  advertising: "Advertising and conversion tracking.",
  payments: "Handles checkout or card payments.",
  cdn: "Serves files such as scripts, images, or fonts.",
  hosting: "Hosts the site or an app on this page.",
  authentication: "Sign-in, accounts, or identity.",
  social: "Social buttons, embeds, or audience tools.",
  media: "Embedded video, audio, or players.",
  security: "Bot checks, consent, or fraud protection.",
  support: "Chat, help widgets, or customer tools.",
  infrastructure: "APIs, fonts, or other behind-the-scenes services.",
  telemetry: "Error, performance, or usage reporting.",
  unknown: "Not on OutTrace’s known list yet.",
};

function namedFromSuffix(domain: string): string | undefined {
  const normalized = domain.toLowerCase();
  const direct = NAMES[normalized];
  if (direct) return direct;
  for (const suffix of NAME_SUFFIXES) {
    if (normalized === suffix || normalized.endsWith(`.${suffix}`)) return NAMES[suffix];
  }
  return undefined;
}

export function riskForCategory(category: DomainCategory): DomainRisk {
  if (category === "advertising") return "high";
  if (category === "analytics" || category === "telemetry" || category === "social" || category === "unknown") {
    return "medium";
  }
  return "low";
}

export function riskLabel(risk: DomainRisk): string {
  if (risk === "high") return "High";
  if (risk === "medium") return "Medium";
  return "Low";
}

export function identifyDomain(domain: string): DomainIdentity {
  const listed = describeDomain(domain);
  const category = listed.category || "unknown";
  const name = namedFromSuffix(domain) || listed.owner?.trim() || domain || "Unknown";
  return {
    domain,
    name,
    category,
    typeLabel: CATEGORY_LABELS[category],
    owner: listed.owner,
    listed: listed.listed,
    classificationSource: listed.source,
    classificationConfidence: listed.confidence,
    risk: riskForCategory(category),
    usedFor: USED_FOR[category],
  };
}

export function classificationLabel(
  source: ClassificationSource,
  confidence: ClassificationConfidence,
): string {
  const sourceLabel =
    source === "curated-list"
      ? "OutTrace list"
      : source === "heuristic"
        ? "Domain-name heuristic"
        : source === "first-party"
          ? "First-party match"
          : "No matching source";
  return `${confidence[0]?.toUpperCase() ?? ""}${confidence.slice(1)} confidence · ${sourceLabel}`;
}

export function seenOnShare(seenOnCount: number, siteCount: number): string {
  if (siteCount <= 0 || seenOnCount <= 0) return "First time in your history";
  const pct = Math.round((seenOnCount / siteCount) * 100);
  if (pct >= 99) return "On every site you've checked";
  if (seenOnCount === 1) return `On 1 of ${String(siteCount)} sites you've checked`;
  if (pct <= 1) return `On ${String(seenOnCount)} of ${String(siteCount)} sites you've checked`;
  return `On ${String(pct)}% of sites you've checked`;
}
