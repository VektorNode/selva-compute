---
'@selvajs/compute': patch
---

Fix display-mesh layers being collapsed on the Rhino.Compute path. When `mergeByMaterial` is enabled (the cloud default), meshes sharing a material were merged into a single object tagged with only the first mesh's layer, so meshes on different layers were shown under the wrong layer in the scene manager. Merging now happens per (material, layer) sub-group, preserving each mesh's layer while keeping the draw-call savings. This brings the cloud path in line with the local WebSocket path.
