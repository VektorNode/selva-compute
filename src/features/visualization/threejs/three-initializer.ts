import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

import { getLogger } from '@/core';
import { ThreeInitializerOptions } from '../types';
import { createCameraController, type CameraController } from './camera-controller';
import { createGrid, type Grid } from './grid';
import { createViewGizmo, type ViewGizmo } from './view-gizmo';
import { addEdges } from './edges';
import { createRenderPipeline, type RenderPipeline } from './render-pipeline';
import { createLabelLayer, type LabelLayer } from './label-layer';
import { createMeasureTool, type MeasureTool } from './measure';

const defaultUp = new THREE.Vector3(0, 0, 1);

/** Map an up vector to the grid's ground-plane axis (the axis the grid is laid perpendicular to). */
function upToGroundPlane(up: THREE.Vector3): 'x' | 'y' | 'z' {
	const ax = Math.abs(up.x);
	const ay = Math.abs(up.y);
	const az = Math.abs(up.z);
	if (az >= ax && az >= ay) return 'z';
	if (ay >= ax && ay >= az) return 'y';
	return 'x';
}

/**
 * Initializes a Three.js environment with scene, camera, renderer, and event handling.
 */
export const initThree = function (
	canvas: HTMLCanvasElement,
	options?: ThreeInitializerOptions
): {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	renderer: THREE.WebGLRenderer;
	cameraController: CameraController;
	grid: Grid | null;
	gizmo: ViewGizmo | null;
	/** Two-click distance measurement tool. Null unless `measure.enabled`; `setEnabled(true)` to use. */
	measureTool: MeasureTool | null;
	/**
	 * Attach edge overlays to the meshes under `root` (no-op unless `edges.enabled`). Call after
	 * loading meshes via `updateScene`, since meshes arrive after init.
	 */
	applyEdges: (root: THREE.Object3D) => void;
	/** Toggle ambient occlusion at runtime — builds or tears down the postprocessing pipeline. */
	setAmbientOcclusion: (enabled: boolean) => void;
	/**
	 * Refit the sun's shadow frustum to the current scene content for crisp shadows. Call after
	 * loading or replacing geometry (e.g. after `updateScene`). No-op when sunlight/shadows are off.
	 */
	updateShadowBounds: () => void;
	dispose: () => void;
	fitToView: () => void;
	clearSelection: () => void;
	/**
	 * Add caller-owned geometry (lines, annotations, construction aids) to the scene. The object is
	 * tagged `userData.source = 'user'` so it persists across `updateScene` solves instead of being
	 * cleared with compute content. It is treated as normal content for fit-to-view framing.
	 */
	addUserGeometry: (object: THREE.Object3D) => void;
	/** Remove a single user-added object and dispose its geometry/materials. */
	removeUserGeometry: (object: THREE.Object3D) => void;
	/** Remove and dispose all user-added geometry (every object tagged `source === 'user'`). */
	clearUserGeometry: () => void;
} {
	const config = applyDefaults(options || {});

	const sceneUp = config.environment?.sceneUp || defaultUp;

	const scene = createScene(config);
	const camera = createCamera(config, canvas);
	// Set the camera's up to the scene up BEFORE OrbitControls/the controller read it — OrbitControls
	// captures the orbit basis from camera.up at construction, and the controller derives its presets
	// and ortho camera from it. Without this, a Z-up scene would orbit and frame as if Y-up.
	camera.up.copy(sceneUp);
	const renderer = setupRenderer(canvas, config);
	const controls = setupControls(camera, canvas, config);

	// Tracks whichever camera (perspective or orthographic) is live; the controller swaps it.
	// Render loop, resize, and raycasting all read through getActiveCamera so 2D/3D stays coherent.
	const cameraController = createCameraController({
		scene,
		perspective: camera,
		controls,
		onActiveCameraChange: () => {},
		up: sceneUp
	});
	const getActiveCamera = () => cameraController.getActiveCamera();

	setupEnvironment(scene, config);
	// The shadow-casting sun (null when sunlight or shadows are off). Its shadow frustum is fitted to
	// the scene content below and again whenever the host calls updateShadowBounds after a geometry
	// change — keeping shadow-map texels packed onto the model for crisp shadows at any scale.
	const sunlight = setupLighting(scene, config);

	/**
	 * Refit the sun's shadow frustum to the current scene content. Call after loading or replacing
	 * geometry (e.g. right after `updateScene`). No-op when there is no shadow-casting sun or no
	 * content. Cheap: one bounds traversal, no per-frame cost.
	 */
	const updateShadowBounds = () => {
		if (sunlight) fitShadowToContent(sunlight, computeContentBounds(scene));
	};

	if (config.floor?.enabled) {
		addFloor(scene, config);
	}

	// Optional CAD aids: an infinite fading grid and the corner nav-cube gizmo. Both opt-in.
	const grid = config.grid.enabled
		? createGrid({
				cellSize: config.grid.cellSize,
				majorEvery: config.grid.majorEvery,
				cellColor: config.grid.cellColor,
				majorColor: config.grid.majorColor,
				fadeDistance: config.grid.fadeDistance,
				plane: config.grid.plane
			})
		: null;
	if (grid) scene.add(grid.object);

	const gizmo = config.gizmo.enabled
		? createViewGizmo({ camera, domElement: canvas, controller: cameraController })
		: null;

	// HTML label overlay (CSS2D) and the measurement tool built on it. Both opt-in; the label layer
	// is only created when something needs it (currently the measure tool).
	const labelContainer = canvas.parentElement ?? canvas;
	const labelLayer: LabelLayer | null = config.measure.enabled
		? createLabelLayer(labelContainer, scene)
		: null;
	const measureTool: MeasureTool | null =
		config.measure.enabled && labelLayer
			? createMeasureTool({
					canvas,
					scene,
					getActiveCamera,
					labelLayer,
					options: {
						snapPixels: config.measure.snapPixels,
						color: config.measure.color,
						labelClassName: config.measure.labelClassName,
						displayUnit: config.measure.displayUnit,
						format: config.measure.format
					}
				})
			: null;

	const eventHandlers =
		config.events.enableEventHandlers !== false
			? setupEventHandlers(canvas, scene, getActiveCamera, camera, controls, config)
			: { dispose: () => {}, fitToView: () => {}, clearSelection: () => {} };

	// A drag to orbit/pan ends with a `click` on mouseup. Without guarding, that release click would
	// be taken as a measurement point (placing a stray point or clearing a finished measurement when
	// the user only meant to rotate). Record where the press started and treat the release as a click
	// only if the pointer barely moved — a real click, not a drag.
	const DRAG_SLOP_PX = 5;
	let pressX = 0;
	let pressY = 0;
	const handlePointerDown = (event: MouseEvent) => {
		pressX = event.clientX;
		pressY = event.clientY;
	};
	const wasDrag = (event: MouseEvent) =>
		Math.hypot(event.clientX - pressX, event.clientY - pressY) > DRAG_SLOP_PX;

	// Capture-phase interceptors that pre-empt scene selection. Order: an active measurement claims
	// the click first, then the gizmo. stopImmediatePropagation keeps the selection handler from
	// also firing. (Both run in capture so they see the event before the bubble-phase selection.)
	const handleToolClick = (event: MouseEvent) => {
		if (wasDrag(event)) return; // an orbit/pan release, not a measurement click — leave it alone
		if (measureTool?.handleClick(event)) {
			event.stopImmediatePropagation();
			return;
		}
		if (gizmo?.handleClick(event)) {
			event.stopImmediatePropagation();
		}
	};
	if (gizmo || measureTool) {
		canvas.addEventListener('mousedown', handlePointerDown, { capture: true });
		canvas.addEventListener('click', handleToolClick, { capture: true });
	}
	// Forward movement to the measure tool so it can preview the snap point under the cursor. Passive:
	// it only reads, never consumes, so it never interferes with orbit/pan.
	const handleToolMove = (event: MouseEvent) => measureTool?.handleMove(event);
	if (measureTool) {
		canvas.addEventListener('mousemove', handleToolMove, { passive: true });
	}

	// Edge overlays: bind the configured options into a closure the consumer calls after loading
	// meshes. Always applies when called explicitly (the `edges.enabled` flag governs whether the
	// host *intends* edges, but an explicit call should never be silently ignored).
	const applyEdges = (root: THREE.Object3D) => {
		addEdges(root, {
			color: config.edges.color,
			width: config.edges.width,
			thresholdAngle: config.edges.thresholdAngle
		});
	};

	const parent = canvas.parentElement;
	const getCanvasSize = () =>
		parent
			? { width: parent.clientWidth, height: parent.clientHeight }
			: { width: window.innerWidth, height: window.innerHeight };

	// Optional AO postprocessing pipeline. Held in a mutable so it can be toggled at runtime
	// (setAmbientOcclusion below); the loop reads it through getRenderPipeline each frame. When null,
	// the loop uses the plain renderer.render path. Retargeted to the active camera every frame.
	let renderPipeline: RenderPipeline | null = null;

	const buildPipeline = (): RenderPipeline => {
		const { width, height } = getCanvasSize();
		const pixelRatio = Math.min(window.devicePixelRatio, 2);
		const pipeline = createRenderPipeline(
			renderer,
			scene,
			getActiveCamera(),
			Math.max(1, width),
			Math.max(1, height),
			{
				toneMapping: config.render.toneMapping ?? THREE.NeutralToneMapping,
				toneMappingExposure: config.render.toneMappingExposure ?? 1,
				aoIntensity: config.render.aoIntensity
			}
		);
		pipeline.setSize(Math.max(1, width), Math.max(1, height), pixelRatio);
		return pipeline;
	};

	const setAmbientOcclusion = (enabled: boolean) => {
		if (enabled && !renderPipeline) {
			renderPipeline = buildPipeline();
		} else if (!enabled && renderPipeline) {
			renderPipeline.dispose();
			renderPipeline = null;
		}
	};

	if (config.render.ambientOcclusion) renderPipeline = buildPipeline();

	// Resize checked every frame so buffer resize and render happen in the same frame,
	// preventing visible blank frames on resize
	const { animate, dispose: disposeAnimation } = createAnimationLoop(
		renderer,
		scene,
		camera,
		getActiveCamera,
		cameraController,
		controls,
		getCanvasSize,
		config.events.onFrame,
		grid,
		gizmo,
		() => renderPipeline,
		labelLayer
	);
	animate();

	scene.up.set(sceneUp.x, sceneUp.y, sceneUp.z);

	// Initial fit so any geometry already present at construction casts crisp shadows. Hosts that add
	// geometry later (via updateScene) should call updateShadowBounds again afterwards.
	updateShadowBounds();

	// Dispose one object's renderable resources (geometry + materials), recursing into children so
	// Groups of lines/points clean up fully.
	const disposeObjectTree = (root: THREE.Object3D) => {
		root.traverse((object) => {
			const renderable = object as Partial<THREE.Mesh> & THREE.Object3D;
			if (!renderable.geometry && !renderable.material) return;
			renderable.geometry?.dispose();
			if (Array.isArray(renderable.material)) {
				renderable.material.forEach((material) => material.dispose());
			} else {
				renderable.material?.dispose();
			}
		});
	};

	const addUserGeometry = (object: THREE.Object3D) => {
		object.userData.source = 'user';
		scene.add(object);
	};

	const removeUserGeometry = (object: THREE.Object3D) => {
		object.removeFromParent();
		disposeObjectTree(object);
	};

	const clearUserGeometry = () => {
		// Snapshot first — removeFromParent mutates scene.children during iteration.
		const userObjects = scene.children.filter((child) => child.userData.source === 'user');
		userObjects.forEach((object) => {
			object.removeFromParent();
			disposeObjectTree(object);
		});
	};

	const dispose = () => {
		disposeAnimation();
		eventHandlers.dispose();
		if (gizmo || measureTool) {
			canvas.removeEventListener('mousedown', handlePointerDown, { capture: true });
			canvas.removeEventListener('click', handleToolClick, { capture: true });
		}
		if (measureTool) {
			canvas.removeEventListener('mousemove', handleToolMove);
		}
		measureTool?.dispose();
		labelLayer?.dispose();
		gizmo?.dispose();
		grid?.dispose();
		renderPipeline?.dispose();
		controls.dispose();
		renderer.dispose();

		scene.traverse((object) => {
			// Dispose any renderable (mesh, line, points), not just meshes.
			const renderable = object as Partial<THREE.Mesh> & THREE.Object3D;
			if (!renderable.geometry && !renderable.material) return;

			renderable.geometry?.dispose();
			if (Array.isArray(renderable.material)) {
				renderable.material.forEach((material) => material.dispose());
			} else {
				renderable.material?.dispose();
			}
		});

		// Scene-level textures the traversal above can't reach.
		scene.environment?.dispose();
		if (scene.background instanceof THREE.Texture) {
			scene.background.dispose();
		}
	};

	return {
		scene,
		camera,
		controls,
		renderer,
		cameraController,
		grid,
		gizmo,
		measureTool,
		applyEdges,
		setAmbientOcclusion,
		updateShadowBounds,
		dispose,
		fitToView: eventHandlers.fitToView,
		clearSelection: eventHandlers.clearSelection,
		addUserGeometry,
		removeUserGeometry,
		clearUserGeometry
	};
};

