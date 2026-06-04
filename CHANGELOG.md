# @selvajs/compute

## 2.0.0-beta.5

### Patch Changes

- c73e215: Fix tree-access `System.String` defaults being JSON-parsed, corrupting value-list inputs on the wire.

  The 2.0 input-normalization pipeline (`normalize-default.ts`) JSON-parsed any tree-access item typed `System.String` whose `data` started with `[` or `{`. A multi-value `Dynamic_ValueList` sends exactly such labels (e.g. `"[1,2,3]"`), so its default was turned into a real array on the leaf `data`. The Rhino.Compute (VektorNode) fork expects that leaf to be a string and its Newtonsoft reader throws `Unexpected character ... value: [` at the leaf position, crashing the solve. 1.5.3 sent the raw string, so this was a 2.0-line regression.
  - Restrict the JSON.parse branch in `normalizeDefaultWithWarning` to `Rhino.Geometry*` types (which really are JSON-encoded on the wire). `System.String` now falls through and round-trips unchanged.
  - Add a regression test pinning that bracket-leading string tree values stay strings.

## 2.0.0-beta.4

### Patch Changes

- ae0dce2: Fix `/io` parsing returning zero inputs (or crashing) on PascalCase server responses.

  beta.3 read the `/io` response straight through as camelCase (`response.inputs`, `schema.paramType`, …). That only holds when the server emits fully camelCase IO (the VektorNode Compute8 fork with `[JsonProperty]` on every field). Upstream-tracking branches (mcneel 8.x/9.x, `8.x.selva`) keep the C# classes close to source, so the top-level wrapper is PascalCase `Inputs`/`Outputs` and per-param fields are `ParamType`/`Minimum`/`Name`/… — and if a `[JsonProperty]` is ever dropped, individual fields silently revert to PascalCase. On such a server every read missed: `response.inputs` was `undefined`, so the input list came back empty (or, before the array guard, threw `inputs is not iterable`).
  - Read the top-level `Inputs`/`Outputs` case-insensitively via `readField` in `fetchDefinitionIO`, then guard each to an array with `Array.isArray` (not `?? []` — the symptom is non-iterability, so a non-array truthy value like `{}` or a string must coerce to `[]` too). The already-surfaced `loadErrors`/`loadWarnings` then explain _why_ a list came back empty instead of the client crashing.
  - Normalize each input/output record's field casing once at the parse boundary (`normalize-schema.ts`), so the per-type parsers stay branch-agnostic and read straight through. Only field KEYS are canonicalized — `default` (handled separately by `normalize-default`) and user-authored value-list `values` label keys ("Option A") are passed through verbatim, avoiding the label-mangling that a deep `camelcaseKeys` pass caused.
  - The client is now casing-agnostic: identical camelCase and PascalCase `/io` bodies parse to the same typed result.
  - Add regression tests pinning both wire shapes end-to-end, plus the malformed/non-array `inputs`/`outputs` guards.

## 2.0.0-beta.3

### Patch Changes

- 7e5a8dd: Fix `inputs is not iterable` crash when the server returns a malformed `/io` response.

  A server fault can return a 200 whose body omits `inputs`/`outputs` (e.g. a definition-LOAD failure that surfaced as a malformed success instead of a clean 500). `fetchDefinitionIO` passed `response.inputs` straight through, and the downstream `for...of` in `processInputsWithErrors` threw `inputs is not iterable`.
  - Coerce `inputs`/`outputs` to `[]` in `fetchDefinitionIO` using `Array.isArray` (not `?? []`) — the symptom is non-iterability, so a non-array truthy value like `{}` or a string must coerce too.
  - The already-surfaced `loadErrors` / `loadWarnings` then explain _why_ the list came back empty instead of the client crashing.
  - Add regression tests covering missing, `null`, non-array-object, and string `inputs`/`outputs`.

## 2.0.0-beta.2

### Patch Changes

