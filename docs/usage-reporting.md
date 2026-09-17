# Optional local usage counts

There is no hosted reporting service and no automatic usage upload. Endpoint environment overrides are ignored. Off-by-default counters stay in the local extension database and can only be exported manually. Users may review a count-only file and decide whether to share it themselves. The developer has no remote analytics dashboard.

## Consent and data contract

- Default off. No reconstruction of pre-consent behavior. Opt-out erases local counts and any legacy pending queue.
- Manual export JSON: `{ "formatVersion": 1, "counts": { "first-scan": 1, "manual-scan": 2 } }`.
- Fixed event enum; no properties, user IDs, page data, domains, URLs, scores, or raw dates enter exports. Counts cap at 10,000 per event. The local consent date is used only to calculate the week-two return milestone.
- No endpoint permission requests, network sender, cookies, receiver, or deployment are needed. Scans and saved data remain local; separate billing requests still use ExtensionPay.
- Local transactions avoid losing events recorded concurrently.
- Telemetry consent/state is internal and excluded from complete backups so restore never silently opts a new profile in.

## Funnel semantics

- `consent-enabled` is the denominator, not all installations. This is a self-selected sample.
- `first-scan` and `second-scan` are emitted once within a consent session, after successful manual/deep scans. Scheduled/automatic captures should not count toward the manual funnel.
- `returned-day-7` means a product open in days 7–13 after consent, counted once. It is not exact install-based day-7 retention. There are no cohort dates or IDs in reports, so cohort-specific retention is unavailable.
- Watchlist adds, share-card downloads, delivered digests, and checkout/management opens are aggregate feature activity, not unique people, successful social shares, or successful paid conversions.
- Disabling and re-enabling starts a fresh consent session; funnels are not lifetime user counts.

If exact installation cohorts, unique users, or attribution become necessary, revisit the consent/privacy design first; do not quietly add identifiers or reconstruct browsing behavior.
