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
- Voice requests use the browser microphone permission and speech recognition; text commands remain available in every browser. Saathi automatically speaks replies through a same-origin ElevenLabs proxy when configured, falls back to browser speech otherwise, and keeps a floating assistant with a “Hear reply” control on every page.
- Other business areas clearly report that their shared API services are unavailable rather than presenting nonfunctional forms or fake offers.

The backend does not yet expose login/OTP/session creation, so a merchant cannot sign in through the app yet. There is no browser token storage shortcut. Conversation history, streaming, approvals, inventory, customers, lending, tax, notification, and settings APIs are also not present in the current backend contract. Browser speech recognition and fallback speech do not need a Paytm API key, but they do depend on browser support and microphone permission.

### ElevenLabs voice replies

The web server proxies text-to-speech requests to ElevenLabs so the API key never enters the browser. Copy `.env.example` to `.env.local`, then set `ELEVENLABS_API_KEY` and a voice ID from your ElevenLabs account. The multilingual model setting is prefilled. When those values are absent or the provider is unavailable, Saathi falls back to browser speech. The floating assistant stays at the lower-right of the screen and offers **Hear reply** for browser autoplay restrictions. See the [ElevenLabs text-to-speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).

### AI and Paytm provider setup

The assistant sends grounded, read-only answers only after an authenticated merchant session, an AI provider is configured on the backend, and the merchant has consented to send the selected organization’s data to that provider. Never put API credentials in this web app. For Sarvam Chat Completions, the backend can use `AI_API_BASE_URL=https://api.sarvam.ai/v1`, `AI_MODEL=sarvam-105b-conversations`, and `AI_API_KEY` in the backend's private `.env`; add an organization ID to `AI_DATA_CONSENT_ORGANIZATION_IDS` only after that merchant has explicitly consented. See [Sarvam Chat Completion API documentation](https://docs.sarvam.ai/api/token-factory/chat-completions).

This frontend branch does not contain the Android app or backend. The shared backend still has no merchant login/session issuance or live Paytm provider adapter, and currently supports only a small read-only sales/transactions/assistant contract. To finish live Paytm data, the project owner needs to enable a Paytm merchant sandbox/API product in the [Paytm developer dashboard](https://dashboard.paytmpayments.com/next/apikeys) and provide the applicable official API specification, required product access, and test credentials directly to the backend secret store (never in chat or a committed file). The public merchant integration docs distinguish product-specific APIs and credentials; a payment-gateway key alone does not grant access to Soundbox events, inventory, customers, lending, or tax services.

## Visual reference status

No Android Stitch export or screenshots were present in the workspace. At the user's direction, the existing web concept preview is used as a temporary reference. This does not establish Android design parity. The Playwright project captures mobile and desktop screenshots to review layout; screenshot comparison against Stitch needs the actual Android artifacts.

## Security and deployment

The browser bundle contains no provider secrets. The API bearer token is held in memory only and disappears on reload. Authentication must be connected to the shared backend's secure session flow before deployment. Configure HTTPS, production CORS allowlists, CSP, monitoring, an authorized identity integration, and a generated lockfile before release. The app adds baseline security headers; the hosting edge should enforce the final CSP and transport policy.
