import * as THREE from 'three';

import { parseColor } from '../threejs/three-helpers';
import { getLogger } from '@/core';

import { FLAG_FLOAT32, parseBinaryMeshBatch } from './binary-parser';

import type { ParsedBinaryMeshBatch } from './binary-parser';
import type {
	DisplayBatch,
	MaterialGroup,
	MeshBatchParsingOptions,
	SerializableMaterial
} from './types';

/**
 * Internal-only telemetry threaded from an outer entry point (e.g. the JSON
 * `parseMeshBatch` measuring its own `JSON.parse` cost) into the shared build
 * step. Never part of any public options surface — callers don't supply timings.
 */
interface ParseTelemetry {
	parseTime?: number;
	perfStart?: number;
}

/**
 * Parses a batched mesh JSON and creates Three.js meshes.
 *
 * The geometry payload is the binary "SLVA" blob produced by the C# `BinaryGeometryWriter`,
 * base64-encoded into the outer JSON envelope. We `JSON.parse` the small envelope, then hand the
 * blob to `parseBinaryMeshBatch` which decodes the geometry without ever turning it into a string.
 *
 * @param batchJson - JSON string containing the batched mesh data
 * @param options - Rendering options
 * @returns Promise resolving to array of Three.js mesh objects
 */
export async function parseMeshBatch(
	batchJson: string,
	options?: MeshBatchParsingOptions
): Promise<THREE.Mesh[]> {
	const { debug = false } = options ?? {};

	const perfStart = debug ? performance.now() : 0;

	try {
		const parseStart = performance.now();
		const batch: DisplayBatch = JSON.parse(batchJson);
		const parseTime = performance.now() - parseStart;

		return await parseMeshBatchObject(batch, options, { parseTime, perfStart });
	} catch (error) {
		getLogger().error('Error parsing mesh batch:', error);
		return [];
	}
}

/**
 * Parses a DisplayBatch object and creates Three.js meshes from its mesh blob.
 *
 * The path is synchronous internally — `parseBinaryMeshBatch` does no IO, just typed-array views
 * over the blob. The function stays `async` so callers don't have to change shape if we move
 * parsing into a worker later.
 *
 * @param batch - DisplayBatch object
 * @param options - Rendering options
 * @returns Promise resolving to array of Three.js mesh objects
 */
export async function parseMeshBatchObject(
	batch: DisplayBatch,
	options?: MeshBatchParsingOptions & {
		/** Scale factor to apply to meshes (e.g., for unit conversion) */
		scaleFactor?: number;
	},
	/** @internal Timings threaded from an outer entry point; not a caller option. */
	telemetry?: ParseTelemetry
): Promise<THREE.Mesh[]> {
	const {
		mergeByMaterial = true,
		applyTransforms = true,
		scaleFactor = 1,
		debug = false
	} = options ?? {};
	const { parseTime = 0, perfStart = debug ? performance.now() : 0 } = telemetry ?? {};

	try {
		const decodeStart = performance.now();
		const parsed = parseBinaryMeshBatch(batch.compressedData);
		const decodeTime = performance.now() - decodeStart;

		const blobBytes = debug ? approximateBase64DecodedBytes(batch.compressedData) : 0;

		return buildMeshesFromParsed(parsed, {
			mergeByMaterial,
			applyTransforms,
			scaleFactor,
			debug,
			parseTime,
			decodeTime,
			perfStart,
			blobBytes,
			fallback: {
				materials: batch.materials,
				groups: batch.groups,
				sourceComponentId: batch.sourceComponentId
			}
		});
	} catch (error) {
		getLogger().error('Error parsing mesh batch object:', error);
		return [];
	}
}

/**
 * Parses a raw binary mesh batch blob (SLVA wire format) and creates Three.js meshes.
 *
 * Use this entry point when the blob arrives as a binary WebSocket frame (Phase 1b transport):
 * the JSON envelope no longer carries `displayData`, so there's nothing to `JSON.parse`. The blob
 * is self-describing — materials, groups, and `sourceComponentId` come from its embedded metadata
 * header.
 *
 * @param blob - Raw blob bytes from a binary WebSocket frame.
 * @param options - Rendering options.
 * @returns Promise resolving to array of Three.js mesh objects.
 */
