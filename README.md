# LinkScope

Local-first Chrome extension that reads pages, shows who else is on them, and maps connected domains as a graph.

Manual scans stay free and run when you open LinkScope. Optional **Automatic protection** checks a site after you stay on it for a few seconds, at most twice per day per site. Sites explicitly added to **Watching** can also be revisited daily or weekly by the browser. Scan contents stay local. ExtensionPay handles the account and subscription status for Pro through Stripe.

## Load unpacked

1. Install dependencies: `npm install`
2. Start the extension build: `npm run dev`
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked**
6. Select the `.output/chrome-mv3` folder (WXT prints the exact path)

## Use it

1. Open any `http`/`https` website
2. Click the LinkScope icon — that click is the first scan, and the popup offers optional automatic protection
3. The popup starts with a plain-language verdict and privacy score, followed by third-party / tracker / ad / unknown counts and recent changes
4. Click a domain for a load chain (page → iframe or script → domain) and watch/block actions
5. Press **See what’s connected** for the full graph, or **Deep scan** to catch delayed requests
6. The Overview becomes a daily briefing and weekly privacy trend as checks accumulate

## Pro billing and Stripe sandbox

LinkScope uses [ExtensionPay](https://extensionpay.com) for hosted Stripe Checkout and license checks. Create a LinkScope product in ExtensionPay, then set its public product slug:

```bash
cp .env.example .env
# Edit WXT_EXTPAY_EXTENSION_ID if your ExtensionPay slug is not "linkscope"
```

Unpacked development builds automatically use ExtensionPay's development flow and Stripe test mode. Chrome Web Store builds use the live payment flow. Never put a Stripe secret key in this extension.

Connect the Stripe account from the ExtensionPay dashboard. LinkScope does not read Stripe publishable or secret API keys directly. Production builds and ZIPs run a secret scan and fail if a Stripe secret is found in the project.

LinkScope's commercial build does not bundle Disconnect's non-commercial Tracker Protection dataset. Tracker categories use the original LinkScope curated classifications plus clearly labeled domain-name heuristics. The release guard fails a build if the removed dataset, generator, attribution, or classification source is reintroduced.

Free includes one watched site and keeps up to 20 local scans for 30 days. Pro unlocks unlimited watched sites, export, and extended local history capped at 1,000 scans or one year. Ordinary scans inspect every accessible frame; Pro deep scans add a 15-second request window and all-site access for cross-origin frames.

The toolbar badge shows the third-party count, or `+N` new domains since last visit to this site.

## Permissions

- `activeTab` + `scripting` — scan the tab you clicked
- `tabs` — open the graph / dashboard and update the badge from saved scans
- `alarms` — wake hourly to run due daily or weekly checks for sites you explicitly watch
- `storage` — retain ExtensionPay's local license token and cached subscription status
- `webRequest` — while a scan/watch is running, record initiator/document URLs for that tab
- `notifications` — optional local alerts for watched-site changes or tracked domains
- `declarativeNetRequest` — only if you click **Block this domain**; the resulting dynamic rule persists across browser restarts
- Optional host access — requested per site for Free watched sites and standard audits. Automatic protection asks for all-site access when the user turns it on; it remains off by default. Pro also uses all-site access for deep iframe scanning, because embedded frames can use unrelated origins. Blocking requests access only when used.

No required host permissions. Pages are not injected at `document_start`.

Permission audit: every declared permission above has a matching runtime feature. LinkScope does not request cookies, browsing history, identity, clipboard, or required host access.

## Development

```bash
npm run dev
npm run compile
npm test
npm run build
```
