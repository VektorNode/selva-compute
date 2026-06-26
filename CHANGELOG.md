# @selvajs/compute

## 2.5.0

### Minor Changes

- e12b1a1: Add `cacheerroredsolves` opt-in for caching solves that report Grasshopper errors.

  By default the Rhino Compute server never caches a solve whose definition reported
  GH errors, so a definition that errors re-solves on every request — even when the
  errors are by design (a guarded Python component, a filtered/pruned branch) and
  the geometry is correct. Set `cacheerroredsolves: true` (alongside `cachesolve`)
  to let such completed-but-errored solves into the server's solve cache.
  - New optional field on `GrasshopperBaseSchema` and `GrasshopperComputeConfig`;
    forwarded to the `/grasshopper` request via `applyOptionalComputeSettings`.
  - Default unset/false — fully backward compatible.
  - Requires a Rhino Compute server that honors `cacheerroredsolves` (the VektorNode
    fork). Older servers ignore the unknown field.

## 2.4.0

### Minor Changes

- 33c10db: WebDisplay mesh payloads: uint16 indices, optional gzip container, and stable per-placement identity.

  **uint16 indices (SLVA v2).** The binary mesh parser reads a new flag (`FLAG_UINT16_INDICES`,
  bit 1 of the geometry flags word) and decodes 16-bit indices when set, halving the index payload
  for batches that address 65,535 or fewer vertices — typically the largest part of the blob for
  unwelded brep meshes.

  **Optional gzip container (SLVZ).** Mesh blobs that ship wrapped in a `SLVZ`-magic container are
  inflated (raw DEFLATE via `fflate`) and the inner SLVA blob is parsed unchanged. Plain
  (uncompressed) `SLVA` blobs are detected by their leading magic and flow through untouched.

  **Per-placement identity.** When building meshes, the envelope's `sourceComponentId` is preferred
  over the blob's embedded value, so a reloaded part instanced many times keeps a distinct web-pick
  identity per placement. The embedded blob value remains the fallback for raw-blob transport, which
  carries no envelope.

  Backward compatible: v1 blobs decode as v2 with the uint16 flag implicitly clear. This is forward
  compatibility on the decoder only — a v2 / SLVZ blob produced by an updated plugin will not decode
  on an older `@selvajs/compute`, so the plugin and this package must be released together.

  The package now builds on TypeScript 6.

## 2.3.0

### Minor Changes

- 7ee92d6: Detect server-side definition-cache misses by error code, not message.

  When solving by `pointer` (server cache key), a stale/evicted key now reliably
  triggers the transparent full-upload fallback even against a production Rhino
  Compute server. Previously the miss was detected by string-matching the server's
  exception message, which the server scrubs to a generic string when not in debug
  mode — so the fallback never fired in production and the caller saw a hard error.
  - Added `ErrorCodes.DEFINITION_NOT_CACHED`.
  - `fetchRhinoCompute` now reads an optional machine `code` from the server's JSON
    error body and maps `"definition_not_cached"` onto that code, taking precedence
    over the status-derived classification.
  - `solveByCacheKey` / `isDefinitionLoadMiss` match on the code first, keeping the
    legacy message match as a fallback for debug-mode servers and older forks.

  Requires a Rhino Compute server that emits `code: "definition_not_cached"` on a
  stale-pointer miss (VektorNode fork). Older servers continue to work via the
  message fallback when running in debug mode.

### Patch Changes

- 1763b6b: Prefer the envelope's `sourceComponentId` over the blob's embedded value when building meshes. The
  blob bakes in the id at encode time, but a reloaded part (e.g. a `.dmf` instanced many times)
  re-stamps a fresh id on the envelope to keep web pick identity distinct per placement. The embedded
  blob value remains the fallback for raw-blob transport, which carries no envelope.

## 2.3.0-beta.1

### Patch Changes