export async function parseMeshBatchBlob(
	blob: ArrayBuffer | Uint8Array,
	options?: MeshBatchParsingOptions & {
		/** Scale factor to apply to meshes (e.g., for unit conversion) */
		scaleFactor?: number;
	}
): Promise<THREE.Mesh[]> {
	const {
		mergeByMaterial = true,
		applyTransforms = true,
		scaleFactor = 1,
		debug = false
	} = options ?? {};

	const perfStart = debug ? performance.now() : 0;

	try {
		const decodeStart = performance.now();
		const parsed = parseBinaryMeshBatch(blob);
		const decodeTime = performance.now() - decodeStart;

		const blobBytes = blob.byteLength;

		return buildMeshesFromParsed(parsed, {
			mergeByMaterial,
			applyTransforms,
			scaleFactor,
			debug,
			parseTime: 0,
			decodeTime,
			perfStart,
			blobBytes
		});
	} catch (error) {
		getLogger().error('Error parsing mesh batch blob:', error);
		return [];
	}
}

interface BuildOptions {
	mergeByMaterial: boolean;
	applyTransforms: boolean;
	scaleFactor: number;
	debug: boolean;
	parseTime: number;
	decodeTime: number;
	perfStart: number;
	blobBytes: number;
	/** Outer-envelope fallback when the blob's metadata is missing fields (defensive). */
	fallback?: {
		materials?: SerializableMaterial[];
		groups?: MaterialGroup[];
		sourceComponentId?: string;
	};
}

function buildMeshesFromParsed(
	parsed: ParsedBinaryMeshBatch,
	opts: BuildOptions
): Promise<THREE.Mesh[]> {
	const {
		mergeByMaterial,
		applyTransforms,
		scaleFactor,
		debug,
		parseTime,
		decodeTime,
		perfStart,
		blobBytes,
		fallback
	} = opts;

	const materialsSrc = parsed.metadata.materials ?? fallback?.materials ?? [];
	const groups = parsed.metadata.groups ?? fallback?.groups ?? [];
	const sourceComponentId = parsed.metadata.sourceComponentId ?? fallback?.sourceComponentId;

	const isFloat32 = (parsed.flags & FLAG_FLOAT32) !== 0;

	// Dequantize once up-front into a single Float32Array. Downstream code (per-group merging,
	// computeVertexNormals, ground-offset, scaleFactor) all expect world-unit floats, and a single
	// linear pass over the int16 buffer is far cheaper than the legacy gunzip + base64 path. The
	// Z-up -> Y-up rotation, when requested, is folded into the same pass.
	const worldVertices = isFloat32
		? maybeRotateFloat32Vertices(parsed.vertices as Float32Array, applyTransforms)
		: dequantizeInt16(parsed.vertices as Int16Array, parsed.origin, parsed.scale, applyTransforms);

	if (debug) {
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

	const meshCreateTime = performance.now() - meshCreateStart;

	if (debug) {
		const totalTime = performance.now() - perfStart;
		getLogger().debug('Performance:');
		if (parseTime > 0) getLogger().debug(`  Parse JSON: ${parseTime.toFixed(2)}ms`);
		getLogger().debug(`  Decode binary: ${decodeTime.toFixed(2)}ms`);
		getLogger().debug(`  Create Meshes: ${meshCreateTime.toFixed(2)}ms`);
		getLogger().debug(`  Total: ${totalTime.toFixed(2)}ms`);
	}

	return Promise.resolve(meshes);
}

// ============================================================================
// DEQUANTIZATION
// ============================================================================

/**
 * Reconstructs world-unit float32 positions from int16 quantized values.
 *
 * Mirrors the encoder formula: `world = origin + (q + 32767) * scale`. Selva keeps one coordinate
 * frame end to end (the Three scene is Rhino's Z-up frame — see `../coordinate-transform.ts`), so
 * vertices pass through unrotated. `_applyCoordinateTransform` is retained for call-site
 * compatibility and no longer changes the output.
 */
function dequantizeInt16(
	q: Int16Array,
	origin: [number, number, number],
	scale: [number, number, number],
	_applyCoordinateTransform: boolean
): Float32Array {
	const out = new Float32Array(q.length);
	const ox = origin[0];
	const oy = origin[1];
	const oz = origin[2];
	const sx = scale[0];
	const sy = scale[1];
	const sz = scale[2];

	for (let i = 0; i < q.length; i += 3) {
		out[i] = ox + (q[i]! + 32767) * sx;
		out[i + 1] = oy + (q[i + 1]! + 32767) * sy;
		out[i + 2] = oz + (q[i + 2]! + 32767) * sz;
	}

	return out;
}

/**
 * For float32 batches the parser's view is already in the scene frame (Rhino Z-up), so we pass it
 * through without copying. `_applyCoordinateTransform` is retained for call-site compatibility and
 * no longer rotates.
 */
function maybeRotateFloat32Vertices(
	vertices: Float32Array,
	_applyCoordinateTransform: boolean
): Float32Array {
	return vertices;
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
