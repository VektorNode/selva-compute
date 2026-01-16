import { downloadFileData } from '@/features/grasshopper/file-handling';
import { FileBaseInfo, FileData } from '@/features/grasshopper/file-handling/types';
import type { MeshExtractionOptions } from '@/features/visualization/webdisplay/types';

import { GrasshopperComputeResponse } from '../types';

import {
	extractFileData,
	getValue,
	getValues,
	GetValuesOptions,
	GetValuesResult,
	ParsedContext
} from '../io/output/response-processors';

/**
 * High-level wrapper for interacting with Grasshopper Compute responses.
 *
 * This class exposes a clean, consistent API for accessing parsed values,
 * geometry, and produced files. It is designed to be the primary interface
 * when working with Grasshopper results in client applications.
 */
export default class GrasshopperResponseProcessor {
	/**
	 * Store the compute response for reuse.
	 */
	constructor(
		private readonly response: GrasshopperComputeResponse,
		private readonly debug: boolean = false
	) {}

	/**
	 * Extract all values in the response.
	 *
	 * @typeParam T - Expected structure of the return value. Defaults to a simple key/value map. (later cast as needed)
	 * @param byId - If true, keys are parameter IDs; if false, keys are parameter names.
	 * @param options - Controls parsing behavior such as Rhino geometry decoding.
	 * @returns Parsed Grasshopper output values.
	 *
	 * **Note:** Using `byId` only works with the custom VektorNode rhino.compute branch.
	 *
	 * @example
	 * ```ts
	 * const processor = new GrasshopperResponseProcessor(response);
	 * const { values } = processor.getValues();
	 * ```
	 *
	 * @example
	 * ```ts
	 * const { values } = processor.getValues(true); // keyed by param ID
	 * ```
	 */
	public getValues<T = ParsedContext>(
		byId: boolean = false,
		options: GetValuesOptions = {}
	): GetValuesResult<T> {
		return getValues<T>(this.response, byId, options);
	}

	/**
	 * Retrieve a specific value using the parameter name.
	 *
	 * @param paramName - Human-readable parameter name from the Grasshopper definition.
	 * @param options - Parsing configuration (e.g. disable parsing or enable Rhino).
	 * @returns Single parsed value, array of values, or undefined if the parameter is absent.
	 *
	 * @example
	 * ```ts
	 * const schema = processor.getValueByParamName('Schema');
	 * ```
	 */
	public getValueByParamName(paramName: string, options?: GetValuesOptions): any {
		return getValue(this.response, { byName: paramName }, options);
	}

	/**
	 * Retrieve a specific value using the parameter ID.
	 *
	 * @param paramId - Parameter GUID from the Grasshopper definition.
	 * @param options - Parsing configuration (e.g. disable parsing or enable Rhino).
	 * @returns Parsed value, array of values, or undefined if not present.
	 *
	 * @example
	 * ```ts
	 * const output = processor.getValueByParamId('a4be1c1e-23f9-4c27-b942-7f3bb2c45c6f');
	 * ```
	 */
	public getValueByParamId(paramId: string, options?: GetValuesOptions): any {
		return getValue(this.response, { byId: paramId }, options);
	}

	/**
	 * Convert all geometry results into Three.js mesh objects.
	 *
	 * This uses internal helpers to decode Rhino geometry into Three.js
	 * primitives such as meshes and lines, making them ready for rendering.
	 *
	 * All processing options (scaling, positioning, compression, etc.) can be customized.
	 * The processor's debug flag is merged with options - explicit options take precedence.
	 *
	 * **Note:** This only works when using the **Selva Display** component in Grasshopper, and requires the custom branch of rhino.compute from VektorNode. This method dynamically imports three.js visualization modules. Ensure three.js is installed as a peer dependency if you use this feature.
	 *
	 * @param options - Configuration for mesh extraction and parsing. Overrides processor's debug flag if provided.
	 * @returns Promise resolving to an array of Three.js mesh objects.
	 * @throws {RhinoComputeError} If three.js visualization module cannot be loaded.
	 *
	 * @example
	 * ```ts
	 * const meshes = await processor.extractMeshesFromResponse();
	 * scene.add(...meshes);
	 * ```
	 *
	 * @example
	 * ```ts
	 * const meshes = await processor.extractMeshesFromResponse({
	 *   debug: true,
	 *   allowScaling: true,
	 *   allowAutoPosition: false,
	 *   parsing: {
	 *     mergeByMaterial: false,
	 *     applyTransforms: true,
	 *     debug: true,
	 *   },
	 * });
	 * ```
	 */
	public async extractMeshesFromResponse(options?: MeshExtractionOptions) {
		const mergedOptions: MeshExtractionOptions = {
			debug: this.debug,
			...options
		};

		// Dynamically import visualization module to avoid coupling three.js at module load time
		try {
			const { getThreeMeshesFromComputeResponse } = await import('@/features/visualization');
			return getThreeMeshesFromComputeResponse(this.response, mergedOptions);
		} catch (error) {
			// Import here to avoid circular dependencies at top level
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { RhinoComputeError, ErrorCodes } = require('@/core/errors');
			throw new RhinoComputeError(
				'Failed to load three.js visualization module. Ensure three.js is installed as a peer dependency.',
				ErrorCodes.INVALID_STATE,
				{
					context: { originalError: error instanceof Error ? error.message : String(error) }
				}
			);
		}
	}

	/**
	 * Extract internal file data structures from the response.
	 * This includes Grasshopper-generated textures, JSON exports,
	 * CAD formats, or any file structure packaged in the response.
	 *
	 * **Note:** This only works when using the **Block to File** and **Geometry To File** components from the Selva plugin in Grasshopper, and requires the custom branch of rhino.compute from VektorNode.
	 *
	 * @returns Raw file data entries.
	 */
	private getFileData(): FileData[] {
		return extractFileData(this.response);
	}

	/**
	 * Download all files generated by Grasshopper, optionally including
	 * additional user-provided files.
	 *
	 * Files are grouped under the specified folder name when downloaded.
	 *
	 * @param folderName - Name for the download directory.
	 * @param additionalFiles - Extra files to package (single file, array, or null).
	 *
	 * @example
	 * ```ts
	 * processor.getAndDownloadFiles('gh-output');
	 * ```
	 *
	 * @example
	 * ```ts
	 * const extra = { name: 'notes.txt', data: 'Example' };
	 * processor.getAndDownloadFiles('project', extra);
	 * ```
	 */
	public getAndDownloadFiles(
		folderName: string,
		additionalFiles?: FileBaseInfo[] | FileBaseInfo | null
	) {
		const files = this.getFileData();
		downloadFileData(files, folderName, additionalFiles);
	}
}
