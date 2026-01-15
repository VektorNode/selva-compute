/**
 * Visualization utilities for selva-compute
 *
 * Provides Three.js integration and web display mesh parsing.
 *
 * @module visualization
 */

// ============================================================================
// THREE.JS VISUALIZATION
// ============================================================================

export { initThree, updateScene, Materials } from './threejs';

// ============================================================================
// WEB DISPLAY PARSING
// ============================================================================

// Public high-level APIs (kept minimal and stable)
export { SCALE_FACTORS, getThreeMeshesFromComputeResponse } from './webdisplay';
export { parseMeshBatchObject } from './webdisplay';

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
