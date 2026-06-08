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

export {
	getThreeMeshesFromComputeResponse,
	SCALE_FACTORS
} from './features/visualization/webdisplay/webdisplay-parser';
export {
	parseMeshBatchObject,
	parseMeshBatchBlob
} from './features/visualization/webdisplay/batch-parser';

export { parseDisplayItems } from './features/visualization/display-items/display-items-parser';

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

export type {
	MeshExtractionOptions,
	DisplayBatch,
	/** @deprecated Use {@link DisplayBatch}. */
	MeshBatch
} from './features/visualization/webdisplay/types';

export type { DisplayItemParseOptions } from './features/visualization/display-items/display-items-parser';
export type {
	DisplayItem,
	DisplayCurve,
	DisplayPoint,
	DisplayItemBase,
	DisplayIdentity,
	DisplayPosition
} from './features/visualization/display-items/types';
