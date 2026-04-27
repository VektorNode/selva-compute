import { getLogger } from './logger';

/**
 * Zips multiple arrays into tuples based on the `multiple` flag.
 *
 * @internal Internal helper — not part of the public stable API.
 *
 * @template T - The input tuple type (arrays when multiple=true, single values when multiple=false)
 * @param multiple - If false, returns the single tuple of args. If true, transposes arrays into tuples.
 * @param args - Variable number of arguments (arrays or single values)
 * @returns
 *  - When multiple is false: returns the single tuple T
 *  - When multiple is true: returns an array of tuples T[]
 *
 * @remarks
 * In transpose mode the result length is the length of the first array. If other
 * arrays have a different length the surplus is silently dropped — a warning is
 * logged in that case so accidental misalignment is observable.
 */
export function zipArgs<T extends any[]>(multiple: boolean, ...args: T): T | T[] {
	if (!multiple) return args;

	if (args.length === 0) return [];

	const length = (args[0] as any[]).length;

	for (let j = 1; j < args.length; j++) {
		const otherLen = (args[j] as any[]).length;
		if (otherLen !== length) {
			getLogger().warn(
				`zipArgs: array at index ${j} has length ${otherLen}, expected ${length}; values will be truncated to the shorter length`
			);
			break;
		}
	}

	const result: T[] = [] as unknown as T[];

	for (let i = 0; i < length; i++) {
		const row: any[] = [];
		for (let j = 0; j < args.length; j++) {
			row.push((args[j] as any[])[i]);
		}
		result.push(row as unknown as T);
	}

	return result;
}
