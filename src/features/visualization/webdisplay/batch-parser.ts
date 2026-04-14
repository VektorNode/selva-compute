import * as THREE from 'three';

import { parseColor } from '../threejs/three-helpers';
import { getLogger } from '@/core';

import { decompressBatchedMeshData } from './mesh-compression';

import type { MeshBatch, MaterialGroup, SerializableMaterial } from './types';

/**
 * Parses a batched mesh JSON and creates Three.js meshes.
 *
 * This function handles the optimized batch format where:
 * - Materials are deduplicated and stored once
 * - Meshes are grouped by material for efficient rendering
 * - All geometry data is compressed together and decompressed in a Web Worker
 *
 * @internal Low-level mesh parsing — keep internal to `selva-compute`.
 *
 * @param batchJson - JSON string containing the batched mesh data
 * @param options - Rendering options
 * @returns Promise resolving to array of Three.js mesh objects
 */
export async function parseMeshBatch(
	batchJson: string,
	options?: {
		/** Merge meshes with same material into single geometry*/
		mergeByMaterial?: boolean;
		/** Apply coordinate system transformations */
		applyTransforms?: boolean;
		/** Enable performance monitoring */
		debug?: boolean;
	}
): Promise<THREE.Mesh[]> {
	const { mergeByMaterial = true, applyTransforms = true, debug = false } = options ?? {};

	const perfStart = debug ? performance.now() : 0;
	let parseTime = 0;

	try {
		const parseStart = performance.now();
		const batch: MeshBatch = JSON.parse(batchJson);
		parseTime = performance.now() - parseStart;

		return await parseMeshBatchObject(batch, {
			mergeByMaterial,
			applyTransforms,
			debug,
			parseTime,
			perfStart
		});
	} catch (error) {
		getLogger().error('Error parsing mesh batch:', error);
		return [];
	}
}

/**
 * Parses a MeshBatch object and creates Three.js meshes.
 * This is useful when you already have a deserialized MeshBatch object.
 *
 * @internal Low-level mesh parsing — keep internal to `selva-compute`.
 *
 * @param batch - MeshBatch object
 * @param options - Rendering options
 * @returns Promise resolving to array of Three.js mesh objects
 */
