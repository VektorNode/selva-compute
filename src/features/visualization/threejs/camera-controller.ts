import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { computeCombinedBoundingBox } from './three-helpers';

/**
 * Runtime camera control for the viewer: preset views (top/front/…), a true 2D/3D toggle
 * (orthographic ⇄ perspective), and a rotate lock.
 *
 * Why a controller and not just loose methods: all three features have to agree on *which* camera
 * is active. Switching projection swaps the camera object OrbitControls drives, the animation loop
 * renders, the resize handler reshapes, and the raycaster picks with. Centralizing that here keeps
 * those four call sites reading one source of truth ({@link getActiveCamera}) instead of each
 * branching on a `mode` flag.
 *
 * The perspective camera stays the primary (it's what {@link updateScene} and existing consumers
 * size). The orthographic camera shadows it: same position/target, frustum derived from the
 * perspective FOV + current distance so the 3D→2D switch doesn't visually jump.
 */

/** The six axis-aligned presets plus the default 3/4 iso. Named in Three's Y-up frame. */
export type ViewPreset = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'iso';

export type CameraProjection = 'perspective' | 'orthographic';

export interface CameraController {
	/** The camera currently being rendered/picked with. Swaps identity on {@link setProjection}. */
	getActiveCamera(): THREE.Camera;
	/** Current projection mode. */
	getProjection(): CameraProjection;
	/** Switch between perspective (3D) and orthographic (2D). No-op if already in that mode. */
	setProjection(projection: CameraProjection): void;
	/** Convenience toggle for a 2D/3D button. */
	toggleProjection(): CameraProjection;
	/** Move the camera to a preset orientation, framing current scene content. Animated. */
	setView(preset: ViewPreset, animate?: boolean): void;
	/** Enable/disable orbit rotation at runtime (pan/zoom unaffected). */
	setRotateEnabled(enabled: boolean): void;
	/** Whether rotation is currently enabled. */
	isRotateEnabled(): boolean;
	/** Keep the orthographic frustum aspect in sync on canvas resize. Called by the resize loop. */
	updateAspect(width: number, height: number): void;
}

interface CameraControllerDeps {
	scene: THREE.Scene;
	perspective: THREE.PerspectiveCamera;
	controls: OrbitControls;
	/** Called whenever the active camera identity changes, so callers can re-point the renderer/raycaster. */
	onActiveCameraChange: (camera: THREE.Camera) => void;
}

/** Direction (from target toward camera) for each preset, in Three Y-up. Unit vectors. */
const VIEW_DIRECTIONS: Record<ViewPreset, THREE.Vector3> = {
	top: new THREE.Vector3(0, 1, 0),
	bottom: new THREE.Vector3(0, -1, 0),
	front: new THREE.Vector3(0, 0, 1),
	back: new THREE.Vector3(0, 0, -1),
	right: new THREE.Vector3(1, 0, 0),
	left: new THREE.Vector3(-1, 0, 0),
	iso: new THREE.Vector3(0.8, 1, 1.2).normalize()
};