function applyDefaults(options: ThreeInitializerOptions): Required<ThreeInitializerOptions> {
	const scale = options.sceneScale || 'm';

	// All Rhino geometry is normalized to METERS (1 unit = 1 meter), sceneScale just changes the viewing perspective
	const scaleDefaults = {
		mm: {
			cameraDistance: 20,
			near: 0.1,
			far: 2000,
			floorSize: 100,
			lightDistance: 10,
			lightHeight: 20,
			minDistance: 0.1,
			shadowSize: 100,
			scaleFactor: 1000
		},
		cm: {
			cameraDistance: 20,
			near: 0.1,
			far: 2000,
			floorSize: 100,
			lightDistance: 25,
			lightHeight: 50,
			minDistance: 0.1,
			shadowSize: 100,
			scaleFactor: 100
		},
		m: {
			cameraDistance: 10,
			near: 0.01,
			far: 2000,
			floorSize: 50,
			lightDistance: 25,
			lightHeight: 50,
			minDistance: 0.001,
			shadowSize: 100,
			scaleFactor: 1
		},
		inches: {
			cameraDistance: 15,
			near: 0.1,
			far: 2000,
			floorSize: 80,
			lightDistance: 20,
			lightHeight: 40,
			minDistance: 0.1,
			shadowSize: 80,
			scaleFactor: 39.37
		},
		feet: {
			cameraDistance: 8,
			near: 0.1,
			far: 2000,
			floorSize: 40,
			lightDistance: 15,
			lightHeight: 30,
			minDistance: 0.1,
			shadowSize: 60,
			scaleFactor: 3.28084
		}
	};

	const defaults = scaleDefaults[scale];

	return {
		sceneScale: scale,
		camera: {
			// Default 3/4 iso for a Z-up scene: back-left and ABOVE (height on +Z).
			position:
				options.camera?.position ||
				new THREE.Vector3(
					-defaults.cameraDistance,
					-defaults.cameraDistance,
					defaults.cameraDistance
				),
			fov: options.camera?.fov || 20,
			near: options.camera?.near || defaults.near,
			far: options.camera?.far || defaults.far,
			target: options.camera?.target || new THREE.Vector3(0, 0, 0)
		},
		lighting: {
			enableSunlight: options.lighting?.enableSunlight ?? true,
			sunlightIntensity: options.lighting?.sunlightIntensity ?? 1,
			// Sun overhead in a Z-up scene: height on +Z, offset across X/Y.
			sunlightPosition:
				options.lighting?.sunlightPosition ||
				new THREE.Vector3(defaults.lightDistance, defaults.lightDistance, defaults.lightHeight),
			ambientLightColor: options.lighting?.ambientLightColor || new THREE.Color(0x404040),
			ambientLightIntensity: options.lighting?.ambientLightIntensity ?? 1,
			sunlightColor: options.lighting?.sunlightColor || 0xffffff // Default to white sunlight
		},
		environment: {
			hdrPath: options.environment?.hdrPath || '/baseHDR.hdr',
			backgroundColor: options.environment?.backgroundColor || new THREE.Color(0xf0f0f0),
			enableEnvironmentLighting: options.environment?.enableEnvironmentLighting ?? true,
			sceneUp: options.environment?.sceneUp || defaultUp,
			showEnvironment: options.environment?.showEnvironment ?? false
		},
		floor: {
			enabled: options.floor?.enabled ?? false,
			size: options.floor?.size || defaults.floorSize,
			color: options.floor?.color || new THREE.Color(0x808080),
			roughness: options.floor?.roughness ?? 0.7,
			metalness: options.floor?.metalness ?? 0.0,
			receiveShadow: options.floor?.receiveShadow ?? true
		},
		render: {
			enableShadows: options.render?.enableShadows ?? true,
			shadowMapSize: options.render?.shadowMapSize || 2048,
			antialias: options.render?.antialias ?? true,
			pixelRatio: options.render?.pixelRatio || Math.min(window.devicePixelRatio, 2),
			toneMapping: options.render?.toneMapping || THREE.NeutralToneMapping,
			toneMappingExposure: options.render?.toneMappingExposure ?? 1,
			preserveDrawingBuffer: options.render?.preserveDrawingBuffer ?? false,
			ambientOcclusion: options.render?.ambientOcclusion ?? false,
			aoIntensity: options.render?.aoIntensity ?? 1
		},
		controls: {
			enableDamping: options.controls?.enableDamping ?? false,
			dampingFactor: options.controls?.dampingFactor || 0.05,
			autoRotate: options.controls?.autoRotate ?? false,
			autoRotateSpeed: options.controls?.autoRotateSpeed || 0.5,
			enableZoom: options.controls?.enableZoom ?? true,
			enablePan: options.controls?.enablePan ?? true,
			minDistance: options.controls?.minDistance || defaults.minDistance,
			maxDistance: options.controls?.maxDistance || Infinity
		},
		grid: {
			// Defaults mirror createGrid's so the two never drift.
			enabled: options.grid?.enabled ?? false,
			cellSize: options.grid?.cellSize ?? 1,
			majorEvery: options.grid?.majorEvery ?? 10,
			cellColor: options.grid?.cellColor ?? 0x888888,
			majorColor: options.grid?.majorColor ?? 0x444444,
			fadeDistance: options.grid?.fadeDistance ?? 100,
			// The "ground" plane is the one orthogonal to the scene up axis, so the grid lies under the
			// model regardless of up convention (Z-up Rhino → 'z'; Y-up → 'y'). Explicit `plane` wins.
			plane: options.grid?.plane ?? upToGroundPlane(options.environment?.sceneUp ?? defaultUp)
		},
		gizmo: {
			enabled: options.gizmo?.enabled ?? false
		},
		edges: {
			// Defaults mirror addEdges' so the two never drift.
			enabled: options.edges?.enabled ?? false,
			color: options.edges?.color ?? 0x222222,
			width: options.edges?.width ?? 1.5,
			thresholdAngle: options.edges?.thresholdAngle ?? 30
		},
		measure: {
			// Visual defaults live in createMeasureTool; only `enabled` needs a value here, the rest
			// pass through (undefined → the tool's own default).
			enabled: options.measure?.enabled ?? false,
			snapPixels: options.measure?.snapPixels,
			color: options.measure?.color,
			labelClassName: options.measure?.labelClassName,
			displayUnit: options.measure?.displayUnit,
			format: options.measure?.format
		},
		events: {
			onBackgroundClicked: options.events?.onBackgroundClicked,
			onObjectSelected: options.events?.onObjectSelected,
			onMeshMetadataClicked: options.events?.onMeshMetadataClicked,
			onMeshDoubleClicked: options.events?.onMeshDoubleClicked,
			selectionColor: options.events?.selectionColor || '#ff0000', // Default to red
			enableEventHandlers: options.events?.enableEventHandlers ?? true,
			enableKeyboardControls: options.events?.enableKeyboardControls ?? true,
			enableClickToFocus: options.events?.enableClickToFocus ?? true,
			enableDoubleClickZoom: options.events?.enableDoubleClickZoom ?? true,
			onReady: options.events?.onReady,
			onFrame: options.events?.onFrame
		}
	};
}

