import { DataTreeDefault, DataTreePath, InputParam, DataTree } from '../types';
import { getLogger } from '@/core';

/**
 * Value types that can be stored in a DataTree
 */
export type DataTreeValue = string | number | boolean | object | null;

/**
 * Simple data item for compute requests (not to be confused with DataItem interface for responses).
 * Note: While TypeScript defines this as string, Rhino Compute accepts boolean/number primitives in JSON.
 */
interface ComputeDataItem {
	data: string | boolean | number;
}

/**
 * InnerTree data structure for compute requests.
 */
type ComputeInnerTreeData = {
	[path in DataTreePath]: ComputeDataItem[];
};

/**
 * Standalone TreeBuilder class for constructing Grasshopper TreeBuilder structures.
 * Does not depend on RhinoCompute library.
 *
 * @example
 * ```ts
 * const tree = new TreeBuilder('MyParam')
 *   .append([0], [1, 2, 3])
 *   .append([1], [4, 5])
 *   .toComputeFormat();
 * ```
 */
export class TreeBuilder {
	private innerTree: ComputeInnerTreeData;
	private paramName: string;

	constructor(paramName: string) {
		this.paramName = paramName;
		this.innerTree = {} as ComputeInnerTreeData;
	}

	/**
	 * Append values to a specific path in the tree.
	 *
	 * @param path - Array of integers representing the branch path (e.g., [0], [0, 1])
	 * @param items - Values to append at this path
	 * @returns this for method chaining
	 */
	public append(path: number[], items: DataTreeValue[]): this {
		const pathKey = TreeBuilder.formatPathString(path);

		if (!this.innerTree[pathKey]) {
			this.innerTree[pathKey] = [];
		}

		const dataItems: ComputeDataItem[] = items.map((item) => ({
			data: TreeBuilder.serializeValue(item)
		}));

		this.innerTree[pathKey].push(...dataItems);
		return this;
	}

	/**
	 * Append a single value to a path.
	 *
	 * @param path - Branch path
	 * @param item - Single value to append
	 * @returns this for method chaining
	 */
	public appendSingle(path: number[], item: DataTreeValue): this {
		return this.append(path, [item]);
	}

	/**
	 * Set values from a DataTreeDefault structure.
	 * Replaces any existing tree data.
	 *
	 * @param treeData - TreeBuilder structure with path keys like "{0;1}"
	 * @returns this for method chaining
	 */
	public fromDataTreeDefault(treeData: DataTreeDefault): this {
		this.innerTree = {} as ComputeInnerTreeData;

		for (const [pathStr, items] of Object.entries(treeData)) {
			if (!Array.isArray(items)) continue;
			const path = TreeBuilder.parsePathString(pathStr);
			this.append(path, items);
		}

		return this;
	}

	/**
	 * Append flattened values to path [0].
	 * Useful for simple flat inputs.
	 *
	 * @param values - Single value or array of values
	 * @returns this for method chaining
	 */
	public appendFlat(values: DataTreeValue | DataTreeValue[]): this {
		const items = Array.isArray(values) ? values : [values];
		return this.append([0], items);
	}

	/**
	 * Get the flattened list of all values in the tree.
	 *
	 * @returns Array of all values across all branches
	 */
	public flatten(): DataTreeValue[] {
		const result: DataTreeValue[] = [];

		for (const items of Object.values(this.innerTree)) {
			if (Array.isArray(items)) {
				for (const item of items) {
					result.push(TreeBuilder.deserializeValue(item.data));
				}
			}
		}

		return result;
	}

	/**
	 * Get all paths in the tree.
	 *
	 * @returns Array of path strings
	 */
	public getPaths(): DataTreePath[] {
		return Object.keys(this.innerTree) as DataTreePath[];
	}

