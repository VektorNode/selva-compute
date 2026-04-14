---
"selva-compute": patch
---

fix: filter invisible objects from raycaster intersections

Click and mousemove event handlers now exclude objects where `visible` is `false` from raycaster hit results, preventing interactions with hidden scene objects.
