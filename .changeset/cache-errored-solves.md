---
'@selvajs/compute': minor
---

Add `cacheerroredsolves` opt-in for caching solves that report Grasshopper errors.

By default the Rhino Compute server never caches a solve whose definition reported
GH errors, so a definition that errors re-solves on every request — even when the
errors are by design (a guarded Python component, a filtered/pruned branch) and
the geometry is correct. Set `cacheerroredsolves: true` (alongside `cachesolve`)
to let such completed-but-errored solves into the server's solve cache.

- New optional field on `GrasshopperBaseSchema` and `GrasshopperComputeConfig`;
  forwarded to the `/grasshopper` request via `applyOptionalComputeSettings`.
- Default unset/false — fully backward compatible.
- Requires a Rhino Compute server that honors `cacheerroredsolves` (the VektorNode
  fork). Older servers ignore the unknown field.
