import { getLogger } from '@/core';
import { readField, hasField } from '@/core/utils/read-field';
import type { InputParamSchema } from '../../types';

/**
 * Read an item's `data` / `type` case-insensitively. Items are lowercase
 * (`data`/`type`) on every known server branch — they carry `[JsonProperty]` —
 * but reading them defensively costs nothing and guards against future drift.
 */
function itemData(item: unknown): unknown {
	return readField(item, 'data');
}
function itemType(item: unknown): string | undefined {
	return readField<string>(item, 'type');
}

/**
 * @internal Shared, type-independent normalization of a raw input's `default`.
 *
 * This is the first step of the input-type parser pipeline: it flattens the
 * raw Grasshopper innerTree default into the shape the per-type parsers
 * expect, BEFORE type dispatch. The flat-vs-tree decision depends only on
 * `treeAccess` / `atMost`, never on the param type — which is why it lives here
 * as one shared step rather than inside each parser.
 *
 * Pure: returns a new schema with a normalized `default`; never mutates the
 * input. Replaces the old in-place `preProcessInputDefault`.
 *
 * ## Casing
 *
 * The `default` wrapper's keys are read case-insensitively via {@link readField}
 * because their casing depends on the server branch: the nested DataTree is
 * PascalCase (`ParamName` / `InnerTree`) on mcneel 8.x/9.x AND on VektorNode
 * Compute8 (the fork camelCases the surrounding IO schema but can't attribute
 * the external `Resthopper.IO.DataTree`). A previous version literal-matched
 * lowercase `innerTree`, which only worked because a now-removed global
 * `camelcaseKeys` pass had flattened the casing first — so once that pass was
 * dropped, every connected default silently collapsed to `null`. Reading the
 * field case-insensitively makes this robust across all three branches without
 * re-introducing the global camelCasing that corrupted value-list label keys.
 *
 * Behavior:
 * - Non-object / null default → returned unchanged.
 * - Object without an innerTree key → default becomes `null` (and warns; this is
 *   a genuinely unexpected shape, not a casing quirk).
 * - Empty innerTree → default becomes `undefined`.
 * - tree-access (`treeAccess` or `atMost > 1`) → default becomes a
 *   `Record<branch, parsed[]>` with per-item type-aware parsing.
 * - otherwise → flatten all branch items: 0 → `undefined`, 1 → the value,
 *   N → the array.
 */
export function normalizeDefault(input: InputParamSchema): InputParamSchema {
	if (typeof input.default !== 'object' || input.default === null) {
		return input;
	}

	if (!hasField(input.default, 'innerTree')) {
		getLogger().warn('Unexpected structure in input.default:', input.default);
		return { ...input, default: null };
	}

	const innerTree = readField<Record<string, unknown>>(input.default, 'innerTree') ?? {};

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
				const data = itemData(item);
				const type = itemType(item);
				// Try to parse numbers, booleans, or JSON if possible
				if (typeof data === 'string') {
					if (type === 'System.Double' || type === 'System.Int32') {
						const num = Number(data);
						return Number.isNaN(num) ? data : num;
					}
					if (type === 'System.Boolean') {
						return data.toLowerCase() === 'true';
					}
					if (type?.startsWith('Rhino.Geometry') || type === 'System.String') {
						try {
							return JSON.parse(data);
						} catch {
							return data;
						}
					}
				}
				return data;
			});
		}
		return { ...input, default: tree };
	}

	// Otherwise, flatten all values as before
	const allValues: any[] = [];
	for (const items of Object.values(innerTree)) {
		if (Array.isArray(items)) {
			items.forEach((item) => {
				if (item && typeof item === 'object' && hasField(item, 'data')) {
					allValues.push(itemData(item));
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