/**
 * Viewer aids (grid, floor, label overlay, measure markers) are not scene *content* — exclude them
 * from fit-to-view bounds and other content queries. Tagged via `userData.id` at creation.
 */
const VIEWER_AID_IDS = new Set(['grid', 'floor', 'label-layer', 'measure']);
function isViewerAid(object: THREE.Object3D): boolean {
	let current: THREE.Object3D | null = object;
	while (current) {
		if (typeof current.userData.id === 'string' && VIEWER_AID_IDS.has(current.userData.id)) {
			return true;
		}
		current = current.parent;
	}
	return false;
}

/**
 * Axis-aligned bounds of the scene's renderable *content* — every visible mesh/line/points, with
 * viewer aids excluded. The grid (a huge camera-tracking plane) and the floor would otherwise
 * dominate the box. Shared by fit-to-view, pick-threshold scaling, and shadow-frustum fitting so
 * they all measure the same thing. Returns an empty Box3 when there is no content.
 */
function computeContentBounds(scene: THREE.Scene): THREE.Box3 {
	const box = new THREE.Box3();
	scene.traverse((object) => {
		const renderable = object as Partial<THREE.Mesh> & THREE.Object3D;
		if (object.visible && !isViewerAid(object) && renderable.geometry) {
			box.expandByObject(object);
		}
	});
	return box;
}

