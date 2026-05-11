/**
 * Material properties for Three.js rendering.
 */
export interface SerializableMaterial {
	color: string;
	metalness: number;
	roughness: number;
	opacity: number;
	transparent: boolean;
}

/**
 * Metadata for a single mesh within a batch.
 *
 * Offsets and counts are expressed in **vertex-count units** (not float components) and
 * **index-count units**. To address the typed-array storage:
 *   - vertex component offset = `vertexStart * 3`
 *   - vertex component count  = `vertexCount * 3`
 *   - index byte offset       = `indexStart * 4`
 *   - index count             = `indexCount`
 */
export interface MeshMetadata {
	name: string;
	/** Layer path for grouping in the scene manager (e.g. 'Structure/Walls') */
	layer: string;
	/** Original index in the GH input tree before material grouping. Combined with
	 *  MeshBatch.sourceComponentId to uniquely identify the GH source geometry. */
	originalIndex: number;
	/** Number of vertices in this mesh (each vertex is 3 components: x, y, z). */
	vertexCount: number;
	/** Number of indices in this mesh (3 per triangle). */
	indexCount: number;
	/** Index of this mesh's first vertex in the combined vertex array, in vertex-count units.
	 *  The corresponding component offset into the int16/float32 typed array is `vertexStart * 3`. */
	vertexStart: number;
	/** Index of this mesh's first index in the combined index array, in index-count units. */
	indexStart: number;
	/** Arbitrary key-value pairs from the GH Metadata input */
	metadata?: Record<string, string>;
}

/**
 * A group of meshes sharing the same material.
 */
export interface MaterialGroup {
	/** Reference to the material ID in the materials array */
	materialId: number;
	/** Individual meshes in this group */
	meshes: MeshMetadata[];
}

/**
 * Batched mesh data optimized for Three.js rendering.
 *
 * `compressedData` contains the binary "SLVA" blob (header + metadata JSON + quantized int16 or
 * float32 vertices + uint32 indices), base64-encoded for transit inside the values JSON envelope.
 * The blob is opaque to the outer JSON: a future binary WebSocket frame can drop the base64 step
 * without changing this shape.
 */
export interface MeshBatch {
	/** Array of unique materials */
	materials: SerializableMaterial[];
	/** Groups of meshes organized by material */
	groups: MaterialGroup[];
	/** Base64-encoded binary blob (SLVA wire format). */
	compressedData: string;
	/** InstanceGuid of the WebDisplay GH component that produced this batch.
	 *  Combined with MeshMetadata.originalIndex to backtrack any mesh to its GH source. */
	sourceComponentId?: string;
}

/**
 * Decoded geometry payload from a binary mesh batch blob.
 *
 * For int16 batches the parser also exposes `origin` and `scale` so the consumer can either
 * dequantize on the GPU (via `BufferAttribute(arr, 3, true)` + a per-mesh transform matrix) or
 * dequantize on the CPU as needed. For float32 batches `origin = (0,0,0)` and `scale = (1,1,1)`.
 */
export interface DecompressedMeshData {
	flags: number;
	vertices: Int16Array | Float32Array;
	indices: Uint32Array;
	origin: [number, number, number];
	scale: [number, number, number];
}

/**
 * Options for parsing mesh batch data.
 */
export interface MeshBatchParsingOptions {
	/** Merge meshes with same material into single geometry (better performance). Defaults to true. */
	mergeByMaterial?: boolean;
	/** Apply coordinate system transformations (Rhino Z-up to Three.js Y-up). Defaults to true. */
	applyTransforms?: boolean;
	/** Enable performance monitoring in console. Defaults to false. */
	debug?: boolean;
}

/**
 * Options for extracting and processing meshes from compute responses.
 */
export interface MeshExtractionOptions {
	/** Configuration for parsing mesh batches. */
	parsing?: MeshBatchParsingOptions;
	/** Apply scaling based on model units. Defaults to true. */
	allowScaling?: boolean;
	/** Apply automatic ground offset positioning (Z=0). Defaults to true. */
	allowAutoPosition?: boolean;
	/** Enable verbose logging. Defaults to false. */
	debug?: boolean;
}
