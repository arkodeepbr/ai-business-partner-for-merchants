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

## Account sign-in and delivery setup

The sign-in screen supports email/password accounts, email verification codes, SMS one-time codes, Google OAuth, email OTP password recovery, password changes, and sign-out. Supabase Auth sends and verifies credentials; the web app does not generate or store OTPs. A FastAPI session exchange validates the Supabase token and maps that verified identity to the API's short-lived bearer session.

To enable real delivery and Google sign-in:

1. Create a Supabase project and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `web/.env.local`. Set matching `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the private backend environment. Never use a service-role key in the browser.
2. Enable email and phone providers in Supabase Auth. Set email confirmation and password recovery templates to include the numeric `{{ .Token }}` code; this screen verifies email OTPs. Configure production SMTP for reliable email delivery.
3. Configure an SMS provider in Supabase, along with sender registration, abuse limits and CAPTCHA. For Indian numbers, complete the applicable DLT registration and template setup with the SMS provider.
4. Add Google OAuth client ID and secret to the Supabase Google provider, and register Supabase's callback URL with Google. Set the Supabase Site URL to the deployed app; allow `http://localhost:3000` and callback `http://localhost:3000/auth/callback` for local development.
5. Apply backend migrations with `alembic upgrade head`, then restart the API and web app.

Until the provider settings exist, the sign-in page works but real email/SMS delivery and Google authentication cannot complete. The API session endpoint returns a configuration error until its private Supabase settings are set. Creating an identity does not automatically grant merchant data access; a verified organization membership is still required.

## Current frontend behavior

- Responsive browser shell based on the current Paytm Saathi concept preview's palette, typography, card treatment, and navigation.
- Uses a Supabase cookie-backed identity session, exchanges it for a short lived API bearer token held in memory, and calls the shared `/me`, sales summary, transactions, and assistant endpoints.
- In disconnected demo mode, shows clearly labelled sample sales, daily collections, transactions, and settlements. Once an authorized merchant organization is connected, the sample figures disappear and only API data is shown.
- The local demo assistant answers sales totals, today/yesterday, best day, daily breakdown, average payment, failed payments, payment methods, recent transactions, and sample settlements from the seeded dataset.
- Natural assistant conversation uses an authenticated Sarvam chat endpoint when `AI_API_KEY` is configured on the backend. It can answer greetings and general questions in English, Hindi, or Kannada, while refusing to invent account-specific amounts. Demo sales figures remain explicitly labelled sample data.
- An accessible English/Hindi language selector currently translates core navigation labels only.
- Voice requests use the browser microphone permission and speech recognition; text commands remain available in every browser. Saathi automatically speaks replies through a same-origin ElevenLabs proxy when configured, falls back to browser speech otherwise, and keeps a floating assistant with a “Hear reply” control on every page.
- Other business areas clearly report that their shared API services are unavailable rather than presenting nonfunctional forms or fake offers.

Conversation storage/streaming, approvals, inventory, customers, lending, tax, notification, and settings APIs are also not present in the current backend contract. Voice recordings are transcribed server-side with ElevenLabs Scribe v2; browser speech recognition is used as a fallback. Microphone permission is required, and transcription uses the configured ElevenLabs account.

### ElevenLabs voice replies

The web server proxies text-to-speech requests to ElevenLabs so the API key never enters the browser. Copy `.env.example` to `.env.local` and set `ELEVENLABS_API_KEY`; the provided voice ID and multilingual model are already configured. When the key is absent or the provider is unavailable, Saathi falls back to browser speech. The floating assistant stays at the lower-right of the screen and offers **Hear reply** for browser autoplay restrictions. See the [ElevenLabs text-to-speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).

### AI and Paytm provider setup

General conversation is authenticated and sends only the bounded chat history and the signed-in user's profile name. Merchant-specific figures use the separate grounded, read-only endpoint after an authenticated session and explicit provider consent. Never put provider credentials in this web app. For Sarvam Chat Completions, configure `AI_API_BASE_URL=https://api.sarvam.ai/v1`, `AI_MODEL=sarvam-105b-conversations`, and `AI_API_KEY` in the backend's private `.env`. The AI key is currently blank in this local backend, so dynamic conversation needs that private key before it can respond. See [Sarvam Chat Completion API documentation](https://docs.sarvam.ai/api/token-factory/chat-completions).

This frontend branch includes a small FastAPI session bridge under `backend/` and contains no Android app. It does not include a live Paytm provider adapter and the API currently supports a small read-only sales/transactions/assistant contract. To finish live Paytm data, the project owner needs to enable a Paytm merchant sandbox/API product in the [Paytm developer dashboard](https://dashboard.paytmpayments.com/next/apikeys) and provide the applicable official API specification, required product access, and test credentials directly to the backend secret store (never in chat or a committed file). The public merchant integration docs distinguish product-specific APIs and credentials; a payment-gateway key alone does not grant access to Soundbox events, inventory, customers, lending, or tax services.

## Visual reference status

No Android Stitch export or screenshots were present in the workspace. At the user's direction, the existing web concept preview is used as a temporary reference. This does not establish Android design parity. The Playwright project captures mobile and desktop screenshots to review layout; screenshot comparison against Stitch needs the actual Android artifacts.

## Security and deployment

The browser bundle contains no provider secrets or service-role key. The API bearer token is held in memory only and disappears on reload. Configure HTTPS, production CORS allowlists, CSP, monitoring, identity project/provider delivery, and a generated lockfile before release. The app adds baseline security headers; the hosting edge should enforce the final CSP and transport policy.
