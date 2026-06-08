/**
 * The single definition of the Rhino → Three coordinate convention.
 *
 * Rhino is Z-up; Three.js is Y-up. Converting is a −90° rotation about X:
 *
 *   (x, y, z) → (x, z, −y)
 *
 * Every display path (mesh vertices, curve tessellation points, point positions) must apply the
 * SAME transform or the primitives land in different frames. This module is that one source of
 * truth. The mesh dequantize loops in `webdisplay/batch-parser.ts` inline this exact formula for
 * speed (one pass over a large typed array); the item path calls {@link rhinoToThree} per point.
 * If the convention ever changes, change it here and mirror the inline loops.
 */

/** A point in either frame. */
export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

/**
 * Convert one Rhino Z-up point to Three Y-up: `(x, y, z) → (x, z, −y)`. When `apply` is false the
 * point is returned unchanged (the caller opted out of the coordinate transform), so callers can
 * thread the same `applyTransforms` flag the mesh path uses without branching themselves.
 */
export function rhinoToThree(x: number, y: number, z: number, apply = true): Vec3 {
	return apply ? { x, y: z, z: -y } : { x, y, z };
}