	/**
	 * Get values at a specific path.
	 *
	 * @param path - Path to retrieve values from
	 * @returns Array of values or undefined if path doesn't exist
	 */
	public getPath(path: number[]): DataTreeValue[] | undefined {
		const pathKey = TreeBuilder.formatPathString(path);
		const items = this.innerTree[pathKey];
		if (!items) return undefined;
		return items.map((item: ComputeDataItem) => TreeBuilder.deserializeValue(item.data));
	}

	/**
	 * Convert to format compatible with Grasshopper Compute API.
	 *
	 * @returns InnerTree object ready for compute
	 */
	public toComputeFormat(): DataTree {
		return {
			ParamName: this.paramName,
			InnerTree: this.innerTree as any // Cast to any because request format differs from response type
		};
	}

	/**
	 * Get the raw InnerTree data structure.
	 *
	 * @returns InnerTree data
	 */
	public getInnerTree(): ComputeInnerTreeData {
		return this.innerTree;
	}

	/**
	 * Get the parameter name.
	 *
	 * @returns Parameter name
	 */
	public getParamName(): string {
		return this.paramName;
	}

	// ============================================================================
	// Static Factory Methods
	// ============================================================================

	/**
	 * Create DataTrees from an array of InputParam definitions.
	 * Handles tree access, numeric constraints, and value parsing.
	 *
	 * @param inputs - Array of input parameter definitions
	 * @returns Array of InnerTree instances ready for compute
	 *
	 * @example
	 * ```ts
	 * const trees = TreeBuilder.fromInputParams(inputs);
	 * ```
	 */
	public static fromInputParams(inputs: InputParam[]): DataTree[] {
		return inputs
			.filter((input) => TreeBuilder.hasValidValue(input.default))
			.map((input) => {
				const tree = new TreeBuilder(input.nickname || 'unnamed');
				const value = input.default;

				// Handle tree access (complex TreeBuilder structure)
				if (input.treeAccess && TreeBuilder.isDataTreeStructure(value)) {
					tree.fromDataTreeDefault(value as DataTreeDefault);

					// Apply numeric constraints to tree items
					if (TreeBuilder.isNumericInput(input)) {
						tree.applyNumericConstraints(input.minimum, input.maximum, input.nickname || 'unnamed');
					}
				}
				// Handle flat inputs
				else {
					const values = Array.isArray(value) ? value : [value];
					const processed = TreeBuilder.processValues(values, input);
					tree.appendFlat(processed);
				}

				return tree.toComputeFormat();
			});
	}

	/**
	 * Create a TreeBuilder from a single InputParam.
	 *
	 * @param input - Input parameter definition
	 * @returns InnerTree ready for compute or undefined if value is invalid
	 */
	public static fromInputParam(input: InputParam): DataTree | undefined {
		if (!TreeBuilder.hasValidValue(input.default)) return undefined;

		const trees = TreeBuilder.fromInputParams([input]);
		return trees[0];
	}

