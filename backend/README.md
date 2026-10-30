# Paytm Saathi backend foundation

This package adds a versioned FastAPI contract alongside the existing concept-preview frontend. It is a development foundation, not a claim of production readiness or live Paytm connectivity.

## Run locally

Requires Python 3.12. From this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
$env:DATABASE_URL = "sqlite:///./saathi-local.db"
alembic upgrade head
uvicorn app.main:app --reload
```

Shared contract source: `../contracts/openapi.yaml` (the web TypeScript client is generated from this file). OpenAPI: `http://localhost:8000/api/v1/openapi.json`; interactive docs: `/api/v1/docs`.
Docker Compose is provided for local PostgreSQL and Redis. The current API only needs PostgreSQL; Redis and Celery are dependencies for the planned worker services and are not yet wired to durable jobs.

## Contract currently implemented

- `GET /health/live`, `GET /health/ready`
- `GET /api/v1/me`
- `GET /api/v1/organizations/{organization_id}/analytics/sales?from_at=...&to_at=...`
- `GET /api/v1/organizations/{organization_id}/transactions?limit=...`
- `POST /api/v1/organizations/{organization_id}/assistant`

All amounts are integer minor units (INR paise). The sales metric is gross successful collections in a half-open UTC timestamp window. It excludes refunds, fees, disputes, and settlements. Timezone conversion for merchant-local calendar windows belongs in a caller/service layer and is not yet implemented. Unauthenticated requests receive 401; a user outside an organization receives indistinguishable 404. The assistant endpoint responds with a safe unavailable message until a consented provider and grounded tool runtime are configured.

The auth foundation verifies short lived signed bearer tokens and active users. There is intentionally no public token issuance endpoint: production OTP delivery, verification, abuse controls, refresh/revocation, and session lifecycle must be connected to an authorized identity provider before merchant login is enabled.

The provider adapter is sandbox-only and returns no records. No public Paytm or Soundbox API is assumed. `PROVIDER_MODE=production` does not create a production connector; live mode remains unavailable until an approved provider adapter and credentials are supplied.

### Optional assistant language provider

The backend provides authenticated general chat at `/api/v1/assistant/chat` and grounded business chat at `/api/v1/organizations/{organization_id}/assistant`. General chat receives only the user's bounded conversation and profile name. Grounded chat uses approved, tenant-scoped facts. Configure `AI_API_BASE_URL=https://api.sarvam.ai/v1`, `AI_MODEL=sarvam-105b-conversations`, and `AI_API_KEY` in the backend's ignored `.env` file or a managed secret store; never put the key in the web app or commit it. Business facts are sent only after the merchant has explicitly consented and their organization ID appears in `AI_DATA_CONSENT_ORGANIZATION_IDS`. Saathi remains read-only and cannot execute payments, purchases, campaigns, lending, tax filing, or settings actions.

## Migrations and checks

Use `alembic upgrade head` and `alembic downgrade base`. Run `pytest` from this folder. Initial tests cover minor-unit arithmetic and cross-tenant denial. Expand the migration and integration suites before staging use.

## Deployment and outstanding work

Do not deploy this foundation with the local JWT secret or local compose passwords. Use a managed secret store, TLS, private network access, encrypted backups, migration job, monitoring exporters, log redaction, SLO alerting, restore drills, dependency/security scans, and provider-specific webhook verification before staging. `.env.example` documents configuration; never commit actual credentials.

Not implemented yet: OTP/session service, detailed RBAC, row-level security, webhook ingestion/replay protection, refunds and settlement reconciliation, approval workflows, AI provider/tool orchestration, speech, inventory, customers/campaign consent, lending, GST, notifications, subscription billing, object storage, background jobs, Sentry, metrics/tracing exporters, CI/CD, Terraform, backup automation, and runbooks. Legal/compliance applicability and all live external integrations require organization-specific review and agreements.

## Frontend participant contract

Base path `/api/v1`; bearer `Authorization` header; tenant context is an organization ID in the route and is revalidated from database membership on every request. Errors use FastAPI's `{ "detail": "stable_error_code" }`. Timestamps must be ISO-8601 with timezone. Pagination currently uses bounded `limit` only. The OpenAPI document is generated from the app and should be the shared contract source.
