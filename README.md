# LinkScope

Local-first Chrome extension that reads pages, shows who else is on them, and maps connected domains as a graph.

Manual scans stay free. Opening LinkScope shows the latest saved capture first and never starts a scan by itself; use **Check this page** for an explicit capture. Optional **Quiet Protection** re-checks known sites after a 6-second dwell, with a 12-hour per-site cooldown, but never establishes a first-ever site baseline implicitly. It is off by default. **Watching** is separate: explicitly monitor a site when you visit, daily, or weekly. Scheduled checks briefly load a website in an inactive tab. Scan contents stay local. ExtensionPay handles the account and subscription status for Pro through Stripe.

## Load unpacked

1. Install dependencies: `npm install`
2. Start the extension build: `npm run dev`
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked**
6. Select the `.output/chrome-mv3` folder (WXT prints the exact path)

## Use it

1. Open any `http`/`https` website
2. Click the LinkScope icon for an instant saved result; use **Check again** for an explicit fresh capture
3. See the plain-language verdict, score, counts, meaningful change reasons, and capture time; a failed refresh leaves saved content visible
4. Optionally enable **Quiet Protection** after reading its explanation and granting optional site access; dismissal is remembered
5. Open **See details** or **See what changed**; graph, deep scan, history/Watching, and share cards remain under secondary controls
6. The Overview offers a quiet Activity inbox (Important + Notable; routine changes collapsed), local-calendar-day briefing, and latest-per-site weekly trend

## Pro billing and Stripe sandbox