/**
 * Fit a directional light's shadow camera to the scene content. The orthographic shadow frustum is
 * sized to the content's bounding sphere (padded), so the fixed shadow-map texels cover only the
 * model rather than a generous constant area — the dominant lever on shadow crispness. Near/far are
 * derived from how far the light sits from the content centre, keeping depth precision tight.
 *
 * No-op when there is no content (an empty box would collapse the frustum to a point).
 */
function fitShadowToContent(light: THREE.DirectionalLight, bounds: THREE.Box3): void {
	if (bounds.isEmpty()) return;

	const center = bounds.getCenter(new THREE.Vector3());
	// Bounding-sphere radius makes the frustum rotation-invariant: the light can shine from any
	// angle and the model still fits, with no per-angle recompute. Pad so grazing-angle casters and
	// soft-shadow (VSM) blur near the edges don't clip.
	const radius = bounds.getSize(new THREE.Vector3()).length() * 0.5 * 1.2;

	const cam = light.shadow.camera;
	cam.left = -radius;
	cam.right = radius;
	cam.top = radius;
	cam.bottom = -radius;

	// Aim the shadow camera at the content centre. The light keeps its configured *position*; only
	// its target moves, so the lighting direction is preserved while the shadow frustum recentres.
	light.target.position.copy(center);
	light.target.updateMatrixWorld();

	// Near/far bracket the content along the light→centre axis. Clamp near to a small positive value
	// so a light sitting inside the bounds can't push near ≤ 0.
	const lightDistance = light.position.distanceTo(center);
	cam.near = Math.max(radius * 0.01, lightDistance - radius);
	cam.far = lightDistance + radius;
	cam.updateProjectionMatrix();
}

