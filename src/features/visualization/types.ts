import * as THREE from 'three';

export type CameraConfig = {
	position?: THREE.Vector3;
	fov?: number;
	near?: number;
	far?: number;
	target?: THREE.Vector3;
};

export type LightingConfig = {
	enableSunlight?: boolean;
	sunlightIntensity?: number;
	sunlightPosition?: THREE.Vector3;
	ambientLightColor?: THREE.Color;
	ambientLightIntensity?: number;
	sunlightColor?: THREE.Color | number;
};

export type EnvironmentConfig = {
	hdrPath?: string;
	backgroundColor?: THREE.Color | string;
	enableEnvironmentLighting?: boolean;
	sceneUp?: THREE.Vector3;
	showEnvironment?: boolean;
};

export type FloorConfig = {
	enabled?: boolean;
	size?: number;
	color?: THREE.Color | string;
	roughness?: number;
	metalness?: number;
	receiveShadow?: boolean;
};

export type RenderConfig = {
	enableShadows?: boolean;
	shadowMapSize?: number;
	antialias?: boolean;
	pixelRatio?: number;
	toneMapping?: THREE.ToneMapping;
	toneMappingExposure?: number;
	preserveDrawingBuffer?: boolean;
	/**
	 * Enable ground-truth ambient occlusion (GTAO) via a postprocessing pipeline. Default false —
	 * turning it on switches rendering from `renderer.render` to an EffectComposer, which costs more.
	 */
	ambientOcclusion?: boolean;
	/** AO strength 0–1 when {@link RenderConfig.ambientOcclusion} is on. Default 1. */
	aoIntensity?: number;
};

/** Crisp boundary/crease edge overlays on meshes. See `addEdges`. */
export type EdgesConfig = {
	/** Auto-attach edge overlays to meshes as they load. Default false (opt-in). */
	enabled?: boolean;
	/** Edge color. Default near-black. */
	color?: THREE.ColorRepresentation;
	/** Edge thickness in CSS px. Default 1.5. */
	width?: number;
	/** Crease angle (degrees): keep edges where faces differ by more than this. Default 30. */
	thresholdAngle?: number;
};

export type ControlsConfig = {
	enableDamping?: boolean;
	dampingFactor?: number;
	autoRotate?: boolean;
	autoRotateSpeed?: number;
	enableZoom?: boolean;
	enablePan?: boolean;
	minDistance?: number;
	maxDistance?: number;
};

/** Infinite distance-fading reference grid. See `createGrid`. */
export type GridConfig = {
	/** Show the grid. Default false (opt-in). */
	enabled?: boolean;
	/** Minor cell size in world units (meters). Default 1. */
	cellSize?: number;
	/** Minor cells per major line. Default 10. */
	majorEvery?: number;
	/** Minor line color. */
	cellColor?: THREE.ColorRepresentation;
	/** Major line color. */
	majorColor?: THREE.ColorRepresentation;
	/** World radius at which the grid fully fades. Default 100. */
	fadeDistance?: number;
	/** Plane the grid lies on. 'y' = horizontal ground. Default 'y'. */
	plane?: 'x' | 'y' | 'z';
};

/** Corner nav-cube/axis gizmo that snaps to preset views. See `createViewGizmo`. */
export type GizmoConfig = {
	/** Show the gizmo. Default false (opt-in). */
	enabled?: boolean;
};

/** Two-click distance measurement tool. See `createMeasureTool`. */
export type MeasureConfig = {
	/**
	 * Create the measurement tool. Default false. Note: this only *builds* the tool (and its label
	 * overlay); start measuring by calling `measureTool.setEnabled(true)` on the init result.
	 */
	enabled?: boolean;
	/** Snap to a vertex within this many screen px. Default 12. */
	snapPixels?: number;
	/** Marker + line color. Default yellow. */
	color?: THREE.ColorRepresentation;
	/** CSS class for the distance label. */
	labelClassName?: string;
	/**
	 * Model unit (pass the response's `modelunits`). The scene is in meters, so the default label is
	 * converted to this unit — a mm model reads "25.0 mm". Defaults to meters. Ignored if `format` is set.
	 */
	displayUnit?: string;
	/**
	 * Format the measurement → label text. Receives the straight-line `distance` and per-axis `delta`.
	 * Default renders the total plus a Δx/Δy/Δz breakdown.
	 */
	format?: (distance: number, delta: THREE.Vector3) => string;
};

export type ThreeInitializerOptions = {
	sceneScale?: 'mm' | 'cm' | 'm' | 'inches' | 'feet';
	camera?: CameraConfig;
	lighting?: LightingConfig;
	environment?: EnvironmentConfig;
	floor?: FloorConfig;
	render?: RenderConfig;
	controls?: ControlsConfig;
	grid?: GridConfig;
	gizmo?: GizmoConfig;
	edges?: EdgesConfig;
	measure?: MeasureConfig;
	events?: EventConfig;
};

export type EventConfig = {
	onBackgroundClicked?: (event: { x: number; y: number }) => void;
	onObjectSelected?: (object: THREE.Object3D) => void;
	/** Called when a mesh with metadata is clicked. Receives the mesh's metadata object. */
	onMeshMetadataClicked?: (metadata: Record<string, string>) => void;
	/** Called when a mesh is double-clicked. Receives the mesh object. */
	onMeshDoubleClicked?: (object: THREE.Object3D) => void;
	/** Color to use for highlighting selected meshes. Defaults to red (#ff0000). */
	selectionColor?: THREE.Color | string;
	/** Enable all event handlers (click/selection/metadata). Defaults to true. */
	enableEventHandlers?: boolean;
	enableKeyboardControls?: boolean;
	enableClickToFocus?: boolean;
	/** Zoom into a mesh on double-click. Defaults to true. */
	enableDoubleClickZoom?: boolean;
	/** Called once the HDR environment map has finished loading and been applied to the scene. */
	onReady?: () => void;
	/** Called every animation frame, after controls update and before render. Use for custom per-frame logic. */
	onFrame?: (delta: number) => void;
};
