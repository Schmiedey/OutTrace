# Optional aggregate usage counts

Usage reporting is off by default. Counters are always kept in the local extension database first. When a release is built with a valid `WXT_USAGE_ENDPOINT`, a user who opts in can also send pending aggregate totals at most once a day. Builds without an endpoint stay local-only. Users can export and inspect the same count totals at any time.

## Consent and data contract

- Default off. No reconstruction of pre-consent behavior. Opt-out erases local counts and any legacy pending queue.
- Export and network JSON use the same shape: `{ "formatVersion": 1, "counts": { "first-scan": 1, "manual-scan": 2 } }`.
- Fixed event enum; no properties, user/install IDs, page data, domains, URLs, scores, IP storage, or client timestamps enter the payload. Counts cap at 10,000 per event. The local consent date is used only to calculate the week-two return milestone and is never sent.
- The configured endpoint must be HTTPS with no embedded credentials or query string. Enabling reporting requests access only to that receiver origin. The request omits credentials and referrer data.
- Sends happen at most once per 24 hours unless the user has just enabled consent. A successful send subtracts only the delivered totals, so events recorded during an in-flight request are not lost. Failed sends remain queued. Revocation aborts an in-flight request and erases totals and the queue.
- Local transactions avoid losing events recorded concurrently.
- Telemetry consent/state is internal and excluded from complete backups so restore never silently opts a new profile in.

## Count-only receiver

`api/usage.ts` is a minimal Vercel Function. It validates the allowlist and integer bounds, then increments one Redis hash per ISO week using a Vercel Marketplace/Upstash Redis REST binding. It stores no request body, IP address, user record, session, or installation identifier. Configure one of these environment-variable pairs on the server:

- `KV_REST_API_URL` and `KV_REST_API_TOKEN`
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

Deploy the function, set the extension build’s `WXT_USAGE_ENDPOINT` to its HTTPS URL, and rebuild the extension. Apply a platform rate limit to `/api/usage`; rate limiting should happen at the platform edge rather than adding an application-side IP log. Weekly hashes are named `linkscope:usage:YYYY-Www` and contain only event-name fields with integer totals.

## Funnel semantics

- `consent-enabled` is the denominator, not all installations. This is a self-selected sample.
- `first-scan` and `second-scan` are emitted once within a consent session, after successful manual/deep scans. Scheduled/automatic captures should not count toward the manual funnel.
- `returned-day-7` means a product open in days 7–13 after consent, counted once. It is not exact install-based day-7 retention. There are no cohort dates or IDs in reports, so cohort-specific retention is unavailable.
- Popup/diff CTA impressions, limit hits, watchlist adds, share-card downloads, delivered digests, and checkout/management opens are aggregate feature activity, not unique people, successful social shares, or successful paid conversions.
- Disabling and re-enabling starts a fresh consent session; funnels are not lifetime user counts.

The counts can answer directional funnel questions only within the self-selected opt-in population. They cannot calculate unique-user conversion or installation cohorts because the design deliberately has no identifier. If exact cohorts, unique users, or attribution become necessary, revisit the consent/privacy design first; do not quietly add identifiers or reconstruct browsing behavior.

Client report events (`client-report-opened`, `client-report-download-requested`, `client-report-print-requested`) measure aggregate report activity only. Download/print requests do not prove a file was saved or shared. They use the same off-by-default, count-only consent contract and contain no site or report content.
