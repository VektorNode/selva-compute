---
"@selvajs/compute": patch
---

Fix input defaults being silently dropped due to wire-casing mismatch.

The beta removed a global `camelcaseKeys` pass (which had been corrupting value-list label keys), but `normalizeDefault` still literal-matched the lowercase `innerTree` key. Because the `default` DataTree wrapper is serialized as PascalCase (`ParamName` / `InnerTree`) on every server branch — mcneel 8.x/9.x and the VektorNode Compute8 fork alike, since `Resthopper.IO.DataTree` carries no `[JsonProperty]` — the check never matched and every connected input default collapsed to `null` (with an `Unexpected structure in input.default` warning).

- Add a case-insensitive `readField` / `hasField` wire-field reader (`@/core/utils/read-field`).
- Read the `default` wrapper (`innerTree`) and item fields (`data` / `type`) case-insensitively, so defaults parse correctly regardless of server-branch casing without re-introducing the label-mangling global camelCase pass.
- Surface a genuinely unrecognized default shape (no tree key at all) as a client-visible `MALFORMED_DEFAULT` entry in `parseErrors` instead of only logging a server-side warning — so a dropped default is observable on both client and server rather than vanishing silently.
- Add regression tests pinning the real PascalCase wire shape, including a guard that a non-empty tree default can never silently become `null`.
