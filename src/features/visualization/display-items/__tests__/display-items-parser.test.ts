import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { parseDisplayItems } from '../display-items-parser';

import type { DisplayItem } from '../types';

/**
 * Step-2b parser tests. Points render with no rhino3dm instance (they need no decode); curves are
 * skipped gracefully when rhino is absent; unknown kinds are skipped, not thrown.
 */
describe('parseDisplayItems', () => {
	it('returns empty for undefined or empty items', () => {
		expect(parseDisplayItems(undefined)).toEqual([]);
		expect(parseDisplayItems([])).toEqual([]);
	});

	it('builds a THREE.Points from a point item and applies the Rhino→Three transform', () => {
		const items: DisplayItem[] = [
			{ kind: 'point', id: 'c:0', name: 'P0', layer: '', position: { X: 1, Y: 2, Z: 3 } }
		];

		const objs = parseDisplayItems(items);
		expect(objs).toHaveLength(1);

		const points = objs[0] as THREE.Points;
		expect(points).toBeInstanceOf(THREE.Points);
		expect(points.name).toBe('P0');
		expect(points.userData.id).toBe('c:0');

		// (x, y, z) -> (x, z, -y)
		const pos = points.geometry.getAttribute('position');
		expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual([1, 3, -2]);
	});

	it('passes position through unchanged when applyTransforms is false', () => {
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
