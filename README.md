# LinkScope

Local-first Chrome extension that reads pages, shows who else is on them, and maps connected domains as a graph.

Manual scans stay free and run when you open LinkScope. Sites explicitly added to **Watching** can be revisited daily or weekly by the browser. Scan contents stay local. ExtensionPay handles the account and subscription status for Pro through Stripe.

## Load unpacked

1. Install dependencies: `npm install`
2. Start the extension build: `npm run dev`
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked**
6. Select the `.output/chrome-mv3` folder (WXT prints the exact path)

## Use it

1. Open any `http`/`https` website
2. Click the LinkScope icon — that click is the scan
3. The popup shows third-party / tracker / ad / unknown counts, and what changed since last visit
4. Click a domain for a load chain (page → iframe or script → domain) and watch/block actions
5. Press **Inspect** for the full graph, or **Watch 15 seconds** to catch delayed requests

## Pro billing and Stripe sandbox

LinkScope uses [ExtensionPay](https://extensionpay.com) for hosted Stripe Checkout and license checks. Create a LinkScope product in ExtensionPay, then set its public product slug:

```bash
cp .env.example .env
# Edit WXT_EXTPAY_EXTENSION_ID if your ExtensionPay slug is not "linkscope"
```

Unpacked development builds automatically use ExtensionPay's development flow and Stripe test mode. Chrome Web Store builds use the live payment flow. Never put a Stripe secret key in this extension.

Connect the Stripe account from the ExtensionPay dashboard. LinkScope does not read Stripe publishable or secret API keys directly. Production builds and ZIPs run a secret scan and fail if a Stripe secret is found in the project.

Free includes one watched site and keeps the latest 20 local scans. Pro unlocks unlimited watched sites, unlimited history/export, and iframe-aware deep scans.

The toolbar badge shows the third-party count, or `+N` new domains since last visit to this site.

## Permissions

- `activeTab` + `scripting` — scan the tab you clicked
- `tabs` — open the graph / dashboard and update the badge from saved scans
- `alarms` — wake hourly to run due daily or weekly checks for sites you explicitly watch
- `storage` — retain ExtensionPay's local license token and cached subscription status
- `webRequest` — while a scan/watch is running, record initiator/document URLs for that tab
- `notifications` — optional local alerts for watched-site changes or tracked domains
- `declarativeNetRequest` — only if you click **Block this domain**
- Optional host access — requested per site for Free watched sites and standard audits. Pro asks for all-site access only when deep iframe scanning is enabled, because embedded frames can use unrelated origins. Blocking also requests access when used.

No required host permissions. Pages are not injected at `document_start`.

## Development

```bash
npm run dev
npm run compile
npm run build
```
