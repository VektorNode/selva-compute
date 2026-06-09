/**
 * Visualization utilities for @selvajs/compute
 *
 * Provides Three.js integration and web display mesh parsing.
 *
 * @module visualization
 */
export { initThree } from './features/visualization/threejs/three-initializer.js';
export {
	updateScene,
	parseColor,
	applyOffset,
	computeCombinedBoundingBox
} from './features/visualization/threejs/three-helpers.js';
export * as Materials from './features/visualization/threejs/three-materials.js';

// CAD-style viewer tooling (camera controller, grid, gizmo, edges, labels, measure, AO pipeline).
export { createCameraController } from './features/visualization/threejs/camera-controller.js';
export type {
	CameraController,
	CameraProjection,
	ViewPreset
} from './features/visualization/threejs/camera-controller.js';
export { createGrid } from './features/visualization/threejs/grid.js';
export type { Grid, GridOptions } from './features/visualization/threejs/grid.js';
export { createViewGizmo } from './features/visualization/threejs/view-gizmo.js';
export type { ViewGizmo } from './features/visualization/threejs/view-gizmo.js';
export {
	addEdges,
	removeEdges,
	isEdgeOverlay,
	EDGE_USERDATA_KIND
} from './features/visualization/threejs/edges.js';
export type { EdgeOptions } from './features/visualization/threejs/edges.js';
export { createRenderPipeline } from './features/visualization/threejs/render-pipeline.js';
export type {
	RenderPipeline,
	RenderPipelineOptions
} from './features/visualization/threejs/render-pipeline.js';
export { createLabelLayer } from './features/visualization/threejs/label-layer.js';
export type { LabelLayer, LabelHandle } from './features/visualization/threejs/label-layer.js';
export { createMeasureTool, snapToVertex } from './features/visualization/threejs/measure.js';
export type { MeasureTool, MeasureOptions } from './features/visualization/threejs/measure.js';

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
	GridConfig,
	GizmoConfig,
	EdgesConfig,
	MeasureConfig,
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
