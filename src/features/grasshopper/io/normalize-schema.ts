import { readField } from '@/core/utils/read-field';
import type { InputParamSchema, OutputParamSchema } from '../types';

/**
 * @internal Canonicalize a raw `/io` param record's field CASING.
 *
 * ## Why this exists
 *
 * The Rhino Compute `/io` response is only partially camelCased, and how much
 * depends on the server branch:
 *
 * - mcneel 8.x/9.x and the upstream-tracking `8.x.selva` branch keep the IO
 *   schema close to the raw C# classes, which carry few/no `[JsonProperty]`
 *   attributes — so most per-param fields serialize PascalCase (`ParamType`,
 *   `Minimum`, `Name`, `Default`, …), with only `id` / `groupName` / `values`
 *   lowercased.
 * - The VektorNode Compute8 fork added `[JsonProperty("camelCase")]` to every
 *   field, so the same record arrives fully camelCase.
 *
 * The per-type parsers ({@link INPUT_TYPE_PARSERS}) and base-field extraction
 * read fields straight through (`schema.paramType`, `schema.minimum`, …). On a
 * PascalCase server those reads all miss, so every input parses as an unknown
 * type with a `null` default — the definition looks like it has no usable
 * inputs. Normalizing the casing ONCE here, at the parse boundary, lets the
 * whole downstream pipeline stay branch-agnostic without threading `readField`
 * through every parser.
 *
 * ## What it does NOT touch
 *
 * Only the top-level FIELD KEYS are canonicalized. The VALUES are passed through
 * verbatim — in particular `default` (the nested DataTree, whose `InnerTree` /
 * item casing is handled separately and case-insensitively by
 * `normalizeDefault`) and `values` (user-authored dropdown label keys like
 * "Option A", which a naive deep camelCase pass would mangle to "optionA" — the
 * exact regression that motivated removing the old global `camelcaseKeys`).
 */
export function normalizeInputSchema(raw: unknown): InputParamSchema {
	return {
		id: readField<string>(raw, 'id') as string,
		name: readField<string>(raw, 'name') as string,
		nickname: readField<string | null>(raw, 'nickname') ?? null,
		description: readField<string>(raw, 'description') as string,
		paramType: readField<string>(raw, 'paramType') as string,
		treeAccess: readField<boolean>(raw, 'treeAccess') as boolean,
		minimum: readField<number | null>(raw, 'minimum') ?? null,
		maximum: readField<number | null>(raw, 'maximum') ?? null,
		atLeast: readField<number>(raw, 'atLeast') as number,
		atMost: readField<number>(raw, 'atMost') as number,
		stepSize: readField<number>(raw, 'stepSize'),
		// Value passed through verbatim — keys inside are normalized downstream.
		default: readField(raw, 'default'),
		values: readField<Record<string, string>>(raw, 'values'),
		acceptedFormats: readField<string[]>(raw, 'acceptedFormats'),
		groupName: readField<string | null>(raw, 'groupName') ?? ''
	};
}

/**
 * @internal Canonicalize a raw `/io` output record's field casing. Same
 * rationale as {@link normalizeInputSchema}: outputs are `Name` / `Nickname` /
 * `ParamType` / `Id` (PascalCase) on upstream-tracking branches.
 */
export function normalizeOutputSchema(raw: unknown): OutputParamSchema {
	return {
		name: readField<string>(raw, 'name') as string,
		nickname: readField<string | null>(raw, 'nickname') ?? null,
		paramType: readField<string>(raw, 'paramType') as string,
		id: readField<string>(raw, 'id') as string
	};
}
