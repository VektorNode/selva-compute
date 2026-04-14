# selva-compute

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