LinkScope uses [ExtensionPay](https://extensionpay.com) for hosted Stripe Checkout and license checks. Create a LinkScope product in ExtensionPay, then set its public product slug:

```bash
cp .env.example .env
# Edit WXT_EXTPAY_EXTENSION_ID if your ExtensionPay slug is not "linkscope"
```

Unpacked development builds automatically use ExtensionPay's development flow and Stripe test mode. Chrome Web Store builds use the live payment flow. Never put a Stripe secret key in this extension.

Connect the Stripe account from the ExtensionPay dashboard. LinkScope does not read Stripe publishable or secret API keys directly. Production builds and ZIPs run a secret scan and fail if a Stripe secret is found in the project.

LinkScope's commercial build does not bundle Disconnect's non-commercial Tracker Protection dataset. Tracker categories use the original LinkScope curated classifications plus clearly labeled domain-name heuristics. The release guard fails a build if the removed dataset, generator, attribution, or classification source is reintroduced.

Single-page scans, including 15-second deep scans, stay unlimited and free. Scores, graph explanations, branded PNG share cards, single-scan exports, saved scans, and complete local backups are free. Pro unlocks watchlists, scheduled checks, native digests/change alerts, deep multi-page audits, and bulk reporting/export. Every plan has the same device-storage safety limit: 1,000 unsaved scans or one year; saved scans are exempt. This is a retention boundary, not a scan quota.

The toolbar is normally blank: unscanned sites and routine/unchanged captures create no badge. On previously checked sites, `+N` counts unseen notable inbox events and `!` indicates important activity, including watched-site changes elsewhere. Hover explains the event and last saved capture; opening the popup surfaces other sites' activity too. Viewing an event clears it. Action writes are tab-specific and revision-guarded against stale navigation results.

One shared importance engine considers loaded resources, not passive hyperlinks. New confirmed trackers, first confirmed trackers on clean sites, tracker surges, new followed-domain sightings, and attributable large score drops are important. New owners and multiple unknown resource domains can be notable; CDN/first-party churn and removals are routine. Score changes alone never alert. Local baselines use up to 30 recent retained captures and wait for at least three before describing a tracker spike as unusual for that site.

Notifications default **off**. Settings offers Nothing, Major tracker changes only, Weekly summary, or both explicitly. Immediate Pro notifications wait five minutes to coalesce site events and are limited to one per site per 24 hours. Identical meaningful changes are suppressed for seven days unless severity increases. Digest and immediate delivery do not overlap unless both are selected. Watching has separate visit/daily/weekly schedules and important/every-change/never activity preferences; routine changes remain local and collapsed, never immediate notifications.

Daily site statistics count each site once and respect local midnight. Weekly score movement compares latest observations for at least three matching sites with the same score model; repeated scanning cannot overweight one site.

## Score-first reports and sharing

Scans open a plain-English report before the graph. Model v2 starts at 100 and subtracts 8 per curated tracking resource domain or 4 per heuristic tracking domain (combined cap 80), plus 2 per unique tracking script/iframe domain (cap 20). Passive hyperlinks, benign CDNs, and page complexity are not tracking penalties. Unclassified resources are disclosed as uncertainty, not clean. This is an explainable exposure heuristic, not a calibrated safety rating or proof of cross-site tracking. Old graphs use the current model when reopened.

**Share this scan** previews a branded 1200 × 630 PNG before download. It contains the site domain, capture date, score, and aggregate counts, never the private URL path/query, page title, or evidence. Nothing is uploaded by the share action.

## Strictly opt-in usage counts

Settings offers an off-by-default usage toggle. Reports contain only allowlisted aggregate event counts: no URLs, domains, page content, scores, timestamps, or persistent identifiers. Revoking consent erases counters and the unsent queue. Complete backups never transfer telemetry consent.

Usage counts are strictly local-only and off by default. Users can manually export a count-only file for review and choose whether to share it themselves. No reporting service, endpoint permission, or automatic upload exists, even if an old environment setting names a receiver. There is no developer analytics dashboard. See `docs/usage-reporting.md` for funnel semantics.

## Local durability and recovery

Use **Save** in Scan snapshots to exempt an important scan from automatic history cleanup. Saved scans remain local, not synced to a cloud account.

Settings offers **Download complete backup** on every plan. This private JSON file includes scan graphs, saved status, audits, alerts, watched sites, followed/ignored domains, preferences, and portable block domains. It excludes ExtensionPay tokens and browser permissions. Store it safely: it contains visited URLs and scan evidence.

**Restore complete backup** validates the file and asks before replacing local records. Database replacement is transactional: failed writes roll back. Watching and automatic protection are turned off, interrupted audits become cancelled, and restored block domains await individual permission approval. Existing browser blocking rules and payment access are unchanged. Close other reports and finish running scans before restoring. Legacy scan-only archives still merge rather than replace.

Restoring, a billing verification failure, or expired Pro access pauses automatic history cleanup. Review/export your data before explicitly resuming it. Previously verified Pro access has a 72-hour offline grace; repeated failures do not extend the verification timestamp.

Local data normally persists through updates when the extension ID and database name remain unchanged. Uninstalling, profile/device loss, or storage failures can remove it. **Protect local storage** asks the browser for persistence protection, but is not a replacement for external backups.

The payment-success content script runs only on `https://extensionpay.com/*`; it lets successful payments and purchase restoration refresh the license cache. It does not scan browsing pages.

## Permissions

- `activeTab` + `scripting` — scan the tab you clicked
- `tabs` — open the graph / dashboard and update the badge from saved scans
- `alarms` — wake hourly to run due daily or weekly checks for sites you explicitly watch
- `storage` — retain ExtensionPay's local license token and cached subscription status
- `webRequest` — while a scan/watch is running, record initiator/document URLs for that tab
- `notifications` — optional local alerts for watched-site changes or tracked domains
- `declarativeNetRequest` — only if you click **Block this domain**; the resulting dynamic rule persists across browser restarts
- Optional host access — requested for watched sites and standard audits. Quiet Protection asks for all-site access only from its explicit enable action after an explanation; it remains off by default. Free deep iframe scans also ask for all-site access because embedded frames can use unrelated origins. Blocking requests access only when used. There is no reporting endpoint or external analytics upload.

No required host permissions. Pages are not injected at `document_start`.

Permission audit: every declared permission above has a matching runtime feature. LinkScope does not request cookies, browsing history, identity, clipboard, or required host access.

## Development

```bash
npm run dev
npm run compile
npm test
npm run build
```
