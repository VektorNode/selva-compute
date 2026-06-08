import * as THREE from 'three';

import { getLogger } from '@/core';

import { rhinoToThree } from '../coordinate-transform';

import type { DisplayCurve, DisplayItem, DisplayPoint } from './types';
import type { RhinoModule } from 'rhino3dm';

/**
 * Builds THREE.js objects from the non-mesh display items on a DisplayBatch — curves (decoded from
 * Rhino-native JSON via rhino3dm and tessellated to {@link THREE.Line}) and points (raw positions
 * rendered as one {@link THREE.Points}). Mirrors the mesh path's coordinate handling: every position
 * goes through {@link rhinoToThree} so items land in the same frame as meshes.
 *
 * selva-compute does not own the rhino3dm WASM instance (it is heavy and the host app initializes
 * it once); the caller threads it in, same as the response decoder. If no instance is supplied,
 * curves are skipped with a warning and points still render — they need no decode.
 */

const DEFAULT_COLOR = '#ffffff';

/** How many segments to sample a curve into. Constant for v1; a future `width`/quality field can drive it. */
const CURVE_TESSELLATION_SEGMENTS = 64;

export interface DisplayItemParseOptions {
	/** rhino3dm instance for decoding curve JSON. Omit to skip curves (points still render). */
	rhino?: RhinoModule;
	/** Apply the Rhino Z-up → Three Y-up transform. Defaults to true (matches the mesh path). */
	applyTransforms?: boolean;
}

/**
 * Parse a batch's `items` into renderable THREE objects. Returns an empty array when there are no
 * items. Unknown kinds are skipped with a warning (forward-compatible with future label/icon kinds
 * a viewer hasn't taught itself to render yet).
 */
export function parseDisplayItems(
	items: DisplayItem[] | undefined,
	options: DisplayItemParseOptions = {}
): THREE.Object3D[] {
	if (!items || items.length === 0) return [];

	const { rhino, applyTransforms = true } = options;
	const objects: THREE.Object3D[] = [];

	for (const item of items) {
		switch (item.kind) {
			case 'curve': {
				const line = buildCurveLine(item, rhino, applyTransforms);
				if (line) objects.push(line);
				break;
			}
			case 'point': {
				objects.push(buildPoint(item, applyTransforms));
				break;
			}
			default: {
				// Exhaustiveness guard: a new kind added to the union without a case here is a
				// compile error. At runtime an unrecognized kind from a newer producer is skipped.
				const unknown = item as { kind?: string };
				getLogger().warn(`Skipping unknown display item kind: ${String(unknown.kind)}`);
				break;
			}
		}
	}

	return objects;
}

/**
 * Decode a curve's Rhino JSON and tessellate it to a THREE.Line. Returns null if rhino3dm is absent
 * or decoding fails, so one bad curve never aborts the whole batch.
 */
function buildCurveLine(
	item: DisplayCurve,
	rhino: RhinoModule | undefined,
	applyTransforms: boolean
): THREE.Line | null {
	if (!rhino) {
		getLogger().warn('No rhino3dm instance provided; skipping curve display item.');
		return null;
	}

	const curve = decodeCurve(item.json, rhino);
	if (!curve) return null;

	const points = tessellate(curve, applyTransforms);
	if (points.length < 2) return null;

	const geometry = new THREE.BufferGeometry().setFromPoints(points);
	const material = new THREE.LineBasicMaterial(materialParams(item.color, item.opacity));

	const line = new THREE.Line(geometry, material);
	line.name = item.name;
	line.userData = { id: item.id, layer: item.layer, kind: 'curve', metadata: item.metadata };
	return line;
}

/** Render a single point as a one-vertex THREE.Points. */
function buildPoint(item: DisplayPoint, applyTransforms: boolean): THREE.Points {
	const { x, y, z } = rhinoToThree(
		item.position.X,
		item.position.Y,
		item.position.Z,
		applyTransforms
	);

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute([x, y, z], 3));

	const material = new THREE.PointsMaterial({
		...materialParams(item.color, item.opacity),
		size: 6,
		sizeAttenuation: false
	});

	const points = new THREE.Points(geometry, material);
	points.name = item.name;
	points.userData = { id: item.id, layer: item.layer, kind: 'point', metadata: item.metadata };
	return points;
}

/** Decode Rhino CommonObject JSON into a rhino3dm Curve (or null on failure). */
function decodeCurve(json: string, rhino: RhinoModule): InstanceType<RhinoModule['Curve']> | null {
	try {
		const parsed = JSON.parse(json);
		const obj = rhino.CommonObject.decode(parsed);
		// decode returns a CommonObject; only curves carry domain/pointAt. Treat anything else as a miss.
		if (obj && typeof (obj as { pointAt?: unknown }).pointAt === 'function') {
			return obj as InstanceType<RhinoModule['Curve']>;
		}
		getLogger().warn('Decoded display-item JSON is not a curve; skipping.');
		return null;
	} catch (error) {
		getLogger().warn('Failed to decode curve display item JSON:', error);
		return null;
	}
}

/**
 * Sample a curve uniformly across its domain into THREE points, applying the shared coordinate
 * transform. rhino3dm WASM has no divideByCount, so we evaluate `pointAt` at evenly spaced
 * parameters — robust for any curve type (line, arc, nurbs, polycurve).
 */
function tessellate(
	curve: InstanceType<RhinoModule['Curve']>,
	applyTransforms: boolean
): THREE.Vector3[] {
	const domain = curve.domain;
	const t0 = domain[0];
	const t1 = domain[1];
	const span = t1 - t0;

	const out: THREE.Vector3[] = [];
	for (let i = 0; i <= CURVE_TESSELLATION_SEGMENTS; i++) {
		const t = t0 + (span * i) / CURVE_TESSELLATION_SEGMENTS;
		const p = curve.pointAt(t); // [x, y, z] in Rhino Z-up
		const { x, y, z } = rhinoToThree(p[0], p[1], p[2], applyTransforms);
		out.push(new THREE.Vector3(x, y, z));
	}

	return out;
}

/** Shared color/opacity → THREE material params. Opacity < 1 flips `transparent` on. */
function materialParams(
	color: string | undefined,
	opacity: number | undefined
): { color: THREE.Color; transparent: boolean; opacity: number } {
	const resolved = opacity ?? 1;
	return {
		color: new THREE.Color(color ?? DEFAULT_COLOR),
		transparent: resolved < 1,
		opacity: resolved
	};
}
