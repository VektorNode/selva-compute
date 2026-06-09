import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { describe, expect, it } from 'vitest';

import { createCameraController } from '../camera-controller';

// The controller only reads `target`, `object`, `enableRotate`, and calls `update()` on controls —
// not the full OrbitControls (which needs a DOM). A minimal stub keeps the test environment 'node'.
function stubControls(camera: THREE.Camera) {
	return {
		target: new THREE.Vector3(0, 0, 0),
		object: camera as THREE.Camera,
		enableRotate: true,
		update: () => {}
	} as unknown as OrbitControls;
}

function makeController(up: THREE.Vector3) {
	const scene = new THREE.Scene();
	// One unit box at the origin so setView has content to frame.
	scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));

	const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 2000);
	camera.up.copy(up);
	const controls = stubControls(camera);

	const controller = createCameraController({
		scene,
		perspective: camera,
		controls,
		onActiveCameraChange: () => {},
		up
	});
	return { camera, controls, controller };
}

describe('camera-controller presets are up-aware', () => {
	it('Z-up: "top" places the camera along +Z above the target', () => {
		const up = new THREE.Vector3(0, 0, 1);
		const { camera, controls, controller } = makeController(up);

		controller.setView('top', false); // no animation: position is final immediately

		const dir = camera.position.clone().sub(controls.target).normalize();
		// Camera looks DOWN the up axis, so it sits on the +up side of the target.
		expect(dir.dot(up)).toBeGreaterThan(0.99);
	});

	it('Y-up: "top" places the camera along +Y above the target', () => {
		const up = new THREE.Vector3(0, 1, 0);
		const { camera, controls, controller } = makeController(up);

		controller.setView('top', false);

		const dir = camera.position.clone().sub(controls.target).normalize();
		expect(dir.dot(up)).toBeGreaterThan(0.99);
	});

	it('Z-up: "front" is orthogonal to up (a side view, not a top-down)', () => {
		const up = new THREE.Vector3(0, 0, 1);
		const { camera, controls, controller } = makeController(up);

		controller.setView('front', false);

		const dir = camera.position.clone().sub(controls.target).normalize();
		// Front faces across the ground plane: no up-component.
		expect(Math.abs(dir.dot(up))).toBeLessThan(0.01);
	});

	it('toggleProjection swaps perspective ⇄ orthographic and preserves the up axis', () => {
		const up = new THREE.Vector3(0, 0, 1);
		const { controller } = makeController(up);

		expect(controller.getProjection()).toBe('perspective');
		expect(controller.toggleProjection()).toBe('orthographic');
		const ortho = controller.getActiveCamera();
		expect(ortho).toBeInstanceOf(THREE.OrthographicCamera);
		expect(ortho.up.clone().normalize().dot(up)).toBeGreaterThan(0.99);
	});
});
