import type { DataTreeDefault } from '../types';

/**
 * Canonical matcher for a Grasshopper branch path key like `{0}`, `{0;1}`, or
 * the root path `{}`. This is the single source of truth for the branch-path
 * shape (`DataTreePath`); anything testing "does this string name a branch?"
 * should use this rather than re-inlining the regex.
 */
export const TREE_PATH_RE = /^\{([\d;]*)\}$/;

/**
 * Membership test for a {@link DataTreeDefault}: an object keyed entirely by
 * branch paths, each mapping to an array of values. This is the one predicate
 * both the input-type parsers (to pass a tree-access default through untouched)
 * and `TreeBuilder` (to dispatch it to `fromDataTreeDefault`) ask — so the two
 * agree by construction on exactly which values are trees.
 */
export function isDataTreeDefault(value: unknown): value is DataTreeDefault {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const entries = Object.entries(value);
	return (
		entries.length > 0 &&
		entries.every(([key, val]) => TREE_PATH_RE.test(key) && Array.isArray(val))
	);
}
