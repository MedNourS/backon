# Changelog

## 0.2.0

- Add `requireEnv(schema)` — validates `process.env` against a Zod schema once at startup, fails fast with every missing/invalid var named instead of the app booting cleanly and crashing later.
- Add `requireAuth(options)` — bearer JWT verification middleware for both adapters, built on `hono/jwt`. Verification only; issuing tokens is left to the consuming project.
- Add `rateLimit(options)` — in-memory token-bucket rate limiter for both adapters, 429 with a `Retry-After` header once a key exceeds its limit.

## 0.1.0

- Initial release: Hono adapter (`createApp`, `defineRoute`, `serve`, `AppError`, structured logging) plus an Express adapter with the same names and error shape, under `@mednours/backon/express`.