- 1763b6b: Prefer the envelope's `sourceComponentId` over the blob's embedded value when building meshes. The
  blob bakes in the id at encode time, but a reloaded part (e.g. a `.dmf` instanced many times)
  re-stamps a fresh id on the envelope to keep web pick identity distinct per placement. The embedded
  blob value remains the fallback for raw-blob transport, which carries no envelope.

## 2.3.0-beta.0

### Minor Changes

- 2e73673: Shrink WebDisplay mesh payloads: uint16 indices and optional blob compression.

  **uint16 indices (SLVA v2).** The binary mesh parser now reads a new flag (`FLAG_UINT16_INDICES`,
  bit 1 of the geometry flags word) and decodes 16-bit indices when set, halving the index payload for
  batches that address 65,535 or fewer vertices — typically the largest part of the blob for unwelded
  brep meshes.

  **Optional gzip container (SLVZ).** Mesh blobs otherwise ship uncompressed (no transport gzip on
  dynamic compute responses or the local WebSocket). The parser now detects a `SLVZ`-magic container,
  inflates it (raw DEFLATE via `fflate`), and parses the inner SLVA blob unchanged. The plugin applies
  this only when it shrinks the payload, so an uncompressed `SLVA` blob still flows through untouched.

  **Backward compatible.** v1 blobs are layout-identical to v2 with the uint16 flag implicitly clear,
  so previously persisted or cached blobs continue to decode; only versions outside
  `MIN_SUPPORTED_VERSION`..`BINARY_MESH_VERSION` are rejected. A plain (uncompressed) blob is detected
  by its leading magic, so non-SLVZ inputs are unaffected.

  Note: this is forward compatibility on the decoder only. A v2 / SLVZ blob produced by an updated
  plugin will not decode on an older `@selvajs/compute`, so the plugin and this package must be
  released together.

## 2.2.0

### Minor Changes

- 5cedef9: Expand `ComputeServerStats` to cover the full rhino.compute proxy/control surface (excluding the SELVA schema endpoints) so consumers no longer hand-roll fetches:
  - `getInstalledPlugins(kind)` — `/plugins/{gh,rhino}/installed`
  - `getServerTime()` — `/servertime`
  - `getIdleSpan()` — `/idlespan`
  - `launchChildren()` / `launchChild(port)` — `/launch-children`, `/launch-child`
  - `shutdownChildren(port?)` / `recycleChildren(port?)` — child-lifecycle controls
  - `purgeAllChildren()` — best-effort fleet-wide cache purge (loops `/cache/purge` across the round-robin pool; reports a `confident` flag, exact only at a single-child pool)
  - `getActiveChildren({ initialize })` — pass `initialize: false` for a passive count that does not spawn (and wake/bill) an idle server; `getServerStats()` now uses this passive read

  **Fix:** `isServerOnline()` now probes the proxy liveness root `/` instead of the non-existent `/healthcheck` route. The rhino.compute proxy never exposed `/healthcheck`; the old probe was forwarded to a child for an unknown path, so it reported reachability of a child rather than the proxy.

## 2.1.0

### Minor Changes

- 9264ebb: Unify the coordinate frame: the Three.js scene is now Rhino's frame (Z-up), end to end.

  Previously the display pipeline rotated Rhino Z-up geometry into Three's native Y-up
  (`(x, y, z) → (x, z, −y)`) during mesh decompression and display-item parsing. That hidden
  rotation meant every feature producing or consuming positions — measurements, mesh metadata,
  label anchors, picking, the new camera presets/grid — had to round-trip through it or silently
  land in the wrong frame.

  The rotation is removed everywhere. A Rhino point `(x, y, z)` is now the Three point `(x, y, z)`:
  - `rhinoToThree` is the identity (kept, deprecated, for call-site compatibility).
  - The int16/float32 vertex paths in `webdisplay/batch-parser.ts` pass vertices through unrotated.
  - `initThree` orients the camera, default iso position, sunlight, floor, and reference grid to the
    scene up axis (Z-up by default); the camera controller's presets are likewise up-derived.

  **Breaking:** any consumer that assumed viewer geometry was Y-up (e.g. reading mesh vertex
  positions, placing objects, or computing directions in Three space) must drop the
  `(x, z, −y)` conversion — Three space now equals Rhino space. The `applyTransforms` option is
  retained but no longer rotates; it will be removed in a future release.

