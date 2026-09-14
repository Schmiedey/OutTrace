import type {
  ClassificationConfidence,
  ClassificationSource,
  DomainCategory,
} from "@/src/types/graph";

const SEED: Record<string, DomainCategory> = {
  "google-analytics.com": "analytics",
  "googletagmanager.com": "analytics",
  "analytics.google.com": "analytics",
  "mixpanel.com": "analytics",
  "amplitude.com": "analytics",
  "segment.com": "analytics",
  "segment.io": "analytics",
  "hotjar.com": "analytics",
  "fullstory.com": "analytics",
  "heap.io": "analytics",
  "plausible.io": "analytics",
  "umami.is": "analytics",
  "posthog.com": "analytics",
  "clarity.ms": "analytics",
  "mouseflow.com": "analytics",
  "crazyegg.com": "analytics",
  "quantcast.com": "analytics",
  "scorecardresearch.com": "analytics",
  "chartbeat.com": "analytics",
  "parsely.com": "analytics",
  "parse.ly": "analytics",
  "newrelic.com": "telemetry",
  "nr-data.net": "telemetry",
  "sentry.io": "telemetry",
  "sentry-cdn.com": "telemetry",
  "bugsnag.com": "telemetry",
  "datadoghq.com": "telemetry",
  "datad0g.com": "telemetry",
  "rollbar.com": "telemetry",
  "logrocket.com": "telemetry",
  "raygun.io": "telemetry",
  "doubleclick.net": "advertising",
  "googlesyndication.com": "advertising",
  "googleadservices.com": "advertising",
  "googletagservices.com": "advertising",
  "ads-twitter.com": "advertising",
  "adsystem.com": "advertising",
  "amazon-adsystem.com": "advertising",
  "criteo.com": "advertising",
  "taboola.com": "advertising",
  "outbrain.com": "advertising",
  "pubmatic.com": "advertising",
  "rubiconproject.com": "advertising",
  "openx.net": "advertising",
  "advertising.com": "advertising",
  "adnxs.com": "advertising",
  "casalemedia.com": "advertising",
  "contextweb.com": "advertising",
  "indexww.com": "advertising",
  "33across.com": "advertising",
  "teads.tv": "advertising",
  "spotxchange.com": "advertising",
  "adsafeprotected.com": "advertising",
  "moatads.com": "advertising",
  "adsrvr.org": "advertising",
  "bidswitch.net": "advertising",
  "stripe.com": "payments",
  "stripe.network": "payments",
  "js.stripe.com": "payments",
  "paypal.com": "payments",
  "paypalobjects.com": "payments",
  "braintreegateway.com": "payments",
  "braintree-api.com": "payments",
  "squareup.com": "payments",
  "square.com": "payments",
  "adyen.com": "payments",
  "checkout.com": "payments",
  "paddle.com": "payments",
  "shopify.com": "payments",
  "shopifycdn.com": "cdn",
  "cloudflare.com": "cdn",
  "cloudflareinsights.com": "telemetry",
  "cloudflarestream.com": "cdn",
  "akamaihd.net": "cdn",
  "akamaized.net": "cdn",
  "akamai.net": "cdn",
  "fastly.net": "cdn",
  "fastlylb.net": "cdn",
  "cloudfront.net": "cdn",
  "azureedge.net": "cdn",
  "jsdelivr.net": "cdn",
  "unpkg.com": "cdn",
  "bootstrapcdn.com": "cdn",
  "gstatic.com": "cdn",
  "googleusercontent.com": "cdn",
  "fbcdn.net": "cdn",
  "twimg.com": "cdn",
  "ytimg.com": "media",
  "redditstatic.com": "cdn",
  "redditmedia.com": "cdn",
  "redd.it": "media",
  "staticflickr.com": "cdn",
  "jquery.com": "cdn",
  "cloudinary.com": "cdn",
  "imgix.net": "cdn",
  "vercel.com": "hosting",
  "vercel-insights.com": "telemetry",
  "vercel-analytics.com": "analytics",
  "netlify.app": "hosting",
  "netlify.com": "hosting",
  "herokuapp.com": "hosting",
  "github.io": "hosting",
  "pages.dev": "hosting",
  "workers.dev": "hosting",
  "fly.dev": "hosting",
  "railway.app": "hosting",
  "render.com": "hosting",
  "amazonaws.com": "hosting",
  "awsstatic.com": "cdn",
  "auth0.com": "authentication",
  "okta.com": "authentication",
  "oktacdn.com": "authentication",
  "clerk.com": "authentication",
  "clerk.dev": "authentication",
  "supabase.co": "authentication",
  "onelogin.com": "authentication",
  "pingidentity.com": "authentication",
  "recaptcha.net": "security",
  "hcaptcha.com": "security",
  "facebook.com": "social",
  "facebook.net": "advertising",
  "instagram.com": "social",
  "twitter.com": "social",
  "x.com": "social",
  "t.co": "social",
  "linkedin.com": "social",
  "licdn.com": "cdn",
  "pinterest.com": "social",
  "pinimg.com": "cdn",
  "tiktok.com": "social",
  "tiktokcdn.com": "cdn",
  "snapchat.com": "social",
  "sc-cdn.net": "cdn",
  "youtube.com": "media",
  "youtu.be": "media",
  "googlevideo.com": "media",
  "vimeo.com": "media",
  "vimeocdn.com": "cdn",
  "twitch.tv": "media",
  "jtvnw.net": "cdn",
  "jwplayer.com": "media",
  "brightcove.com": "media",
  "soundcloud.com": "media",
  "spotify.com": "media",
  "intercom.io": "support",
  "intercomcdn.com": "cdn",
  "zendesk.com": "support",
  "zdassets.com": "cdn",
  "crisp.chat": "support",
  "drift.com": "support",
  "helpscout.net": "support",
  "freshdesk.com": "support",
  "tawk.to": "support",
  "hubspot.com": "support",
  "hs-scripts.com": "support",
  "hs-analytics.net": "analytics",
  "hubspotusercontent.com": "cdn",
  "google.com": "infrastructure",
  "googleapis.com": "infrastructure",
  "ggpht.com": "cdn",
  "apple.com": "infrastructure",
  "microsoft.com": "infrastructure",
  "office.com": "infrastructure",
  "live.com": "infrastructure",
  "gravatar.com": "cdn",
  "polyfill.io": "cdn",
  "typekit.net": "cdn",
  "fonts.net": "cdn",
  "fontawesome.com": "cdn",
  "cookiebot.com": "security",
  "onetrust.com": "security",
  "cookielaw.org": "security",
  "trustarc.com": "security",
  "adjust.com": "advertising",
  "adj.st": "advertising",
  "ophan.co.uk": "analytics",
  "permutive.com": "analytics",
  "snowplowanalytics.com": "analytics",
  "snowplow.io": "analytics",
  "matomo.cloud": "analytics",
  "matomo.org": "analytics",
  "statsig.com": "analytics",
  "optimizely.com": "analytics",
  "launchdarkly.com": "analytics",
  "branch.io": "analytics",
  "appsflyer.com": "analytics",
  "kochava.com": "analytics",
  "fb.com": "social",
  "githubassets.com": "cdn",
  "githubusercontent.com": "cdn",
  "github.blog": "media",
  "ctfassets.net": "cdn",
  "contentful.com": "cdn",
  "guim.co.uk": "cdn",
  "stripecdn.com": "cdn",
  "stripeassets.com": "cdn",
  "wikimedia.org": "cdn",
  "youtube-nocookie.com": "media",
  "mastodon.social": "social",
  "bsky.app": "social",
  "bsky.social": "social",
  "threads.net": "social",
  "threads.com": "social",
  "blueskyweb.xyz": "social",
  "gartner.com": "support",
};

