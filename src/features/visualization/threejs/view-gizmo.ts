import * as THREE from 'three';
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { CameraController } from './camera-controller';

/**
 * The corner nav-cube/axis gizmo. Wraps three's {@link ViewHelper} (the standard, well-tested
 * widget) and uses its built-in click → animate behavior, which we keep rather than reimplement:
 * ViewHelper's hit-test depends on private internals (`dim`, `interactiveObjects`, viewport math),
 * so replicating it is fragile. We let it drive the perspective camera directly.
 *
 * Two integration points with the viewer's dual-camera setup:
 *  1. Before each click we point `helper.center` at the live orbit target, so the snap rotates about
 *     what the user is looking at (not the world origin).
 *  2. ViewHelper only drives the perspective camera. The nav cube is inherently a 3D-orientation
 *     tool, so if the viewer is in orthographic (2D) mode when the gizmo is clicked, we first flip
 *     back to perspective — then ViewHelper animates as usual. Using the cube returns you to 3D.
 *
 * Caller responsibilities (mirror ViewHelper's own contract):
 *  - call {@link ViewGizmo.render} *after* the main scene render each frame (overlay viewport),
 *  - call {@link ViewGizmo.update} each frame with the frame delta (drives the snap animation),
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
	/** The perspective (primary) camera ViewHelper orients and animates. */
	camera: THREE.PerspectiveCamera;
	domElement: HTMLElement;
	controls: OrbitControls;
	controller: CameraController;
}

export function createViewGizmo(deps: ViewGizmoDeps): ViewGizmo {
	const { camera, domElement, controls, controller } = deps;

	const helper = new ViewHelper(camera, domElement);
	helper.setLabels('X', 'Y', 'Z');

	let visible = true;

	const handleClick = (event: MouseEvent): boolean => {
		if (!visible) return false;

		// Rotate the snap about what the user is looking at.
		helper.center.copy(controls.target);

		// ViewHelper hit-tests and (on a hit) animates the perspective camera. Run it first so a click
		// that MISSES the cube changes nothing.
		const hit = helper.handleClick(event);
		if (!hit) return false;

		// On a hit: the cube orients in 3D, so if we were in 2D, switch to perspective — the camera
		// ViewHelper just started animating — so the snap is what gets rendered.
		if (controller.getProjection() === 'orthographic') {
			controller.setProjection('perspective');
		}
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
