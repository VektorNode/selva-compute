import { getLogger } from '@/core';
import type { InputParamSchema } from '../../types';

/**
 * @internal Pre-processing helpers for raw input parameters.
 */

/**
 * Pre-processes raw input to normalize default values
 * Handles data tree structures, flattening, and type parsing
 *
 * @param input - The input parameter to pre-process
 *
 * @remarks
 * Handles:
 * - Empty data trees → undefined
 * - Tree structure preservation for tree access parameters
 * - Flattening of multiple values
 * - Type-aware parsing (numbers, booleans, JSON)
 */
export function preProcessInputDefault(input: InputParamSchema): void {
	if (typeof input.default !== 'object' || input.default === null) {
		return;
	}

	if (!('innerTree' in input.default)) {
		getLogger().warn('Unexpected structure in input.default:', input.default);
		input.default = null;
		return;
	}

	const innerTree = (input.default as any).innerTree;

	// If innerTree is empty, set default to undefined
	if (Object.keys(innerTree).length === 0) {
		input.default = undefined;
		return;
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
		input.default = tree;
		return;
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
		input.default = undefined;
	} else if (allValues.length === 1) {
		input.default = allValues[0];
	} else {
		input.default = allValues;
	}
}