- 5ac65cc: Fix input defaults being silently dropped due to wire-casing mismatch.

  The beta removed a global `camelcaseKeys` pass (which had been corrupting value-list label keys), but `normalizeDefault` still literal-matched the lowercase `innerTree` key. Because the `default` DataTree wrapper is serialized as PascalCase (`ParamName` / `InnerTree`) on every server branch — mcneel 8.x/9.x and the VektorNode Compute8 fork alike, since `Resthopper.IO.DataTree` carries no `[JsonProperty]` — the check never matched and every connected input default collapsed to `null` (with an `Unexpected structure in input.default` warning).
  - Add a case-insensitive `readField` / `hasField` wire-field reader (`@/core/utils/read-field`).
  - Read the `default` wrapper (`innerTree`) and item fields (`data` / `type`) case-insensitively, so defaults parse correctly regardless of server-branch casing without re-introducing the label-mangling global camelCase pass.
  - Surface a genuinely unrecognized default shape (no tree key at all) as a client-visible `MALFORMED_DEFAULT` entry in `parseErrors` instead of only logging a server-side warning — so a dropped default is observable on both client and server rather than vanishing silently.
  - Add regression tests pinning the real PascalCase wire shape, including a guard that a non-empty tree default can never silently become `null`.

## 2.0.0-beta.1

### Patch Changes

- f2040dd: Fix input defaults being silently dropped due to wire-casing mismatch.

  The beta removed a global `camelcaseKeys` pass (which had been corrupting value-list label keys), but `normalizeDefault` still literal-matched the lowercase `innerTree` key. Because the `default` DataTree wrapper is serialized as PascalCase (`ParamName` / `InnerTree`) on every server branch — mcneel 8.x/9.x and the VektorNode Compute8 fork alike, since `Resthopper.IO.DataTree` carries no `[JsonProperty]` — the check never matched and every connected input default collapsed to `null` (with an `Unexpected structure in input.default` warning).
  - Add a case-insensitive `readField` / `hasField` wire-field reader (`@/core/utils/read-field`).
  - Read the `default` wrapper (`innerTree`) and item fields (`data` / `type`) case-insensitively, so defaults parse correctly regardless of server-branch casing without re-introducing the label-mangling global camelCase pass.
  - Surface a genuinely unrecognized default shape (no tree key at all) as a client-visible `MALFORMED_DEFAULT` entry in `parseErrors` instead of only logging a server-side warning — so a dropped default is observable on both client and server rather than vanishing silently.
  - Add regression tests pinning the real PascalCase wire shape, including a guard that a non-empty tree default can never silently become `null`.

## 2.0.0-beta.0

### Major Changes

- 3417e9a: Align the Grasshopper client with the Compute8 server contract and overhaul the input/output processing pipeline.
  - Update Grasshopper client to align with the Compute8 server contract
  - Overhaul the input processing pipeline with type-specific parsers
  - Centralize settle-once logic in `SolveScheduler` and unify server URL validation
  - Reuse server-definition cache for more efficient solves
  - Surface previously-unused Compute server features
  - Strengthen hashing for binary definitions to prevent cache collisions
  - Improve error handling in `fetchRhinoCompute` and server exception paths

  This is a major release containing breaking changes to the client contract.

## 1.5.3

### Patch Changes

- 9253770: Match input `paramType` case-insensitively so lowercase schema types (e.g. `valueList`) no longer fail with "Unsupported paramType". Any casing now resolves to its canonical type before parsing.

## 1.5.2

### Patch Changes

- 137b7b5: Forward response body and headers on `RhinoComputeError.context` for all
  non-2xx responses. Adds `context.responseBody` (full body) and
  `context.responseHeaders`, and unifies the message format across status
  codes with a 200-char body hint. Makes upstream 500s easier to diagnose
  when the body is non-empty, and reveals whether the response came from
  Rhino Compute or from a proxy in front of it.

## 1.5.2-beta.1

### Patch Changes

- Structural cleanup: collapse sub-feature barrel files, rename `threejs.ts` entry point to `visualization.ts`, and merge `grasshopper/types/` split into a single file. No public API changes.

## 1.5.2-beta.0

### Patch Changes

