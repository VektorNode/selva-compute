---
"@selvajs/compute": patch
---

Fix `inputs is not iterable` crash when the server returns a malformed `/io` response.

A server fault can return a 200 whose body omits `inputs`/`outputs` (e.g. a definition-LOAD failure that surfaced as a malformed success instead of a clean 500). `fetchDefinitionIO` passed `response.inputs` straight through, and the downstream `for...of` in `processInputsWithErrors` threw `inputs is not iterable`.

- Coerce `inputs`/`outputs` to `[]` in `fetchDefinitionIO` using `Array.isArray` (not `?? []`) — the symptom is non-iterability, so a non-array truthy value like `{}` or a string must coerce too.
- The already-surfaced `loadErrors` / `loadWarnings` then explain *why* the list came back empty instead of the client crashing.
- Add regression tests covering missing, `null`, non-array-object, and string `inputs`/`outputs`.
