/**
 * Data tree types for Grasshopper parameter structures
 */

/**
 * Grasshopper-style data tree branch path
 * @example "{0}", "{0;0}", "{0;1;2}"
 */
export type DataTreePath = `{${string}}`;

/**
 * Represents a data item in a data tree
 */
export interface DataItem {
	/** The type of the data, inferred from the Grasshopper GOO class */
	type: string;
	/** The actual returned data as a string that may need to be parsed */
	data: string;
	/** The grasshopper refrence id of the output */
	id: string;
}

/**
 * Grasshopper-style data tree for input defaults
 * @example
 * ```typescript
 * const numericTree: DataTreeDefault<number> = {
 *   "{0}": [1, 2, 3],
 *   "{0;0}": [4, 5],
 *   "{1}": [6]
 * };
 * ```
 */
export type DataTreeDefault<T = any> = {
	[K in DataTreePath]?: T[];
};

/**
 * Data structure for InnerTreeData matching Rhino Compute responses
 */
export type InnerTreeData = {
	[path in DataTreePath]: DataItem[];
};

/**
 * Tree with parameter metadata (used in compute responses)
 */
export interface DataTree {
	InnerTree: InnerTreeData;
	ParamName: string;
}

/**
 * Array of inner tree values (used in compute requests/responses)
 */
export type Values = DataTree[];

/**
 * Processed data item for output handling
 */
export interface ProcessedDataItem {
	type: string;
	data: any;
	path: string;
}