	/**
	 * Set or replace a parameter value within a TreeBuilder or InnerTree array.
	 *
	 * Supports both high-level `DataTree[]` instances and low-level `InnerTree[]` format.
	 *
	 * **Architecture Note:**
	 * - Use with `DataTree[]` when building/modifying before computation
	 * - Use with `InnerTree[]` when modifying compute API results
	 * - `DataTree` is the high-level builder; `InnerTree` is the Rhino Compute format
	 *
	 * @overload For TreeBuilder instances (high-level builder)
	 * @param trees - Array of TreeBuilder instances to modify
	 * @param paramName - The parameter name to set or replace
	 * @param newValue - The new value (scalar, array, or TreeBuilder structure)
	 * @returns A new/modified TreeBuilder array with the updated parameter
	 *
	 * @overload For compiled InnerTree (low-level API format)
	 * @param trees - The compiled InnerTree array (typically from `client.solve()`)
	 * @param paramName - The parameter name to set or replace
	 * @param newValue - The new value (scalar, array, or TreeBuilder structure)
	 * @returns A new/modified InnerTree array with the updated parameter
	 *
	 * @example
	 * ```ts
	 * // With TreeBuilder instances (high-level)
	 * let trees = [new TreeBuilder('X'), new TreeBuilder('Y')];
	 * trees = TreeBuilder.replaceTreeValue(trees, 'X', 42);
	 * const result = await client.solve(definitionUrl,
	 *   trees.map(t => t.toComputeFormat())
	 * );
	 * ```
	 *
	 * @example
	 * ```ts
	 * // With InnerTree format (low-level, from API)
	 * let trees = await client.solve(definitionUrl, initialInputs);
	 * trees = TreeBuilder.replaceTreeValue(trees, 'X', 42);
	 * trees = TreeBuilder.replaceTreeValue(trees, 'Y', [1, 2, 3]);
	 * ```
	 */
	public static replaceTreeValue(
		trees: TreeBuilder[],
		paramName: string,
		newValue: DataTreeValue
	): TreeBuilder[];
	public static replaceTreeValue(
		trees: DataTree[],
		paramName: string,
		newValue: DataTreeValue
	): DataTree[];
	public static replaceTreeValue(
		trees: TreeBuilder[] | DataTree[],
		paramName: string,
		newValue: DataTreeValue
	): TreeBuilder[] | DataTree[] {
		// Check if we're working with TreeBuilder instances or InnerTree objects
		const isDataTreeArray = trees.length > 0 && trees[0] instanceof TreeBuilder;

		if (isDataTreeArray) {
			// Handle DataTree[] instances
			const dataTrees = trees as TreeBuilder[];
			const existingIndex = dataTrees.findIndex((t) => t.getParamName() === paramName);
			const tree = new TreeBuilder(paramName);

			// Handle different input formats
			if (
				typeof newValue === 'object' &&
				newValue !== null &&
				!Array.isArray(newValue) &&
				TreeBuilder.isDataTreeStructure(newValue)
			) {
				tree.fromDataTreeDefault(newValue as DataTreeDefault);
			} else if (Array.isArray(newValue)) {
				tree.appendFlat(newValue);
			} else {
				tree.appendFlat(newValue);
			}

			if (existingIndex !== -1) {
				dataTrees[existingIndex] = tree;
			} else {
				dataTrees.push(tree);
			}

			return dataTrees;
		} else {
			// Handle InnerTree[] (compiled format)
			const innerTrees = trees as DataTree[];
			const existingIndex = innerTrees.findIndex((t) => t.ParamName === paramName);
			const tree = new TreeBuilder(paramName);

			// Handle different input formats
			if (
				typeof newValue === 'object' &&
				newValue !== null &&
				!Array.isArray(newValue) &&
				TreeBuilder.isDataTreeStructure(newValue)
			) {
				tree.fromDataTreeDefault(newValue as DataTreeDefault);
			} else if (Array.isArray(newValue)) {
				tree.appendFlat(newValue);
			} else {
				tree.appendFlat(newValue);
			}

			const newTree = tree.toComputeFormat();

			if (existingIndex !== -1) {
				innerTrees[existingIndex] = newTree;
			} else {
				innerTrees.push(newTree);
			}

			return innerTrees;
		}
	}

