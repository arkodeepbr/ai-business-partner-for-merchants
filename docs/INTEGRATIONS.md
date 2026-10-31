# Integration status

| Capability | Current state | Required before live use |
| --- | --- | --- |
| Payment transaction and settlement feed | Normalized merchant CSV import and read APIs; live provider sync unavailable | Authorized provider contract, credential vault, verified webhook/sync adapter |
| Google login and session lifecycle | Native Google sign-in with backend ID-token verification and short-lived app sessions | Google Cloud OAuth client IDs, Android package/SHA-1 registration, deployment key rotation and account recovery policy |
| LLM | Local development can use Ollama; hosted backend can use Cloudflare Workers AI `@cf/qwen/qwen3-30b-a3b-fp8`. Exact sales, payment, settlement and customer-due answers are read from merchant records; open-ended analysis uses a bounded snapshot | Cloudflare account ID and Workers AI Read API token in Render; confirm daily free quota and model access |
| Speech recognition and synthesis | English (`en-IN`) and Hindi (`hi-IN`) recognition uses Android; the authenticated backend uses the ElevenLabs Python SDK for MP3 replies, with Android voice fallback | Account quota/voice access, response-text disclosure, production usage limits, retention review and device testing |
| Lending offers and applications | Not implemented | Authorized lender adapters, disclosures, consent and compliance review |
| GST filing | Summaries not implemented as statutory filing | Verified tax rules and authorized filing integration; accountant review |
| Campaign delivery | Draft/approval record boundary only | Consent-aware customer source and authorized delivery provider |
| Push notifications | Not implemented | FCM/Expo credentials, delivery privacy and preference flows |

Google sign-in creates a merchant workspace for a verified Google identity the first time it is used. It does not connect a Paytm merchant account. The local-session endpoint is excluded when `APP_ENV=production`; it is only for local development. A successfully approved proposal does not execute any provider-side operation.

## Google sign-in setup

