---
"selva-compute": patch
---

Fix responsive resize handling and deprecated HDR loader in Three.js viewer initializer

- Replace `setTimeout(fn, 16)` throttle with a double-rAF (requestAnimationFrame) pattern for post-layout resize measurements. This ensures `clientWidth`/`clientHeight` are read only after the browser has fully committed the new layout, fixing incorrect canvas dimensions during mobile fullscreen transitions.
- Fix `rafId` type from `NodeJS.Timeout` to `number | null`, which is the correct browser return type for `requestAnimationFrame`.
- Switch `ResizeObserver` target from `parent`-only to an exclusive parent-or-canvas strategy: when a parent container exists it is observed (no feedback loop risk); when no parent is present (fullscreen / `position:fixed`) the canvas itself is observed. This avoids the redundant observer callbacks that were triggered by `renderer.setSize()` mutating canvas attributes when both elements were observed simultaneously.
- Replace deprecated `RGBELoader` with `HDRLoader` to resolve Three.js deprecation warning.
- Update dependencies to latest compatible versions.
