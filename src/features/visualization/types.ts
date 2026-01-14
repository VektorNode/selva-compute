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

export type ThreeInitializerOptions = {
	sceneScale?: 'mm' | 'cm' | 'm' | 'inches' | 'feet';
	camera?: CameraConfig;
	lighting?: LightingConfig;
	environment?: EnvironmentConfig;
	floor?: FloorConfig;
	render?: RenderConfig;
	controls?: ControlsConfig;
	events?: EventConfig;
};

export type EventConfig = {
	onBackgroundClicked?: (event: { x: number; y: number }) => void;
	onObjectSelected?: (object: THREE.Object3D) => void;
	/** Called when a mesh with metadata is clicked. Receives the mesh's metadata object. */
	onMeshMetadataClicked?: (metadata: Record<string, string>) => void;
	/** Color to use for highlighting selected meshes. Defaults to red (#ff0000). */
	selectionColor?: THREE.Color | string;
	/** Enable all event handlers (click/selection/metadata). Defaults to true. */
	enableEventHandlers?: boolean;
	enableKeyboardControls?: boolean;
	enableClickToFocus?: boolean;
};