function createScene(config: Required<ThreeInitializerOptions>): THREE.Scene {
	const scene = new THREE.Scene();

	const bgColor =
		typeof config.environment.backgroundColor === 'string'
			? new THREE.Color(config.environment.backgroundColor)
			: config.environment.backgroundColor;
	scene.background = bgColor || null;

	return scene;
}

function animateCameraTo(
	camera: THREE.PerspectiveCamera,
	controls: OrbitControls,
	toPosition: THREE.Vector3,
	toTarget: THREE.Vector3,
	durationMs = 200
): void {
	const fromPosition = camera.position.clone();
	const fromTarget = controls.target.clone();
	const startTime = performance.now();

	const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

	const tick = () => {
		const elapsed = performance.now() - startTime;
		const t = easeOut(Math.min(elapsed / durationMs, 1));

		camera.position.lerpVectors(fromPosition, toPosition, t);
		controls.target.lerpVectors(fromTarget, toTarget, t);
		controls.update();

		if (t < 1) requestAnimationFrame(tick);
	};

	requestAnimationFrame(tick);
}

// Resize applied before render so buffer clear and draw happen in the same frame,
// preventing visible blank frames when the canvas is resized
function createAnimationLoop(
	renderer: THREE.WebGLRenderer,
	scene: THREE.Scene,
	camera: THREE.PerspectiveCamera,
	getActiveCamera: () => THREE.Camera,
	cameraController: CameraController,
	controls: OrbitControls,
	getCanvasSize: () => { width: number; height: number },
	onFrame?: (delta: number) => void,
	grid?: Grid | null,
	gizmo?: ViewGizmo | null,
	getRenderPipeline?: () => RenderPipeline | null,
	labelLayer?: LabelLayer | null
): { animate: () => void; dispose: () => void } {
	let animationId: number | null = null;
	let lastTime = performance.now();

	const checkResize = () => {
		const { width, height } = getCanvasSize();
		if (width === 0 || height === 0) return;

		const pixelRatio = Math.min(window.devicePixelRatio, 2);
		const newW = Math.round(width * pixelRatio);
		const newH = Math.round(height * pixelRatio);

		if (renderer.domElement.width !== newW || renderer.domElement.height !== newH) {
			renderer.setPixelRatio(pixelRatio);
			renderer.setSize(width, height, false);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
			// Reshape the orthographic frustum too, if it's the active projection.
			cameraController.updateAspect(width, height);
			// Keep the AO composer's render targets in step with the canvas.
			getRenderPipeline?.()?.setSize(width, height, pixelRatio);
			// CSS2D overlay matches the canvas's CSS size (not the pixel-ratio buffer size).
			labelLayer?.setSize(width, height);
		}
	};

	const animate = function () {
		animationId = requestAnimationFrame(animate);

		const now = performance.now();
		const delta = (now - lastTime) / 1000;
		lastTime = now;

		checkResize();

		if (controls.enableDamping || controls.autoRotate) {
			controls.update();
		}

		// Keep the grid centered on the camera so it reads as infinite.
		if (grid) grid.update(getActiveCamera().position);

		// Advance the gizmo's fade/spin animation (no-op when idle).
		if (gizmo) gizmo.update(delta);

		onFrame?.(delta);

		const activeCamera = getActiveCamera();
		const renderPipeline = getRenderPipeline?.();
		if (renderPipeline) {
			// AO path: composer owns the render. Retarget to the active camera in case 2D/3D swapped.
			renderPipeline.setCamera(activeCamera);
			renderPipeline.render(delta);
		} else {
			renderer.render(scene, activeCamera);
		}

		// HTML labels follow their 3D anchors — render the DOM overlay against the active camera.
		if (labelLayer) labelLayer.render(scene, activeCamera);

		// The gizmo draws as an overlay in a corner viewport with its own clear; render it last so it
		// sits on top of the scene.
		if (gizmo) gizmo.render(renderer);
	};

	const dispose = () => {
		if (animationId !== null) {
			cancelAnimationFrame(animationId);
			animationId = null;
		}
	};

	return { animate, dispose };
}

