/**
 * Converts a string to camelCase.
 * @param str - The string to convert
 * @param options - Options object
 *   - preserveSpaces: If true, spaces are preserved (default: false)
 */
export function toCamelCase(str: string, options: { preserveSpaces?: boolean } = {}): string {
	const { preserveSpaces = false } = options;
	// Whitespace acts as a separator unless we're explicitly preserving it.
	const sep = preserveSpaces ? /[-_]+(.)?/g : /[\s-_]+(.)?/g;
	const head = str.trim();
	return (
		head.charAt(0).toLowerCase() + head.slice(1).replace(sep, (_, c) => (c ? c.toUpperCase() : ''))
	);
}

/**
 * Recursively converts all object keys to camelCase.
 *
 * @deprecated Do not use this on Rhino Compute wire payloads: deep-camelCasing
 * corrupts user-authored keys (value-list labels, item `data` JSON). Read the
 * specific fields you need case-insensitively with `readField`/`hasField` from
 * `core/utils/read-field` instead. Kept only for generic non-payload use.
 *
 * @param obj - The object to process
 * @param options - Options object
 *   - deep: If true, process deeply
 *   - preserveSpaces: If true, spaces are preserved in keys
 * @returns The new object with camelCased keys
 * @internal
 */
export function camelcaseKeys(
	obj: unknown,
	options: { deep?: boolean; preserveSpaces?: boolean } = {}
): unknown {
	if (!obj || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		return options.deep ? obj.map((item) => camelcaseKeys(item, options)) : obj;
	}

	return Object.keys(obj).reduce(
		(result, key) => {
			const camelKey = toCamelCase(key, { preserveSpaces: options.preserveSpaces });
			const value = (obj as any)[key];
			(result as any)[camelKey] = options.deep ? camelcaseKeys(value, options) : value;
			return result;
		},
		{} as Record<string, unknown>
	);
}
