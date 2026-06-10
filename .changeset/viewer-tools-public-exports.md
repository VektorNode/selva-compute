---
'@selvajs/compute': minor
---

Export the CAD viewer tooling from the public `visualization` entry point.

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
