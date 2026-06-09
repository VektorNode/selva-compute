---
'@selvajs/compute': patch
---

Fix measurement/dimension labels being hidden behind host viewer overlays. The CSS2D label
overlay now sets an explicit `z-index` so it stacks above container scrims (e.g. blur/loading
overlays) that previously painted over it, while staying below typical menu/popover layers.
