---
'@selvajs/compute': minor
---

Unify the coordinate frame: the Three.js scene is now Rhino's frame (Z-up), end to end.

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
