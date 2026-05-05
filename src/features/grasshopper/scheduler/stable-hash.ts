/**
 * Stable hashing for solve deduplication and caching.
 * @internal
 */

/**
 * Deterministic stringify with sorted keys. {a:1,b:2} and {b:2,a:1} produce
 * the same string. Safely handles circular references and non-finite numbers.
 */
export function stableStringify(value: unknown): string {
	const seen = new WeakSet<object>();

	const stringify = (v: unknown): string => {
		if (v === null || v === undefined) return JSON.stringify(v);
		if (typeof v === 'number') {
			return Number.isFinite(v) ? String(v) : JSON.stringify(null);
		}
		if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
		if (typeof v === 'bigint') return JSON.stringify(v.toString());
		if (v instanceof Uint8Array) {
			// Use length + sample instead of full buffer to avoid stringifying large data
			const sample =
				v.length > 64 ? Array.from(v.slice(0, 32)).concat(Array.from(v.slice(-32))) : Array.from(v);
			return JSON.stringify({ __u8: true, len: v.length, sample });
		}
		if (Array.isArray(v)) {
			return `[${v.map(stringify).join(',')}]`;
		}
		if (typeof v === 'object') {
			if (seen.has(v as object)) return JSON.stringify('[Circular]');
			seen.add(v as object);
			const keys = Object.keys(v as object).sort();
			const parts = keys.map((k) => `${JSON.stringify(k)}:${stringify((v as any)[k])}`);
			return `{${parts.join(',')}}`;
		}
		// Fallback for functions, symbols, etc.
		return JSON.stringify(null);
	};

	return stringify(value);
}

/**
 * 32-bit FNV-1a— fast, no dependencies. Returns unsigned hex string.
 */
export function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

/**
 * Hash definition and data tree into a stable cache key.
 * For Uint8Array, uses length + samples to keep hashing fast.
 */
export function hashSolveInput(definition: string | Uint8Array, dataTree: unknown): string {
	const defKey =
		typeof definition === 'string'
			? definition
			: stableStringify({ __u8: true, len: definition.length });
	return fnv1a(`${defKey}|${stableStringify(dataTree)}`);
}
