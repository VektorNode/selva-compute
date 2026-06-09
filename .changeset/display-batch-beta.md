---
"@selvajs/compute": minor
---

Add display items and DisplayBatch support for visualizing non-mesh objects (curves, points) with coordinate transformation.

Expand the viewer (`initThree`) into a CAD-style surface:

- Adaptive curve tessellation (polylines stay exact, smooth curves subdivide by chord/turn tolerance) and fat-line rendering via `Line2`.
- Camera controller with a true orthographic/perspective (2D/3D) toggle, preset views (top/front/side/iso), and a runtime rotate lock.
- Infinite fading reference grid, corner nav-cube gizmo, mesh edge overlays, two-click measurement tool, and optional ambient occlusion (config-gated, off by default) — each with live show/hide and enable/disable APIs.
- Fixes: `fitToView` now excludes viewer aids (grid/floor/labels) so content frames correctly; the nav cube no longer clears the whole frame or pins the camera to the origin.