function setupEnvironment(scene: THREE.Scene, config: Required<ThreeInitializerOptions>) {
	if (config.environment.enableEnvironmentLighting) {
		new HDRLoader().load(
			config.environment.hdrPath || '/baseHDR.hdr',
			function (envMap) {
				if (!envMap?.image) {
					getLogger().warn('HDR loaded without image data; skipping environment map.');
					config.events.onReady?.();
					return;
				}
				envMap.mapping = THREE.EquirectangularReflectionMapping;
				scene.environment = envMap;
				if (config.environment.showEnvironment) {
					scene.background = envMap;
				}
				config.events.onReady?.();
			},
			undefined,
			function (error) {
				getLogger().warn('HDR texture could not be loaded, falling back to basic lighting:', error);
				config.events.onReady?.();
			}
		);
	} else {
		config.events.onReady?.();
	}
}

/**
 * Set up scene lighting. Returns the shadow-casting sun, if any, so the caller can refit its shadow
 * frustum to the scene whenever geometry changes (see `fitShadowToContent`). Returns null when
 * sunlight is disabled or shadows are off — there is then nothing to refit.
 */
function setupLighting(
	scene: THREE.Scene,
	config: Required<ThreeInitializerOptions>
): THREE.DirectionalLight | null {
	const ambientLight = new THREE.AmbientLight(
		config.lighting.ambientLightColor,
		config.lighting.ambientLightIntensity
	);
	scene.add(ambientLight);

	if (!config.lighting.enableSunlight) return null;

	const sunlight = new THREE.DirectionalLight(
		config.lighting.sunlightColor ?? 0xffffff,
		config.lighting.sunlightIntensity
	);
	const pos = config.lighting.sunlightPosition;
	if (pos) {
		sunlight.position.set(pos.x, pos.y, pos.z);
	}

	if (!config.render.enableShadows) {
		scene.add(sunlight);
		return null;
	}

	sunlight.castShadow = true;

	// The frustum bounds (left/right/top/bottom/near/far) are not set here — they are fitted to the
	// scene content by fitShadowToContent, called at init and on every geometry change. Sizing them
	// to the model instead of a fixed constant is the dominant lever on shadow crispness.
	sunlight.shadow.mapSize.width = config.render.shadowMapSize || 2048;
	sunlight.shadow.mapSize.height = config.render.shadowMapSize || 2048;

	sunlight.shadow.bias = -0.0001;
	sunlight.shadow.normalBias = 0.02;
	// Soften VSM edges; cheap and only meaningful once the frustum is tight (see fitShadowToContent).
	sunlight.shadow.radius = 4;

	scene.add(sunlight);
	// A DirectionalLight aims at its target's world position; the target must be in the scene graph
	// for its matrix to update. fitShadowToContent moves this target to the content centre.
	scene.add(sunlight.target);
	return sunlight;
}

function addFloor(scene: THREE.Scene, config: Required<ThreeInitializerOptions>) {
	const floorSize = config.floor.size;
	const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize);

	const floorColor =
		typeof config.floor.color === 'string'
			? new THREE.Color(config.floor.color)
			: config.floor.color;

	const floorMaterial = new THREE.MeshStandardMaterial({
		color: floorColor,
		roughness: config.floor.roughness,
		metalness: config.floor.metalness,
		side: THREE.DoubleSide
	});

	const floor = new THREE.Mesh(floorGeometry, floorMaterial);
	floor.userData.id = 'floor';
	floor.name = 'floor';
	// PlaneGeometry lies in XY with a +Z normal — already the ground for a Z-up scene. Orient its
	// normal to the scene up axis so the floor is the ground plane in any up convention.
	const up = (config.environment?.sceneUp || defaultUp).clone().normalize();
	floor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
	floor.position.set(0, 0, 0);

	if (config.floor.receiveShadow && config.render.enableShadows) {
		floor.receiveShadow = true;
	}

	scene.add(floor);
}