- 9264ebb: Release v2.1.0: Z-up coordinate frame, measurement tool, and CAD viewer tooling.

  **Coordinate frame unification (breaking)**

  The Three.js scene is now Z-up end-to-end, matching Rhino's native frame. The hidden `(x, y, z) → (x, z, −y)` rotation that was applied during mesh decompression and display-item parsing is removed. `rhinoToThree` is kept as an identity for call-site compatibility but deprecated. Consumers that read mesh vertex positions or place objects in Three space must drop any `(x, z, −y)` conversion — Three space now equals Rhino space.

  **CAD viewer tooling — public exports**

  The camera controller, reference grid, view gizmo, edge overlays, label layer, and measurement tool are now exported from the public `visualization` entry point. Previously their factories and types were only available internally. New exports include `createCameraController`, `createGrid`, `createViewGizmo`, `addEdges`/`removeEdges`, `createLabelLayer`, `createMeasureTool`/`snapToVertex`, and all associated config/option types (`GridConfig`, `GizmoConfig`, `EdgesConfig`, `MeasureConfig`, `ViewPreset`, `CameraProjection`, …). Additive only — no existing export changed.

  **Measurement tool improvements**
  - Snapping extended to lines and points: `snapToVertex` snaps to the nearer endpoint of a struck segment and to the struck vertex on point objects. Raycast thresholds for lines and points are scaled by view distance so thin geometry is actually clickable at any zoom.
  - Cursor preview: a ghost marker follows the cursor and jumps to the snap vertex before a click commits it.
  - Drag-to-orbit no longer disturbs a measurement — clicks that follow a drag past the slop threshold are ignored.
  - Labels now show per-axis deltas (`Δx`/`Δy`/`Δz`) alongside the total distance. The `format` callback is widened to `(distance, delta) => string`; existing `(distance) => string` callbacks remain valid.
  - Labels ship with a default dark-pill style so they are legible on any background. Pass `labelClassName` to opt out.

  **Camera, grid, and label layer fixes**
  - `initThree` sets `camera.up` before constructing OrbitControls so preset views (`top`/`front`/…) and orbit behavior are correct for Z-up scenes.
  - The grid's default plane is derived from the scene up axis (Z-up → `plane: 'z'`); an explicit `plane` still takes precedence.
  - `clearScene` preserves the persistent `floor`, `grid`, and `label-layer` groups across content updates, fixing measurement labels disappearing in streaming viewers (e.g. per Grasshopper solve).
  - The CSS2D label overlay gets an explicit `z-index` so labels stack above container scrims while staying below menus and popovers.

- 9264ebb: Export the CAD viewer tooling from the public `visualization` entry point.

  The camera controller, reference grid, view gizmo, edge overlays, label layer, and
  measurement tool shipped in 2.1.0-beta.1 were wired through `initThree` at runtime, but
  their factories and types were only re-exported from the internal
  `features/visualization/index.ts` barrel — not from `src/visualization.ts`, the actual
  published entry. Consumers could enable the tools via options and read them off the
  `initThree` return, but could not import the supporting type names
  (`CameraController`, `MeasureTool`, `ViewPreset`, `CameraProjection`, …) or the
  config types (`GridConfig`, `GizmoConfig`, `EdgesConfig`, `MeasureConfig`).
  - Re-export `createCameraController`, `createGrid`, `createViewGizmo`, `addEdges`/`removeEdges`/`isEdgeOverlay`, `createRenderPipeline`, `createLabelLayer`, `createMeasureTool`/`snapToVertex` and their types from `visualization`.
  - Re-export the `GridConfig`/`GizmoConfig`/`EdgesConfig`/`MeasureConfig` option types.
  - Also surface `parseColor`, `applyOffset`, and `computeCombinedBoundingBox` from `three-helpers`.

  Additive only — no existing export changed.

