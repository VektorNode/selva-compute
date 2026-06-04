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
 * 32-bit FNV-1a core over a sequence of byte/char codes. Returns unsigned hex.
 * Shared by the string and byte hashers so they stay the same algorithm.
 */
function fnv1aCore(length: number, codeAt: (i: number) => number): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < length; i++) {
		hash ^= codeAt(i);
		hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

/**
 * 32-bit FNV-1a— fast, no dependencies. Returns unsigned hex string.
 */
export function fnv1a(input: string): string {
	return fnv1aCore(input.length, (i) => input.charCodeAt(i));
}

/**
 * 32-bit FNV-1a over raw bytes. Returns unsigned hex string.
 */
export function fnv1aBytes(bytes: Uint8Array): string {
	return fnv1aCore(bytes.length, (i) => bytes[i]);
}

/**
 * Hash definition and data tree into a stable cache key.
 *
 * The definition is the *identity* of what we solve, so a binary definition is
 * hashed over its full content (`fnv1aBytes`) — a length-only or sampled key
 * would let two different `.gh` files collide and serve one's cached solve for
 * the other. `.gh` files are small enough that a single linear pass is
 * negligible. (Note this differs from `stableStringify`'s sampled handling of a
 * `Uint8Array` found *inside* the dataTree, where sampling is a deliberate
 * per-solve perf tradeoff.)
 */
export function hashSolveInput(definition: string | Uint8Array, dataTree: unknown): string {
	return fnv1a(`${hashDefinition(definition)}|${stableStringify(dataTree)}`);
}

/**
 * Stable identity of a definition alone (no inputs) — used to key the
 * server-cache-key map so the same definition reuses its `pointer` across solves
 * with different inputs. Same full-content hashing as {@link hashSolveInput}: a
 * binary definition is hashed over all its bytes so two distinct `.gh` files of
 * equal length can't share a cache key.
 */
export function hashDefinition(definition: string | Uint8Array): string {
	return typeof definition === 'string'
		? definition
		: `u8:${definition.length}:${fnv1aBytes(definition)}`;
}
