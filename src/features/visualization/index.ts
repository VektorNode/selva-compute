/**
 * Visualization utilities for @selvajs/compute
 *
 * Provides Three.js integration and web display mesh parsing.
 *
 * @module visualization
 */

// ============================================================================
// THREE.JS VISUALIZATION
// ============================================================================

export { initThree } from './threejs/three-initializer.js';
export {
	updateScene,
	parseColor,
	applyOffset,
	computeCombinedBoundingBox
} from './threejs/three-helpers.js';
export * as Materials from './threejs/three-materials.js';

// ============================================================================
// WEB DISPLAY PARSING
// ============================================================================

export { getThreeMeshesFromComputeResponse, SCALE_FACTORS } from './webdisplay/webdisplay-parser';
export {
	parseMeshBatch,
	parseMeshBatchObject,
	parseMeshBatchBlob
} from './webdisplay/batch-parser';
export {
	parseBinaryMeshBatch,
	BINARY_MESH_MAGIC,
	BINARY_MESH_VERSION,
	FLAG_FLOAT32
} from './webdisplay/binary-parser';
export type { BinaryMeshMetadata, ParsedBinaryMeshBatch } from './webdisplay/binary-parser';

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
	ThreeInitializerOptions,
	CameraConfig,
	LightingConfig,
	EnvironmentConfig,
	FloorConfig,
	RenderConfig,
	ControlsConfig,
	EventConfig
} from './types';

export type {
	MeshBatchParsingOptions,
	MeshExtractionOptions,
	SerializableMaterial,
	MeshMetadata,
	MaterialGroup,
	MeshBatch,
	DecompressedMeshData
} from './webdisplay/types';
