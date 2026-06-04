/**
 * Typed re-export of the plain-ESM contract parser.
 *
 * The parsing logic lives in `parse-server-contract.mjs` so a bare
 * `node scripts/fetch-server-contract.mjs` can import it without a TS loader.
 * This shim adds the type surface the `.test.ts` files consume.
 */
// @ts-expect-error - .mjs sibling, resolved at runtime by vitest
import { parseServerContract as _parse, flatten as _flatten } from './parse-server-contract.mjs';

/** A single C# class and the wire property names it contributes. */
export interface ParsedClass {
	/** C# class name, e.g. `InputParamSchema`. */
	name: string;
	/** Base class name if the class declares one (`class A : B`), else null. */
	base: string | null;
	/**
	 * Wire property names declared directly on this class (not inherited),
	 * in source order. For `[JsonProperty("x")]` members this is `"x"`; for
	 * attribute-less serialized members (DataTree) it is the C# member name.
	 */
	properties: string[];
}

/** The shape we snapshot and compare — only the pieces the client reads. */
export interface ServerContract {
	/** ref the source was taken from, e.g. `Compute8`. */
	ref: string;
	/** Each relevant class keyed by C# name. */
	classes: Record<string, ParsedClass>;
}

export const parseServerContract: (
	schemaCs: string,
	ghPathCs: string,
	ref: string
) => ServerContract = _parse;

export const flatten: (contract: ServerContract, className: string) => string[] = _flatten;
