import { FileData } from '@/core/files/types';
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

// Main extractor — assumes type has already been filtered through isExcludedType
// at the call site. Returning a sentinel from here would pollute the aggregated
// arrays in getValues / getValue when multiple branches are mixed.
function extractItemValue(data: any, type: string, parseValues: boolean, rhino?: any): any {
	if (typeof data !== 'string') return data;

	const raw = parseValues ? tryDecodeJSON(data) : data;
	return decodeBySystemType(raw, type, rhino);
}

/**
 * Type guard for {@link FileData}. The Compute server emits these as JSON
 * blobs inside `FileData`-typed values; this checks that the parsed shape
 * has every required field before we trust it.
 */
function isFileData(value: unknown): value is FileData {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.fileName === 'string' &&
		typeof v.fileType === 'string' &&
		'data' in v &&
		typeof v.isBase64Encoded === 'boolean' &&
		typeof v.subFolder === 'string'
	);
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
 * Read all output values from a Grasshopper Compute response, keyed by parameter
 * name (or ID when `byId`). Duplicate keys aggregate into an array.
 *
 * @param options.parseValues - Parse complex data types into JS objects (default true).
 * @param options.rhino - Rhino3dm instance for geometry decoding.
 * @param options.stringOnly - Keep only string-typed items.
 */
export function getValues<T = ParsedContext>(
	response: GrasshopperComputeResponse,
	byId: boolean = false,
	options: GetValuesOptions = {}
): GetValuesResult<T> {
	const { parseValues = true, rhino, stringOnly = false } = options;
	const result: ParsedContext = {};
	// Keys holding an aggregation array (vs. a single value that happens to BE an array,
	// e.g. parsed JSON `[1,2,3]`) — `Array.isArray(result[key])` can't tell those apart.
	const aggregated = new Set<string>();

	for (const param of response.values) {
		forEachTreeItem(param.InnerTree, (item) => {
			// Skip excluded types (e.g. WebDisplay) entirely — leaving them in
			// would write null into the aggregated result.
			if (isExcludedType(item.type)) return;
			// Skip non-string types if stringOnly is enabled
			if (stringOnly && item.type !== SYSTEM_TYPES.STRING) return;

			const key = byId ? item.id : param.ParamName;
			if (!key) return;

			const value = extractItemValue(item.data, item.type, parseValues, rhino);

			if (!(key in result)) {
				result[key] = value;
			} else if (aggregated.has(key)) {
				result[key].push(value);
			} else {
				result[key] = [result[key], value];
				aggregated.add(key);
			}
		});
	}

	return { values: result as T };
}

/** Decode every file-data item in a response into {@link FileData} objects. */
export function extractFileData(response: GrasshopperComputeResponse): FileData[] {
	const output: FileData[] = [];

	for (const param of response.values) {
		forEachTreeItem(param.InnerTree, (item) => {
			if (!item.type.includes(FILE_DATA_TYPE)) return;

			const parsed = tryDecodeJSON(item.data);
			if (isFileData(parsed)) {
				output.push(parsed);
			}
		});
	}

	return output;
}

/**
 * Read one parameter's value(s) from a response — `byName` matches a `ParamName`,
 * `byId` matches an item ID. Returns `undefined` if absent, a single value for one
 * match, or an array for several.
 *
 * @param parseOptions.parseValues - Parse raw data into formatted values (default true).
 * @param parseOptions.rhino - Rhino3dm instance for geometry decoding.
 * @param parseOptions.stringOnly - Keep only string-typed items.
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
		// Skip excluded types (e.g. WebDisplay) entirely.
		if (isExcludedType(item.type)) return;
		// Skip non-string types if stringOnly is enabled
		if (stringOnly && item.type !== SYSTEM_TYPES.STRING) return;
		const v = extractItemValue(item.data, item.type, parseValues, rhino);
		collected.push(v);
	});

	if (collected.length === 0) return undefined;
	if (collected.length === 1) return collected[0];
	return collected;
}
