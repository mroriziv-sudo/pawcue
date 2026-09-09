# API

Full contract: [docs/api/openapi.yaml](docs/api/openapi.yaml). This doc covers the conventions that apply across
every endpoint rather than repeating per-route detail.

## Versioning

Every route is prefixed `/v1`. A breaking change gets a new prefix (`/v2`) rather than mutating `/v1` in place;
additive/backward-compatible changes (new optional field, new endpoint) don't require a version bump.

## Auth

Every route except `POST /v1/anonymous-session` and `GET /v1/lessons/:id` (public catalog read) requires a bearer
Supabase session JWT — which a guest has too, via anonymous sign-in (see AUTH.md). There is no separate "guest API
key" mechanism.

## Validation

Every request body is parsed with a Zod schema (mirroring `packages/domain`) before touching the database. A
validation failure returns `400` with the shape in `components.schemas.ApiError` in the OpenAPI file — never a raw
Postgres constraint error leaking to the client.

## Errors

```json
{
  "code": "VALIDATION_ERROR",
  "message": "dailyMinutes must be one of 5, 10, 15, 20",
  "requestId": "..."
}
```

`requestId` is generated per-request (propagated into server logs) so a user-reported bug can be traced to its exact
request without needing PII in the log line itself (brief §16: "logs without unnecessary PII").

## Rate limiting

Applied at the Edge Function gateway on write-heavy/abuse-prone routes: `POST /v1/anonymous-session`,
`POST /v1/purchases/verify`, `POST /v1/sessions/:id/events`. Read-only public catalog routes are not rate-limited
per-user (they're cacheable and don't touch owner-scoped data).

## Idempotency

`POST /v1/sessions/:id/events` and `POST /v1/auth/merge-guest` are idempotent by design — see
ARCHITECTURE.md §8 and DATABASE.md `merge_guest_session` — because offline mutation replay and merge retries are
both expected, not edge cases to special-case away.
