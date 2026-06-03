import { getLogger } from '@/core';
import type { InputParamSchema } from '../../types';

/**
 * @internal Shared, type-independent normalization of a raw input's `default`.
 *
 * This is the first step of the input-type parser pipeline: it flattens the
 * raw Grasshopper `innerTree` default into the shape the per-type parsers
 * expect, BEFORE type dispatch. The flat-vs-tree decision depends only on
 * `treeAccess` / `atMost`, never on the param type — which is why it lives here
 * as one shared step rather than inside each parser.
 *
 * Pure: returns a new schema with a normalized `default`; never mutates the
 * input. Replaces the old in-place `preProcessInputDefault`.
 *
 * Behavior (pinned by characterization tests — keep identical):
 * - Non-object / null default → returned unchanged.
 * - Object without `innerTree` → default becomes `null` (and warns).
 * - Empty `innerTree` → default becomes `undefined`.
 * - tree-access (`treeAccess` or `atMost > 1`) → default becomes a
 *   `Record<branch, parsed[]>` with per-item type-aware parsing.
 * - otherwise → flatten all branch items: 0 → `undefined`, 1 → the value,
 *   N → the array.
 */
export function normalizeDefault(input: InputParamSchema): InputParamSchema {
	if (typeof input.default !== 'object' || input.default === null) {
		return input;
	}

	if (!('innerTree' in input.default)) {
		getLogger().warn('Unexpected structure in input.default:', input.default);
		return { ...input, default: null };
	}

	const innerTree = (input.default as any).innerTree;

	// If innerTree is empty, set default to undefined
	if (Object.keys(innerTree).length === 0) {
		return { ...input, default: undefined };
	}

	// If treeAccess is true or atMost > 1, preserve the tree structure
	if (input.treeAccess || (input.atMost && input.atMost > 1)) {
		// Convert each branch to an array of parsed data
		const tree: Record<string, any[]> = {};
		for (const [branch, items] of Object.entries(innerTree)) {
			tree[branch] = (items as any[]).map((item) => {
				// Try to parse numbers, booleans, or JSON if possible
				if (typeof item.data === 'string') {
					if (item.type === 'System.Double' || item.type === 'System.Int32') {
						const num = Number(item.data);
						return Number.isNaN(num) ? item.data : num;
					}
					if (item.type === 'System.Boolean') {
						return item.data.toLowerCase() === 'true';
					}
					if (item.type.startsWith('Rhino.Geometry') || item.type === 'System.String') {
						try {
							return JSON.parse(item.data);
						} catch {
							return item.data;
						}
					}
				}
				return item.data;
			});
		}
		return { ...input, default: tree };
	}

	// Otherwise, flatten all values as before
	const allValues: any[] = [];
	for (const items of Object.values(innerTree)) {
		if (Array.isArray(items)) {
			items.forEach((item) => {
				if (item && typeof item === 'object' && 'data' in item) {
					allValues.push(item.data);
				}
			});
		}
	}
	if (allValues.length === 0) {
		return { ...input, default: undefined };
	} else if (allValues.length === 1) {
		return { ...input, default: allValues[0] };
	} else {
		return { ...input, default: allValues };
	}
}