export async function parseMeshBatchObject(
	batch: MeshBatch,
	options?: {
		/** Merge meshes with same material into single geometry*/
		mergeByMaterial?: boolean;
		/** Apply coordinate system transformations */
		applyTransforms?: boolean;
		/** Scale factor to apply to meshes (e.g., for unit conversion) */
		scaleFactor?: number;
		/** Enable performance monitoring */
		debug?: boolean;
		/** Parse time (optional, for debugging) */
		parseTime?: number;
		/** Performance start time (optional, for debugging) */
		perfStart?: number;
	}
): Promise<THREE.Mesh[]> {
	const {
		mergeByMaterial = true,
		applyTransforms = true,
		scaleFactor = 1,
		debug = false,
		parseTime = 0,
		perfStart = debug ? performance.now() : 0
	} = options ?? {};

	let decompressTime = 0,
		meshCreateTime = 0;

	try {
		const decompressStart = performance.now();
		const { vertices, faces } = await decompressBatchedMeshData(batch.compressedData);
		decompressTime = performance.now() - decompressStart;

		const compressedSizeMB = ((batch.compressedData.length * 0.75) / 1024 / 1024).toFixed(2); // Base64 overhead
		const uncompressedSizeMB = ((vertices.byteLength + faces.byteLength) / 1024 / 1024).toFixed(2);
		const compressionRatio = (
			(1 - parseFloat(compressedSizeMB) / parseFloat(uncompressedSizeMB)) *
			100
		).toFixed(1);

		if (debug) {
			getLogger().debug('Mesh Batch Stats:');
			getLogger().debug(`  Materials: ${batch.materials.length} | Groups: ${batch.groups.length}`);
			getLogger().debug(
				`  Vertices: ${(vertices.length / 3).toLocaleString()} | Faces: ${(faces.length / 3).toLocaleString()}`
			);
			getLogger().debug(
				`  Compressed: ${compressedSizeMB} MB | Uncompressed: ${uncompressedSizeMB} MB`
			);
			getLogger().debug(`  Compression Ratio: ${compressionRatio}%`);
		}

		if (applyTransforms) {
			applyCoordinateTransform(vertices);
		}

		const meshCreateStart = performance.now();
		const materials = batch.materials.map(createMaterial);

		const meshes: THREE.Mesh[] = [];

		for (const group of batch.groups) {
			if (mergeByMaterial && group.meshes.length > 1) {
				const mergedMesh = createMergedMesh(group, vertices, faces, materials);
				mergedMesh.userData.sourceComponentId = batch.sourceComponentId ?? null;
				meshes.push(mergedMesh);
			} else {
				const individualMeshes = createIndividualMeshes(group, vertices, faces, materials);
				for (const mesh of individualMeshes) {
					mesh.userData.sourceComponentId = batch.sourceComponentId ?? null;
				}
				meshes.push(...individualMeshes);
			}
		}

		// Apply scaling if needed
		if (scaleFactor !== 1) {
			for (const mesh of meshes) {
				mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
			}
		}

		meshCreateTime = performance.now() - meshCreateStart;

		if (debug) {
			const totalTime = performance.now() - perfStart;
			getLogger().debug('Performance:');
			if (parseTime > 0) getLogger().debug(`  Parse JSON: ${parseTime.toFixed(2)}ms`);
			getLogger().debug(`  Decompress: ${decompressTime.toFixed(2)}ms`);
			getLogger().debug(`  Create Meshes: ${meshCreateTime.toFixed(2)}ms`);
			getLogger().debug(`  Total: ${totalTime.toFixed(2)}ms`);
		}

		return meshes;
	} catch (error) {
		getLogger().error('Error parsing mesh batch object:', error);
		return [];
	}
}

/**
 * Creates a Three.js material from serializable material data.
 */
function createMaterial(matData: SerializableMaterial): THREE.MeshPhysicalMaterial {
	const color = parseColor(matData.color);

	return new THREE.MeshPhysicalMaterial({
		color,
		metalness: matData.metalness,
		roughness: matData.roughness,
		opacity: matData.opacity,
		transparent: matData.transparent,
		side: THREE.DoubleSide,
		// Reduced polygon offset to minimize artifacts
		// Only use minimal offset to prevent z-fighting on coplanar faces
		polygonOffset: true,
		polygonOffsetFactor: 0.5,
		polygonOffsetUnits: 0.5,
		// Improve depth rendering
		depthWrite: true,
		depthTest: true
	});
}

/**
 * Creates a merged mesh from multiple meshes sharing the same material.
 * This is optimal for rendering many small meshes.
 * Optimized to minimize memory allocations and copies.
 */
