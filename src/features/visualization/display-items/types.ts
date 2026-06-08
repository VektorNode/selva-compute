/**
 * Non-mesh display items: curves, points, and later labels/icons.
 *
 * These ride as JSON inside a {@link DisplayBatch} alongside the binary mesh blob — they are a
 * separate pipeline from the SLVA mesh path in `../webdisplay`. Curves arrive as Rhino-native JSON
 * (decoded via rhino3dm and tessellated on the web); points arrive as raw `{X,Y,Z}` positions.
 *
 * The union is STRICT and discriminated on `kind`. The parser narrows on it and uses a
 * `never`-exhaustiveness check, so adding a new kind is a compile error until it is handled.
 */

/**
 * Identity + tagging shared by every display thing — meshes (via an adapter over `MeshMetadata`)
 * and items alike — so pick / filter / label code treats them uniformly. Deliberately excludes
 * rendering concerns (color/material): those differ by kind and are not identity.
 */
export interface DisplayIdentity {
	/** Stable pick key. Both meshes and items synthesize it as `${sourceComponentId}:${originalIndex}`. */
	id: string;
	/** Human label (e.g. "North wall"). Distinct from {@link id} — renaming must not change identity. */
	name: string;
	/** Layer path for grouping in the scene manager (e.g. "Structure/Walls"). */
	layer: string;
	/** Arbitrary key-value pairs from the GH Metadata input. */
	metadata?: Record<string, string>;
}

/**
 * Style fields every visible item can honour. Lines and points have no PBR (no metalness/roughness),
 * so only color + opacity apply here; a future kind that needs richer material adds fields to its own
 * variant rather than bloating this base.
 */
export interface DisplayItemBase extends DisplayIdentity {
	/** Hex/rgb/named color string, parsed by `parseColor`. Falls back to a viewer default. */
	color?: string;
	/** Opacity 0–1. Omitted means fully opaque. */
	opacity?: number;
}

/** A world position in Rhino's Z-up frame, in Rhino's `{X,Y,Z}` casing. Rotated to Three on parse. */
export interface DisplayPosition {
	X: number;
	Y: number;
	Z: number;
}

/**
 * A curve shipped as Rhino-native JSON (`curve.ToNurbsCurve().ToJSON()`), decoded via rhino3dm and
 * tessellated to a `THREE.Line` on the web.
 */
export interface DisplayCurve extends DisplayItemBase {
	kind: 'curve';
	/** Rhino CommonObject JSON for the curve. */
	json: string;
	// Future: width?: number — fat-line thickness in px. Add here, parser reads it, nothing else moves.
}

/** A single point, shipped raw (no rhino3dm decode), rendered as one vertex of a `THREE.Points`. */
export interface DisplayPoint extends DisplayItemBase {
	kind: 'point';
	/** World position in Rhino Z-up; the shared Rhino→Three transform is applied on parse. */
	position: DisplayPosition;
	// Future: size?: number — point size in px. Add here only; scoped to points by the union.
}

/**
 * One non-mesh display item. Meshes do NOT appear here — they ride the binary blob in `DisplayBatch`.
 * New kinds (`label`, `icon`) extend this union and add a parser case; the parser's `never` guard
 * forces them to be handled.
 */
export type DisplayItem = DisplayCurve | DisplayPoint;
