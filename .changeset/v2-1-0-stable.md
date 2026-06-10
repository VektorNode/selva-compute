---
'@selvajs/compute': minor
---

Release v2.1.0: Z-up coordinate frame, measurement tool, and CAD viewer tooling.

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
