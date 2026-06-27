---
'@selvajs/compute': minor
---

Add viewer support for caller-owned geometry that persists across solves, and mark compute geometry with a source tag.

Previously every object in the scene except viewer infrastructure (`floor`/`grid`/`label-layer`) was cleared on each `updateScene` solve, so anything a caller added directly via `scene.add` was disposed on the next update. There was also no way to tell compute-generated geometry apart from other objects in the scene.

Two additive changes:

- Compute geometry now carries `userData.source = 'compute'` — meshes (merged and individual), curves, and points. Useful for picking, filtering, and debugging.
- Three new viewer methods on the `initThree` return:
  - `addUserGeometry(object)` — tags the object `userData.source = 'user'` and adds it to the scene. User geometry persists across `updateScene` solves instead of being cleared with compute content, and is framed as normal content by fit-to-view.
  - `removeUserGeometry(object)` — removes a single user object and disposes its geometry/materials.
  - `clearUserGeometry()` — removes and disposes all user-added geometry.

Non-breaking: existing call sites are unaffected, and nothing is tagged `'user'` until `addUserGeometry` is called.
