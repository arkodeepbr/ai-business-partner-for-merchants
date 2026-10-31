# Implementation status

The repository has working local source and tests. It is not a finished production launch.

## Implemented

- Expo Router Android application with secure token storage, query caching, Stitch-informed login, dashboard, wallet, graphs and profile views, a bottom-up voice-assistant sheet, persistent assistant conversation history, business module list/detail routes, CSV import, create flows, consent controls, approval decisions and local sign-out.
- Daily dashboard briefing that uses India business-day boundaries and summarizes recorded collections, refunds, yesterday comparison, low-stock items and settlements expected in the next 24 hours. It is generated on dashboard load and does not claim to send scheduled notifications.
- English and Hindi assistant response preference; Android handles `en-IN`/`hi-IN` speech recognition and the authenticated backend uses the official ElevenLabs Python SDK for speech generation. Local onboarding secrets stay in ignored `.env.local` and are passed only to the backend.
- FastAPI versioned API with merchant membership verification and tenant-scoped sales, settlements, inventory, customers, suppliers, campaign drafts, credit offers, tax summaries, staff, stores, notifications, conversations and approvals.
- SQLAlchemy persistence and five Alembic migrations for merchant/payment/settlement/inventory, workflow, inventory movement, import de-duplication and customer receivable tables.
- Deterministic decimal calculations for collections and refunds; explicit wording distinguishes collections from profit and pending settlements from guaranteed receipts.
- Merchant-authorized transaction CSV import with bounded rows, strict schema/time-zone validation, source labeling, duplicate suppression and audit records. Imported rows are not presented as live provider data.
- Local Ollama/Qwen3 development integration and hosted Cloudflare Workers AI/Qwen integration for bounded merchant-context questions, plus a confirmed, tenant-scoped customer-receivable workflow. A pending-due note is not written until confirmation and is kept separate from payments and settlements.
- Inventory adjustments use row locking, reject negative stock, and persist a movement ledger.
- Sensitive purchase order and campaign drafts require an approval record. Approval only changes local workflow state to `approved_pending_provider`; it never sends the order, campaign or credit application.
- Merchant data is never filled with sample transactions. Empty live feeds are shown as unavailable/empty.
- Generated OpenAPI contract, Docker Compose development stack, EAS configuration, CI workflow and operational notes.
- Speech recognition availability and privacy depend on the Android service and its settings. ElevenLabs synthesis uses account quota; if unavailable, the app falls back to installed Android text-to-speech.

## Required before production

- Authorized OTP/identity provider, session refresh/revocation and account recovery.
- Authorized payment/settlement connectors and webhook verification. No Paytm private API access is assumed.
- Validation of the hosted LLM's accuracy, workload, daily quota and language behavior, plus a managed speech policy for production. The offline preview uses fictional sample rules. Device speech recognition and ElevenLabs synthesis need device/account validation before production.
- Authorized lender, tax filing, campaign delivery and push notification providers.
- Complete organization-level membership/store entitlements, disputes/refunds, customer loyalty/segments, product catalog editing, report export, support workflows and durable background jobs.
- Managed secrets, rate limits, observability, encryption/retention/deletion controls, backup restore drills and security/privacy/tax/lending review.
- Accessibility/device/end-to-end testing, Android SDK build, organization-owned package/listing assets, Play signing and release review.

The Stitch export is preserved in `design/stitch/` as visual/source reference. The native app uses the same cool-neutral, navy and cyan direction while retaining factual empty states and functional controls. The Android package ID remains `in.merchant.businesspartner` and must be confirmed before any release.
