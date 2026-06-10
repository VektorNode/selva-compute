import * as THREE from 'three';

import { applyOffset, computeCombinedBoundingBox } from '../threejs/three-helpers.js';
import { getLogger } from '@/core';

import { parseDisplayItems } from '../display-items/display-items-parser';

import { parseMeshBatch } from './batch-parser';

import type { DataItem, GrasshopperComputeResponse } from '@/features/grasshopper/types';
import type { DisplayBatch, MeshExtractionOptions, MeshBatchParsingOptions } from './types';
import type { RhinoModule } from 'rhino3dm';

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
): Promise<THREE.Object3D[]> {
	const startTime = performance.now();
	const objects: THREE.Object3D[] = [];

	const {
		allowScaling = true,
		allowAutoPosition = true,
		rhino,
		debug = false,
		parsing: parsingOptions = {}
	} = options ?? {};

	try {
		const scaleFactor = allowScaling ? getScaleFactor(data.modelunits) : 1;
		await extractDisplayFromData(data, objects, scaleFactor, parsingOptions, rhino, debug);

		if (allowAutoPosition) {
			applyGroundOffset(objects);
		}

		return objects;
	} catch (error) {
		handleError(error, objects);
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
 * Extracts meshes and non-mesh display items (curves, points) from compute response data.
 */
async function extractDisplayFromData(
	data: GrasshopperComputeResponse,
	objects: THREE.Object3D[],
	scaleFactor: number,
	parsingOptions: MeshBatchParsingOptions,
	rhino: RhinoModule | undefined,
	debug: boolean
): Promise<void> {
	for (const value of data.values) {
		const innerTree = value.InnerTree as { [key: string]: DataItem[] };

		for (const path in innerTree) {
			const branch = innerTree[path];
			if (!branch) continue;

			await processDataBranch(branch, objects, scaleFactor, parsingOptions, rhino, debug);
		}
	}
}

/**
 * Processes a single data branch to extract a DisplayBatch's meshes (binary blob) and items
 * (curves/points JSON). Both get the same unit scale so they share one frame.
 */
async function processDataBranch(
	branch: DataItem[],
	objects: THREE.Object3D[],
	scaleFactor: number,
	parsingOptions: MeshBatchParsingOptions,
	rhino: RhinoModule | undefined,
	debug: boolean
): Promise<void> {
	for (const item of branch) {
		if (!item.type.includes(DISPLAY_COMPONENT_TYPE)) continue;

		const mergedParsingOptions = {
			mergeByMaterial: true,
			applyTransforms: true,
			debug: false,
			...parsingOptions
		};

		const batchMeshes = await parseMeshBatch(item.data, mergedParsingOptions);

		const batchItems = parseDisplayItems(extractBatchItems(item.data), {
			rhino,
			applyTransforms: mergedParsingOptions.applyTransforms
		});

		const batchObjects: THREE.Object3D[] = [...batchMeshes, ...batchItems];

		if (scaleFactor !== 1) {
			for (const obj of batchObjects) {
				obj.scale.set(scaleFactor, scaleFactor, scaleFactor);
			}
		}

		objects.push(...batchObjects);

		if (debug) {
			getLogger().debug(
				`Extracted ${batchMeshes.length} meshes and ${batchItems.length} items from batch`
			);
		}
	}
}

/**
 * Pulls the `items` array off a raw DisplayBatch payload, tolerating either a parsed object or a
 * JSON string (the blob-bearing `item.data` is the same envelope the mesh parser reads).
 */
function extractBatchItems(data: unknown): DisplayBatch['items'] {
	const batch = typeof data === 'string' ? safeParse(data) : (data as DisplayBatch | undefined);
	return batch?.items;
}

function safeParse(s: string): DisplayBatch | undefined {
	try {
		return JSON.parse(s) as DisplayBatch;
	} catch {
		return undefined;
	}
}

/**
 * Applies vertical offset to position objects on the Z=0 plane (the ground of the unified
 * Z-up scene frame — see ../coordinate-transform.ts).
 */
function applyGroundOffset(meshes: THREE.Object3D[]): void {
	if (meshes.length === 0) return;

	const combinedBoundingBox = computeCombinedBoundingBox(meshes);
	applyOffset(meshes, combinedBoundingBox.min.z, 'z');
}

/**
 * Handles errors by disposing created objects and logging.
 */
function handleError(error: unknown, meshes: THREE.Object3D[]): void {
	getLogger().error('An unexpected error occurred:', error);
	disposeMeshes(meshes);
}

/**
 * Disposes of all objects (meshes, lines, points) and their associated resources.
 */
function disposeMeshes(meshes: THREE.Object3D[]): void {
	for (const obj of meshes) {
		const mesh = obj as Partial<THREE.Mesh> & THREE.Object3D;
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