- - Fold Rhino → Three coordinate transform into the mesh decompression read pass, eliminating a second pass over vertex data for batched WebDisplay meshes.
  - Use `fflate.gunzip` (Web Worker) in browsers and `gunzipSync` in Node for batched mesh decompression, removing the `requestIdleCallback`/`setTimeout` scheduling hop.
  - Skip excluded types (e.g. WebDisplay) in `getValue` / `getValues` so they no longer write `null` into aggregated results.
  - `solveGrasshopperDefinition` no longer mutates the response object when stripping the `pointer` field; it returns a shallow copy instead.
  - Fix `ComputeServerStats.getVersion` "Body has already been read" error when the response is non-JSON, by reading the body as text first.
  - Tighten hex color parsing in `parseColor` to require exactly 6 hex characters.

## 1.5.1

### Patch Changes

- 192d412: Merge with new project stucture

## 1.5.0

### Minor Changes

- feat: robust transport layer and SolveScheduler for managing solves

  **Transport robustness** (`fetchRhinoCompute`, `GrasshopperClient.solve`)
  - Switch to `AbortSignal.timeout` so per-request timeouts are not throttled when the tab is backgrounded.
  - Accept a caller-supplied `signal` on `ComputeConfig` and as a per-call override on `client.solve(definition, tree, { signal, timeoutMs, retry })`. Composes with the internal timeout via `AbortSignal.any` (with fallback for older runtimes).
  - Add a configurable `retry` policy with exponential backoff + jitter for transient errors (502 / 503 / 504, network errors, and timeouts). Caller cancellation is never retried.
  - Honor `Retry-After` on 429 responses (toggle via `retry.retryOn429`).
  - Scrub the request `args` from timeout/network error contexts; keep `requestId`, `endpoint`, `requestSize`, `url`.

  **`SolveScheduler`** — new opt-in class for managing many short solves and few long ones from one place
  - Three scheduling modes:
    - `latest-wins` — one in flight, supersede pending, abort in-flight when newer values arrive (slider scrubs).
    - `queue` — FIFO with `maxConcurrent` cap (submit-job flows).
    - `parallel` — concurrent up to `maxConcurrent` (closest to plain `client.solve`).
  - Per-call and bulk cancellation: `solve(def, tree, { signal })` and `scheduler.cancelAll()`.
  - Optional response cache (LRU + TTL) keyed by a stable hash of `(definition, dataTree)`.
  - Lifecycle hooks: `onStart`, `onSettle`, `onSuperseded`.
  - Observable state: `subscribe()`, `isSolving`, `hasPending`, `lastResult`, `lastError`, `lastDurationMs`, `inFlightCount`, `queueDepth`.
  - Created via `client.createScheduler(options)`; multiple schedulers can share one client.

  **New public exports**
  - `SolveScheduler`, `hashSolveInput`
  - Types: `SchedulerMode`, `SolveSchedulerOptions`, `CacheOptions`, `SolveContext`, `SolveResult`, `SolveExecutor`, `SolveOptions`, `RetryPolicy`

  No breaking changes — `client.solve(definition, tree)` works exactly as before; the third argument is optional.

### Patch Changes

- 9269727: fix: filter invisible objects from raycaster intersections

  Click and mousemove event handlers now exclude objects where `visible` is `false` from raycaster hit results, preventing interactions with hidden scene objects.

## 1.4.1

### Patch Changes

- a9c7ec1: fix: filter invisible objects from raycaster intersections

  Click and mousemove event handlers now exclude objects where `visible` is `false` from raycaster hit results, preventing interactions with hidden scene objects.

## 1.4.0

### Minor Changes

- 9e735d4: feat: add `onReady` and `onFrame` callbacks to `initThree`; fix canvas resize flicker

  ### New features
  - `events.onReady` — called once the HDR environment map has loaded (or immediately if HDR is disabled or fails), so consumers can coordinate scene loading
  - `events.onFrame(delta)` — called every animation frame before render, for custom per-frame logic or physics updates

  ### Bug fixes
  - **Canvas resize flicker** — resize is now applied inside the animation loop immediately before `renderer.render()`, so the buffer clear and the new frame are composited together. Previously a `ResizeObserver` callback triggered the resize asynchronously, leaving a blank frame between the clear and the next render
  - **`clearScene` ghost groups** — now removes top-level non-floor children and traverses their subtrees for disposal, instead of traversing the whole scene for meshes. This prevents empty `Group` nodes from accumulating after their mesh children were removed
  - **`computeCombinedBoundingBox` empty array** — now returns early on an empty array instead of returning a `Box3` with `+Infinity`/`-Infinity` bounds that would produce `NaN` vectors downstream
  - **Tone mapping mismatch** — `setupRenderer` was falling back to `ACESFilmicToneMapping` despite `applyDefaults` always setting `NeutralToneMapping`; the stale fallback is removed

  ### Breaking changes
  - `initThree` no longer returns a `resize` method (resize is now handled automatically every frame)

