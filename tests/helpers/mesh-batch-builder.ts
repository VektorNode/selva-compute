import * as fflate from 'fflate';

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
 */
export function buildMeshBatch(options: MeshBatchBuilderOptions): BuiltMeshBatch {
	const { materialCount, meshCount, vertsPerMesh, sourceComponentId, seed = 1 } = options;

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
			vertexCount: vertsPerMesh * 3,
			faceCount: trianglesPerMesh * 3,
			vertexOffset: vertexFloatCursor,
			faceOffset: faceIndexCursor,
			metadata: { idx: String(m) }
		};

		groupBuckets[m % materialCount]!.push(meta);

		vertexFloatCursor += vertsPerMesh * 3;
		faceIndexCursor += trianglesPerMesh * 3;
	}

	const groups: MaterialGroup[] = groupBuckets
		.map((meshes, materialId) => ({ materialId, meshes }))
		.filter((g) => g.meshes.length > 0);

	const compressedData = encodeBatchPayload(vertices, faces);

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

/**
 * Serializes vertex and face arrays into the wire format that `parseBatchedMeshBinaryData`
 * expects, then gzips and base64-encodes the result.
 *
 * Wire format: [u32 numVertexFloats][f32 * numVertexFloats][u32 numIndices][u32 * numIndices].
 */
export function encodeBatchPayload(vertices: Float32Array, faces: Uint32Array): string {
	const headerBytes = 4 + 4;
	const totalBytes = headerBytes + vertices.byteLength + faces.byteLength;

	const buffer = new ArrayBuffer(totalBytes);
	const view = new DataView(buffer);
	const u8 = new Uint8Array(buffer);

	let offset = 0;
	view.setUint32(offset, vertices.length, true);
	offset += 4;

	u8.set(new Uint8Array(vertices.buffer, vertices.byteOffset, vertices.byteLength), offset);
	offset += vertices.byteLength;

	view.setUint32(offset, faces.length, true);
	offset += 4;

	u8.set(new Uint8Array(faces.buffer, faces.byteOffset, faces.byteLength), offset);

	const gzipped = fflate.gzipSync(u8);
	return Buffer.from(gzipped).toString('base64');
}
