# Security and operations baseline

- Merchant-scoped queries bind the merchant ID from a signed session and re-check active membership on every request.
- Configure a high-entropy `SESSION_SIGNING_KEY` through a managed secret store. Rotate it using a planned session invalidation procedure.
- TLS termination, database encryption, production CORS allowlists, secret rotation, rate limits, structured redaction, and monitoring must be configured in the deployment environment.
- Local development bootstrap is disabled in production. Connect an OTP/identity provider before enabling merchant account flows.
- Financial amounts use decimal database columns. Collections are explicitly labeled as collections, not profit.
- Audit records capture approval decisions. Integrations must add idempotency keys, replay defense, verified provider outcomes, and immutable execution audit records before actions are enabled.
- Establish retention/deletion, access/export handling, incident response, backup encryption, restore drills, and data processing terms before ingesting real merchant data.
- Compliance claims require review by qualified Indian privacy, financial, lending and tax professionals.
- The current npm audit reports unresolved transitive Expo CLI findings (including `deepmerge` and nested Zod) in the build-tool dependency graph. The project must not pass a release security gate until the toolchain advisory status is resolved or a security reviewer documents an accepted mitigation. See [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) and [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

Initial service objectives to ratify with operators: API availability 99.5% monthly; p95 authenticated read latency below 500 ms for normal merchant histories; recovery point objective 15 minutes and recovery time objective 4 hours. These are targets, not measured guarantees.
