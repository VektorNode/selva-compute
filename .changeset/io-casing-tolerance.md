---
"@selvajs/compute": patch
---

Fix `/io` parsing returning zero inputs (or crashing) on PascalCase server responses.

beta.3 read the `/io` response straight through as camelCase (`response.inputs`, `schema.paramType`, …). That only holds when the server emits fully camelCase IO (the VektorNode Compute8 fork with `[JsonProperty]` on every field). Upstream-tracking branches (mcneel 8.x/9.x, `8.x.selva`) keep the C# classes close to source, so the top-level wrapper is PascalCase `Inputs`/`Outputs` and per-param fields are `ParamType`/`Minimum`/`Name`/… — and if a `[JsonProperty]` is ever dropped, individual fields silently revert to PascalCase. On such a server every read missed: `response.inputs` was `undefined`, so the input list came back empty (or, before the array guard, threw `inputs is not iterable`).

- Read the top-level `Inputs`/`Outputs` case-insensitively via `readField` in `fetchDefinitionIO`, then guard each to an array with `Array.isArray` (not `?? []` — the symptom is non-iterability, so a non-array truthy value like `{}` or a string must coerce to `[]` too). The already-surfaced `loadErrors`/`loadWarnings` then explain *why* a list came back empty instead of the client crashing.
- Normalize each input/output record's field casing once at the parse boundary (`normalize-schema.ts`), so the per-type parsers stay branch-agnostic and read straight through. Only field KEYS are canonicalized — `default` (handled separately by `normalize-default`) and user-authored value-list `values` label keys ("Option A") are passed through verbatim, avoiding the label-mangling that a deep `camelcaseKeys` pass caused.
- The client is now casing-agnostic: identical camelCase and PascalCase `/io` bodies parse to the same typed result.
- Add regression tests pinning both wire shapes end-to-end, plus the malformed/non-array `inputs`/`outputs` guards.
