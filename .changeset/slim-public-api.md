---
'@selvajs/compute': major
---

Slim the public API surface: remove dead exports and internalize plumbing that was never part of the intended public API.

This narrows the published surface to the high-level client/scheduler/IO APIs and the documented extension seams. The internal implementation is unchanged — the removed symbols still exist as module-internal code where the library uses them; they're just no longer re-exported.

**Removed entirely (dead — no callers anywhere):**

- `base64ToRhinoObject` (core util) — unused internal decode helper.
- `getValueByParamName` / `getValueByParamId` methods on `GrasshopperResponseProcessor` — deprecated; use `getValue({ byName })` / `getValue({ byId })`.
- `Values` and `ProcessedDataItem` types — unused.
- The `normalizeDefault` schema-only wrapper — internal callers use `normalizeDefaultWithWarning`.

**Removed from the public API (still used internally; import the high-level API instead):**

- Hashing internals: `hashSolveInput`, `hashDefinition`, `stableStringify`, `fnv1a`, `fnv1aBytes` — the `SolveScheduler` handles caching for you.
- Scheduler wiring types: `SolveExecutor`, `CacheKeyExecutor`.
- Decoder engine: `decodeRhinoGeometry`, `decodeRhinoObject`, `DecodeRhinoOptions` — the public extension seam remains `registerDecoder`.
- IO/input plumbing: `processInputWithError` (use `processInput` / `processInputsWithErrors`), `extractFileData` (use `extractFilesFromComputeResponse` / `downloadFileData`).

**Unchanged / still public:** `GrasshopperClient`, `GrasshopperResponseProcessor`, `SolveScheduler` (+ `SolveResult`/`SolveContext`/`SolveSchedulerOptions`/`SchedulerMode`/`CacheOptions`), `processInput`/`processInputs`/`processInputsWithErrors`, `solveGrasshopperDefinition`, `fetchDefinitionIO`/`fetchParsedDefinitionIO`, `getValue`/`getValues`, `registerDecoder`, `TreeBuilder`, the file-handling helpers, `camelcaseKeys`, `ComputeServerStats`, and the full visualization toolkit.
