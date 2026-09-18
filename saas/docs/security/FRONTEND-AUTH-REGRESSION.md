# Frontend authentication and period browser regression

The old development-only authentication banner displayed a demo email/password.
Dynamic QA authentication removed its configuration object, but the banner still
referenced it. Production builds dropped the DEV branch, so build success did not
detect the development ReferenceError. The obsolete banner is removed entirely:
no replacement credential object, automatic login, or frontend secret is added.

`frontend/test/auth.browser.cjs` now checks a fresh browser context for empty
credentials, no saved session, no unsolicited login request, no demo access
button/banner or exposed QA password, and no page errors. It then exercises
explicit login, wrong credentials, outage/retry and session expiry on desktop
and mobile. `CONTAPANAMA_EXPECT_DEV=1` requires the Vite development client to be
present, preventing a production-only run from masking this regression.
The harness supplies an ephemeral password through the existing test-only
environment contract; it is not part of the frontend bundle.

The period test previously selected a bank name using the label `Banco`. Payments
now require a bank account belonging to the document's client. The UI's existing
accessible name is `Cuenta bancaria del pago`. The test uses that combobox,
provides a synthetic client-owned active account, selects its ID, and verifies
both the account ID and bank in the submitted payment. The UI was not changed
to accommodate the obsolete selector. Existing closed-period rejection, retry,
mobile form, historical balance and CSV assertions remain in place.

Run both browser scripts against isolated QA API/Vite instances with explicit
test credentials, and run payments.browser.cjs for desktop/mobile settlement.
The full QA runner additionally checks PostgreSQL-backed browser payments.
No accounting/fiscal behavior or default journal synchronization mode is changed.