### Patch Changes

- 9264ebb: Fix measurement/dimension labels never appearing in viewers that stream new content (e.g. per
  Grasshopper solve).
  - `updateScene`/`clearScene` removed every top-level scene child except the floor on each update,
    which detached the persistent CSS2D `label-layer` group. Labels added afterwards were parented to
    an orphaned group, so the CSS2D renderer (which walks the live scene) never injected their DOM.
    `clearScene` now preserves persistent infrastructure — `floor`, `grid`, and `label-layer` — across
    content updates. Demos that add geometry directly (never calling `updateScene`) were unaffected,
    which is why the label only went missing in consumer apps.
  - The CSS2D label overlay also gets an explicit `z-index` so it stacks above container scrims (e.g.
    blur/loading overlays) that previously painted over it, while staying below menu/popover layers.

- 9264ebb: Extend the measurement tool to lines and points, not just meshes.
  - `snapToVertex` now snaps line hits to the nearer endpoint of the struck segment and point hits to
    the struck vertex, in addition to the existing mesh triangle-vertex snapping. Hits without usable
    vertex indices (e.g. fat `Line2`) still fall back to the raw point.
  - Line and Points raycast thresholds are raised per-pick, scaled by the view distance, so thin lines
    and points are actually clickable at any zoom instead of being nearly impossible to hit with the
    default ~1-unit threshold.

- 9264ebb: Make the measurement tool easier to read and aim, and report per-axis deltas.
  - Distance labels now carry a default style (dark translucent pill, light text) so they stay
    legible on any background instead of inheriting the page color (previously invisible white-on-white).
    Passing `labelClassName` still opts out of all default styling.
  - The tool previews the snap point: a ghost marker follows the cursor and jumps to the vertex a
    click would lock onto, so you can aim before committing. `MeasureTool` gains `handleMove(event)`,
    which `initThree` wires to canvas `mousemove`.
  - Orbiting/panning no longer disturbs a measurement: the `click` a drag fires on release is ignored
    (pointer moved past a small slop threshold), so in-progress points and finished measurements survive
    rotation instead of being cleared or mis-placed.
  - The default label now shows the per-axis breakdown (`Δx`/`Δy`/`Δz`) under the total distance. The
    `format` callback signature widens to `(distance, delta) => string`; existing `(distance) => string`
    callbacks remain valid.

