# selva-compute

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
