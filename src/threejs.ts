/**
 * Three.js visualization utilities
 * Re-exports for convenience
 * @module threejs
 */
export { initThree, updateScene, Materials } from './features/visualization/threejs';

export type {
	ThreeInitializerOptions,
	CameraConfig,
	ControlsConfig,
	EnvironmentConfig,
	LightingConfig,
	RenderConfig,
	FloorConfig,
	EventConfig
} from './features/visualization';