### Patch Changes

- 9e735d4: Fix: Enhanced validation in extractFileData to properly check FileData object structure
  - Changed property checks from uppercase (FileName, FileType, Data) to camelCase (fileName, fileType, data)
  - Added type guards for isBase64Encoded (boolean) and subFolder (string) properties
  - Improves type safety and ensures all required FileData properties are validated before parsing

## 1.3.1

### Patch Changes

- 2846ee5: Fix: Enhanced validation in extractFileData to properly check FileData object structure
  - Changed property checks from uppercase (FileName, FileType, Data) to camelCase (fileName, fileType, data)
  - Added type guards for isBase64Encoded (boolean) and subFolder (string) properties
  - Improves type safety and ensures all required FileData properties are validated before parsing

## 1.3.0

### Minor Changes

- 7680657: Expose `toCamelCase` and `camelcaseKeys` utilities in the public core API.

## 1.2.0

### Minor Changes

- e135baa: Improve `initThree` stability, correctness, and UX

  **Bug fixes:**
  - Fix canvas resize flickering — corrected size comparison to use `clientWidth * pixelRatio` instead of raw buffer dimensions, set `setSize(..., true)` consistently on both init and resize, and raised debounce to 100ms so the layout settles before re-rendering
  - Fix `createCamera` querying `document.querySelector('canvas')` (wrong canvas on multi-canvas pages) — now receives the correct canvas element directly
  - Fix `enableZoom: false` and `enablePan: false` being silently ignored due to `|| true` fallback — changed to `??`
  - Fix `autoRotate` having no effect when `enableDamping` was false — `controls.update()` now also runs when `autoRotate` is on
  - Fix HDR load-error handler adding a duplicate ambient light on top of the one already added by `setupLighting`
  - Remove dead code in `createScene` that iterated and mutated `scene.children` on a brand-new empty scene

  **New feature:**
  - Add smooth animated camera zoom on double-click via `animateCameraTo` (ease-out cubic, 200ms). Controlled by new `events.enableDoubleClickZoom` option (default `true`) and accompanied by an optional `events.onMeshDoubleClicked` callback

## 1.1.4

### Patch Changes

- c7d91be: Add Color input parameter type support for Grasshopper definitions. Color inputs are now properly parsed and normalized as RGB strings (e.g., "166, 111, 111"), with surrounding quotes removed during processing.

## 1.1.3

### Patch Changes

- a329571: Fix responsive resize handling and deprecated HDR loader in Three.js viewer initializer
  - Replace `setTimeout(fn, 16)` throttle with a double-rAF (requestAnimationFrame) pattern for post-layout resize measurements. This ensures `clientWidth`/`clientHeight` are read only after the browser has fully committed the new layout, fixing incorrect canvas dimensions during mobile fullscreen transitions.
  - Fix `rafId` type from `NodeJS.Timeout` to `number | null`, which is the correct browser return type for `requestAnimationFrame`.
  - Switch `ResizeObserver` target from `parent`-only to an exclusive parent-or-canvas strategy: when a parent container exists it is observed (no feedback loop risk); when no parent is present (fullscreen / `position:fixed`) the canvas itself is observed. This avoids the redundant observer callbacks that were triggered by `renderer.setSize()` mutating canvas attributes when both elements were observed simultaneously.
  - Replace deprecated `RGBELoader` with `HDRLoader` to resolve Three.js deprecation warning.
  - Update dependencies to latest compatible versions.

## 1.1.3-beta.0

### Patch Changes

