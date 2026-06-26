---
'@selvajs/compute': minor
---

Detect server-side definition-cache misses by error code, not message.

When solving by `pointer` (server cache key), a stale/evicted key now reliably
triggers the transparent full-upload fallback even against a production Rhino
Compute server. Previously the miss was detected by string-matching the server's
exception message, which the server scrubs to a generic string when not in debug
mode — so the fallback never fired in production and the caller saw a hard error.

- Added `ErrorCodes.DEFINITION_NOT_CACHED`.
- `fetchRhinoCompute` now reads an optional machine `code` from the server's JSON
  error body and maps `"definition_not_cached"` onto that code, taking precedence
  over the status-derived classification.
- `solveByCacheKey` / `isDefinitionLoadMiss` match on the code first, keeping the
  legacy message match as a fallback for debug-mode servers and older forks.

Requires a Rhino Compute server that emits `code: "definition_not_cached"` on a
stale-pointer miss (VektorNode fork). Older servers continue to work via the
message fallback when running in debug mode.
