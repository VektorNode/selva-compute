import * as THREE from 'three';

import { parseColor } from '../threejs/three-helpers';
import { getLogger } from '@/core';

import { FLAG_FLOAT32, parseBinaryMeshBatch } from './binary-parser';

import type { MeshBatch, MaterialGroup, SerializableMaterial } from './types';

/**
 * Parses a batched mesh JSON and creates Three.js meshes.
 *
 * The geometry payload is the binary "SLVA" blob produced by the C# `BinaryGeometryWriter`,
 * base64-encoded into the outer JSON envelope. We `JSON.parse` the small envelope, then hand the
 * blob to `parseBinaryMeshBatch` which decodes the geometry without ever turning it into a string.
 *
 * @internal Low-level mesh parsing — keep internal to `@selvajs/compute`.
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
 *
 * The path is synchronous internally — `parseBinaryMeshBatch` does no IO, just typed-array views
 * over the blob. The function stays `async` so callers don't have to change shape if we move
 * parsing into a worker later.
 *
 * @internal Low-level mesh parsing — keep internal to `@selvajs/compute`.
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

	let decodeTime = 0;
	let meshCreateTime = 0;

	try {
		const decodeStart = performance.now();
		const parsed = parseBinaryMeshBatch(batch.compressedData);
		decodeTime = performance.now() - decodeStart;

		// Prefer materials/groups from the blob's embedded metadata — that's the source of truth
		// the C# writer emits. Fall back to the outer envelope for resilience (e.g. if a future
		// transport drops them from the blob's metadata to save bytes).
		const materialsSrc = parsed.metadata.materials ?? batch.materials;
		const groups = parsed.metadata.groups ?? batch.groups;
		const sourceComponentId = parsed.metadata.sourceComponentId ?? batch.sourceComponentId;

		const isFloat32 = (parsed.flags & FLAG_FLOAT32) !== 0;

		// Dequantize once up-front into a single Float32Array. Downstream code (per-group merging,
		// computeVertexNormals, ground-offset, scaleFactor) all expect world-unit floats, and a
		// single linear pass over the int16 buffer is far cheaper than the legacy gunzip + base64
		// path. The Z-up -> Y-up rotation, when requested, is folded into the same pass.
		const worldVertices = isFloat32
			? maybeRotateFloat32Vertices(parsed.vertices as Float32Array, applyTransforms)
			: dequantizeInt16(
					parsed.vertices as Int16Array,
					parsed.origin,
					parsed.scale,
					applyTransforms
				);

		if (debug) {
			const blobBytes = approximateBase64DecodedBytes(batch.compressedData);
			const wireBytes = parsed.vertices.byteLength + parsed.indices.byteLength;
			getLogger().debug('Mesh Batch Stats:');
			getLogger().debug(`  Materials: ${materialsSrc.length} | Groups: ${groups.length}`);
			getLogger().debug(
				`  Vertices: ${parsed.vertices.length / 3} | Indices: ${parsed.indices.length}`
			);
			getLogger().debug(`  Format: ${isFloat32 ? 'float32' : 'int16 quantized'}`);
			getLogger().debug(
				`  Blob: ${(blobBytes / 1024 / 1024).toFixed(2)} MB | Geometry on wire: ${(wireBytes / 1024 / 1024).toFixed(2)} MB`
			);
		}

		const meshCreateStart = performance.now();
		const materials = materialsSrc.map(createMaterial);

		const meshes: THREE.Mesh[] = [];

		for (const group of groups) {
			if (mergeByMaterial && group.meshes.length > 1) {
				const mergedMesh = createMergedMesh(group, worldVertices, parsed.indices, materials);
				mergedMesh.userData.sourceComponentId = sourceComponentId ?? null;
				meshes.push(mergedMesh);
			} else {
				const individualMeshes = createIndividualMeshes(
					group,
					worldVertices,
					parsed.indices,
					materials
				);
				for (const mesh of individualMeshes) {
					mesh.userData.sourceComponentId = sourceComponentId ?? null;
				}
				meshes.push(...individualMeshes);
			}
		}

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
			getLogger().debug(`  Decode binary: ${decodeTime.toFixed(2)}ms`);
			getLogger().debug(`  Create Meshes: ${meshCreateTime.toFixed(2)}ms`);
			getLogger().debug(`  Total: ${totalTime.toFixed(2)}ms`);
		}

		return meshes;
	} catch (error) {
		getLogger().error('Error parsing mesh batch object:', error);
		return [];
	}
}

// ============================================================================
// DEQUANTIZATION
// ============================================================================

/**
 * Reconstructs world-unit float32 positions from int16 quantized values.
 *
 * Mirrors the encoder formula: `world = origin + (q + 32767) * scale`. When
 * `applyCoordinateTransform=true` we fold the Rhino Z-up -> Three Y-up shuffle into the same pass
 * (`(x, y, z) -> (x, z, -y)`), saving a second walk over the buffer.
 */
function dequantizeInt16(
	q: Int16Array,
	origin: [number, number, number],
	scale: [number, number, number],
	applyCoordinateTransform: boolean
): Float32Array {
	const out = new Float32Array(q.length);
	const ox = origin[0];
	const oy = origin[1];
	const oz = origin[2];
	const sx = scale[0];
	const sy = scale[1];
	const sz = scale[2];

	if (applyCoordinateTransform) {
		// Rotate -90 deg around X: (x, y, z) -> (x, z, -y)
		for (let i = 0; i < q.length; i += 3) {
			const wx = ox + (q[i]! + 32767) * sx;
			const wy = oy + (q[i + 1]! + 32767) * sy;
			const wz = oz + (q[i + 2]! + 32767) * sz;
			out[i] = wx;
			out[i + 1] = wz;
			out[i + 2] = -wy;
		}
	} else {
		for (let i = 0; i < q.length; i += 3) {
			out[i] = ox + (q[i]! + 32767) * sx;
			out[i + 1] = oy + (q[i + 1]! + 32767) * sy;
			out[i + 2] = oz + (q[i + 2]! + 32767) * sz;
		}
	}

	return out;
}

