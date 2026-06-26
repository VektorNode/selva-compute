---
'@selvajs/compute': minor
---

Surface a definition-cache verdict on successful solves via `SolveResult.definitionReuploaded`.

When `reuseServerDefinitionCache` is enabled the scheduler solves by server cache-key
(pointer) and only re-uploads the full definition on a stale-pointer miss. The
underlying executor already computed this `missed` flag for telemetry, but
`runExecutor` discarded it before the result reached `onSettle`, so consumers had no
way to tell a definition-cache HIT from a re-upload.

The `success` variant of `SolveResult` now carries an optional `definitionReuploaded`:

- `false` — the server reused its cached definition via the pointer (no upload).
- `true` — the pointer was cold/stale, so the full definition was re-uploaded.
- `undefined` — the server-definition-cache fast path didn't run (reuse disabled, or
  a non-reusable definition such as a remote-URL source).

Additive and optional, so existing `onSettle` consumers are unaffected.
