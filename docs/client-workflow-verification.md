# Client website release verification

## Implemented
- Welcome → visual pin / open-the-site / Check this page walkthrough → manual capture → monitoring setup.
- Portfolio combines saved sites and watchlist entries; unread meaningful changes sort first.
- Overview no longer marks all alerts as read. Opening a change comparison still marks its activity read.
- Single-site reports preview locally, download as text, and invoke the browser print dialog for print/PDF output.
- Comparisons use an earlier capture from the same site, excluding passive hyperlinks from observed resources. Missing or mismatched explicit comparison evidence produces an error.
- Reports omit full URLs, titles, and raw evidence; observed domains remain included.
- Existing Free and lifetime Pro entitlements are preserved.

## Verification performed
- Production build, type check, secret scan, classification licensing guard, and automated test suite.
- Isolated Chromium installation of the built extension: welcome page rendered the pin → open the site → Check this page walkthrough.
- Isolated synthetic captures: portfolio populated; unread changes remained unread after opening Overview and cleared after opening their comparison.
- Client report rendered the new resource domain and captured dates. Browser text download succeeded. Private URL/query, title, and evidence markers did not appear in the report or download.
- Browser errors were empty during the verified flows.

## Remaining release gates
- The automated headless browser cannot complete Chrome's native optional site-access prompt. Verify accepting and declining that prompt in a visible browser, then verify initial capture and visit-triggered checks. This was not represented as an end-to-end scanning pass.
- Verify the native print dialog and saved PDF pagination in a visible browser.
- Run the existing populated-installation upgrade and backup recovery checks in production-readiness.md.
- Verify live ExtensionPay price, purchase, restoration, and refund behavior against the intended account. No real payment was made.
- Publish the package to the existing store listing; the implementation does not publish it automatically.

## Product measurement
Use existing opt-in aggregate counts for first/second manual scans, watching setup, and checkout activity. New report open, download-request, and print-request counts reveal report use without transmitting site data. These are self-selected aggregate events, not unique people or exact retention cohorts.