function createMergedMesh(
	group: MaterialGroup,
	allVertices: Float32Array,
	allFaces: Uint32Array,
	materials: THREE.Material[]
): THREE.Mesh {
	const geometry = new THREE.BufferGeometry();

	let totalVertexFloats = 0;
	let totalFaceIndices = 0;

	for (const mesh of group.meshes) {
		totalVertexFloats += mesh.vertexCount;
		totalFaceIndices += mesh.faceCount;
	}

	const mergedVertices = new Float32Array(totalVertexFloats);
	const mergedIndices = new Uint32Array(totalFaceIndices);

	let vertexWriteOffset = 0;
	let indexWriteOffset = 0;

	for (const mesh of group.meshes) {
		mergedVertices.set(
			allVertices.subarray(mesh.vertexOffset, mesh.vertexOffset + mesh.vertexCount),
			vertexWriteOffset
		);

		const faceSlice = allFaces.subarray(mesh.faceOffset, mesh.faceOffset + mesh.faceCount);

		// Face indices are already rebased in the C# batching process
		// We need to adjust them based on where we're copying the vertices to in the merged array
		const originalBaseVertexIndex = Math.floor(mesh.vertexOffset / 3);
		const newBaseVertexIndex = Math.floor(vertexWriteOffset / 3);
		const indexOffset = newBaseVertexIndex - originalBaseVertexIndex;

		for (let i = 0; i < faceSlice.length; i++) {
			mergedIndices[indexWriteOffset + i] = faceSlice[i] + indexOffset;
		}

		vertexWriteOffset += mesh.vertexCount;
		indexWriteOffset += mesh.faceCount;
	}

	geometry.setAttribute('position', new THREE.BufferAttribute(mergedVertices, 3));
	geometry.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
	geometry.computeVertexNormals();

	const threeMesh = new THREE.Mesh(geometry, materials[group.materialId]);
	// Use the first mesh's name for the merged mesh
	const firstMesh = group.meshes[0];
	const meshNames = group.meshes.map((m) => m.name).filter((name) => name && name.length > 0);
	threeMesh.name = meshNames.length > 0 ? meshNames[0] : `merged_material_${group.materialId}`;
	threeMesh.castShadow = true;
	threeMesh.receiveShadow = true;

	// Structured userData — merged meshes carry data from the first mesh in the group
	threeMesh.userData = {
		name: threeMesh.name,
		layer: firstMesh?.layer ?? '',
		originalIndex: firstMesh?.originalIndex ?? 0,
		metadata: firstMesh?.metadata ?? {},
		// Remaining meshes in the merged group, for reference
		mergedFrom: group.meshes.slice(1).map((m) => ({
			name: m.name,
			layer: m.layer,
			originalIndex: m.originalIndex
		}))
	};

	return threeMesh;
}

/**
 * Creates individual meshes from a material group.
 * This allows independent control of each mesh.
 */
function createIndividualMeshes(
	group: MaterialGroup,
	allVertices: Float32Array,
	allFaces: Uint32Array,
	materials: THREE.Material[]
): THREE.Mesh[] {
	const meshes: THREE.Mesh[] = [];

	for (const meshMeta of group.meshes) {
		const geometry = new THREE.BufferGeometry();

		const vertices = allVertices.subarray(
			meshMeta.vertexOffset,
			meshMeta.vertexOffset + meshMeta.vertexCount
		);

		const faces = allFaces.subarray(meshMeta.faceOffset, meshMeta.faceOffset + meshMeta.faceCount);

		// Faces are already rebased in C# batching, but we need to rebase them for this
		// individual mesh since we're using a subarray of vertices starting at 0
		const baseIndex = Math.floor(meshMeta.vertexOffset / 3);
		const rebasedFaces = new Uint32Array(faces.length);
		for (let i = 0; i < faces.length; i++) {
			rebasedFaces[i] = faces[i] - baseIndex;
		}

		geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
		geometry.setIndex(new THREE.BufferAttribute(rebasedFaces, 1));
		geometry.computeVertexNormals();

		const mesh = new THREE.Mesh(geometry, materials[group.materialId]);
		mesh.name = meshMeta.name;
		mesh.userData = {
			name: meshMeta.name,
			layer: meshMeta.layer ?? '',
			originalIndex: meshMeta.originalIndex,
			metadata: meshMeta.metadata ?? {}
		};
		mesh.castShadow = true;
		mesh.receiveShadow = true;

		meshes.push(mesh);
	}

	return meshes;
}

/**
 * Applies Rhino to Three.js coordinate system transformation.
 * Rhino uses Z-up, Three.js uses Y-up.
 */
function applyCoordinateTransform(vertices: Float32Array): void {
	const cos = Math.cos(-Math.PI / 2);
	const sin = Math.sin(-Math.PI / 2);

	for (let i = 0; i < vertices.length; i += 3) {
		const x = vertices[i];
		const y = vertices[i + 1];
		const z = vertices[i + 2];

		vertices[i] = x;
		vertices[i + 1] = y * cos - z * sin;
		vertices[i + 2] = y * sin + z * cos;
	}
}
