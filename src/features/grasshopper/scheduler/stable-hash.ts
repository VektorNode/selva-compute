/**
 * Stable hashing helpers for solve dedupe / cache keys.
 *
 * @internal
 */

/**
 * Deterministic JSON stringify — keys are sorted at every object level so
 * `{a:1,b:2}` and `{b:2,a:1}` produce the same string. Handles circular
 * references safely (replaces with a sentinel) and non-finite numbers.
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
			// Hash bytes by length + a sample to avoid stringifying multi-MB buffers fully
			const sample = v.length > 64 ? Array.from(v.slice(0, 32)).concat(Array.from(v.slice(-32))) : Array.from(v);
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
 * 32-bit FNV-1a hash. Fast, no deps, good enough for dedupe/cache keys.
 * Returns an unsigned hex string.
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
 * Hash a (definition, dataTree) pair into a short stable key.
 * For Uint8Array definitions we use length + endpoint bytes rather than the
 * full content to keep hashing cheap.
 */
export function hashSolveInput(definition: string | Uint8Array, dataTree: unknown): string {
	const defKey =
		typeof definition === 'string'
			? definition
			: stableStringify({ __u8: true, len: definition.length });
	return fnv1a(`${defKey}|${stableStringify(dataTree)}`);
}
