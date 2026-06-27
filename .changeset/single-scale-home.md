---
'@selvajs/compute': major
---

Give the webdisplay orchestrator sole ownership of unit→scale, and remove the `scaleFactor` option from `parseMeshBatchObject` and `parseMeshBatchBlob`.

`scaleFactor` was applied in two places: the batch parsers scaled meshes when `scaleFactor !== 1`, _and_ the webdisplay orchestrator independently re-scaled the returned meshes from `modelunits`. The real extraction path goes through the orchestrator, which never passed `scaleFactor` into the parsers — so the in-parser knob was dead on that path, but a caller using `parseMeshBatchObject`/`Blob` directly _and_ the orchestrator would double-scale.

Unit scaling is a model-level concern that only the orchestrator can source (it owns `modelunits`), so it is now the single scaling home. The `scaleFactor?` option is removed from both parsers; they always emit identity-scaled meshes. The orchestrator's behavior (`getThreeMeshesFromComputeResponse`) is unchanged.

**Migration:** callers using `parseMeshBatchObject`/`parseMeshBatchBlob` directly with a `scaleFactor` should scale the returned meshes themselves (`mesh.scale.set(s, s, s)`), or go through `getThreeMeshesFromComputeResponse`, which derives the scale from `modelunits`.
