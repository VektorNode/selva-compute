---
'@selvajs/compute': patch
---

Extend the measurement tool to lines and points, not just meshes.

- `snapToVertex` now snaps line hits to the nearer endpoint of the struck segment and point hits to
  the struck vertex, in addition to the existing mesh triangle-vertex snapping. Hits without usable
  vertex indices (e.g. fat `Line2`) still fall back to the raw point.
- Line and Points raycast thresholds are raised per-pick, scaled by the view distance, so thin lines
  and points are actually clickable at any zoom instead of being nearly impossible to hit with the
  default ~1-unit threshold.
