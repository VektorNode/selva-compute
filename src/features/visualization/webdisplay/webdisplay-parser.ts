import * as THREE from 'three';

import { applyOffset, computeCombinedBoundingBox } from '../threejs';
import { getLogger } from '@/core';

import { parseMeshBatch } from './batch-parser';

import type { DataItem, GrasshopperComputeResponse } from '@/features/grasshopper/types';
import type { MeshExtractionOptions, MeshBatchParsingOptions } from './types';

// Constants
export const SCALE_FACTORS: Record<string, number> = {
	Millimeters: 1 / 1000,
	Centimeters: 1 / 100,
	Meters: 1,
	Inches: 1 / 39.37,
	Feet: 1 / 3.28084
};

const DISPLAY_COMPONENT_TYPE = 'Display';

/**
 * Extracts and processes display meshes from a ComputePointerResponse using the Grasshopper WebDisplay component.
 *
 * This is the primary entry point for extracting mesh geometry from Grasshopper compute responses.
 * It handles all aspects of mesh processing: decompression, coordinate transformation, scaling, and positioning.
 *
 * **Note:** Mesh decompression happens asynchronously in a Web Worker to prevent UI blocking.
 *
 * @param data - The ComputePointerResponse containing Grasshopper output trees.
 * @param options - Configuration for mesh extraction and parsing behavior. All options are optional with sensible defaults.
 * @returns Promise resolving to array of THREE.Mesh objects (may be empty).
 * @throws Rethrows unexpected errors after attempting to dispose any created meshes.
 *
 * @remarks
 * - Only works with the WebDisplay component of GHHeadless.
 * - Requires changes to Rhino.Compute (see https://github.com/TheVessen/compute.rhino3d).
 * - Provides a performant way to display mesh data in Three.js.
 * - Decompression is performed in a Web Worker for non-blocking UI updates.
 * - Supports mesh metadata (names, user data) if provided in the compute response.
 *
 * @internal Internal helper: high-level extraction remains public via visualization module, but this
 * function is considered internal implementation detail for mesh extraction.
 *
 * @example
 * ```ts
 * // Simple usage with defaults (all processing enabled)
 * const meshes = await getThreeMeshesFromComputeResponse(response);
 *
 * // With debugging enabled
 * const meshes = await getThreeMeshesFromComputeResponse(response, { debug: true });
 *
 * // With advanced options
 * const meshes = await getThreeMeshesFromComputeResponse(response, {
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
export async function getThreeMeshesFromComputeResponse(
	data: GrasshopperComputeResponse,
	options?: MeshExtractionOptions
): Promise<THREE.Mesh[]> {
	const startTime = performance.now();
	const meshes: THREE.Mesh[] = [];

	const {
		allowScaling = true,
		allowAutoPosition = true,
		debug = false,
		parsing: parsingOptions = {}
	} = options ?? {};

	try {
		const scaleFactor = allowScaling ? getScaleFactor(data.modelunits) : 1;
		await extractMeshesFromData(data, meshes, scaleFactor, parsingOptions, debug);

		if (allowAutoPosition) {
			applyGroundOffset(meshes);
		}

		return meshes;
	} catch (error) {
		handleError(error, meshes);
		throw error;
	} finally {
		if (debug) {
			logProcessingTime(startTime);
		}
	}
}

/**
 * Gets the scale factor for the given unit type.
 */
function getScaleFactor(modelUnits: string): number {
	return SCALE_FACTORS[modelUnits] ?? 1;
}

/**
 * Extracts meshes from compute response data.
 */
async function extractMeshesFromData(
	data: GrasshopperComputeResponse,
	meshes: THREE.Mesh[],
	scaleFactor: number,
	parsingOptions: MeshBatchParsingOptions,
	debug: boolean
): Promise<void> {
	for (const value of data.values) {
		const innerTree = value.InnerTree as { [key: string]: DataItem[] };

		for (const path in innerTree) {
			const branch = innerTree[path];
			if (!branch) continue;

			await processDataBranch(branch, meshes, scaleFactor, parsingOptions, debug);
		}
	}
}

/**
 * Processes a single data branch to extract MeshBatch display meshes.
 */
async function processDataBranch(
	branch: DataItem[],
	meshes: THREE.Mesh[],
	scaleFactor: number,
	parsingOptions: MeshBatchParsingOptions,
	debug: boolean
): Promise<void> {
	for (const item of branch) {
		if (item.type.includes(DISPLAY_COMPONENT_TYPE)) {
			const mergedParsingOptions = {
				mergeByMaterial: true,
				applyTransforms: true,
				debug: false,
				...parsingOptions
			};

			const batchMeshes = await parseMeshBatch(item.data, mergedParsingOptions);

			if (scaleFactor !== 1) {
				for (const mesh of batchMeshes) {
					mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
				}
			}

			meshes.push(...batchMeshes);

			if (debug) {
				getLogger().debug(`Extracted ${batchMeshes.length} meshes from batch`);
			}
		}
	}
}

/**
 * Applies vertical offset to position meshes on the Z=0 plane.
 */
function applyGroundOffset(meshes: THREE.Mesh[]): void {
	if (meshes.length === 0) return;

	const combinedBoundingBox = computeCombinedBoundingBox(meshes);
	const offsetY = combinedBoundingBox.min.y;
	applyOffset(meshes, offsetY);
}

/**
 * Handles errors by disposing created meshes and logging.
 */
function handleError(error: unknown, meshes: THREE.Mesh[]): void {
	getLogger().error('An unexpected error occurred:', error);
	disposeMeshes(meshes);
}

/**
 * Disposes of all meshes and their associated resources.
 */
function disposeMeshes(meshes: THREE.Mesh[]): void {
	for (const mesh of meshes) {
		if (mesh.geometry) {
			mesh.geometry.dispose();
		}

		if (mesh.material) {
			if (Array.isArray(mesh.material)) {
				mesh.material.forEach((material) => material.dispose());
			} else {
				mesh.material.dispose();
			}
		}
	}
}

/**
 * Logs the processing time for mesh extraction.
 */
function logProcessingTime(startTime: number): void {
	const elapsed = performance.now() - startTime;
	getLogger().info('Time to process meshes:', `${elapsed.toFixed(2)}ms`);
}
