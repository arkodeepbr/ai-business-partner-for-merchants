# Paytm Saathi web app

This Next.js App Router client is the browser companion for the shared FastAPI backend. It consumes the versioned contract at `../contracts/openapi.yaml`; TypeScript API types live in `src/lib/api-schema.ts` and can be regenerated with `npm run generate:api`.

## Local setup

Requires Node.js 20.9 or newer. Start the API separately, then:

```powershell
Copy-Item .env.example .env.local
npm ci
npm run generate:api
npm run dev
```

The site runs at `http://localhost:3000`. Set `NEXT_PUBLIC_API_BASE_URL` to the shared API origin. `npm run build`, `npm test`, and `npm run test:e2e` are the build and verification commands. Install a browser once for e2e checks with `npx playwright install chromium`.

## Container deployment

Build the standalone image with the public HTTPS API origin embedded at build time:

```powershell
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t paytm-saathi-web:local .
docker run --rm -p 3000:3000 paytm-saathi-web:local
```

The image runs as a non-root user and includes a basic HTTP health check. Terminate TLS at the deployment ingress, allow the deployed web origin in backend CORS configuration, and configure the backend and identity/session integration before exposing merchant data.

## Current frontend behavior

- Responsive browser shell based on the current Paytm Saathi concept preview's palette, typography, card treatment, and navigation.
- Uses short lived bearer token state in memory and calls the shared `/me`, sales summary, transactions, and assistant endpoints.
- Displays empty, loading, unavailable, and provider-not-configured states without substituting concept-preview figures.
- An accessible English/Hindi language selector currently translates core navigation labels only.
- Other business areas clearly report that their shared API services are unavailable rather than presenting nonfunctional forms or fake offers.

The backend does not yet expose login/OTP/session creation, so a merchant cannot sign in through the app yet. There is no browser token storage shortcut. Conversation history, streaming, voice, approvals, inventory, customers, lending, tax, notification, and settings APIs are also not present in the current backend contract.

## Visual reference status

No Android Stitch export or screenshots were present in the workspace. At the user's direction, the existing web concept preview is used as a temporary reference. This does not establish Android design parity. The Playwright project captures mobile and desktop screenshots to review layout; screenshot comparison against Stitch needs the actual Android artifacts.

## Security and deployment

The browser bundle contains no provider secrets. The API bearer token is held in memory only and disappears on reload. Authentication must be connected to the shared backend's secure session flow before deployment. Configure HTTPS, production CORS allowlists, CSP, monitoring, an authorized identity integration, and a generated lockfile before release. The app adds baseline security headers; the hosting edge should enforce the final CSP and transport policy.