	/**
	 * Extract a value from a TreeBuilder or InnerTree array by parameter name.
	 *
	 * Automatically unwraps single values for convenience.
	 * Works with both high-level `DataTree[]` instances and low-level `InnerTree[]` format.
	 *
	 * **Architecture Note:**
	 * - Use with `DataTree[]` to read builder instances
	 * - Use with `InnerTree[]` to read compute API responses
	 * - Return behavior is consistent across both formats
	 *
	 * **Return Value Behavior:**
	 * - Single value → unwrapped (returns `5` not `[5]`)
	 * - Multiple values → array of values
	 * - Not found → `null`
	 *
	 * @overload For TreeBuilder instances
	 * @param trees - Array of TreeBuilder instances to read from
	 * @param paramName - The parameter name to retrieve
	 * @returns The unwrapped value, array of values, or null if parameter not found
	 *
	 * @overload For compiled InnerTree
	 * @param trees - The compiled InnerTree array (typically from `client.solve()`)
	 * @param paramName - The parameter name to retrieve
	 * @returns The unwrapped value, array of values, or null if parameter not found
	 *
	 * @example
	 * ```ts
	 * // With TreeBuilder instances
	 * const trees = [new TreeBuilder('X'), new TreeBuilder('Y')];
	 * trees[0].appendFlat(42);
	 * const x = TreeBuilder.getTreeValue(trees, 'X'); // Returns 42
	 * ```
	 *
	 * @example
	 * ```ts
	 * // With InnerTree from compute results
	 * const result = await client.solve(definitionUrl, inputs);
	 * const x = TreeBuilder.getTreeValue(result, 'X'); // Returns 42 (not [42])
	 * const points = TreeBuilder.getTreeValue(result, 'Points'); // Returns [point1, point2, ...]
	 * ```
	 */
	public static getTreeValue(trees: TreeBuilder[], paramName: string): DataTreeValue | null;
	public static getTreeValue(trees: DataTree[], paramName: string): DataTreeValue | null;
	public static getTreeValue(
		trees: TreeBuilder[] | DataTree[],
		paramName: string
	): DataTreeValue | null {
		// Check if we're working with TreeBuilder instances or InnerTree objects
		const isDataTreeArray = trees.length > 0 && trees[0] instanceof TreeBuilder;

		if (isDataTreeArray) {
			// Handle DataTree[] instances
			const dataTrees = trees as TreeBuilder[];
			const tree = dataTrees.find((t) => t.getParamName() === paramName);

			if (!tree) {
				return null;
			}

			const values = tree.flatten();

			if (values.length === 0) return null;
			if (values.length === 1) return values[0];
			return values;
		} else {
			// Handle InnerTree[] (compiled format)
			const innerTrees = trees as DataTree[];
			const tree = innerTrees.find((t) => t.ParamName === paramName);

			if (!tree) {
				return null;
			}

			const innerTree = tree.InnerTree;

			// Handle missing InnerTree
			if (!innerTree) {
				return null;
			}

			// Get the first path (usually "{0}")
			const firstKey = Object.keys(innerTree)[0];
			if (!firstKey) {
				return null;
			}

			// @ts-expect-error - Dynamic key access on innerTree
			const items = innerTree[firstKey];

			// Handle array of values
			if (Array.isArray(items)) {
				// Single value: unwrap the data property
				if (items.length === 1) {
					const value = items[0]?.data;
					return value !== undefined ? TreeBuilder.deserializeValue(value) : null;
				}
				// Multiple values: return array of deserialized values
				return items
					.map((item) =>
						item?.data !== undefined ? TreeBuilder.deserializeValue(item.data) : null
					)
					.filter((v) => v !== null);
			}

			// Handle single object with data property
			if (items?.data !== undefined) {
				return TreeBuilder.deserializeValue(items.data);
			}

			// Return raw value
			return items;
		}
	}

	/**
	 * Parse a TreeBuilder path string like "{0;1;2}" into [0, 1, 2].
	 *
	 * @param pathStr - Path string
	 * @returns Array of path indices
	 */
	public static parsePathString(pathStr: string): number[] {
		const match = pathStr.match(/^\{([\d;]+)\}$/);
		if (!match) {
			getLogger().warn(`Invalid TreeBuilder path format: ${pathStr}, using [0]`);
			return [0];
		}
		return match[1].split(';').map(Number);
	}

	/**
	 * Format a path array into TreeBuilder path string format.
	 *
	 * @param path - Path as number array
	 * @returns Formatted path string like "{0;1;2}"
	 */
	public static formatPathString(path: number[]): DataTreePath {
		return `{${path.join(';')}}` as DataTreePath;
	}

