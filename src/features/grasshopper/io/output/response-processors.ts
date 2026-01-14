import { FileData } from '../../../file-handling/types';
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

const EXCLUDED_TYPES = ['WebDisplay'];
const RHINO_GEOMETRY_PREFIX = 'Rhino.Geometry.';
const FILE_DATA_TYPE = 'FileData';

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

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

export function extractFileData(response: GrasshopperComputeResponse): FileData[] {
	const output: FileData[] = [];

	for (const param of response.values) {
		forEachTreeItem(param.InnerTree, (item) => {
			if (!item.type.includes(FILE_DATA_TYPE)) return;

			const parsed = tryDecodeJSON(item.data);
			if (parsed && parsed.FileName && parsed.FileType && parsed.Data) {
				output.push(parsed as FileData);
			}
		});
	}

	return output;
}

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
