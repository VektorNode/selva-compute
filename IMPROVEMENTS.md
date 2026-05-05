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

### 8. `parallel` and `queue` modes share identical logic in the scheduler
**File:** [src/features/grasshopper/scheduler/solve-scheduler.ts:317-333](src/features/grasshopper/scheduler/solve-scheduler.ts#L317-L333)

The two `case` branches are byte-for-byte identical. Distinction (`parallel` is unordered, `queue` is FIFO) is only realized via `maxConcurrent` defaulting to 4 vs 1.

**Fix:** Either collapse them or genuinely differ them.

---

### 9. `latest-wins` aborts in-flight + sets pending: race with `drainNext()`
**File:** [src/features/grasshopper/scheduler/solve-scheduler.ts:299-313](src/features/grasshopper/scheduler/solve-scheduler.ts#L299-L313)

When you abort an in-flight item and also set `pendingForLatestWins`, then `drainNext()` runs in the in-flight's `finally`. If a brand-new `solve()` arrives between abort and finally, ordering is fragile.

**Fix:** Add a unit test that fires `solve()` calls during the abort window. Verify only the latest survives.

---

### 10. Scheduler "Superseded" rejects use `UNKNOWN_ERROR` code
**File:** [src/features/grasshopper/scheduler/solve-scheduler.ts:420, 428](src/features/grasshopper/scheduler/solve-scheduler.ts#L420)

The doc on `solve()` (line 229) says check `code: ErrorCodes.UNKNOWN_ERROR` and `message: 'Superseded'`. Comparing on a string message is fragile.

**Fix:** Add dedicated `ErrorCodes.SUPERSEDED` and `ErrorCodes.ABORTED` so callers can do `if (err.code === ErrorCodes.SUPERSEDED)`.

---

### 11. `GrasshopperClient.solve` checks `'message' in result && !('fileData' in result)` to detect errors
**File:** [src/features/grasshopper/client/grasshopper-client.ts:141-155](src/features/grasshopper/client/grasshopper-client.ts#L141)

Brittle structural check — depends on the response not having a property called `fileData`. If Rhino Compute ever adds `fileData` at the top level on a real response, errors stop being caught.

**Fix:** Use the actual error contract from the API (errors/warnings arrays from `handleResponse`).

---

### 12. `extractFileData` validation is a runtime type-narrow without a guard
**File:** [src/features/grasshopper/io/output/response-processors.ts:191-213](src/features/grasshopper/io/output/response-processors.ts#L191)

The five-property structural check is fine but spread inline.

**Fix:** Extract as a named `isFileData(parsed)` type guard so callers can re-use it and the check has a single source of truth.

---

### 13. `processInput` always returns `createSafeDefault` on validation errors
**File:** [src/features/grasshopper/io/input/input-processors.ts:200-203](src/features/grasshopper/io/input/input-processors.ts#L200-L203)

Failed parse for a parameter → silent fallback to a safe default. The user has no signal their input is wrong. The warning is `getLogger().error(...)` which is no-op by default.

**Fix:** Surface this through the return type (e.g. `{ ok, value }` or include a `parseErrors[]` on the IO response).

---

## 🟢 Defensive bloat / dead code

### 14. `encoding.ts:base64ByteArray` — 130 lines of paranoia
**File:** [src/core/utils/encoding.ts:90-222](src/core/utils/encoding.ts#L90-L222)

Almost every line of the loop has `if (typeof a !== 'number' || a < 0 || a >= encodings.length) throw …`. These are values just produced from `& 63`, `& 252) >> 2`, etc. — guaranteed in range.

**Fix:** Collapse to:
```ts
export function base64ByteArray(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
```
Drop the BOM-stripping unless you can name a `.gh` file in the wild that has a UTF-8 BOM (those are zip archives).

---

### 15. Two equally-valid validation modules with overlap
- [src/features/grasshopper/io/input/input-validators.ts](src/features/grasshopper/io/input/input-validators.ts): `validateValueListValues`, `validateValueListDefault`
- [src/features/grasshopper/io/input/input-parsers.ts:processValueListInput](src/features/grasshopper/io/input/input-parsers.ts#L358) duplicates the same logic

`input-validators.ts` exports `validateInputStructure`, `validateRequiredProperties`, `validateNumericConstraints`, `validateParameterType`, `extractNumericPrecision`, `normalizeGroupName` — none called outside their own file.

**Fix:** Confirm with grep, then delete.

```bash
grep -rn "validateNumericConstraints\|normalizeGroupName\|validateRequiredProperties" src/
```

---

### 16. `RhinoComputeError` static helpers are unused in public surface
**File:** [src/core/errors/base.ts:42-97](src/core/errors/base.ts#L42-L97)

`validation`, `missingValues`, `invalidDefault`, `unknownParamType`, `invalidStructure` — most are called from internal validators only.

**Fix:** Either move them into a private module (they pollute the public error API) or use them consistently. Currently most call sites construct `new RhinoComputeError(...)` directly.

---

### 17. `RhinoComputeError` always copies `originalError` to `cause` — guard is impossible
**File:** [src/core/errors/base.ts:27-32](src/core/errors/base.ts#L27)

`'cause' in Error.prototype` — Node 16.9+, TypeScript 4.6+. The `engines` field is `>=20.0.0`.

**Fix:** Just write `cause: options?.originalError` directly.

---

### 18. `setLogger` accepts `Console | null | Logger` then misroutes
**File:** [src/core/utils/logger.ts:87-95](src/core/utils/logger.ts#L87)

If you pass a `Console`, it has the four methods — falls into the Logger branch. The else branch (`new ConsoleLogger()`) is unreachable because every non-null arg already has the four methods.

**Fix:** Remove the dual-type dance.

---

### 19. `toCamelCase` has two near-identical code paths
**File:** [src/core/utils/camel-case.ts:7-23](src/core/utils/camel-case.ts#L7)

The `preserveSpaces` toggle could be a single regex parameterized by the separator class.

**Fix:** Minor — collapse into one regex.

---

### 20. `data-tree.ts` `replaceTreeValue` and `getTreeValue` have full duplicate paths for `TreeBuilder[]` vs `DataTree[]`
**File:** [src/features/grasshopper/data-tree/data-tree.ts:286-466](src/features/grasshopper/data-tree/data-tree.ts#L286-L466)

~180 lines that could be a small adapter: convert any input to `TreeBuilder[]` once at the entry, do the operation, convert back if needed. The `instanceof TreeBuilder` check on `trees[0]` only is unsafe if the array is mixed.

**Fix:** Adapter pattern + audit type guard.

---

### 21. `compute-fetch.ts` 429 retry: doesn't drain on retryable status when attempts are exhausted
**File:** [src/core/compute-fetch/compute-fetch.ts:373-392](src/core/compute-fetch/compute-fetch.ts#L373-L392)

Body is drained only inside the `if (isRetryableStatus && attempt < totalAttempts - 1)` branch. When the last attempt returns 429, the body falls through to `handleResponse` (which reads it again — fine), but the connection-reuse comment is misleading.

**Fix:** Drain unconditionally on retryable status.

---

### 22. `composeSignal` manual fallback may leak listeners on caller-supplied signals
**File:** [src/core/compute-fetch/compute-fetch.ts:215-230](src/core/compute-fetch/compute-fetch.ts#L215-L230)

The fallback path creates `ctrl` and listens on each input signal. The cleanup function does cover this (called via `finally` in `attemptFetch`, ✓), but listeners on long-lived caller signals (component lifecycle) need explicit audit.

**Fix:** Audit cleanup paths; add a test for caller signal listener count after many requests.

---

## 🔵 API / DX nits

### 23. Public API exposes three ways to read values
**File:** [src/features/grasshopper/client/grasshopper-response-processor.ts:73-91](src/features/grasshopper/client/grasshopper-response-processor.ts#L73)

`getValueByParamName`, `getValueByParamId`, plus `getValues(byId)`. Three ways to do the same thing.

**Fix:** Consider one method `getValue(selector: { byName } | { byId })` and one `getValues(options)`.

---

### 24. `GrasshopperClient.dispose()` checks `'dispose' in this.serverStats` — type-level redundant
**File:** [src/features/grasshopper/client/grasshopper-client.ts:218](src/features/grasshopper/client/grasshopper-client.ts#L218)

`ComputeServerStats` is constructed in the constructor, has a known dispose method. The `if ('dispose' in ...)` narrowing is a leftover.

**Fix:** Remove the guard.

---

### 25. `ComputeConfig.suppressClientSideWarning` plumbed everywhere but only consulted in one place
**Files:** [src/core/compute-fetch/compute-fetch.ts:163-167](src/core/compute-fetch/compute-fetch.ts#L163), [src/features/grasshopper/compute/solve.ts:43](src/features/grasshopper/compute/solve.ts#L43)

The flag controls the `warnIfClientSide` check.

**Fix:** Rename to match intent (`suppressBrowserWarning`) or scope it to the warning module only.

---

## Recommended order

Behavioral bugs (#1–#7) are resolved — fixed or validated as not-bugs. Remaining priorities:

1. **#10** Typed `SUPERSEDED`/`ABORTED` codes — affects every scheduler caller's error handling
2. **#13** Surface `processInput` validation errors instead of silent fallback
3. **#11** Replace brittle `'message' in result && !('fileData' in result)` error detection
4. **#9** Race-test for `latest-wins` abort + pending interaction
5. **#14, #15, #16** Mechanical cleanup — ~300 lines deletable

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

### S1. Re-export pyramid: 4 layers for the same symbols

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

### S2. `src/grasshopper.ts` and `src/threejs.ts` sit awkwardly at root

These are package entry points (referenced from `package.json` exports) but live next to `src/index.ts` with no folder convention. `src/threejs.ts` re-exports from `features/visualization` — name mismatch (`threejs` vs `visualization`).

**Fix:** Either:
- Rename `src/threejs.ts` → `src/visualization.ts` (matches `package.json:"./visualization"`), or
- Move all entry points into `src/entries/` and reference them from `tsup.config` / `package.json`

Pick one. Current state has `package.json` exporting `./visualization` while the file is `threejs.ts` — confusing.

---

### S3. `grasshopper/types/` is split into 4 files for ~30 type aliases

[src/features/grasshopper/types/](src/features/grasshopper/types/) has `parameters.ts`, `parsed.ts`, `schemas.ts`, `trees.ts` — plus `index.ts` re-exporting all. The header on `index.ts` says *"Provides backward compatibility with the original monolithic types.ts"* — mid-migration debris.

**Fix:** Either complete the split (move types into the modules they belong to: `DataTree` types into `data-tree/`, `InputParam` types into `io/input/`) or collapse back to one file. Current half-state is worse than either.

Colocated approach is usually better for libraries — `data-tree/types.ts` next to `data-tree.ts` keeps related code together.

---

### S4. `compute/` is a one-file folder

[src/features/grasshopper/compute/](src/features/grasshopper/compute/) holds only `solve.ts` (+ tests + `index.ts` barrel). One file doesn't earn a folder.

**Fix:** Inline `solve.ts` directly under `grasshopper/`, or merge with `client/` since `solveGrasshopperDefinition` is only called from the client and definition-io.

Same applies to `data-tree/` — though that one is more justifiable because users import `TreeBuilder` directly.

---

### S5. `errors/` is split into `base.ts` + `error-codes.ts` + `index.ts` for ~120 lines

[src/core/errors/](src/core/errors/) — three files for one error class and one constant object.

**Fix:** Single file `src/core/errors.ts`. Folders should hold multiple files.

---

### S6. `__tests__/` placement is inconsistent

- [src/core/utils/__tests__/](src/core/utils/__tests__/) — has tests
- [src/core/server/](src/core/server/) — no tests
- [src/core/compute-fetch/](src/core/compute-fetch/) — no tests
- [src/features/grasshopper/io/input/__tests__/](src/features/grasshopper/io/input/__tests__/) — has tests
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

### S9. Path aliases inconsistent: `@/core/errors` vs `@/core/errors/base`

Both styles in use:
- [src/features/grasshopper/client/grasshopper-client.ts:1-2](src/features/grasshopper/client/grasshopper-client.ts#L1-L2) imports both `@/core/errors` and `@/core/errors/base` in the same file
- [src/features/grasshopper/io/input/input-validators.ts:1-2](src/features/grasshopper/io/input/input-validators.ts#L1-L2) uses `@/core/errors` and `@/core` separately

**Fix:** Pick one entry style per package and lint for it. If `@/core` works, never reach into `@/core/errors/base` — that's coupling to internal layout.

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

1. **S1** Delete sub-feature barrels — biggest noise reduction, no risk
2. **S2** Rename `src/threejs.ts` → `src/visualization.ts` — matches `package.json`
3. **S5** Collapse `errors/` to `errors.ts` — three files become one, trivial
4. **S3** Resolve the `grasshopper/types/` split — pick colocated or single-file, finish the migration
5. **S9** Lint for consistent path aliases
