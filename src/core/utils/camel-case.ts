/**
 * Converts a string to camelCase.
 * @param str - The string to convert
 * @param options - Options object
 *   - preserveSpaces: If true, spaces are preserved (default: false)
 */
export function toCamelCase(str: string, options: { preserveSpaces?: boolean } = {}): string {
	const { preserveSpaces = false } = options;
	let s = str.trim();
	if (!preserveSpaces) {
		// Remove spaces, dashes, and underscores, camelCase the next letter
		s = s
			.replace(/^[A-Z]/, (m) => m.toLowerCase())
			.replace(/[\s-_]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''));
		return s;
	} else {
		// Only camelCase after dashes/underscores, preserve spaces
		s =
			s.charAt(0).toLowerCase() +
			s.slice(1).replace(/[-_](.)/g, (_, c) => (c ? c.toUpperCase() : ''));
		return s;
	}
}

/**
 * Recursively converts all object keys to camelCase.
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
