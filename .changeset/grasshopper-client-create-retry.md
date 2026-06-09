---
"@selvajs/compute": patch
---

Make `GrasshopperClient.create()` resilient to a cold or briefly-busy-but-up Compute server.

The pre-flight `/healthcheck` probe was a single-sample boolean gate with no retry and no timeout, so one missed probe (warm-up, a transient network blip, momentary non-200) made construction throw `NETWORK_ERROR` even though the server was online.

- `create()` now retries the healthcheck with exponential backoff (default 3 probes, 250ms→1s) before failing, configurable via the existing `config.retry` policy, and disposes the client on final failure.
- `isServerOnline(timeoutMs = 5000)` now bounds the probe with `AbortSignal.timeout` so a hung connection can't stall the caller; pass `0` to disable. The probe in `create()` always uses its own timeout, independent of `config.timeoutMs` (which may be `0` for long solves).
