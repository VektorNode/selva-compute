---
'@selvajs/compute': patch
---

- Fold Rhino → Three coordinate transform into the mesh decompression read pass, eliminating a second pass over vertex data for batched WebDisplay meshes.
- Use `fflate.gunzip` (Web Worker) in browsers and `gunzipSync` in Node for batched mesh decompression, removing the `requestIdleCallback`/`setTimeout` scheduling hop.
- Skip excluded types (e.g. WebDisplay) in `getValue` / `getValues` so they no longer write `null` into aggregated results.
- `solveGrasshopperDefinition` no longer mutates the response object when stripping the `pointer` field; it returns a shallow copy instead.
- Fix `ComputeServerStats.getVersion` "Body has already been read" error when the response is non-JSON, by reading the body as text first.
- Tighten hex color parsing in `parseColor` to require exactly 6 hex characters.
