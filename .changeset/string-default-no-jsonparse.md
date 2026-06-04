---
"@selvajs/compute": patch
---

Fix tree-access `System.String` defaults being JSON-parsed, corrupting value-list inputs on the wire.

The 2.0 input-normalization pipeline (`normalize-default.ts`) JSON-parsed any tree-access item typed `System.String` whose `data` started with `[` or `{`. A multi-value `Dynamic_ValueList` sends exactly such labels (e.g. `"[1,2,3]"`), so its default was turned into a real array on the leaf `data`. The Rhino.Compute (VektorNode) fork expects that leaf to be a string and its Newtonsoft reader throws `Unexpected character ... value: [` at the leaf position, crashing the solve. 1.5.3 sent the raw string, so this was a 2.0-line regression.

- Restrict the JSON.parse branch in `normalizeDefaultWithWarning` to `Rhino.Geometry*` types (which really are JSON-encoded on the wire). `System.String` now falls through and round-trips unchanged.
- Add a regression test pinning that bracket-leading string tree values stay strings.
