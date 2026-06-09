import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { describe, expect, it } from 'vitest';

import { parseDisplayItems } from '../display-items-parser';

import type { DisplayItem } from '../types';
import type { RhinoModule } from 'rhino3dm';

/**
 * Minimal rhino3dm stand-in: `decodeCurve` only needs `CommonObject.decode` to return something with
 * a `pointAt` function. We return a straight-line curve that reports as NOT a polyline, so the
 * parser exercises the uniform-sampling path and builds a real Line2 — no WASM required.
 */
function fakeRhino(): RhinoModule {
	const curve = {
		isPolyline: () => false,
		domain: [0, 1],
		pointAt: (t: number) => [t, 0, 0],
		getBoundingBox: () => ({ min: [0, 0, 0], max: [1, 0, 0] })
	};
	return {
		CommonObject: { decode: () => curve }
	} as unknown as RhinoModule;
}

/**
 * Step-2b parser tests. Points render with no rhino3dm instance (they need no decode); curves are
 * skipped gracefully when rhino is absent; unknown kinds are skipped, not thrown.
 */
describe('parseDisplayItems', () => {
	it('returns empty for undefined or empty items', () => {
		expect(parseDisplayItems(undefined)).toEqual([]);
		expect(parseDisplayItems([])).toEqual([]);
	});

	it('builds a THREE.Points from a point item in the scene frame (Rhino Z-up, no rotation)', () => {
		const items: DisplayItem[] = [
			{ kind: 'point', id: 'c:0', name: 'P0', layer: '', position: { X: 1, Y: 2, Z: 3 } }
		];

		const objs = parseDisplayItems(items);
		expect(objs).toHaveLength(1);

		const points = objs[0] as THREE.Points;
		expect(points).toBeInstanceOf(THREE.Points);
		expect(points.name).toBe('P0');
		expect(points.userData.id).toBe('c:0');

		// Three scene IS Rhino's Z-up frame — the point lands at its Rhino coordinates unchanged.
		const pos = points.geometry.getAttribute('position');
		expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual([1, 2, 3]);
	});

	it('lands at Rhino coordinates regardless of the legacy applyTransforms flag', () => {
		const items: DisplayItem[] = [
			{ kind: 'point', id: 'c:0', name: 'P', layer: '', position: { X: 1, Y: 2, Z: 3 } }
		];

		const points = parseDisplayItems(items, { applyTransforms: false })[0] as THREE.Points;
		const pos = points.geometry.getAttribute('position');
		expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual([1, 2, 3]);
	});

	it('honors color and opacity on the point material', () => {
		const items: DisplayItem[] = [
			{
				kind: 'point',
				id: 'c:0',
				name: 'P',
				layer: '',
				color: '#ff0000',
				opacity: 0.5,
				position: { X: 0, Y: 0, Z: 0 }
			}
		];

		const points = parseDisplayItems(items)[0] as THREE.Points;
		const mat = points.material as THREE.PointsMaterial;
		expect(mat.opacity).toBe(0.5);
		expect(mat.transparent).toBe(true);
		expect(mat.color.getHexString()).toBe('ff0000');
	});

	it('skips curve items when no rhino3dm instance is provided (points still render)', () => {
		const items: DisplayItem[] = [
			{ kind: 'curve', id: 'c:0', name: 'edge', layer: '', json: '{}' },
			{ kind: 'point', id: 'c:1', name: 'P', layer: '', position: { X: 0, Y: 0, Z: 0 } }
		];

		const objs = parseDisplayItems(items);
		expect(objs).toHaveLength(1);
		expect(objs[0]).toBeInstanceOf(THREE.Points);
	});

	it('builds a fat Line2 from a curve, honoring width, color, and userData', () => {
		const items: DisplayItem[] = [
			{ kind: 'curve', id: 'c:0', name: 'edge', layer: 'L', json: '{}', width: 5, color: '#00ff00' }
		];

		const objs = parseDisplayItems(items, { rhino: fakeRhino() });
		expect(objs).toHaveLength(1);

		const line = objs[0] as Line2;
		expect(line).toBeInstanceOf(Line2);
		expect(line.name).toBe('edge');
		expect(line.userData).toMatchObject({ id: 'c:0', layer: 'L', kind: 'curve' });

		const mat = line.material as Line2['material'] & { linewidth: number };
		expect(mat.linewidth).toBe(5);
		expect(mat.color.getHexString()).toBe('00ff00');
	});

	it('falls back to the default line width when a curve omits width', () => {
		const items: DisplayItem[] = [{ kind: 'curve', id: 'c:0', name: 'e', layer: '', json: '{}' }];

		const line = parseDisplayItems(items, { rhino: fakeRhino() })[0] as Line2;
		const mat = line.material as Line2['material'] & { linewidth: number };
		expect(mat.linewidth).toBe(2);
	});

	it('skips unknown kinds without throwing', () => {
		const items = [
			{ kind: 'label', id: 'c:0', name: 'L', layer: '' },
			{ kind: 'point', id: 'c:1', name: 'P', layer: '', position: { X: 0, Y: 0, Z: 0 } }
		] as unknown as DisplayItem[];

		const objs = parseDisplayItems(items);
		expect(objs).toHaveLength(1);
		expect(objs[0]).toBeInstanceOf(THREE.Points);
	});
});
