---
'@selvajs/compute': minor
---

Expand `ComputeServerStats` to cover the full rhino.compute proxy/control surface (excluding the SELVA schema endpoints) so consumers no longer hand-roll fetches:

- `getInstalledPlugins(kind)` — `/plugins/{gh,rhino}/installed`
- `getServerTime()` — `/servertime`
- `getIdleSpan()` — `/idlespan`
- `launchChildren()` / `launchChild(port)` — `/launch-children`, `/launch-child`
- `shutdownChildren(port?)` / `recycleChildren(port?)` — child-lifecycle controls
- `purgeAllChildren()` — best-effort fleet-wide cache purge (loops `/cache/purge` across the round-robin pool; reports a `confident` flag, exact only at a single-child pool)
- `getActiveChildren({ initialize })` — pass `initialize: false` for a passive count that does not spawn (and wake/bill) an idle server; `getServerStats()` now uses this passive read

**Fix:** `isServerOnline()` now probes the proxy liveness root `/` instead of the non-existent `/healthcheck` route. The rhino.compute proxy never exposed `/healthcheck`; the old probe was forwarded to a child for an unknown path, so it reported reachability of a child rather than the proxy.