- Fix responsive resize handling and deprecated HDR loader in Three.js viewer initializer
  - Replace `setTimeout(fn, 16)` throttle with a double-rAF (requestAnimationFrame) pattern for post-layout resize measurements. This ensures `clientWidth`/`clientHeight` are read only after the browser has fully committed the new layout, fixing incorrect canvas dimensions during mobile fullscreen transitions.
  - Fix `rafId` type from `NodeJS.Timeout` to `number | null`, which is the correct browser return type for `requestAnimationFrame`.
  - Switch `ResizeObserver` target from `parent`-only to an exclusive parent-or-canvas strategy: when a parent container exists it is observed (no feedback loop risk); when no parent is present (fullscreen / `position:fixed`) the canvas itself is observed. This avoids the redundant observer callbacks that were triggered by `renderer.setSize()` mutating canvas attributes when both elements were observed simultaneously.
  - Replace deprecated `RGBELoader` with `HDRLoader` to resolve Three.js deprecation warning.
  - Update dependencies to latest compatible versions.

## 1.1.2

### Patch Changes

- 789287a: Documentation and code quality improvements:
  - Fixed README.md spelling and grammar throughout
  - Restructured sections for better clarity and readability
  - Added comprehensive "Why this project exists" section with bullet points
  - Improved Acknowledgement section with proper formatting and links
  - Updated Requirements section with clear setup instructions for both standard and enhanced setup
  - Refactored error handling system:
    - Moved ValidationErrors factory methods to RhinoComputeError static methods for simpler API
    - Removed unused error factory classes (InputErrors, DataErrors, ConfigErrors)
    - Updated all callsites to use new simplified error creation pattern
  - Added implementation requirements documentation to GrasshopperResponseProcessor:
    - extractMeshesFromResponse requires Selva Display component and custom VektorNode compute
    - getFileData requires Block to File, Geometry To File components and custom compute
  - Added context-specific README files:
    - src/features/file-handling/README.md with setup workflow
    - src/features/visualization/webdisplay/Readme.md with usage instructions
  - Improved compute-fetch documentation with clearer API explanations
  - Removed unused error-factory.ts file
  - Cleaned up unused imports across the codebase

## 1.1.1

### Patch Changes

- 58e5a24: Refactor visualization helpers: fix bounding box calculation, optimize shadow camera bounds, and externalize camera configuration constants.

## 1.1.0

### Minor Changes

- dac3245: Changed file types from PascalCase to camelCase

## 1.0.1

### Patch Changes

- c0ae495: Updated some naming issues

## Unreleased

### Major Changes

- **Node.js 20+ requirement**: Updated minimum Node.js version from 16 to 20.0.0 for better performance and modern API support

### Minor Changes

- **Structured logging system**: Added configurable logger with `setLogger()`, `getLogger()`, and `enableDebugLogging()` APIs
  - Libraries no longer pollute console by default (NoOp logger)
  - Users can enable console logging via `enableDebugLogging()` or integrate custom loggers (Winston, Pino, Sentry, etc.)
  - Replaced all 37 `console.*` calls throughout codebase with structured logging
  - Supports log levels: `debug`, `info`, `warn`, `error`

- **Three.js decoupling**: Mesh processing now uses dynamic imports for Three.js dependencies
  - `extractMeshesFromResponse()` is now async and lazy-loads Three.js only when needed
  - Reduces bundle size for users who don't use visualization features
  - No breaking changes - function signature remains compatible

- **Browser environment guards**: Added runtime checks for browser-only APIs
  - File handling functions now throw `RhinoComputeError` with `BROWSER_ONLY` error code when used in Node.js
  - Prevents cryptic runtime errors when accidentally using browser APIs server-side

### Patch Changes

- **Improved base64 encoding**: Replaced `btoa`/`atob` with Node.js Buffer API
  - More reliable for Node.js 20+ environments
  - Added `encodeStringToBase64()`, `decodeBase64ToString()`, and `isBase64()` utilities
  - Proper error handling with `ENCODING_ERROR` error code

- **Error standardization**: Enhanced error handling across modules
  - Added new error codes: `BROWSER_ONLY`, `ENVIRONMENT_ERROR`, `ENCODING_ERROR`
  - Consistent use of `RhinoComputeError` with proper error codes
  - Better error messages with context (e.g., original error preserved in `originalError` property)

