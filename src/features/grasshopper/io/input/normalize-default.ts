import { getLogger } from '@/core';
import { readField, hasField } from '@/core/utils/read-field';
import type { InputParamSchema } from '../../types';

/**
 * A non-fatal reason `normalizeDefault` could not interpret a raw `default`.
 * The schema is still returned (with `default` nulled) so parsing continues;
 * the caller folds this into the client-visible `parseErrors`.
 */
export interface NormalizeDefaultWarning {
	code: 'MALFORMED_DEFAULT';
	message: string;
}

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
 * - Object without an innerTree key → default becomes `null` and a
 *   `MALFORMED_DEFAULT` warning is returned (this is a genuinely unexpected
 *   shape, not a casing quirk — the old code only logged and silently nulled,
 *   so the data-loss was invisible on the client).
 * - Empty innerTree → default becomes `undefined`.
 * - tree-access (`treeAccess` or `atMost > 1`) → default becomes a
 *   `Record<branch, parsed[]>` with per-item type-aware parsing.
 * - otherwise → flatten all branch items: 0 → `undefined`, 1 → the value,
 *   N → the array.
 *
 * Returns the normalized schema plus an optional `warning`. {@link normalizeDefault}
 * is the schema-only convenience wrapper for callers that don't need the warning.
 */
export function normalizeDefaultWithWarning(input: InputParamSchema): {
	schema: InputParamSchema;
	warning?: NormalizeDefaultWarning;
} {
	if (typeof input.default !== 'object' || input.default === null) {
		return { schema: input };
	}

	if (!hasField(input.default, 'innerTree')) {
		const message = `Input "${input.name ?? 'unknown'}" default had an unrecognized shape (no innerTree key); the default was dropped.`;
		getLogger().warn('Unexpected structure in input.default:', input.default);
		return {
			schema: { ...input, default: null },
			warning: { code: 'MALFORMED_DEFAULT', message }
		};
	}

	const innerTree = readField<Record<string, unknown>>(input.default, 'innerTree') ?? {};

	// If innerTree is empty, set default to undefined
	if (Object.keys(innerTree).length === 0) {
		return { schema: { ...input, default: undefined } };
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
					// Only geometry is JSON-encoded on the wire. A `System.String`
					// must stay a string: value-list labels routinely start with
					// `[`/`{` (e.g. `[1,2,3]`), and JSON-parsing them would put a
					// non-string into the leaf `data`, which the Rhino.Compute
					// fork's Newtonsoft reader rejects ("Unexpected character ... [").
					if (type?.startsWith('Rhino.Geometry')) {
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
		return { schema: { ...input, default: tree } };
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
		return { schema: { ...input, default: undefined } };
	} else if (allValues.length === 1) {
		return { schema: { ...input, default: allValues[0] } };
	} else {
		return { schema: { ...input, default: allValues } };
	}
}

/**
 * Schema-only convenience wrapper around {@link normalizeDefaultWithWarning},
 * for callers (and tests) that don't consume the warning channel.
 */
export function normalizeDefault(input: InputParamSchema): InputParamSchema {
	return normalizeDefaultWithWarning(input).schema;
}