- 9264ebb: Make the viewer's camera controller, presets, and grid respect the scene up axis.

  The CAD tooling assumed Three's native Y-up, but Selva scenes are Z-up. `initThree` set
  `scene.up` to Z yet never set `camera.up`, so OrbitControls orbited as if Y-up and the
  preset views (`top`/`front`/…) framed the wrong faces; the grid also defaulted to the
  horizontal Y-up plane.
  - `initThree` now sets `camera.up` to the configured `sceneUp` _before_ constructing
    OrbitControls and the camera controller (both capture the orbit/preset basis from up).
  - The camera controller derives its preset view directions, iso angle, and orthographic
    camera up from the up axis instead of a hardcoded Y-up table, via a new optional `up`
    dependency (defaults to the perspective camera's up).
  - The grid's default plane is derived from the up axis (Z-up → `plane: 'z'`), so the grid
    lies under the model without callers passing `plane` explicitly. An explicit `plane`
    still wins.

  No API changes; behavior is corrected for non-Y-up scenes and unchanged for Y-up.

## 2.1.0-beta.7

### Patch Changes

- fdcc1f8: Fix measurement/dimension labels never appearing in viewers that stream new content (e.g. per
  Grasshopper solve).
  - `updateScene`/`clearScene` removed every top-level scene child except the floor on each update,
    which detached the persistent CSS2D `label-layer` group. Labels added afterwards were parented to
    an orphaned group, so the CSS2D renderer (which walks the live scene) never injected their DOM.
    `clearScene` now preserves persistent infrastructure — `floor`, `grid`, and `label-layer` — across
    content updates. Demos that add geometry directly (never calling `updateScene`) were unaffected,
    which is why the label only went missing in consumer apps.
  - The CSS2D label overlay also gets an explicit `z-index` so it stacks above container scrims (e.g.
    blur/loading overlays) that previously painted over it, while staying below menu/popover layers.

## 2.1.0-beta.6

### Patch Changes

- cf78444: Fix measurement/dimension labels being hidden behind host viewer overlays. The CSS2D label
  overlay now sets an explicit `z-index` so it stacks above container scrims (e.g. blur/loading
  overlays) that previously painted over it, while staying below typical menu/popover layers.

## 2.1.0-beta.5

### Patch Changes

- a9b134b: Extend the measurement tool to lines and points, not just meshes.
  - `snapToVertex` now snaps line hits to the nearer endpoint of the struck segment and point hits to
    the struck vertex, in addition to the existing mesh triangle-vertex snapping. Hits without usable
    vertex indices (e.g. fat `Line2`) still fall back to the raw point.
  - Line and Points raycast thresholds are raised per-pick, scaled by the view distance, so thin lines
    and points are actually clickable at any zoom instead of being nearly impossible to hit with the
    default ~1-unit threshold.

## 2.1.0-beta.4

### Minor Changes

- 9982b33: Unify the coordinate frame: the Three.js scene is now Rhino's frame (Z-up), end to end.

  Previously the display pipeline rotated Rhino Z-up geometry into Three's native Y-up
  (`(x, y, z) → (x, z, −y)`) during mesh decompression and display-item parsing. That hidden
  rotation meant every feature producing or consuming positions — measurements, mesh metadata,
  label anchors, picking, the new camera presets/grid — had to round-trip through it or silently
  land in the wrong frame.

  The rotation is removed everywhere. A Rhino point `(x, y, z)` is now the Three point `(x, y, z)`:
  - `rhinoToThree` is the identity (kept, deprecated, for call-site compatibility).
  - The int16/float32 vertex paths in `webdisplay/batch-parser.ts` pass vertices through unrotated.
  - `initThree` orients the camera, default iso position, sunlight, floor, and reference grid to the
    scene up axis (Z-up by default); the camera controller's presets are likewise up-derived.

  **Breaking:** any consumer that assumed viewer geometry was Y-up (e.g. reading mesh vertex
  positions, placing objects, or computing directions in Three space) must drop the
  `(x, z, −y)` conversion — Three space now equals Rhino space. The `applyTransforms` option is
  retained but no longer rotates; it will be removed in a future release.

### Patch Changes

- 9982b33: Make the measurement tool easier to read and aim, and report per-axis deltas.
  - Distance labels now carry a default style (dark translucent pill, light text) so they stay
    legible on any background instead of inheriting the page color (previously invisible white-on-white).
    Passing `labelClassName` still opts out of all default styling.
  - The tool previews the snap point: a ghost marker follows the cursor and jumps to the vertex a
    click would lock onto, so you can aim before committing. `MeasureTool` gains `handleMove(event)`,
    which `initThree` wires to canvas `mousemove`.
  - Orbiting/panning no longer disturbs a measurement: the `click` a drag fires on release is ignored
    (pointer moved past a small slop threshold), so in-progress points and finished measurements survive
    rotation instead of being cleared or mis-placed.
  - The default label now shows the per-axis breakdown (`Δx`/`Δy`/`Δz`) under the total distance. The
    `format` callback signature widens to `(distance, delta) => string`; existing `(distance) => string`
    callbacks remain valid.

- 9982b33: Make the viewer's camera controller, presets, and grid respect the scene up axis.

  The CAD tooling assumed Three's native Y-up, but Selva scenes are Z-up. `initThree` set
  `scene.up` to Z yet never set `camera.up`, so OrbitControls orbited as if Y-up and the
  preset views (`top`/`front`/…) framed the wrong faces; the grid also defaulted to the
  horizontal Y-up plane.
  - `initThree` now sets `camera.up` to the configured `sceneUp` _before_ constructing
    OrbitControls and the camera controller (both capture the orbit/preset basis from up).
  - The camera controller derives its preset view directions, iso angle, and orthographic
    camera up from the up axis instead of a hardcoded Y-up table, via a new optional `up`
    dependency (defaults to the perspective camera's up).
  - The grid's default plane is derived from the up axis (Z-up → `plane: 'z'`), so the grid
    lies under the model without callers passing `plane` explicitly. An explicit `plane`
    still wins.

  No API changes; behavior is corrected for non-Y-up scenes and unchanged for Y-up.

## 2.1.0-beta.3

### Minor Changes

- 15cdcfb: Export the CAD viewer tooling from the public `visualization` entry point.

  The camera controller, reference grid, view gizmo, edge overlays, label layer, and
  measurement tool shipped in 2.1.0-beta.1 were wired through `initThree` at runtime, but
  their factories and types were only re-exported from the internal
  `features/visualization/index.ts` barrel — not from `src/visualization.ts`, the actual
  published entry. Consumers could enable the tools via options and read them off the
  `initThree` return, but could not import the supporting type names
  (`CameraController`, `MeasureTool`, `ViewPreset`, `CameraProjection`, …) or the
  config types (`GridConfig`, `GizmoConfig`, `EdgesConfig`, `MeasureConfig`).
  - Re-export `createCameraController`, `createGrid`, `createViewGizmo`, `addEdges`/`removeEdges`/`isEdgeOverlay`, `createRenderPipeline`, `createLabelLayer`, `createMeasureTool`/`snapToVertex` and their types from `visualization`.
  - Re-export the `GridConfig`/`GizmoConfig`/`EdgesConfig`/`MeasureConfig` option types.
  - Also surface `parseColor`, `applyOffset`, and `computeCombinedBoundingBox` from `three-helpers`.

  Additive only — no existing export changed.

## 2.1.0-beta.2

### Minor Changes

- 38cf55d: Add optional `metadata` (`Record<string, string>`) to `FileData`, carrying arbitrary key/value pairs attached in Grasshopper through to downstream consumers for tagging and indexing. Optional and backwards-compatible — existing payloads and the `isFileData` guard are unaffected.

### Patch Changes

- 38cf55d: Make `GrasshopperClient.create()` resilient to a cold or briefly-busy-but-up Compute server.

  The pre-flight `/healthcheck` probe was a single-sample boolean gate with no retry and no timeout, so one missed probe (warm-up, a transient network blip, momentary non-200) made construction throw `NETWORK_ERROR` even though the server was online.
  - `create()` now retries the healthcheck with exponential backoff (default 3 probes, 250ms→1s) before failing, configurable via the existing `config.retry` policy, and disposes the client on final failure.
  - `isServerOnline(timeoutMs = 5000)` now bounds the probe with `AbortSignal.timeout` so a hung connection can't stall the caller; pass `0` to disable. The probe in `create()` always uses its own timeout, independent of `config.timeoutMs` (which may be `0` for long solves).

## 2.1.0-beta.1

### Minor Changes

- 5b8c969: Expand the viewer with CAD-style tooling: camera controller (2D/3D toggle, preset views, rotate lock), infinite fading reference grid, mesh edge overlays, label layer, and a two-click measurement tool.

## 2.1.0-beta.0

### Minor Changes

- Add display items and DisplayBatch support for visualizing non-mesh objects (curves, points) with coordinate transformation.

## 2.0.0

### Major Changes

- 5a332c4: Release v2.0.0.

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