const SORTED_SUFFIXES = Object.keys(SEED).sort((a, b) => b.length - a.length);

export const LIST_ATTRIBUTION = {
  source: "LinkScope curated classifications",
  license: "Original LinkScope project data",
  homepage: "https://github.com/Schmiedey/linkscope",
  generatedAt: "2026-09-14",
  domainCount: SORTED_SUFFIXES.length,
} as const;

export type DomainDescription = {
  category: DomainCategory;
  owner?: string;
  listed: boolean;
  source: ClassificationSource;
  confidence: ClassificationConfidence;
};

function categorizeFromSeed(domain: string): DomainCategory | null {
  const normalized = domain.toLowerCase();
  for (const suffix of SORTED_SUFFIXES) {
    if (normalized === suffix || normalized.endsWith(`.${suffix}`)) {
      return SEED[suffix] ?? null;
    }
  }
  return null;
}

export function describeDomain(domain: string): DomainDescription {
  const seed = categorizeFromSeed(domain);
  const pattern = categorizeByPattern(domain.toLowerCase());
  if (seed) {
    return {
      category: seed,
      listed: true,
      source: "curated-list",
      confidence: "high",
    };
  }
  if (pattern) {
    return {
      category: pattern,
      listed: false,
      source: "heuristic",
      confidence: "medium",
    };
  }
  return {
    category: "unknown",
    listed: false,
    source: "unknown",
    confidence: "low",
  };
}

export function categorizeDomain(domain: string): DomainCategory {
  return describeDomain(domain).category;
}

function categorizeByPattern(domain: string): DomainCategory | null {
  if (
    /doubleclick|googlesyndication|googleadservices|adsystem|adservice|adnxs|rubicon|criteo|taboola|outbrain|pubmatic|adsrvr|moatads|adsafeprotected/.test(
      domain,
    )
  ) {
    return "advertising";
  }
  if (
    /google-analytics|googletagmanager|hotjar|chartbeat|segment\.|mixpanel|amplitude|scorecardresearch|ophan|permutive|snowplow|matomo/.test(
      domain,
    )
  ) {
    return "analytics";
  }
  if (/sentry|datadog|newrelic|bugsnag|logrocket|cloudflareinsights|nr-data/.test(domain)) {
    return "telemetry";
  }
  if (/(^|\.)(facebook|instagram|linkedin|tiktok|pinterest|snapchat)\./.test(domain)) return "social";
  if (/(cdn|assets|static|images)\./.test(domain) || /(cdn|assets|static)$/.test(domain.split(".")[0] ?? "")) {
    return "cdn";
  }
  return null;
}

export function isTrackerCategory(category: DomainCategory): boolean {
  return category === "analytics" || category === "advertising" || category === "telemetry";
}