function createCamera(
	config: Required<ThreeInitializerOptions>,
	canvas: HTMLCanvasElement
): THREE.PerspectiveCamera {
	const parent = canvas.parentElement;
	const width = parent ? parent.clientWidth : window.innerWidth;
	const height = parent ? parent.clientHeight : window.innerHeight;

	const camera = new THREE.PerspectiveCamera(
		config.camera.fov,
		width / height,
		config.camera.near,
		config.camera.far
	);

	const pos = config.camera.position;
	if (pos) {
		camera.position.set(pos.x, pos.y, pos.z);
	}

	return camera;
}

// Logarithmic depth buffer improves depth precision for mixed scales (mm to km)
function setupRenderer(
	canvas: HTMLCanvasElement,
	config: Required<ThreeInitializerOptions>
): THREE.WebGLRenderer {
	const renderer = new THREE.WebGLRenderer({
		antialias: config.render.antialias,
		canvas,
		alpha: true,
		powerPreference: 'high-performance',
		preserveDrawingBuffer: config.render.preserveDrawingBuffer,
		logarithmicDepthBuffer: true
	});

	const parent = canvas.parentElement;
	const width = parent ? parent.clientWidth : window.innerWidth;
	const height = parent ? parent.clientHeight : window.innerHeight;

	if (parent) {
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		canvas.style.display = 'block';
	}

	renderer.setSize(width, height, false);
	renderer.setPixelRatio(config.render.pixelRatio || Math.min(window.devicePixelRatio, 2));

	if (config.render.enableShadows) {
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.VSMShadowMap;
	}

	renderer.toneMapping = config.render.toneMapping!;
	renderer.toneMappingExposure = config.render.toneMappingExposure ?? 1.0;
	renderer.outputColorSpace = THREE.SRGBColorSpace;

	renderer.sortObjects = true;

	return renderer;
}

