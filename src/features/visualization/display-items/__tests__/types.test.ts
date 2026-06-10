import { describe, expect, it } from 'vitest';

import { rhinoToThree } from '../../coordinate-transform';
import type { DisplayBatch } from '../../webdisplay/types';
import type { DisplayItem } from '../types';

/**
 * Step-2a contract tests: the DisplayItem model is types-only (no rendering yet), so these prove the
 * wire shape round-trips through JSON, the union narrows on `kind`, and the shared coordinate
 * transform is the single definition the item path will reuse.
 */
describe('DisplayItem model (wire contract)', () => {
	it('round-trips a curve item through JSON', () => {
		const item: DisplayItem = {
			kind: 'curve',
			id: 'comp-1:3',
			name: 'North edge',
			layer: 'Structure/Edges',
			color: '#ff8800',
			opacity: 0.8,
			json: '{"version":10000,"archive3dm":70}'
		};
		const back = JSON.parse(JSON.stringify(item)) as DisplayItem;
		expect(back.kind).toBe('curve');
		if (back.kind === 'curve') {
			// Narrowed: `json` is visible, `position` is not part of this variant.
			expect(back.json).toBe(item.json);
			expect(back.id).toBe('comp-1:3');
		}
	});

	it('round-trips a point item with Rhino {X,Y,Z} casing', () => {
		const item: DisplayItem = {
			kind: 'point',
			id: 'comp-1:0',
			name: 'P0',
			layer: '',
			position: { X: 1, Y: 2, Z: 3 }
		};
		const back = JSON.parse(JSON.stringify(item)) as DisplayItem;
		expect(back.kind).toBe('point');
		if (back.kind === 'point') {
			expect(back.position).toEqual({ X: 1, Y: 2, Z: 3 });
		}
	});

	it('carries items alongside the mesh blob on a DisplayBatch', () => {
		const batch: DisplayBatch = {
			materials: [],
			groups: [],
			compressedData: '',
			items: [{ kind: 'point', id: 'c:0', name: 'a', layer: '', position: { X: 0, Y: 0, Z: 0 } }]
		};
		const back = JSON.parse(JSON.stringify(batch)) as DisplayBatch;
		expect(back.items).toHaveLength(1);
		expect(back.items?.[0]?.kind).toBe('point');
	});

	it('omits items cleanly when absent (mesh-only batch unchanged)', () => {
		const batch: DisplayBatch = { materials: [], groups: [], compressedData: '' };
		expect('items' in JSON.parse(JSON.stringify(batch))).toBe(false);
	});
});

describe('rhinoToThree (shared coordinate transform)', () => {
	// Selva keeps one coordinate frame end to end: the Three scene IS Rhino's Z-up frame, so the
	// conversion is the identity. (Historically it rotated (x,y,z)->(x,z,-y) into Three's Y-up.)
	it('is the identity: Rhino coords pass through to the same Three coords', () => {
		expect(rhinoToThree(1, 2, 3)).toEqual({ x: 1, y: 2, z: 3 });
	});

	it('is unaffected by the legacy apply flag', () => {
		expect(rhinoToThree(1, 2, 3, false)).toEqual({ x: 1, y: 2, z: 3 });
		expect(rhinoToThree(1, 2, 3, true)).toEqual({ x: 1, y: 2, z: 3 });
	});
});