Create OAuth clients in the [Google Cloud Credentials page](https://console.cloud.google.com/apis/credentials). Configure an Android OAuth client for package `in.merchant.businesspartner` and the SHA-1 fingerprint of the debug signing key used on the emulator. Also create a **Web application** OAuth client: the native Google sign-in SDK uses this Web client ID to request the identity token that the backend verifies. Keep both IDs out of source control; the IDs are public configuration values, not private API secrets.

Set the Web client ID as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `mobile/.env` and as `GOOGLE_OAUTH_CLIENT_ID` in the backend environment. Rebuild and reinstall the Android development app after adding the native Google sign-in package. Set the same Web client ID on the backend and app so the backend can check the token audience. The app's Android package name is `in.merchant.businesspartner`. For iOS later, replace the placeholder `iosUrlScheme` in `mobile/app.json` with the reversed iOS client ID from Google Cloud.

The emulator debug fingerprint can be read with `keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android`. A release build has a different fingerprint and needs its own Android OAuth client registration. Without OAuth configuration, the Google button explains what's missing; the offline sample workspace remains available for demonstrations.

## Local development model

The backend uses Ollama with [`qwen3:0.6b`](https://ollama.com/library/qwen3:0.6b) by default. The quantized model download is about 523 MB and is Apache 2.0 licensed. Inference runs on the machine hosting the backend; there is no per-token API bill. First-time model download needs internet access, and response speed depends on that machine's CPU/RAM. This small model is suitable for a low-cost prototype, not a guarantee of production-grade financial reasoning.

The Compose stack downloads the model on first start and stores it in the named `ollamadata` volume. To pull it manually instead:

```sh
docker compose exec ollama ollama pull qwen3:0.6b
```

The API uses `http://ollama:11434` inside the private Compose network. When running the API directly on the host, the default is `http://127.0.0.1:11434`; install Ollama, run `ollama pull qwen3:0.6b`, then start Ollama with `ollama serve` and start the API. The backend rejects remote Ollama hosts so it cannot send merchant snapshots to an arbitrary model endpoint. Built-in numerical questions use database calculations; open-ended questions receive a bounded merchant snapshot on the local model. Sample-workspace answers remain rule-based and fictional.

For a command such as “keep ₹500 pending from Mr Suresh,” the assistant first displays a draft. It writes an internal customer-due record only after the merchant confirms. These notes are separate from payment history and settlement records. Asking who owes money reads these records back from the same merchant workspace.

## Hosted Qwen with Cloudflare Workers AI

The hosted Render API can call Cloudflare Workers AI, so the APK sends requests to the backend and does not load a language model or download model weights onto the phone. The selected Qwen model is `@cf/qwen/qwen3-30b-a3b-fp8`; merchant account snapshots are sent from the backend to Cloudflare for inference. Cloudflare documents zero retention for standard inference and says it does not use customer content to train models. The free Workers plan includes 10,000 Neurons per day; on that plan, requests fail after the daily allowance is used rather than continuing as paid usage. Review [Cloudflare's data usage terms](https://developers.cloudflare.com/workers-ai/platform/data-usage/) and [pricing/quota](https://developers.cloudflare.com/workers-ai/platform/pricing/).

Open Cloudflare [Workers AI](https://dash.cloudflare.com/?to=/:account/workers-ai), choose **Use REST API**, create a Workers AI API token with **Workers AI Read**, and copy the Account ID shown there. In Render's service environment, set `MODEL_PROVIDER=cloudflare`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`; leave `CLOUDFLARE_MODEL` as `@cf/qwen/qwen3-30b-a3b-fp8`. Keep the token only in Render's secret environment. See Cloudflare's [REST setup guide](https://developers.cloudflare.com/workers-ai/get-started/rest-api/).

The existing customer-due flow still validates a draft and asks for confirmation before writing. For example, “keep 500 rupees pending from Mr Suresh” creates only a proposed internal due; after confirmation it is saved in the signed-in merchant's database and can be queried later.

## Optional Gemini development setup

For non-sensitive prompts only, create a key in Google AI Studio and set `MODEL_PROVIDER=gemini`, `GEMINI_API_KEY`, and optionally `GEMINI_MODEL` in the repository-root `.env`. This optional provider only receives general questions; customer and payment rows are not sent. Google's free-tier terms say submitted content may be used to improve its products, so do not send personal, customer, payment, or other confidential merchant information through this setup.

The mobile sample workspace is intentionally offline and does not call Gemini. It loads fictional transactions from `mobile/assets/demo/merchant_transactions_sample.csv`; relative dates are shifted to the current India date when loaded. In the welcome screen, choose **Open presentation sample**. The CSV contains fictional sender labels and references; every screen labels those records as sample data, and no merchant or Paytm connection is made.

To use the backend assistant, run the API, use a local development workspace, and configure the app with `EXPO_PUBLIC_DEMO_MODE=false` and an emulator API URL such as `http://10.0.2.2:8000/api/v1`. Speech recognition uses Android; speech output uses ElevenLabs when configured and otherwise falls back to device text-to-speech. An emulator started with `-no-audio` cannot play replies; enable emulator audio and raise its media volume.

## Paytm API connection

The app keeps a Paytm connection status and CSV import entry in Profile. Live Paytm API sync is not implemented because authorized API access is currently unavailable. Do not paste merchant credentials into the app or Expo environment variables. When Paytm grants the merchant API contract and credentials, implement the documented provider adapter in the backend and provision its secrets through the server's ignored `.env.local` for development or a managed secret store for deployment. The app should receive only authenticated, normalized transaction data from that backend. The authorized CSV importer accepts optional `sender_name`, `sender_reference`, and `sender_contact` fields, which appear on the payment detail screen when supplied. Until then, use the clearly labeled presentation CSV or import a merchant-authorized CSV through the import screen.

## ElevenLabs reply voices

Run `npx -y @elevenlabs/cli@latest onboard init` from the repository root and follow its browser sign-in. It stores `ELEVENLABS_API_KEY` in the ignored root `.env.local`. Start Compose with `docker compose --env-file .env --env-file .env.local up --build`; Compose passes the key only to the API container. Optionally set `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL` in `.env` to choose the account's default voice or model. Do not put the key in Expo variables, the Android app, screenshots, or source control. Restart the API after changing it. The signed-in app loads voices from the configured account and can select one; speech is returned as MP3 through an authenticated API endpoint. The ElevenLabs key is never sent to the app.

Spoken assistant replies are sent to ElevenLabs to synthesize audio. This can include amounts or other information contained in a reply. Speech recognition still uses Android's speech service. In offline demo mode, or when the backend speech service is unavailable, replies use the installed Android text-to-speech voice instead. ElevenLabs usage is subject to the account's plan and quota. The daily briefing is generated when the dashboard opens; background/push delivery is not configured.