function setupEventHandlers(
	canvas: HTMLCanvasElement,
	scene: THREE.Scene,
	getActiveCamera: () => THREE.Camera,
	camera: THREE.PerspectiveCamera,
	controls: OrbitControls,
	config: Required<ThreeInitializerOptions>
): {
	dispose: () => void;
	fitToView: () => void;
	clearSelection: () => void;
} {
	const selectedObjects = new Set<THREE.Object3D>();
	const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2();
	const mouseDownPosition = new THREE.Vector2();

	// An object is hittable only if every ancestor is also visible. Three.js's
	// recursive intersect doesn't enforce that — it can hit a visible Mesh inside
	// a hidden Group.
	const isFullyVisible = (object: THREE.Object3D): boolean => {
		let current: THREE.Object3D | null = object;
		while (current) {
			if (!current.visible) return false;
			current = current.parent;
		}
		return true;
	};

	const fitToView = () => {
		// Frame the scene's renderable content; viewer aids (grid/floor/labels/measure) are excluded so
		// the camera-tracking grid plane can't dominate the bounds and blow up the fit distance.
		const box = computeContentBounds(scene);

		if (box.isEmpty()) {
			getLogger().warn('No objects to fit to view');
			return;
		}

		const center = box.getCenter(new THREE.Vector3());
		const size = box.getSize(new THREE.Vector3());

		const maxDim = Math.max(size.x, size.y, size.z);
		const fov = camera.fov * (Math.PI / 180);
		let distance = maxDim / (2 * Math.tan(fov / 2));

		distance *= 1.5;

		// View direction from the current camera→target. If those coincide (camera sitting on its
		// target, e.g. after a degenerate fit), fall back to a sensible 3/4 iso so we never produce a
		// zero/NaN direction that collapses the view.
		const direction = camera.position.clone().sub(controls.target);
		if (direction.lengthSq() < 1e-12) direction.set(0.8, 1, 1.2);
		direction.normalize();
		camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));

		controls.target.copy(center);
		controls.update();
	};

	const selectionColorObj =
		typeof config.events.selectionColor === 'string'
			? new THREE.Color(config.events.selectionColor)
			: config.events.selectionColor instanceof THREE.Color
				? config.events.selectionColor
				: new THREE.Color('#ff0000');

	const clearSelection = () => {
		selectedObjects.forEach((obj) => {
			const restorable = obj as THREE.Object3D & {
				material?: THREE.Material | THREE.Material[];
			};
			if (originalMaterials.has(obj)) {
				const original = originalMaterials.get(obj)!;
				// Dispose the clone we swapped in before restoring the original.
				const clone = restorable.material;
				if (clone instanceof THREE.Material) clone.dispose();
				else if (Array.isArray(clone)) clone.forEach((m) => m.dispose());
				restorable.material = original;
				originalMaterials.delete(obj);
			}
		});
		selectedObjects.clear();
	};

	// Highlight a selected object by cloning its material and recoloring. Meshes get an `emissive`
	// tint (so the surface keeps its base color); lines and points have no emissive channel, so we
	// recolor `color` directly. Returns true if a highlight was applied (a material was found).
	const applyHighlight = (object: THREE.Object3D): boolean => {
		const target = object as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
		if (!(target.material instanceof THREE.Material)) return false;

		originalMaterials.set(object, target.material);
		const clone = target.material.clone();

		if (object instanceof THREE.Mesh && 'emissive' in clone) {
			(clone as THREE.MeshStandardMaterial).emissive = selectionColorObj.clone();
		} else if ('color' in clone) {
			(clone as THREE.LineBasicMaterial).color = selectionColorObj.clone();
		}

		target.material = clone;
		return true;
	};

	// Picking lines and points needs a ray-to-geometry tolerance, scaled to the scene so it holds at
	// any zoom. Plain THREE.Points use Raycaster.params.Points.threshold; fat Line2 uses its own
	// material linewidth, so only Points needs this. (THREE.Line would use params.Line.threshold, but
	// curves here are Line2.) Recomputed per pick from the current scene bounds.
	const updatePickThresholds = () => {
		const box = computeContentBounds(scene);
		const diagonal = box.isEmpty() ? 1 : box.getSize(new THREE.Vector3()).length();
		raycaster.params.Points.threshold = diagonal * 0.01;
	};

	const handleMouseDown = (event: MouseEvent) => {
		mouseDownPosition.set(event.clientX, event.clientY);
	};

	const handleCanvasClick = (event: MouseEvent) => {
		// Ignore if mouse has moved (drag)
		const currentMousePosition = new THREE.Vector2(event.clientX, event.clientY);
		if (mouseDownPosition.distanceTo(currentMousePosition) > 5) {
			return;
		}

		const rect = canvas.getBoundingClientRect();
		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		updatePickThresholds();
		raycaster.setFromCamera(mouse, getActiveCamera());
		const intersects = raycaster
			.intersectObjects(scene.children, true)
			.filter((i) => isFullyVisible(i.object));

		if (intersects.length > 0) {
			const clickedObject = intersects[0].object;

			if (!selectedObjects.has(clickedObject)) {
				clearSelection();
				selectedObjects.add(clickedObject);

				// Clone material (so siblings sharing it are untouched) and recolor to highlight.
				// Handles meshes, fat lines, and points alike.
				applyHighlight(clickedObject);

				config.events?.onObjectSelected?.(clickedObject);

				if (clickedObject instanceof THREE.Mesh && Object.keys(clickedObject.userData).length > 0) {
					config.events?.onMeshMetadataClicked?.(clickedObject.userData);
				}
			}
		} else {
			clearSelection();
			config.events?.onBackgroundClicked?.({ x: mouse.x, y: mouse.y });
		}
	};

	const handleDoubleClick = (event: MouseEvent) => {
		const rect = canvas.getBoundingClientRect();
		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		updatePickThresholds();
		raycaster.setFromCamera(mouse, getActiveCamera());
		const intersects = raycaster
			.intersectObjects(scene.children, true)
			.filter((i) => isFullyVisible(i.object));

		if (intersects.length === 0) return;

		const target = intersects[0].object;
		config.events?.onMeshDoubleClicked?.(target);

		if (!config.events?.enableDoubleClickZoom) return;

		const box = new THREE.Box3().setFromObject(target);
		if (box.isEmpty()) return;

		const center = box.getCenter(new THREE.Vector3());
		const size = box.getSize(new THREE.Vector3());
		const maxDim = Math.max(size.x, size.y, size.z);
		const fov = camera.fov * (Math.PI / 180);
		const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

		const direction = camera.position.clone().sub(controls.target).normalize();
		const targetPosition = center.clone().add(direction.multiplyScalar(distance));

		animateCameraTo(camera, controls, targetPosition, center);
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (!config.events?.enableKeyboardControls) return;

		switch (event.key.toLowerCase()) {
			case 'f':
				event.preventDefault();
				fitToView();
				break;
			case 'escape':
				event.preventDefault();
				clearSelection();
				break;
			case ' ':
				event.preventDefault();
				fitToView();
				break;
		}
	};

	if (config.events?.enableClickToFocus) {
		canvas.addEventListener('mousedown', handleMouseDown);
		canvas.addEventListener('click', handleCanvasClick);
		canvas.addEventListener('dblclick', handleDoubleClick);
	}

	if (config.events?.enableKeyboardControls) {
		canvas.setAttribute('tabindex', '0');
		canvas.addEventListener('keydown', handleKeydown);
	}

	const dispose = () => {
		canvas.removeEventListener('mousedown', handleMouseDown);
		canvas.removeEventListener('click', handleCanvasClick);
		canvas.removeEventListener('dblclick', handleDoubleClick);
		canvas.removeEventListener('keydown', handleKeydown);
		clearSelection();
	};

	return { dispose, fitToView, clearSelection };
}

function setupControls(
	camera: THREE.PerspectiveCamera,
	canvas: HTMLCanvasElement,
	config: Required<ThreeInitializerOptions>
): OrbitControls {
	const controls = new OrbitControls(camera, canvas);

	const target = config.camera.target;
	if (target) {
		controls.target.set(target.x, target.y, target.z);
	}

	controls.enableDamping = config.controls.enableDamping || false;
	controls.dampingFactor = config.controls.dampingFactor || 0.05;

	controls.autoRotate = config.controls.autoRotate || false;
	controls.autoRotateSpeed = config.controls.autoRotateSpeed || 0.5;

	controls.enableZoom = config.controls.enableZoom ?? true;
	controls.enablePan = config.controls.enablePan ?? true;
	controls.minDistance = config.controls.minDistance || 0.001;
	controls.maxDistance = config.controls.maxDistance || Infinity;

	controls.screenSpacePanning = false;
	controls.maxPolarAngle = Math.PI;

	controls.update();
	return controls;
}