/**
 * For float32 batches: when no transform is needed we can pass through the parser's view; the
 * caller doesn't mutate it. When the rotation is needed we have to allocate.
 */
function maybeRotateFloat32Vertices(
	vertices: Float32Array,
	applyCoordinateTransform: boolean
): Float32Array {
	if (!applyCoordinateTransform) return vertices;

	const out = new Float32Array(vertices.length);
	for (let i = 0; i < vertices.length; i += 3) {
		const x = vertices[i]!;
		const y = vertices[i + 1]!;
		const z = vertices[i + 2]!;
		out[i] = x;
		out[i + 1] = z;
		out[i + 2] = -y;
	}
	return out;
}

// ============================================================================
// MATERIAL CONSTRUCTION
// ============================================================================

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

// ============================================================================
// MESH CONSTRUCTION
// ============================================================================

/**
 * Creates a merged mesh from multiple meshes sharing the same material.
 *
 * Indices in the parser output already reference offsets into the combined vertex array (the C#
 * pipeline rebases per-mesh local indices into combined-array indices when assembling the batch).
 * For merged meshes we copy the relevant slices into a fresh contiguous buffer and shift indices
 * to match the new layout.
 */
function createMergedMesh(
	group: MaterialGroup,
	allVertices: Float32Array,
	allIndices: Uint32Array,
	materials: THREE.Material[]
): THREE.Mesh {
	let totalVertexCount = 0;
	let totalIndexCount = 0;
	for (const meshMeta of group.meshes) {
		totalVertexCount += meshMeta.vertexCount;
		totalIndexCount += meshMeta.indexCount;
	}

	const mergedVertices = new Float32Array(totalVertexCount * 3);
	const mergedIndices = new Uint32Array(totalIndexCount);

	let vertexWriteCursor = 0;
	let indexWriteCursor = 0;

	for (const meshMeta of group.meshes) {
		const componentStart = meshMeta.vertexStart * 3;
		const componentLen = meshMeta.vertexCount * 3;
		mergedVertices.set(
			allVertices.subarray(componentStart, componentStart + componentLen),
			vertexWriteCursor * 3
		);

		const indicesSlice = allIndices.subarray(
			meshMeta.indexStart,
			meshMeta.indexStart + meshMeta.indexCount
		);
		const indexShift = vertexWriteCursor - meshMeta.vertexStart;
		if (indexShift === 0) {
			mergedIndices.set(indicesSlice, indexWriteCursor);
		} else {
			for (let i = 0; i < indicesSlice.length; i++) {
				mergedIndices[indexWriteCursor + i] = indicesSlice[i]! + indexShift;
			}
		}

		vertexWriteCursor += meshMeta.vertexCount;
		indexWriteCursor += meshMeta.indexCount;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(mergedVertices, 3));
	geometry.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
	geometry.computeVertexNormals();

	const threeMesh = new THREE.Mesh(geometry, materials[group.materialId]);
	const firstMesh = group.meshes[0];
	const meshNames = group.meshes.map((m) => m.name).filter((name) => name && name.length > 0);
	threeMesh.name = meshNames.length > 0 ? meshNames[0]! : `merged_material_${group.materialId}`;
	threeMesh.castShadow = true;
	threeMesh.receiveShadow = true;

	threeMesh.userData = {
		name: threeMesh.name,
		layer: firstMesh?.layer ?? '',
		originalIndex: firstMesh?.originalIndex ?? 0,
		metadata: firstMesh?.metadata ?? {},
		mergedFrom: group.meshes.slice(1).map((m) => ({
			name: m.name,
			layer: m.layer,
			originalIndex: m.originalIndex
		}))
	};

	return threeMesh;
}

/**
 * Creates individual meshes from a material group. Each mesh's indices are rebased so they
 * address its own local vertex slice starting from 0.
 */
function createIndividualMeshes(
	group: MaterialGroup,
	allVertices: Float32Array,
	allIndices: Uint32Array,
	materials: THREE.Material[]
): THREE.Mesh[] {
	const meshes: THREE.Mesh[] = [];

	for (const meshMeta of group.meshes) {
		const componentStart = meshMeta.vertexStart * 3;
		const componentLen = meshMeta.vertexCount * 3;

		// `subarray` returns a view; copy via `slice` so the BufferAttribute owns its memory and
		// downstream code (dispose/reuse) can't surprise us by sharing the parser's buffer.
		const vertices = allVertices.slice(componentStart, componentStart + componentLen);

		const indicesSlice = allIndices.subarray(
			meshMeta.indexStart,
			meshMeta.indexStart + meshMeta.indexCount
		);
		const rebasedIndices = new Uint32Array(indicesSlice.length);
		const baseIndex = meshMeta.vertexStart;
		for (let i = 0; i < indicesSlice.length; i++) {
			rebasedIndices[i] = indicesSlice[i]! - baseIndex;
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
		geometry.setIndex(new THREE.BufferAttribute(rebasedIndices, 1));
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

// ============================================================================
// DEBUG HELPERS
// ============================================================================

function approximateBase64DecodedBytes(base64: string): number {
	return Math.floor((base64.length * 3) / 4);
}
