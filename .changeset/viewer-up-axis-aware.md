---
'@selvajs/compute': patch
---

Make the viewer's camera controller, presets, and grid respect the scene up axis.

The CAD tooling assumed Three's native Y-up, but Selva scenes are Z-up. `initThree` set
`scene.up` to Z yet never set `camera.up`, so OrbitControls orbited as if Y-up and the
preset views (`top`/`front`/…) framed the wrong faces; the grid also defaulted to the
horizontal Y-up plane.

- `initThree` now sets `camera.up` to the configured `sceneUp` *before* constructing
  OrbitControls and the camera controller (both capture the orbit/preset basis from up).
- The camera controller derives its preset view directions, iso angle, and orthographic
  camera up from the up axis instead of a hardcoded Y-up table, via a new optional `up`
  dependency (defaults to the perspective camera's up).
- The grid's default plane is derived from the up axis (Z-up → `plane: 'z'`), so the grid
  lies under the model without callers passing `plane` explicitly. An explicit `plane`
  still wins.

No API changes; behavior is corrected for non-Y-up scenes and unchanged for Y-up.
