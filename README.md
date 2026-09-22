# OutTrace

[![OutTrace on Product Hunt](https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1256657&theme=light)](https://www.producthunt.com/products/outtrace)

Local-first Chrome extension for people who maintain websites: inspect third-party connections, watch for changes after updates, and prepare client reports.

Manual scans are unlimited on every plan. Opening OutTrace shows the latest saved capture first and never starts a scan by itself; use **Check this page** for an explicit capture. Optional **Quiet Protection** re-checks known sites after a 6-second dwell, with a 12-hour per-site cooldown, but never establishes a first-ever site baseline implicitly. It is off by default. **Watching** is separate: explicitly monitor a site when you visit, daily, or weekly. Scheduled checks briefly load a website in an inactive tab. OutTrace itself has no account and sends no scan data anywhere. ExtensionPay and Stripe handle only the payment email/card details and Pro verification.

## Client website workflow

The welcome page shows how a first check actually works: pin OutTrace, open a client site in Chrome, then choose **Check this page**. The popup then offers monitoring setup. **Portfolio** brings scanned and watched sites together, puts unread meaningful changes first, and shows failed checks or missing site access. Merely opening Overview does not mark activity as read.

**Client report** is available from site history, graph controls, the popup, and change comparisons. It includes observed third-party resource domains, classification sources, capture dates, changes, and suggested follow-up. Initial captures are labeled as starting points. Passive hyperlinks, page titles, full URLs, and raw evidence are excluded. Reports remain local and can be downloaded as text or printed / saved as PDF through the browser. Review included domains before sharing.

Single-site reports are free. Existing one-time Pro entitlements remain unchanged. Scheduled checks require the browser to be running; OutTrace does not provide always-on cloud monitoring.

## Load unpacked

1. Install dependencies: `npm install`
2. Start the extension build: `npm run dev`
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked**
6. Select the `.output/chrome-mv3` folder (WXT prints the exact path)

## Use it

1. Open any `http`/`https` website
2. Click the OutTrace icon for an instant saved result; use **Check again** for an explicit fresh capture
3. See the plain-language verdict, score, counts, meaningful change reasons, and capture time; a failed refresh leaves saved content visible
4. Optionally enable **Quiet Protection** after reading its explanation and granting optional site access; dismissal is remembered
5. Open **See details** or **See what changed**; graph, deep scan, history/Watching, and share cards remain under secondary controls
6. The Overview offers a quiet Activity inbox (Important + Notable; routine changes collapsed), local-calendar-day briefing, and latest-per-site weekly trend

## Pro billing and Stripe sandbox

OutTrace uses [ExtensionPay](https://extensionpay.com) for hosted Stripe Checkout and license checks. The existing ExtensionPay product slug is `linkscope` (same as the local database name: a billing identifier, not the brand). The Stripe product display name is OutTrace. Support and refunds: `websparkgenerations@gmail.com`.

```bash
cp .env.example .env
# WXT_EXTPAY_EXTENSION_ID defaults to "linkscope". Leave it; it matches the live ExtensionPay product.
```

Unpacked development builds automatically use ExtensionPay's development flow and Stripe test mode. Use Stripe's test card in hosted Checkout, then use ExtensionPay's **reset test payment data** control to switch the same test user between paid and unpaid before shipping. Chrome Web Store builds use the live payment flow. Never put a Stripe secret key in this extension. Support and refunds go to websparkgenerations@gmail.com.

Connect the Stripe account from the ExtensionPay dashboard. OutTrace does not read Stripe publishable or secret API keys directly. Production builds and ZIPs run a secret scan and fail if a Stripe secret is found in the project.

OutTrace's commercial build does not bundle Disconnect's non-commercial Tracker Protection dataset. Tracker categories use the original OutTrace curated classifications plus clearly labeled domain-name heuristics. The release guard fails a build if the removed dataset, generator, attribution, or classification source is reintroduced.

Free includes unlimited manual scans, scores, graph explanations, branded PNG share cards, single-scan exports, saved scans, complete local backups, two visit-only watched sites, and one site audit per local calendar day. The daily free audit can use the same deep iframe-aware mode as Pro. Both plans use the same one-year/1,000-scan device-storage safety boundary; it is never a usage quota. A one-time $14.99 Pro purchase unlocks unlimited site audits, unlimited watched sites, scheduled checks, native digests/change alerts, and bulk reporting/export. Pro access remains active indefinitely. OutTrace never sends scan history or page content to ExtensionPay/Stripe; payment email and card details are handled there for the receipt.

The toolbar is normally blank: unscanned sites and routine/unchanged captures create no badge. On previously checked sites, `+N` counts unseen notable inbox events and `!` indicates important activity, including watched-site changes elsewhere. Hover explains the event and last saved capture; opening the popup surfaces other sites' activity too. Viewing an event clears it. Action writes are tab-specific and revision-guarded against stale navigation results.

One shared importance engine considers loaded resources, not passive hyperlinks. New confirmed trackers, first confirmed trackers on clean sites, tracker surges, new followed-domain sightings, and attributable large score drops are important. New owners and multiple unknown resource domains can be notable; CDN/first-party churn and removals are routine. Score changes alone never alert. Local baselines use up to 30 recent retained captures and wait for at least three before describing a tracker spike as unusual for that site.

Notifications default **off**. Settings offers Nothing, Major tracker changes only, Weekly summary, or both explicitly. Immediate Pro notifications wait five minutes to coalesce site events and are limited to one per site per 24 hours. Identical meaningful changes are suppressed for seven days unless severity increases. Digest and immediate delivery do not overlap unless both are selected. Watching has separate visit/daily/weekly schedules and important/every-change/never activity preferences; routine changes remain local and collapsed, never immediate notifications.

Daily site statistics count each site once and respect local midnight. Weekly score movement compares latest observations for at least three matching sites with the same score model; repeated scanning cannot overweight one site.

## Score-first reports and sharing

Scans open a plain-English report before the graph. Model v2 starts at 100 and subtracts 8 per curated tracking resource domain or 4 per heuristic tracking domain (combined cap 80), plus 2 per unique tracking script/iframe domain (cap 20). Passive hyperlinks, benign CDNs, and page complexity are not tracking penalties. Unclassified resources are disclosed as uncertainty, not clean. This is an explainable exposure heuristic, not a calibrated safety rating or proof of cross-site tracking. Old graphs use the current model when reopened.

**Share this scan** previews a branded 1200 × 630 PNG before download. It contains the site domain, capture date, score, and aggregate counts, never the private URL path/query, page title, or evidence. Nothing is uploaded by the share action.

## Strictly opt-in usage counts

Settings offers an off-by-default usage toggle. Reports contain only allowlisted aggregate event counts: no URLs, domains, page content, scores, timestamps, or persistent identifiers. Revoking consent erases counters and the unsent queue. Complete backups never transfer telemetry consent.

When a release is built with `WXT_USAGE_ENDPOINT`, opting in also sends pending count totals at most once a day. The payload contains the fixed event names and integer totals only—no URL, domain, scan content, score, client timestamp, user ID, or install ID. Failed sends remain queued locally. Builds without a configured receiver remain local-only. Users can export the same count-only file for review, and opting out erases local totals and the unsent queue. See `docs/usage-reporting.md` for the exact contract and receiver setup.

## Local durability and recovery

Use **Save** in Scan snapshots to exempt an important scan from automatic history cleanup. Saved scans remain local, not synced to a cloud account.

Settings offers **Download complete backup** on every plan. This private JSON file includes scan graphs, saved status, audits, alerts, watched sites, followed/ignored domains, preferences, and portable block domains. It excludes ExtensionPay tokens and browser permissions. Store it safely: it contains visited URLs and scan evidence.

**Restore complete backup** validates the file and asks before replacing local records. Database replacement is transactional: failed writes roll back. Watching and automatic protection are turned off, interrupted audits become cancelled, and restored block domains await individual permission approval. Existing browser blocking rules and payment access are unchanged. Close other reports and finish running scans before restoring. Legacy scan-only archives still merge rather than replace.

Restoring a complete backup pauses automatic history cleanup until you review the restored data and explicitly resume it. A cached paid result keeps one-time Pro access available during a temporary ExtensionPay/network outage; use **Refresh Pro status** when connectivity returns.

Local data normally persists through updates when the extension ID and database name remain unchanged. Uninstalling, profile/device loss, or storage failures can remove it. **Protect local storage** asks the browser for persistence protection, but is not a replacement for external backups.

The payment-success content script runs only on `https://extensionpay.com/*`; it lets successful payments and purchase restoration refresh the license cache, then returns the checkout tab to OutTrace's Pro page with a short confirmation state. It does not scan browsing pages. Chrome may warn that OutTrace can read and change data on extensionpay.com for that checkout return. OutTrace does not replace the browser's new-tab page.

## Permissions

- `activeTab` + `scripting` — scan the tab you clicked
- `alarms` — schedule the opt-in weekly digest and due checks for sites you explicitly watch
- `storage` — retain ExtensionPay's local license token and cached Pro purchase status
- `webRequest` — while a scan/watch is running, record initiator/document URLs for that tab
- `declarativeNetRequestWithHostAccess` — only if you click **Block this domain**; Chrome asks for that domain's host access first, so this does not show an install-time blocking warning
- Optional `notifications` — requested only when you enable change alerts in Settings
- Optional host access — a watched site asks only for its exact hostname at the moment you add it, alongside a clear explanation. If declined, it remains on the watchlist for manual checks only. Visit alerts run only after a granted watched-origin navigation. Quiet Protection and deep iframe scans retain their separate explicit permission prompts. Removing a watched site revokes its matching hostname access. If a count receiver is configured, enabling anonymous usage counts asks separately for access to that exact HTTPS receiver origin.
- Optional browser capabilities — Right-click scan and visit navigation observation are requested only when you enable those controls; neither grants website access. The weekly digest is off until selected in Settings and stays quiet when no new trackers appear.
- `https://extensionpay.com/*` — content script for Pro checkout and restore only; not used to scan websites

No required host permissions. OutTrace asks for extensionpay.com access only when you explicitly open checkout, restore, or billing management.

Permission audit: every declared permission above has a matching runtime feature. OutTrace does not request cookies, browsing history, identity, clipboard, the `tabs` permission, or a new-tab override.

## Links

- [Product Hunt](https://www.producthunt.com/products/outtrace)
- [Chrome Web Store](https://chromewebstore.google.com/detail/outtrace/eedjncgcdepjbmpapihoigdbdfobmdmc)

## Development

```bash
npm run dev
npm run compile
npm test
npm run build
```
