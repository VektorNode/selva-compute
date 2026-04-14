---
"selva-compute": minor
---

feat: add `onReady` and `onFrame` callbacks to `initThree`; fix canvas resize flicker

### New features

- `events.onReady` — called once the HDR environment map has loaded (or immediately if HDR is disabled or fails), so consumers can coordinate scene loading
- `events.onFrame(delta)` — called every animation frame before render, for custom per-frame logic or physics updates

### Bug fixes

- **Canvas resize flicker** — resize is now applied inside the animation loop immediately before `renderer.render()`, so the buffer clear and the new frame are composited together. Previously a `ResizeObserver` callback triggered the resize asynchronously, leaving a blank frame between the clear and the next render
- **`clearScene` ghost groups** — now removes top-level non-floor children and traverses their subtrees for disposal, instead of traversing the whole scene for meshes. This prevents empty `Group` nodes from accumulating after their mesh children were removed
- **`computeCombinedBoundingBox` empty array** — now returns early on an empty array instead of returning a `Box3` with `+Infinity`/`-Infinity` bounds that would produce `NaN` vectors downstream
- **Tone mapping mismatch** — `setupRenderer` was falling back to `ACESFilmicToneMapping` despite `applyDefaults` always setting `NeutralToneMapping`; the stale fallback is removed

### Breaking changes

- `initThree` no longer returns a `resize` method (resize is now handled automatically every frame)