- **Test coverage improvements**: Added baseline test files for previously untested modules
  - `solve.test.ts`: Grasshopper solve function tests
  - `batch-parser.test.ts`: Mesh batch parsing tests
  - `webdisplay-parser.test.ts`: WebDisplay parsing tests

## 1.2.0

### Minor Changes

- cd6ad4b: ## Features

  ### Mesh Selection and Metadata System
  - **Added optional mesh click event handlers** with configurable selection highlighting
    - `onMeshMetadataClicked`: Callback fired when a mesh with metadata is clicked, returns metadata object
    - `onObjectSelected`: Callback fired when any mesh is selected, returns Three.js object
    - `onBackgroundClicked`: Callback fired when background is clicked
  - **Configurable selection color** (`selectionColor` option) - defaults to red (#ff0000), supports any CSS color or THREE.Color
  - **Material cloning on selection** - only selected mesh is highlighted without affecting other meshes sharing the same material

  ### Event Handlers Configuration
  - **`enableEventHandlers`** - Master switch to enable/disable all event listeners (defaults to true)
  - **`enableClickToFocus`** - Individual control for click-to-focus behavior
  - **`enableKeyboardControls`** - Individual control for keyboard shortcuts (F, Space, ESC)

  ### Type Safety Improvements
  - **Proper type exposure for viewer options**
    - `ProcessMeshBatchesOptions` interface for mesh batch processing
    - `EventConfig` type for all event-related options
    - `ModelUnit` type derived from valid SCALE_FACTORS keys
  - **Removed unused `any` types** in ViewerState - now properly typed with THREE.Scene, THREE.PerspectiveCamera, and OrbitControls
  - **Proper re-exports** from `@selva/shared` for convenience access to core visualization functions

  ## Breaking Changes
  - **Removed wrapper functions** from `@selva/shared`:
    - `initializeViewerScene()` - use `initThree()` directly
    - `updateViewerScene()` - use `updateScene()` directly
    - `processMeshBatches()` - use `parseMeshBatchObject()` in a loop directly

    These were thin wrappers that added minimal value. Direct access to core functions is more flexible and easier to understand.

  ## Architecture
  - **Cleaner abstraction layers** - `@selva/shared` now serves as a convenience re-export layer rather than adding unnecessary wrapper logic
  - **Metadata already attached during batch parsing** - no additional processing needed; metadata is preserved in mesh.userData
  - **Event system is optional** - can be completely disabled with `enableEventHandlers: false` for performance-critical scenarios

  ## Migration Guide

  If you were using the wrapper functions from `@selva/shared`:

  **Before:**

  ```typescript
  import { initializeViewerScene, updateViewerScene, processMeshBatches } from '@selva/shared';

  const state = await initializeViewerScene(canvas, schema);
  await updateViewerScene(state, meshes);
  const meshes = await processMeshBatches(batches, options);
  ```

  **After:**

  ```typescript
  import {
  	initThree,
  	updateScene,
  	parseMeshBatchObject,
  	SCALE_FACTORS
  } from 'selva-compute/visualization';

  const { scene, camera, controls } = initThree(canvas, options);
  updateScene(scene, meshes, camera, controls, initialized);
  const meshes = await parseMeshBatchObject(batch, options);
  ```

  The core functions are still re-exported from `@selva/shared` for convenience, but calling them directly from `selva-compute/visualization` is recommended.

## 1.1.0

### Minor Changes

- **File Handling & Import**
  - Add comprehensive file import functionality supporting 3dm, STEP, IGES, DXF, DWG, OBJ, FBX, and GLB formats
  - Implement file upload validation with configurable size limits
  - Add file handling utilities for browser and Node.js environments

  **Grasshopper Client Improvements**
  - Update `fetchRhinoCompute` argument types for improved flexibility
  - Enhance data tree parsing and serialization
  - Improve error handling and response processing

  **Code Quality**
  - Add comprehensive unit tests for input parsers (boolean, numeric, text)
  - Refactor code structure for improved readability
  - Simplify exception handling patterns
  - Add detailed README documentation for core features
