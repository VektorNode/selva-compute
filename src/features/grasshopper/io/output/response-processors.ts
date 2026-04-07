import { FileData } from '../../file-handling/types';
import { GrasshopperComputeResponse, DataItem } from '../../types';
import { decodeRhinoGeometry } from './rhino-decoder';

export interface ParsedContext {
	[key: string]: any;
}

export interface GetValuesOptions {
	parseValues?: boolean;
	rhino?: any;
	/**
	 * If true, only include values of type System.String in the result.
	 * Non-string types are filtered out.
	 */
	stringOnly?: boolean;
}

export interface GetValuesResult<T = ParsedContext> {
	values: T;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const SYSTEM_TYPES = {
	STRING: 'System.String',
	INT: 'System.Int32',
	DOUBLE: 'System.Double',
	BOOL: 'System.Boolean'
};

const RHINO_GEOMETRY_PREFIX = 'Rhino.Geometry.';

// Only relevant is Selva plugin is used
const EXCLUDED_TYPES = ['WebDisplay'];
const FILE_DATA_TYPE = 'FileData';

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

/**
 * Checks if a given type string should be excluded by verifying if it contains
 * any of the substrings defined in the `EXCLUDED_TYPES` list.
 *
 * @param type - The string representation of the type to check.
 * @returns `true` if the type matches any excluded pattern; otherwise, `false`.
 */
function isExcludedType(type: string): boolean {
	return EXCLUDED_TYPES.some((t) => type.includes(t));
}

function tryDecodeJSON(value: string): any {
	if (typeof value !== 'string') return value;

	const trimmed = value.trim();
	const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"');
	if (!looksJson) return value;

	try {
		const first = JSON.parse(trimmed);
		if (typeof first === 'string') {
			try {
				return JSON.parse(first);
			} catch {
				return first;
			}
		}
		return first;
	} catch {
		return value;
	}
}

function decodeBySystemType(raw: any, type: string, rhino?: any): any {
	switch (type) {
		case SYSTEM_TYPES.STRING:
			if (typeof raw !== 'string') return raw;
			return raw.replace(/^"(.*)"$/, '$1');

		case SYSTEM_TYPES.INT:
			return Number.parseInt(raw, 10);

		case SYSTEM_TYPES.DOUBLE:
			return Number.parseFloat(raw);

		case SYSTEM_TYPES.BOOL: {
			const str = String(raw).toLowerCase();
			return str === 'true';
		}

		default:
			if (rhino && type.startsWith(RHINO_GEOMETRY_PREFIX)) {
				return decodeRhinoGeometry(raw, type, rhino);
			}
			return raw;
	}
}

// Main extractor
function extractItemValue(data: any, type: string, parseValues: boolean, rhino?: any): any {
	if (isExcludedType(type)) return null;

	if (typeof data !== 'string') return data;

	const raw = parseValues ? tryDecodeJSON(data) : data;
	return decodeBySystemType(raw, type, rhino);
}

// Traversal helper
/**
 * Iterates over every data item within a Grasshopper tree structure.
 *
 * @param tree - The Grasshopper tree structure containing branches of items.
 * @param handler - A callback function invoked for each {@link DataItem} found within the tree branches.
 */
function forEachTreeItem(
	tree: GrasshopperComputeResponse['values'][0]['InnerTree'],
	handler: (item: DataItem) => void
) {
	for (const list of Object.values(tree)) {
		if (Array.isArray(list)) {
			for (const item of list) handler(item);
		}
	}
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Extracts and processes values from a Grasshopper Compute response object.
 *
 * This function iterates through the internal tree structure of the response parameters,
 * extracts individual data items, and aggregates them into a structured result object.
 * Values can be mapped by their parameter names or unique identifiers.
 *
 * @template T - The type of the resulting parsed context values.
 * @param response - The raw response object received from the Grasshopper Compute service.
 * @param byId - Whether to use the parameter's unique ID as the key (true) or its name (false).
 * @param options - Configuration options for value extraction.
 * @param options.parseValues - Whether to attempt parsing complex data types into JavaScript objects.
 * @param options.rhino - An optional Rhino3dm instance used for geometry decoding.
 * @param options.stringOnly - If true, only items identified as strings will be included in the output.
 * @returns A result object containing the mapped values, where duplicate keys are aggregated into arrays.
 */
export function getValues<T = ParsedContext>(
	response: GrasshopperComputeResponse,
	byId: boolean = false,
	options: GetValuesOptions = {}
): GetValuesResult<T> {
	const { parseValues = true, rhino, stringOnly = false } = options;
	const result: ParsedContext = {};

	for (const param of response.values) {
		forEachTreeItem(param.InnerTree, (item) => {
			// Skip non-string types if stringOnly is enabled
			if (stringOnly && item.type !== SYSTEM_TYPES.STRING) return;

			const key = byId ? item.id : param.ParamName;
			if (!key) return;

			const value = extractItemValue(item.data, item.type, parseValues, rhino);

			if (result[key] === undefined) {
				result[key] = value;
			} else if (Array.isArray(result[key])) {
				result[key].push(value);
			} else {
				result[key] = [result[key], value];
			}
		});
	}

	return { values: result as T };
}

/**
 * Extracts and decodes file data from a Grasshopper Compute response.
 *
 * This function iterates through all parameter values in the compute response,
 * identifies items that match the file data type, and attempts to decode their
 * JSON content into {@link FileData} objects.
 *
 * @param response - The response object received from a Grasshopper Compute request.
 * @returns An array of valid {@link FileData} objects extracted from the response trees.
 */
export function extractFileData(response: GrasshopperComputeResponse): FileData[] {
	const output: FileData[] = [];

	for (const param of response.values) {
		forEachTreeItem(param.InnerTree, (item) => {
			if (!item.type.includes(FILE_DATA_TYPE)) return;

			const parsed = tryDecodeJSON(item.data);
			if (
				parsed &&
				parsed.fileName &&
				parsed.fileType &&
				parsed.data &&
				typeof parsed.isBase64Encoded === 'boolean' &&
				typeof parsed.subFolder === 'string'
			) {
				output.push(parsed as FileData);
			}
		});
	}

	return output;
}

/**
 * Extracts a value or collection of values from a Grasshopper Compute response based on the provided criteria.
 *
 * This function searches through the `InnerTree` structures of the response values. If searching `byName`,
 * it returns all values (or a single value) within that parameter's tree. If searching `byId`, it specifically
 * targets items matching that unique identifier.
 *
 * @param response - The compute response object containing the results of a Grasshopper definition execution.
 * @param options - Search criteria, either a `{ byName: string }` to match a `ParamName`, or `{ byId: string }` to match a specific item ID.
 * @param parseOptions - Optional configuration for how values are extracted and filtered.
 * @param parseOptions.parseValues - Whether to process raw data into formatted values (defaults to `true`).
 * @param parseOptions.rhino - Optional Rhino/OpenNURBS instance used for geometry decoding.
 * @param parseOptions.stringOnly - If `true`, non-string types will be filtered out (defaults to `false`).
 *
 * @returns
 * - `undefined` if no matching parameter or items are found.
 * - A single extracted value if only one matching item exists.
 * - An array of extracted values if multiple matching items are found.
 */
export function getValue(
	response: GrasshopperComputeResponse,
	options: { byName: string } | { byId: string },
	parseOptions: GetValuesOptions = {}
): any {
	const { parseValues = true, rhino, stringOnly = false } = parseOptions;

	let targetParam: GrasshopperComputeResponse['values'][0] | undefined;

	if ('byName' in options) {
		targetParam = response.values.find((p) => p.ParamName === options.byName);
	} else {
		targetParam = response.values.find((p) => {
			let found = false;
			forEachTreeItem(p.InnerTree, (item) => {
				if (item.id === options.byId) found = true;
			});
			return found;
		});
	}

	if (!targetParam) return undefined;

	const collected: any[] = [];

	forEachTreeItem(targetParam.InnerTree, (item) => {
		if ('byId' in options && item.id !== options.byId) return;
		// Skip non-string types if stringOnly is enabled
		if (stringOnly && item.type !== SYSTEM_TYPES.STRING) return;
		const v = extractItemValue(item.data, item.type, parseValues, rhino);
		collected.push(v);
	});

	if (collected.length === 0) return undefined;
	if (collected.length === 1) return collected[0];
	return collected;
}
