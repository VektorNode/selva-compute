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
 */
export interface MeshMetadata {
	name: string;
	/** Layer path for grouping in the scene manager (e.g. 'Structure/Walls') */
	layer: string;
	/** Original index in the GH input tree before material grouping. Combined with
	 *  MeshBatch.sourceComponentId to uniquely identify the GH source geometry. */
	originalIndex: number;
	vertexCount: number;
	faceCount: number;
	/** Offset in the combined vertex array (in number of floats) */
	vertexOffset: number;
	/** Offset in the combined face index array (in number of integers) */
	faceOffset: number;
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
 */
export interface MeshBatch {
	/** Array of unique materials */
	materials: SerializableMaterial[];
	/** Groups of meshes organized by material */
	groups: MaterialGroup[];
	/** Compressed binary data containing all vertices and faces */
	compressedData: string;
	/** InstanceGuid of the WebDisplay GH component that produced this batch.
	 *  Combined with MeshMetadata.originalIndex to backtrack any mesh to its GH source. */
	sourceComponentId?: string;
}

/**
 * Decompressed mesh data.
 */
export interface DecompressedMeshData {
	vertices: Float32Array;
	faces: Uint32Array;
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
