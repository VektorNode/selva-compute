---
"selva-compute": minor
---

Improve `initThree` stability, correctness, and UX

**Bug fixes:**
- Fix canvas resize flickering — corrected size comparison to use `clientWidth * pixelRatio` instead of raw buffer dimensions, set `setSize(..., true)` consistently on both init and resize, and raised debounce to 100ms so the layout settles before re-rendering
- Fix `createCamera` querying `document.querySelector('canvas')` (wrong canvas on multi-canvas pages) — now receives the correct canvas element directly
- Fix `enableZoom: false` and `enablePan: false` being silently ignored due to `|| true` fallback — changed to `??`
- Fix `autoRotate` having no effect when `enableDamping` was false — `controls.update()` now also runs when `autoRotate` is on
- Fix HDR load-error handler adding a duplicate ambient light on top of the one already added by `setupLighting`
- Remove dead code in `createScene` that iterated and mutated `scene.children` on a brand-new empty scene

**New feature:**
- Add smooth animated camera zoom on double-click via `animateCameraTo` (ease-out cubic, 200ms). Controlled by new `events.enableDoubleClickZoom` option (default `true`) and accompanied by an optional `events.onMeshDoubleClicked` callback
