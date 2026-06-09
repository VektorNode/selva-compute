---
'@selvajs/compute': patch
---

Fix measurement/dimension labels never appearing in viewers that stream new content (e.g. per
Grasshopper solve).

- `updateScene`/`clearScene` removed every top-level scene child except the floor on each update,
  which detached the persistent CSS2D `label-layer` group. Labels added afterwards were parented to
  an orphaned group, so the CSS2D renderer (which walks the live scene) never injected their DOM.
  `clearScene` now preserves persistent infrastructure — `floor`, `grid`, and `label-layer` — across
  content updates. Demos that add geometry directly (never calling `updateScene`) were unaffected,
  which is why the label only went missing in consumer apps.
- The CSS2D label overlay also gets an explicit `z-index` so it stacks above container scrims (e.g.
  blur/loading overlays) that previously painted over it, while staying below menu/popover layers.
