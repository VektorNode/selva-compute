/**
 * Visualization utilities for @selvajs/compute
 *
 * Provides Three.js integration and web display mesh parsing.
 *
 * @module visualization
 */
export { initThree } from './features/visualization/threejs/three-initializer.js';
export { updateScene } from './features/visualization/threejs/three-helpers.js';
export * as Materials from './features/visualization/threejs/three-materials.js';

export { getThreeMeshesFromComputeResponse } from './features/visualization/webdisplay/webdisplay-parser';
export { parseMeshBatchObject } from './features/visualization/webdisplay/batch-parser';

export type {
	ThreeInitializerOptions,
	CameraConfig,
	ControlsConfig,
	EnvironmentConfig,
	LightingConfig,
	RenderConfig,
	FloorConfig,
	EventConfig
} from './features/visualization/types';

export type { MeshExtractionOptions } from './features/visualization/webdisplay/types';
