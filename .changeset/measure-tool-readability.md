---
'@selvajs/compute': patch
---

Make the measurement tool easier to read and aim, and report per-axis deltas.

- Distance labels now carry a default style (dark translucent pill, light text) so they stay
  legible on any background instead of inheriting the page color (previously invisible white-on-white).
  Passing `labelClassName` still opts out of all default styling.
- The tool previews the snap point: a ghost marker follows the cursor and jumps to the vertex a
  click would lock onto, so you can aim before committing. `MeasureTool` gains `handleMove(event)`,
  which `initThree` wires to canvas `mousemove`.
- Orbiting/panning no longer disturbs a measurement: the `click` a drag fires on release is ignored
  (pointer moved past a small slop threshold), so in-progress points and finished measurements survive
  rotation instead of being cleared or mis-placed.
- The default label now shows the per-axis breakdown (`Δx`/`Δy`/`Δz`) under the total distance. The
  `format` callback signature widens to `(distance, delta) => string`; existing `(distance) => string`
  callbacks remain valid.
