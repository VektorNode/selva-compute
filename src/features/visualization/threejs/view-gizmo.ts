import * as THREE from 'three';
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js';

import type { CameraController } from './camera-controller';

/**
 * The corner nav-cube/axis gizmo. Uses three's {@link ViewHelper} purely as the rendered widget, but
 * NOT its click→animate behavior: ViewHelper's built-in snap assumes a Y-up world and animates the
 * camera straight onto the up axis, which in our Z-up scene rolls the view and makes the gizmo jitter
 * at the pole. Instead we hit-test the axis sprites ourselves and drive the viewer's up-aware camera
 * controller, which snaps (no animation) with a pole nudge so the orbit basis never degenerates.
 *
 * Integration points with the viewer's dual-camera setup:
 *  1. The snap frames the current orbit target via the controller, so it rotates about what the user
 *     is looking at (not the world origin).
 *  2. The nav cube is inherently a 3D-orientation tool, so if the viewer is in orthographic (2D) mode
 *     when the gizmo is clicked, we first flip back to perspective.
 *
 * Caller responsibilities (mirror ViewHelper's own contract):
 *  - call {@link ViewGizmo.render} *after* the main scene render each frame (overlay viewport),
 *  - call {@link ViewGizmo.update} each frame (no-op now; kept for API symmetry),
 *  - forward pointer clicks to {@link ViewGizmo.handleClick}.
 */
export interface ViewGizmo {
	render(renderer: THREE.WebGLRenderer): void;
	update(delta: number): void;
	/** Hit-test a click. Returns true if it hit the gizmo (and a view change started). */
	handleClick(event: MouseEvent): boolean;
	readonly isAnimating: boolean;
	/** Show/hide the gizmo at runtime. Hidden = not rendered and not click-hittable. */
	setVisible(visible: boolean): void;
	isVisible(): boolean;
	dispose(): void;
}

interface ViewGizmoDeps {
	/** The perspective (primary) camera the gizmo visualizes and re-orients. */
	camera: THREE.PerspectiveCamera;
	domElement: HTMLElement;
	controller: CameraController;
}

export function createViewGizmo(deps: ViewGizmoDeps): ViewGizmo {
	const { camera, domElement, controller } = deps;

	const helper = new ViewHelper(camera, domElement);
	helper.setLabels('X', 'Y', 'Z');

	let visible = true;

	// Our own hit-test against the helper's axis sprites, mirroring ViewHelper's internal viewport math
	// (a `dim`×`dim` square in the corner given by `location`). We do this instead of ViewHelper's own
	// `handleClick` so the camera move goes through the viewer's up-aware controller — ViewHelper's
	// built-in snap assumes a Y-up world and animates straight onto the pole, which rolls the view and
	// makes the gizmo jitter in our Z-up scene.
	const DIM = 128;
	const raycaster = new THREE.Raycaster();
	const gizmoCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0, 4);
	gizmoCamera.position.set(0, 0, 2);

	// Map a clicked axis sprite to the world-space view direction (from target toward camera).
	const AXIS_DIRECTIONS: Record<string, THREE.Vector3> = {
		posX: new THREE.Vector3(1, 0, 0),
		negX: new THREE.Vector3(-1, 0, 0),
		posY: new THREE.Vector3(0, 1, 0),
		negY: new THREE.Vector3(0, -1, 0),
		posZ: new THREE.Vector3(0, 0, 1),
		negZ: new THREE.Vector3(0, 0, -1)
	};

	/** Which axis sprite (if any) a click landed on. Returns its `userData.type` or null. */
	const pickAxis = (event: MouseEvent): string | null => {
		const rect = domElement.getBoundingClientRect();
		// The gizmo viewport sits in the bottom-right corner (helper.location defaults: right/bottom 0).
		const offsetX = rect.left + domElement.offsetWidth - DIM - helper.location.right;
		const offsetY = rect.top + domElement.offsetHeight - DIM - helper.location.bottom;

		const mouse = new THREE.Vector2(
			((event.clientX - offsetX) / DIM) * 2 - 1,
			-((event.clientY - offsetY) / DIM) * 2 + 1
		);
		// Outside the gizmo square — not our click.
		if (Math.abs(mouse.x) > 1 || Math.abs(mouse.y) > 1) return null;

		// Orient the helper as it's rendered (inverse of the camera), so the sprites are where the user
		// sees them, then raycast the interactive axis sprites.
		helper.quaternion.copy(camera.quaternion).invert();
		helper.updateMatrixWorld();

		raycaster.setFromCamera(mouse, gizmoCamera);
		const hits = raycaster.intersectObjects(helper.children, false);
		for (const hit of hits) {
			const type = hit.object.userData?.type;
			if (typeof type === 'string' && type in AXIS_DIRECTIONS) return type;
		}
		return null;
	};

	const handleClick = (event: MouseEvent): boolean => {
		if (!visible) return false;

		const axis = pickAxis(event);
		if (!axis) return false;

		// The cube orients in 3D, so a click while in 2D returns us to perspective first.
		if (controller.getProjection() === 'orthographic') {
			controller.setProjection('perspective');
		}

		// Snap directly via the up-aware controller — no animation, no Y-up pole roll.
		controller.setViewDirection(AXIS_DIRECTIONS[axis]!, false);
		return true;
	};

	return {
		render: (renderer) => {
			if (!visible) return;
			// ViewHelper.render() calls renderer.render(this, orthoCamera), which with the default
			// autoClear=true clears the FULL framebuffer (to the scene's grey clear color) before drawing
			// the cube in its corner viewport — wiping the just-rendered scene. It only needs the depth
			// clear it does internally (clearDepth). So suppress the automatic color/depth clear here.
			const prevAutoClear = renderer.autoClear;
			renderer.autoClear = false;
			helper.render(renderer);
			renderer.autoClear = prevAutoClear;
		},
		// ViewHelper.update() unconditionally rewrites camera.position from (center, radius, q1) — at
		// rest (radius 0, center origin) that pins the camera to the origin every frame, blanking the
		// view. It's only meant to run while a click-snap is animating, so guard on `animating`.
		update: (delta) => {
			if (helper.animating) helper.update(delta);
		},
		handleClick,
		get isAnimating() {
			return helper.animating;
		},
		setVisible: (value) => {
			visible = value;
		},
		isVisible: () => visible,
		dispose: () => helper.dispose()
	};
}