	// ============================================================================
	// Private Helper Methods
	// ============================================================================

	/**
	 * Apply numeric constraints to all tree values.
	 */
	private applyNumericConstraints(
		min: number | null | undefined,
		max: number | null | undefined,
		inputName: string
	): void {
		for (const items of Object.values(this.innerTree)) {
			if (!Array.isArray(items)) continue;

			for (const item of items) {
				const value = TreeBuilder.deserializeValue(item.data);
				if (typeof value === 'number') {
					const clamped = TreeBuilder.clampValue(value, min, max, inputName);
					item.data = TreeBuilder.serializeValue(clamped);
				}
			}
		}
	}

	/**
	 * Serialize a value for compute requests.
	 * Preserves booleans and numbers as primitives for proper Grasshopper parameter handling.
	 */
	private static serializeValue(value: DataTreeValue): string | boolean | number {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'number') return value;
		if (typeof value === 'string') return value;
		if (typeof value === 'object' && value !== null) {
			return JSON.stringify(value);
		}
		return String(value);
	}

	/**
	 * Deserialize a value back to its original type.
	 * Handles both string-encoded values and primitive values.
	 */
	private static deserializeValue(data: string | boolean | number): DataTreeValue {
		// If already a primitive type, return as-is
		if (typeof data === 'boolean') return data;
		if (typeof data === 'number') return data;

		// Handle string values
		if (typeof data !== 'string') return data;

		// Try to parse as JSON first
		if (data.startsWith('{') || data.startsWith('[')) {
			try {
				return JSON.parse(data);
			} catch {
				return data;
			}
		}
		// Try to parse as number
		if (!isNaN(Number(data))) {
			return Number(data);
		}
		// Try to parse as boolean
		if (data === 'true') return true;
		if (data === 'false') return false;
		return data;
	}

	/**
	 * Check if a value is valid for inclusion in a DataTree.
	 */
	private static hasValidValue(value: unknown): boolean {
		if (value === undefined || value === null) return false;
		if (typeof value === 'string') return true;
		if (Array.isArray(value) && value.length === 0) return false;
		if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
			return false;
		return true;
	}

	/**
	 * Check if value is a TreeBuilder structure.
	 */
	private static isDataTreeStructure(value: unknown): value is DataTreeDefault {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
		return Object.entries(value).every(
			([key, val]) => typeof key === 'string' && /^\{[\d;]+\}$/.test(key) && Array.isArray(val)
		);
	}

	/**
	 * Check if input is numeric type.
	 */
	private static isNumericInput(input: InputParam): input is InputParam & {
		paramType: 'Number' | 'Integer';
		minimum?: number | null;
		maximum?: number | null;
	} {
		return input.paramType === 'Number' || input.paramType === 'Integer';
	}

	/**
	 * Process array of values based on input type.
	 */
	private static processValues(values: DataTreeValue[], input: InputParam): DataTreeValue[] {
		return values
			.map((val) => {
				// Apply numeric constraints
				if (TreeBuilder.isNumericInput(input) && typeof val === 'number') {
					return TreeBuilder.clampValue(
						val,
						input.minimum,
						input.maximum,
						input.nickname || 'unnamed'
					);
				}

				// Keep objects and strings as-is (serialization happens in append)
				return val;
			})
			.filter((v) => v !== null && v !== undefined);
	}

	/**
	 * Clamp numeric value to constraints.
	 */
	private static clampValue(
		value: number,
		min: number | null | undefined,
		max: number | null | undefined,
		inputName: string
	): number {
		let result = value;

		if (min !== null && min !== undefined && result < min) {
			getLogger().warn(`${inputName}: ${value} below min ${min}, clamping`);
			result = min;
		}
		if (max !== null && max !== undefined && result > max) {
			getLogger().warn(`${inputName}: ${value} above max ${max}, clamping`);
			result = max;
		}

		return result;
	}
}
