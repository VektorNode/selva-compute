import {
	BINARY_MESH_MAGIC,
	BINARY_MESH_VERSION,
	FLAG_FLOAT32
} from '@/features/visualization/webdisplay/binary-parser';
import type {
	MaterialGroup,
	MeshBatch,
	MeshMetadata,
	SerializableMaterial
} from '@/features/visualization/webdisplay/types';

export interface MeshBatchBuilderOptions {
	materialCount: number;
	meshCount: number;
	vertsPerMesh: number;
	sourceComponentId?: string;
	seed?: number;
	/**
	 * If true, encode vertices as float32 instead of int16-quantized. Useful for tests that
	 * need exact roundtrips of arbitrary float values.
	 */
	forceFloat32?: boolean;
}

export interface BuiltMeshBatch {
	batch: MeshBatch;
	rawVertices: Float32Array;
	rawFaces: Uint32Array;
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Builds a synthetic MeshBatch suitable for tests and benchmarks.
 *
 * Each mesh is a triangle strip of `vertsPerMesh` vertices producing `vertsPerMesh - 2` triangles.
 * Face indices are emitted in the absolute (already-rebased) form the C# batcher produces — i.e.
 * indices reference the global vertex array, not per-mesh local positions.
 *
 * The geometry is encoded in the SLVA binary wire format (see `binary-parser.ts`) and
 * base64-encoded into `batch.compressedData`. The blob's embedded metadata mirrors the outer
 * `materials`/`groups`/`sourceComponentId` so the parser sees the same shape regardless of
 * whether it pulls from the blob or the envelope.
 */
export function buildMeshBatch(options: MeshBatchBuilderOptions): BuiltMeshBatch {
	const {
		materialCount,
		meshCount,
		vertsPerMesh,
		sourceComponentId,
		seed = 1,
		forceFloat32 = false
	} = options;

	if (materialCount < 1) throw new Error('materialCount must be >= 1');
	if (meshCount < 1) throw new Error('meshCount must be >= 1');
	if (vertsPerMesh < 3) throw new Error('vertsPerMesh must be >= 3 to form a triangle');

	const rand = mulberry32(seed);

	const trianglesPerMesh = vertsPerMesh - 2;
	const totalVertexFloats = meshCount * vertsPerMesh * 3;
	const totalFaceIndices = meshCount * trianglesPerMesh * 3;

	const vertices = new Float32Array(totalVertexFloats);
	const faces = new Uint32Array(totalFaceIndices);

	const materials: SerializableMaterial[] = [];
	for (let i = 0; i < materialCount; i++) {
		const r = Math.floor(rand() * 256);
		const g = Math.floor(rand() * 256);
		const b = Math.floor(rand() * 256);
		const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
		materials.push({
			color: hex,
			metalness: rand(),
			roughness: rand(),
			opacity: 1,
			transparent: false
		});
	}

	const groupBuckets: MeshMetadata[][] = Array.from({ length: materialCount }, () => []);

	let vertexFloatCursor = 0;
	let faceIndexCursor = 0;

	for (let m = 0; m < meshCount; m++) {
		const baseVertexIndex = vertexFloatCursor / 3;

		for (let v = 0; v < vertsPerMesh; v++) {
			const i = vertexFloatCursor + v * 3;
			vertices[i] = (rand() - 0.5) * 100;
			vertices[i + 1] = (rand() - 0.5) * 100;
			vertices[i + 2] = (rand() - 0.5) * 100;
		}

		for (let t = 0; t < trianglesPerMesh; t++) {
			const fi = faceIndexCursor + t * 3;
			faces[fi] = baseVertexIndex + t;
			faces[fi + 1] = baseVertexIndex + t + 1;
			faces[fi + 2] = baseVertexIndex + t + 2;
		}

		const meta: MeshMetadata = {
			name: `mesh_${m}`,
			layer: `Layer/${m % 4}`,
			originalIndex: m,
			vertexCount: vertsPerMesh,
			indexCount: trianglesPerMesh * 3,
			vertexStart: baseVertexIndex,
			indexStart: faceIndexCursor,
			metadata: { idx: String(m) }
		};

		groupBuckets[m % materialCount]!.push(meta);

		vertexFloatCursor += vertsPerMesh * 3;
		faceIndexCursor += trianglesPerMesh * 3;
	}

	const groups: MaterialGroup[] = groupBuckets
		.map((meshes, materialId) => ({ materialId, meshes }))
		.filter((g) => g.meshes.length > 0);

	const compressedData = encodeBatchPayload(vertices, faces, {
		materials,
		groups,
		sourceComponentId,
		forceFloat32
	});

	return {
		batch: {
			materials,
			groups,
			compressedData,
			sourceComponentId
		},
		rawVertices: vertices,
		rawFaces: faces
	};
}

interface EncodeOptions {
	materials: SerializableMaterial[];
	groups: MaterialGroup[];
	sourceComponentId?: string;
	forceFloat32?: boolean;
}

/**
 * Encodes vertex + index arrays into the SLVA binary wire format and returns it as base64.
 *
 * Mirrors the C# `BinaryGeometryWriter` exactly so tests exercise the same bytes the runtime
 * pipeline produces. Picks int16 vs float32 with the same 5cm-per-unit threshold.
 */
export function encodeBatchPayload(
	vertices: Float32Array,
	faces: Uint32Array,
	encodeOptions: EncodeOptions
): string {
	const { materials, groups, sourceComponentId, forceFloat32 = false } = encodeOptions;

	const metadataObject = sourceComponentId
		? { materials, groups, sourceComponentId }
		: { materials, groups };
	const metadataJson = JSON.stringify(metadataObject);
	const metadataBytes = utf8Encode(metadataJson);

	const vertexCount = vertices.length / 3;
	const { useFloat32, originX, originY, originZ, scaleX, scaleY, scaleZ } = computeFormat(
		vertices,
		forceFloat32
	);

	const verticesByteLength = vertexCount * 3 * (useFloat32 ? 4 : 2);
	const indicesByteLength = faces.length * 4;

	const totalBytes =
		4 /* magic */ +
		4 /* version */ +
		4 /* metadataLen */ +
		metadataBytes.length +
		4 /* flags */ +
		24 /* origin */ +
		24 /* scale */ +
		4 /* vertexCount */ +
		verticesByteLength +
		4 /* indexCount */ +
		indicesByteLength;

	const buffer = new ArrayBuffer(totalBytes);
	const view = new DataView(buffer);
	const u8 = new Uint8Array(buffer);

	let offset = 0;
	view.setUint32(offset, BINARY_MESH_MAGIC, true);
	offset += 4;
	view.setUint32(offset, BINARY_MESH_VERSION, true);
	offset += 4;
	view.setUint32(offset, metadataBytes.length, true);
	offset += 4;
	u8.set(metadataBytes, offset);
	offset += metadataBytes.length;

	view.setUint32(offset, useFloat32 ? FLAG_FLOAT32 : 0, true);
	offset += 4;
	view.setFloat64(offset, originX, true);
	offset += 8;
	view.setFloat64(offset, originY, true);
	offset += 8;
	view.setFloat64(offset, originZ, true);
	offset += 8;
	view.setFloat64(offset, scaleX, true);
	offset += 8;
	view.setFloat64(offset, scaleY, true);
	offset += 8;
	view.setFloat64(offset, scaleZ, true);
	offset += 8;

	view.setUint32(offset, vertexCount, true);
	offset += 4;

	// Write vertices via DataView so we don't depend on `offset` being aligned to the typed-array
	// element size. The metadata JSON has variable length, so the position of the geometry
	// section in the buffer may not be 4-byte-aligned.
	if (useFloat32) {
		for (let i = 0; i < vertices.length; i++) {
			view.setFloat32(offset + i * 4, vertices[i]!, true);
		}
		offset += verticesByteLength;
	} else {
		for (let i = 0; i < vertices.length; i += 3) {
			view.setInt16(offset + i * 2, quantize(vertices[i]!, originX, scaleX), true);
			view.setInt16(offset + (i + 1) * 2, quantize(vertices[i + 1]!, originY, scaleY), true);
			view.setInt16(offset + (i + 2) * 2, quantize(vertices[i + 2]!, originZ, scaleZ), true);
		}
		offset += verticesByteLength;
	}

	view.setUint32(offset, faces.length, true);
	offset += 4;
	for (let i = 0; i < faces.length; i++) {
		view.setUint32(offset + i * 4, faces[i]!, true);
	}

	return uint8ToBase64(u8);
}

function quantize(value: number, origin: number, scale: number): number {
	const q = Math.round((value - origin) / scale) - 32767;
	if (q < -32768) return -32768;
	if (q > 32767) return 32767;
	return q;
}

function computeFormat(
	vertices: Float32Array,
	forceFloat32: boolean
): {
	useFloat32: boolean;
	originX: number;
	originY: number;
	originZ: number;
	scaleX: number;
	scaleY: number;
	scaleZ: number;
} {
	if (vertices.length === 0) {
		return {
			useFloat32: forceFloat32,
			originX: 0,
			originY: 0,
			originZ: 0,
			scaleX: forceFloat32 ? 1 : 1e-12,
			scaleY: forceFloat32 ? 1 : 1e-12,
			scaleZ: forceFloat32 ? 1 : 1e-12
		};
	}

	let minX = vertices[0]!,
		maxX = vertices[0]!;
	let minY = vertices[1]!,
		maxY = vertices[1]!;
	let minZ = vertices[2]!,
		maxZ = vertices[2]!;

	for (let i = 3; i < vertices.length; i += 3) {
		const x = vertices[i]!;
		const y = vertices[i + 1]!;
		const z = vertices[i + 2]!;
		if (x < minX) minX = x;
		else if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		else if (y > maxY) maxY = y;
		if (z < minZ) minZ = z;
		else if (z > maxZ) maxZ = z;
	}

	let useFloat32 = forceFloat32;
	if (!useFloat32) {
		const maxExtent = Math.max(maxX - minX, Math.max(maxY - minY, maxZ - minZ));
		const step = maxExtent / 65534;
		if (step > 0.05) useFloat32 = true;
	}

	if (useFloat32) {
		return {
			useFloat32: true,
			originX: 0,
			originY: 0,
			originZ: 0,
			scaleX: 1,
			scaleY: 1,
			scaleZ: 1
		};
	}

	const eps = 1e-12;
	return {
		useFloat32: false,
		originX: minX,
		originY: minY,
		originZ: minZ,
		scaleX: Math.max((maxX - minX) / 65534, eps),
		scaleY: Math.max((maxY - minY) / 65534, eps),
		scaleZ: Math.max((maxZ - minZ) / 65534, eps)
	};
}

function utf8Encode(str: string): Uint8Array {
	if (typeof TextEncoder !== 'undefined') {
		return new TextEncoder().encode(str);
	}
	return new Uint8Array(Buffer.from(str, 'utf-8'));
}

function uint8ToBase64(bytes: Uint8Array): string {
	if (typeof Buffer !== 'undefined') {
		return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
	}
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}