export function createCameraController(deps: CameraControllerDeps): CameraController {
	const { scene, perspective, controls, onActiveCameraChange } = deps;

	const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, perspective.near, perspective.far);
	ortho.up.copy(perspective.up);

	let projection: CameraProjection = 'perspective';
	let aspect = perspective.aspect;

	const active = (): THREE.Camera => (projection === 'perspective' ? perspective : ortho);

	// Sizes the ortho frustum so its on-screen content matches the perspective view at the current
	// distance — the apparent height of the perspective view at the target plane is
	// 2 * distance * tan(fov/2). Half-height drives top/bottom; aspect drives left/right.
	const syncOrthoFrustum = () => {
		const distance = perspective.position.distanceTo(controls.target);
		const halfH = distance * Math.tan((perspective.fov * Math.PI) / 360);
		const halfW = halfH * aspect;
		ortho.left = -halfW;
		ortho.right = halfW;
		ortho.top = halfH;
		ortho.bottom = -halfH;
		ortho.near = perspective.near;
		ortho.far = perspective.far;
		ortho.updateProjectionMatrix();
	};

	const setProjection = (next: CameraProjection) => {
		if (next === projection) return;

		// Carry position/target across so the switch doesn't jump.
		if (next === 'orthographic') {
			ortho.position.copy(perspective.position);
			ortho.up.copy(perspective.up);
			ortho.lookAt(controls.target);
			syncOrthoFrustum();
		} else {
			perspective.position.copy(ortho.position);
		}

		projection = next;
		controls.object = active();
		controls.update();
		onActiveCameraChange(active());
	};

	const setView = (preset: ViewPreset, animate = true) => {
		const box = computeContentBox(scene);
		const center = box.isEmpty() ? controls.target.clone() : box.getCenter(new THREE.Vector3());
		const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
		const maxDim = Math.max(size.x, size.y, size.z) || 1;

		// Distance to fit the content for the perspective camera; ortho reuses it via syncOrthoFrustum.
		const fov = perspective.fov * (Math.PI / 180);
		const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

		const dir = VIEW_DIRECTIONS[preset];
		const toPosition = center.clone().add(dir.clone().multiplyScalar(distance));

		const cam = active();
		if (animate) {
			animateMove(cam, controls, toPosition, center, () => {
				if (projection === 'orthographic') syncOrthoFrustum();
			});
		} else {
			cam.position.copy(toPosition);
			controls.target.copy(center);
			if (projection === 'orthographic') syncOrthoFrustum();
			controls.update();
		}
	};

	const setRotateEnabled = (enabled: boolean) => {
		controls.enableRotate = enabled;
	};

	const updateAspect = (width: number, height: number) => {
		aspect = height === 0 ? aspect : width / height;
		if (projection === 'orthographic') syncOrthoFrustum();
	};

	return {
		getActiveCamera: active,
		getProjection: () => projection,
		setProjection,
		toggleProjection: () => {
			setProjection(projection === 'perspective' ? 'orthographic' : 'perspective');
			return projection;
		},
		setView,
		setRotateEnabled,
		isRotateEnabled: () => controls.enableRotate,
		updateAspect
	};
}

/** userData.id of objects that are viewer aids, not content — excluded from view framing. */
const VIEWER_AID_IDS = new Set(['grid', 'floor', 'label-layer', 'measure']);

/** True if the object or any ancestor is a viewer aid (grid/floor/labels/measure markers). */
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
 * Bounding box of renderable scene content. Excludes viewer aids — crucially the grid, a huge plane
 * that re-centers on the camera every frame; including it would make `setView` frame the grid (i.e.
 * wherever the camera is) instead of the actual content, so a preset view wouldn't recenter.
 */
function computeContentBox(scene: THREE.Scene): THREE.Box3 {
	const renderables: THREE.Object3D[] = [];
	scene.traverse((object) => {
		const r = object as Partial<THREE.Mesh> & THREE.Object3D;
		if (object.visible && !isViewerAid(object) && r.geometry) {
			renderables.push(object);
		}
	});
	return computeCombinedBoundingBox(renderables);
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Tween camera position + controls target. Mirrors the initializer's double-click tween. */
function animateMove(
	camera: THREE.Camera,
	controls: OrbitControls,
	toPosition: THREE.Vector3,
	toTarget: THREE.Vector3,
	onTick: () => void,
	durationMs = 250
): void {
	const fromPosition = camera.position.clone();
	const fromTarget = controls.target.clone();
	const startTime = performance.now();

	const tick = () => {
		const t = easeOut(Math.min((performance.now() - startTime) / durationMs, 1));
		camera.position.lerpVectors(fromPosition, toPosition, t);
		controls.target.lerpVectors(fromTarget, toTarget, t);
		onTick();
		controls.update();
		if (t < 1) requestAnimationFrame(tick);
	};

	requestAnimationFrame(tick);
}
