/**
 * The single definition of the Rhino → Three coordinate convention.
 *
 * Selva keeps ONE coordinate frame end to end: the Three.js scene is Rhino's frame, Z-up. A Rhino
 * point `(x, y, z)` is the Three point `(x, y, z)` — no rotation is applied anywhere in the display
 * pipeline. This is why the viewer's camera, grid, floor, and presets are all oriented to Z-up
 * (see `three-initializer.ts` / `camera-controller.ts`).
 *
 * Historically the pipeline rotated Rhino Z-up into Three's native Y-up (`(x, y, z) → (x, z, −y)`),
 * which forced every feature that produced or consumed positions (measurements, metadata, labels,
 * picking) to round-trip through that hidden rotation or silently land in the wrong frame. Removing
 * it makes the frame explicit and uniform; this module is retained as the one documented place the
 * convention lives, and {@link rhinoToThree} is now the identity.
 *
 * The mesh dequantize loops in `webdisplay/batch-parser.ts` likewise pass vertices through unchanged.
 */

/** A point in either frame (the frames are now identical). */
export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

/**
 * Convert one Rhino point to the Three scene frame. The two frames are identical (both Z-up), so
 * this is the identity. The `apply` parameter is retained for API compatibility with callers that
 * thread an `applyTransforms` flag; it no longer changes the result.
 *
 * @deprecated The Rhino→Three frames are unified; this no longer transforms. Use the coordinates
 * directly. Kept so existing call sites compile unchanged.
 */
export function rhinoToThree(x: number, y: number, z: number, _apply = true): Vec3 {
	return { x, y, z };
}
