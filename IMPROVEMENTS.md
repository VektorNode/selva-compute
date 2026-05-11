# Codebase Improvement Plan: `@selvajs/compute`

Audit findings from a full-repo scan. Grouped by severity, with file links and concrete fix suggestions. Items at the bottom are picks for "do first."

---

## 🔴 Correctness / behavioral bugs

### 1. `parseColor` accepts impossible hex inputs ✅ FIXED

**File:** [src/features/visualization/threejs/three-helpers.ts:117](src/features/visualization/threejs/three-helpers.ts#L117)

The check was `if (trimmed.startsWith('#') || /^[0-9A-Fa-f]{6}$/.test(trimmed))` — any `#`-prefixed string of any length passed the first branch, so `"#zzz"` reached `new THREE.Color(hex)`.

**Resolution:** Tightened to `/^#?[0-9A-Fa-f]{6}$/`. Invalid hex now falls through to the named-color branch.

---

### 2. `applyCoordinateTransform` is mathematically a no-op for "Z-up → Y-up" ❌ NOT A BUG

**File:** [src/features/visualization/webdisplay/batch-parser.ts](src/features/visualization/webdisplay/batch-parser.ts) (transform now folded into [mesh-compression.ts](src/features/visualization/webdisplay/mesh-compression.ts))

The transform produces `(x, y, z) → (x, z, -y)`. This is **intentional** — downstream camera/scene setup expects this exact orientation, and the behavior is locked in by tests in `batch-parser.test.ts` ("rotates by -90deg around X: (x, y, z) -> (x, z, -y)").

**Resolution:** No change. The original audit's "correct" mapping `(x, z, y)` would mirror scenes that currently render correctly. Do not "fix" this.

---

### 3. `decompressBatchedMeshData` claims "Web Worker" but uses the main thread ✅ FIXED

**Files:** [src/features/visualization/webdisplay/mesh-compression.ts](src/features/visualization/webdisplay/mesh-compression.ts), [src/features/visualization/webdisplay/webdisplay-parser.ts](src/features/visualization/webdisplay/webdisplay-parser.ts)

Was using `requestIdleCallback` / `setTimeout(0)` — both main-thread.

**Resolution:** Switched to `fflate.gunzip` (callback API) in browsers — fflate spawns a Web Worker — and `gunzipSync` in Node. Browser/Node detection via the `IS_BROWSER` constant. The coordinate transform is now folded into the vertex read so we only pass over the buffer once.

---

### 4. `isBase64` rejects valid base64 with `-_` (URL-safe alphabet) ❌ NOT A BUG (in this codebase)

**File:** [src/core/utils/encoding.ts:37](src/core/utils/encoding.ts#L37)

Only `A-Za-z0-9+/` is accepted. The audit suggested adding `-_` to the regex.

**Resolution:** No change. Only caller is [solve.ts:92](src/features/grasshopper/compute/solve.ts#L92), and the downstream decoder (`decodeBase64ToBinary` → `Buffer.from(s, 'base64')` / `atob`) does **not** handle URL-safe base64 either. Accepting URL-safe input here would silently produce wrong bytes downstream — strictly worse than the current behavior of treating it as plain text and re-encoding it. If we ever need to support URL-safe input, fix the decoder first, then the validator.

---

### 5. `extractItemValue` returns `null` for excluded types — silently drops keys ✅ FIXED

**File:** [src/features/grasshopper/io/output/response-processors.ts](src/features/grasshopper/io/output/response-processors.ts)

When `isExcludedType()` matched `WebDisplay`, `null` was written into the result and aggregated as if it were data, producing things like `[null, realValue]`.

**Resolution:** Lifted `isExcludedType` checks up to the call sites in `getValues` and `getValue` — excluded items are now skipped entirely via `forEachTreeItem` early-return. `extractItemValue` no longer returns a sentinel.

---

### 6. `ComputeServerStats.getVersion` chains `response.json()` then `response.text()` ✅ FIXED

**File:** [src/core/server/compute-server-stats.ts:159](src/core/server/compute-server-stats.ts#L159)

`response.json()` consumed the body; the fallback `response.text()` would throw "Body has already been read."

**Resolution:** Read body as text once via `await response.text()`, then attempt `JSON.parse(text)` inside try/catch. Falls back to plain-text version on parse failure.

---

### 7. `solve.ts` strips `pointer` from result — but mutates the response ✅ FIXED

**File:** [src/features/grasshopper/compute/solve.ts:51](src/features/grasshopper/compute/solve.ts#L51)

`delete (result as any).pointer` mutated the object the scheduler may have already cached or returned to a caller.

**Resolution:** Replaced with a destructure-based shallow copy: `const { pointer: _pointer, ...rest } = result; return rest`. No mutation of the original object.

---

## 🟡 Behavioral / design issues

### 8. `parallel` and `queue` modes share identical logic in the scheduler ✅ FIXED

**File:** [src/features/grasshopper/scheduler/solve-scheduler.ts](src/features/grasshopper/scheduler/solve-scheduler.ts)

The two `case` branches were byte-for-byte identical. Distinction (`parallel` is unordered, `queue` is FIFO) is realized via `maxConcurrent` defaulting to 4 vs 1, set in the constructor.

**Resolution:** Collapsed to a fall-through `case 'queue': case 'parallel':` with a one-line comment noting the constructor sets the defaults.

---

### 9. `latest-wins` aborts in-flight + sets pending: race with `drainNext()` ✅ FIXED

**File:** [src/features/grasshopper/scheduler/solve-scheduler.ts](src/features/grasshopper/scheduler/solve-scheduler.ts)

When aborting in-flight + setting `pendingForLatestWins`, `drainNext()` runs in the in-flight's `finally`. If a brand-new `solve()` arrived between abort and finally, ordering was fragile and the executor's `AbortError` could overwrite the original supersede on `_lastError`.

**Resolution:** Added a `settled` field on each item (first-settle wins) so a late executor rejection becomes a no-op. Added five new tests: race with 10 back-to-back solves, supersede during abort window, `_lastError` reflects the original supersede cause, plus typed-code checks for `SUPERSEDED` / `ABORTED`. All 21 scheduler tests pass.

---

### 10. Scheduler "Superseded" rejects use `UNKNOWN_ERROR` code ✅ FIXED

**File:** [src/features/grasshopper/scheduler/solve-scheduler.ts](src/features/grasshopper/scheduler/solve-scheduler.ts), [src/core/errors/error-codes.ts](src/core/errors/error-codes.ts)

The doc on `solve()` previously said to check `code: ErrorCodes.UNKNOWN_ERROR` and `message: 'Superseded'`. Comparing on a string message is fragile.

**Resolution:** Added `ErrorCodes.SUPERSEDED` and `ErrorCodes.ABORTED`. Scheduler now rejects with these codes, and the executor's downstream `AbortError` is normalized in a dedicated helper so it doesn't overwrite the original cause. Doc updated and tests added asserting both codes.

---

### 11. `GrasshopperClient.solve` checks `'message' in result && !('fileData' in result)` to detect errors ✅ FIXED

**File:** [src/features/grasshopper/client/grasshopper-client.ts](src/features/grasshopper/client/grasshopper-client.ts)

Brittle structural check — depends on the response not having a property called `fileData`.

**Resolution:** Replaced with a check against the actual API contract: `result.errors` is a `string[]` populated by `handleResponse` for partial-success (HTTP 500 with values + errors). The error message now joins the actual errors and the context includes both `errors` and `warnings` arrays.

---

### 12. `extractFileData` validation is a runtime type-narrow without a guard ✅ FIXED

**File:** [src/features/grasshopper/io/output/response-processors.ts](src/features/grasshopper/io/output/response-processors.ts)

The five-property structural check was inlined in `extractFileData`.

**Resolution:** Extracted `isFileData(value): value is FileData` as a named type guard at the top of the file. `extractFileData` now calls it directly, and the guard narrows `parsed` so the cast is gone.

---

### 13. `processInput` always returns `createSafeDefault` on validation errors ✅ FIXED

**File:** [src/features/grasshopper/io/input/input-processors.ts](src/features/grasshopper/io/input/input-processors.ts), [src/features/grasshopper/io/definition-io.ts](src/features/grasshopper/io/definition-io.ts), [src/features/grasshopper/types/parsed.ts](src/features/grasshopper/types/parsed.ts)

Failed parse → silent fallback to a safe default. User had no signal their input was wrong.

**Resolution:** Added `processInputWithError` and `processInputsWithErrors` that return `{ inputs, parseErrors }`. New `InputParseError` type (with `inputName`, `paramType`, `message`, `code`) is exported. `fetchParsedDefinitionIO` now populates `parseErrors[]` on the `GrasshopperParsedIO` result when any input fell back. Old `processInput`/`processInputs` keep their original signatures for back-compat.

---

## 🟢 Defensive bloat / dead code

### 14. `encoding.ts:base64ByteArray` — 130 lines of paranoia ✅ FIXED

**File:** [src/core/utils/encoding.ts](src/core/utils/encoding.ts)

Almost every line of the loop had `if (typeof a !== 'number' || a < 0 || a >= encodings.length) throw …` for values just produced from `& 63`, `& 252) >> 2`, etc. — guaranteed in range.

**Resolution:** Collapsed to ~15 lines. Uses `Buffer.from(bytes).toString('base64')` in Node and a chunked `btoa(String.fromCharCode(...))` fallback in browsers. The chunking (32K at a time) avoids call-stack overflow on large inputs. BOM-stripping was dropped — `.gh` files are zip archives, not text.

---

### 15. Two equally-valid validation modules with overlap ✅ FIXED

**File:** [src/features/grasshopper/io/input/input-validators.ts](src/features/grasshopper/io/input/input-validators.ts)

**Resolution:** Confirmed via grep that only `preProcessInputDefault` was used externally. Deleted `validateValueListValues`, `validateValueListDefault`, `validateInputStructure`, `validateRequiredProperties`, `validateNumericConstraints`, `validateParameterType`, `extractNumericPrecision`, `normalizeGroupName`, and the `ValidationContext` type. The file is now ~80 lines (was ~290) and only contains `preProcessInputDefault`.

---

### 16. `RhinoComputeError` static helpers are unused in public surface ✅ FIXED

**File:** [src/core/errors/base.ts](src/core/errors/base.ts)

`validation`, `invalidDefault`, `invalidStructure` were only called from the now-deleted validators in #15.

**Resolution:** Removed `validation`, `invalidDefault`, `invalidStructure`. Kept `missingValues` (used in `input-parsers.ts:processValueListInput`) and `unknownParamType` (used in `input-processors.ts`).

---

### 17. `RhinoComputeError` always copies `originalError` to `cause` — guard is impossible ✅ FIXED

**File:** [src/core/errors/base.ts](src/core/errors/base.ts)

**Resolution:** Removed the `'cause' in Error.prototype` guard. Since `engines` requires Node 20+ and the project's `lib` is still ES2020 (so the typings don't accept the second arg to `super`), the constructor now sets `cause` directly on `this` after `super(message)` rather than going through `Object.defineProperty`.

---

### 18. `setLogger` accepts `Console | null | Logger` then misroutes ✅ FIXED

**File:** [src/core/utils/logger.ts](src/core/utils/logger.ts)

The dual structural-narrowing branch was unreachable — every non-null arg already had the four methods, so the `else { new ConsoleLogger() }` branch was dead.

**Resolution:** Collapsed to a single ternary: `null` → `NoOpLogger`, otherwise cast to `Logger`. `Console` already satisfies `Logger` structurally.

---

### 19. `toCamelCase` has two near-identical code paths ✅ FIXED

**File:** [src/core/utils/camel-case.ts](src/core/utils/camel-case.ts)

The `preserveSpaces` toggle had two duplicate replace pipelines.

**Resolution:** Collapsed to one expression with the separator class chosen by the toggle (`/[\s-_]+/` vs `/[-_]+/`). 9 camelCase tests still pass.

---

### 20. `data-tree.ts` `replaceTreeValue` and `getTreeValue` have full duplicate paths for `TreeBuilder[]` vs `DataTree[]` ✅ FIXED

**File:** [src/features/grasshopper/data-tree/data-tree.ts](src/features/grasshopper/data-tree/data-tree.ts)

**Resolution:** Both methods now branch only on `trees[0] instanceof TreeBuilder` and dispatch to small private helpers — `buildFromValue` (shared between both array shapes), `readFromBuilders` (uses `flatten()` across all branches), and `readFromDataTrees` (first-branch read, current API semantics). The duplicate value-shape and unwrap logic is now in one place each. The empty-array edge case (an empty `TreeBuilder[]` lands in the DataTree branch) is preserved and pinned by the existing characterization test. The `instanceof` check on `trees[0]` is acknowledged as the heuristic it always was — mixed arrays are not supported and there's no realistic call path that produces them.

---

### 21. `compute-fetch.ts` 429 retry: doesn't drain on retryable status when attempts are exhausted ❌ NOT A BUG

**File:** [src/core/compute-fetch/compute-fetch.ts](src/core/compute-fetch/compute-fetch.ts)

The original concern was that the last 429 attempt skips the drain. But on the final attempt, we _want_ to fall through to `handleResponse` — it reads the body itself with `await response.text()` to surface error context. Draining "unconditionally on retryable status" would leave `handleResponse` with an empty body and worse error messages.

**Resolution:** Comment clarified to spell out the intent: drain only when retrying, since the final attempt's body is consumed by `handleResponse` for error reporting. No code change.

---

### 22. `composeSignal` manual fallback may leak listeners on caller-supplied signals ✅ FIXED

**File:** [src/core/compute-fetch/compute-fetch.ts](src/core/compute-fetch/compute-fetch.ts), [src/core/compute-fetch/**tests**/compose-signal.test.ts](src/core/compute-fetch/__tests__/compose-signal.test.ts)

**Resolution:** Audit confirmed the cleanup is sound — `removeEventListener` runs over every signal regardless of whether `addEventListener` succeeded for it (so the early `break` on an already-aborted signal can't leak), and `{ once: true }` covers the fire-and-forget case. Exported `composeSignal` for tests and added a leak test that forces the manual-fallback path (by stubbing `AbortSignal.any` / `AbortSignal.timeout`), runs 50 compose/cleanup cycles, and asserts `addEventListener('abort')` and `removeEventListener('abort')` call counts match. Also covers the timeout-fallback timer cleanup (`getTimerCount` round-trip) and the already-aborted input case.

---

## 🔵 API / DX nits

### 23. Public API exposes three ways to read values ✅ FIXED

**File:** [src/features/grasshopper/client/grasshopper-response-processor.ts](src/features/grasshopper/client/grasshopper-response-processor.ts)

**Resolution:** Added `getValue(selector: { byName } | { byId }, options?)` as the canonical single-value reader — same selector shape as the underlying `getValue` helper. `getValueByParamName` and `getValueByParamId` are kept as `@deprecated` thin wrappers so external consumers don't break on upgrade; remove them in a future major.

---

### 24. `GrasshopperClient.dispose()` checks `'dispose' in this.serverStats` — type-level redundant ✅ FIXED

**File:** [src/features/grasshopper/client/grasshopper-client.ts](src/features/grasshopper/client/grasshopper-client.ts)

`ComputeServerStats` is constructed in the constructor and has a known `dispose()` method. The `if ('dispose' in ...)` narrowing was a leftover.

**Resolution:** Replaced the guard with a direct `await this.serverStats.dispose()` call.

---

### 25. `ComputeConfig.suppressClientSideWarning` plumbed everywhere but only consulted in one place ✅ FIXED

**Files:** [src/core/types.ts](src/core/types.ts), [src/features/grasshopper/compute/solve.ts](src/features/grasshopper/compute/solve.ts), [src/features/grasshopper/io/definition-io.ts](src/features/grasshopper/io/definition-io.ts), [src/features/grasshopper/client/grasshopper-client.ts](src/features/grasshopper/client/grasshopper-client.ts)

**Resolution:** Added `suppressBrowserWarning` to `ComputeConfig`. The old `suppressClientSideWarning` is kept as `@deprecated` for back-compat. All three call sites (`solve`, `fetchParsedDefinitionIO`, `normalizeComputeConfig`) read `suppressBrowserWarning ?? suppressClientSideWarning`, so callers using either name keep working. README updated to advertise the new name only.

---

## Recommended order

All code-level items resolved: #1–#25. The remaining work is structural (S-series below).

---

# Folder Structure Review

The current shape is already pretty good — `core` / `features` split, feature folders are cohesive, tests live next to code. Below is polish, not overhaul.

## What's working

- **`core/` vs `features/`** split is the right boundary. Core is generic plumbing (HTTP, errors, logger); features are domain-specific (grasshopper, visualization).
- **Feature folders are cohesive** — `grasshopper/scheduler`, `grasshopper/client`, etc. each own a focused concern.
- **Tests colocated** in `__tests__/` next to source — good for discoverability.
- **Three sub-package entry points** (`grasshopper`, `visualization`, `core`) via `package.json` exports — gives users tree-shakeable, scoped imports.

---

## 🔴 Issues worth fixing

### S1. Re-export pyramid: 4 layers for the same symbols ✅ FIXED

Trace `GrasshopperClient`:

- [src/features/grasshopper/client/grasshopper-client.ts](src/features/grasshopper/client/grasshopper-client.ts) — defined
- [src/features/grasshopper/client/index.ts](src/features/grasshopper/client/index.ts) — re-export
- [src/features/grasshopper/index.ts](src/features/grasshopper/index.ts) — re-export
- [src/grasshopper.ts](src/grasshopper.ts) — re-export
- [src/index.ts](src/index.ts) — re-export

That's **5 files touching one symbol**. Every new export means edits in 4 of them. The barrel files also break tree-shaking when consumers do `import { x } from '@selvajs/compute'` if any module has hidden side effects.

**Fix:** Collapse to **two** layers:

- Feature roots that re-export their public surface (`features/grasshopper/index.ts`)
- Package entry points (`src/index.ts`, `src/grasshopper.ts`, `src/visualization.ts`) that re-export from feature roots

Drop the per-subfeature `index.ts` files (`client/index.ts`, `scheduler/index.ts`, `compute/index.ts`, `io/index.ts`, `io/input/index.ts`, etc.) — internal modules don't need barrels.

That's **~10 files deletable** with no API change.

---

### S2. `src/grasshopper.ts` and `src/threejs.ts` sit awkwardly at root ✅ FIXED

These are package entry points (referenced from `package.json` exports) but live next to `src/index.ts` with no folder convention. `src/threejs.ts` re-exports from `features/visualization` — name mismatch (`threejs` vs `visualization`).

**Fix:** Either:

- Rename `src/threejs.ts` → `src/visualization.ts` (matches `package.json:"./visualization"`), or
- Move all entry points into `src/entries/` and reference them from `tsup.config` / `package.json`

Pick one. Current state has `package.json` exporting `./visualization` while the file is `threejs.ts` — confusing.

---

### S3. `grasshopper/types/` is split into 4 files for ~30 type aliases ✅ FIXED

[src/features/grasshopper/types/](src/features/grasshopper/types/) has `parameters.ts`, `parsed.ts`, `schemas.ts`, `trees.ts` — plus `index.ts` re-exporting all. The header on `index.ts` says _"Provides backward compatibility with the original monolithic types.ts"_ — mid-migration debris.

**Fix:** Either complete the split (move types into the modules they belong to: `DataTree` types into `data-tree/`, `InputParam` types into `io/input/`) or collapse back to one file. Current half-state is worse than either.

Colocated approach is usually better for libraries — `data-tree/types.ts` next to `data-tree.ts` keeps related code together.

---

### S4. `compute/` is a one-file folder

[src/features/grasshopper/compute/](src/features/grasshopper/compute/) holds only `solve.ts` (+ tests + `index.ts` barrel). One file doesn't earn a folder.

**Fix:** Inline `solve.ts` directly under `grasshopper/`, or merge with `client/` since `solveGrasshopperDefinition` is only called from the client and definition-io.

Same applies to `data-tree/` — though that one is more justifiable because users import `TreeBuilder` directly.

---

### S5. `errors/` is split into `base.ts` + `error-codes.ts` + `index.ts` for ~120 lines ✅ FIXED

**File:** [src/core/errors.ts](src/core/errors.ts)

The folder held three files for one error class and one constant object.

**Resolution:** Collapsed to a single `src/core/errors.ts` containing both `RhinoComputeError` and `ErrorCodes`. All call sites already imported via `@/core/errors`, so external imports are unchanged. Two internal deep-imports in `encoding.ts` and `core/index.ts` were redirected to the new file.

---

### S6. `__tests__/` placement is inconsistent

- [src/core/utils/**tests**/](src/core/utils/__tests__/) — has tests
- [src/core/server/](src/core/server/) — no tests
- [src/core/compute-fetch/](src/core/compute-fetch/) — no tests
- [src/features/grasshopper/io/input/**tests**/](src/features/grasshopper/io/input/__tests__/) — has tests
- [src/features/grasshopper/io/output/](src/features/grasshopper/io/output/) — no tests

More a coverage problem than structure, but the convention is set: when tests get added, they go in a `__tests__/` sibling.

**Fix:** Decide on a convention and be consistent. Vitest also supports `*.test.ts` next to source — that's even less noise. Pick one.

---

### S7. `webdisplay/types.ts` vs `visualization/types.ts` split is unclear

- [src/features/visualization/types.ts](src/features/visualization/types.ts) — has `ThreeInitializerOptions`, `CameraConfig`, etc.
- [src/features/visualization/webdisplay/types.ts](src/features/visualization/webdisplay/types.ts) — has `MeshBatch`, `SerializableMaterial`, etc.

Non-overlapping, but reader has to guess where to look. Types for `threejs/` setup live at the parent level, types for `webdisplay/` live in the subfolder.

**Fix:** Move `visualization/types.ts` into `visualization/threejs/types.ts` so each subfolder owns its types.

---

### S8. `file-handling/` lives under `grasshopper/` but is generic

[src/features/grasshopper/file-handling/](src/features/grasshopper/file-handling/) handles ZIP creation and base64 decoding — nothing Grasshopper-specific. The tie-in is `extractFileData` reading a Grasshopper response, but `downloadFileData` and `extractFilesFromComputeResponse` are agnostic.

**Fix:** Either keep it where it is and accept the misnomer, or hoist to `core/files/`. Low priority.

---

### S9. Path aliases inconsistent: `@/core/errors` vs `@/core/errors/base` ✅ FIXED

The mixed-style imports were:

- `grasshopper-client.ts` imported both `@/core/errors` and `@/core/errors/base`

**Resolution:** Consolidated `grasshopper-client.ts` to a single `import { ErrorCodes, RhinoComputeError } from '@/core/errors'`. Combined with **S5** above (the folder is now a single file), there's no longer a way to deep-import past the public surface — the inconsistency can't recur.

---

## Suggested target shape

```
src/
├── index.ts                 # main entry (re-exports core + grasshopper)
├── core.ts                  # entry: @selvajs/compute/core
├── grasshopper.ts           # entry: @selvajs/compute/grasshopper
├── visualization.ts         # entry: @selvajs/compute/visualization (rename threejs.ts)
│
├── core/
│   ├── index.ts             # public surface
│   ├── compute-fetch.ts     # collapse compute-fetch/ folder
│   ├── server-stats.ts      # collapse server/ folder
│   ├── errors.ts            # collapse errors/ folder
│   ├── logger.ts
│   ├── types.ts
│   └── utils/
│       ├── camel-case.ts
│       ├── encoding.ts
│       ├── args.ts
│       └── warnings.ts
│
└── features/
    ├── grasshopper/
    │   ├── index.ts         # public surface (single re-export layer)
    │   ├── client.ts
    │   ├── response-processor.ts
    │   ├── solve.ts         # was compute/solve.ts
    │   ├── types.ts         # collapse types/ folder back
    │   ├── data-tree.ts     # was data-tree/data-tree.ts
    │   ├── file-handling/   # multi-file, justifies folder
    │   │   ├── handle-files.ts
    │   │   └── types.ts
    │   ├── io/
    │   │   ├── definition-io.ts
    │   │   ├── input-parsers.ts
    │   │   ├── input-processors.ts
    │   │   ├── input-validators.ts
    │   │   ├── response-processors.ts
    │   │   └── rhino-decoder.ts
    │   └── scheduler/
    │       ├── solve-scheduler.ts
    │       └── stable-hash.ts
    │
    └── visualization/
        ├── index.ts
        ├── threejs/
        │   ├── three-initializer.ts
        │   ├── three-helpers.ts
        │   ├── three-materials.ts
        │   └── types.ts
        └── webdisplay/
            ├── batch-parser.ts
            ├── mesh-compression.ts
            ├── webdisplay-parser.ts
            └── types.ts
```

**Net effect:** ~12 files / 4 folders deleted, no public API change. Reader can find any export in at most 2 hops from a feature root.

---

## Recommended order (structure)

Resolved: S1, S2, S3, S5, S9. All structural items complete.
