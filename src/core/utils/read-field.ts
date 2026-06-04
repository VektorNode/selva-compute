/**
 * Case-insensitive single-key reader for wire payloads.
 *
 * The Rhino Compute family serializes the same logical field with different
 * casing depending on the server branch:
 *
 * - mcneel 8.x / 9.x: the IO schema is PascalCase (`ParamType`, `Default`,
 *   `InnerTree`, …) because those C# classes carry no `[JsonProperty]`.
 * - VektorNode Compute8: the IO schema is camelCase (`paramType`, `default`,
 *   …) because the fork added `[JsonProperty("camelCase")]`, BUT the nested
 *   `default` DataTree wrapper stays PascalCase (`ParamName` / `InnerTree`)
 *   since `Resthopper.IO.DataTree` is an external type the fork can't attribute.
 *
 * So a single response can mix casings, and which casing a given field uses
 * depends on the server branch. Rather than deep-camelCasing the whole payload
 * (the old `camelcaseKeys` approach — which corrupted user-authored value-list
 * label keys and item `data` JSON), read the specific fields we care about
 * case-insensitively and leave everything else verbatim.
 *
 * Prefers an exact-case match when present, then falls back to the first
 * case-insensitive match. Returns `undefined` when no key matches.
 *
 * @param obj - The source object (any non-object input yields `undefined`).
 * @param name - The logical field name, in any casing.
 */
export function readField<T = unknown>(obj: unknown, name: string): T | undefined {
	if (!obj || typeof obj !== 'object') return undefined;

	const record = obj as Record<string, unknown>;
	if (name in record) return record[name] as T;

	const lower = name.toLowerCase();
	for (const key of Object.keys(record)) {
		if (key.toLowerCase() === lower) return record[key] as T;
	}
	return undefined;
}

/**
 * True when `obj` has a key matching `name` (case-insensitively). Distinguishes
 * "field present but value is null/undefined" from "field absent" — needed where
 * presence itself carries meaning (e.g. an `innerTree` that exists but is empty).
 */
export function hasField(obj: unknown, name: string): boolean {
	if (!obj || typeof obj !== 'object') return false;
	const record = obj as Record<string, unknown>;
	if (name in record) return true;
	const lower = name.toLowerCase();
	return Object.keys(record).some((key) => key.toLowerCase() === lower);
}
