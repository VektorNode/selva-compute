import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getLogger } from '@/core';

/**
 * Updates the scene with the given meshes and camera settings.
 * If initialPositionSet is false, it positions the camera and sets the controls target based on the bounding boxes of the meshes.
 * @param scene - The THREE.Scene object to update.
 * @param meshes - An array of THREE.Mesh objects to add to the scene.
 * @param camera - The THREE.PerspectiveCamera object to position.
 * @param controls - The OrbitControls object to update.
 * @param initialPositionSet - A boolean indicating whether the initial position of the camera and controls have been set.
 */
export function updateScene(
	scene: THREE.Scene,
	meshes: THREE.Mesh[],
	camera: THREE.PerspectiveCamera,
	controls: OrbitControls,
	initialPositionSet: boolean
) {
	clearScene(scene);

	if (meshes.length === 0) return;

	const unionBoundingBox = new THREE.Box3();

	meshes.forEach((mesh) => {
		scene.add(mesh);
		const boundingBox = new THREE.Box3().setFromObject(mesh);
		unionBoundingBox.union(boundingBox);
	});

	// Get the center of the union bounding box
	const center = unionBoundingBox.getCenter(new THREE.Vector3());
	const size = unionBoundingBox.getSize(new THREE.Vector3());

	// Calculate a distance that is slightly larger than the largest dimension of the union bounding box
	const maxDim = Math.max(size.x, size.y, size.z);

	// Always update camera frustum to ensure geometry is visible
	// This prevents clipping when geometry size changes significantly
	const scaleRatio = maxDim / Math.min(size.x || 1, size.y || 1, size.z || 1);

	if (scaleRatio > 100 || maxDim > 10000) {
		// Large scale range detected - use logarithmic depth buffer approach
		camera.near = maxDim * 0.0001; // 0.01% of max dimension
		camera.far = maxDim * 100; // 100x max dimension
	} else if (maxDim > 1000) {
		// Large scene
		camera.near = maxDim * 0.001;
		camera.far = maxDim * 50;
	} else {
		// Normal scene
		camera.near = Math.max(0.01, maxDim * 0.01);
		camera.far = Math.max(2000, maxDim * 20);
	}

	camera.updateProjectionMatrix();

	// Only reposition camera and controls on first frame
	if (!initialPositionSet) {
		const distance = maxDim * 4;

		camera.position.set(center.x + distance * 0.8, center.y + distance, center.z + distance * 1.2);
		controls.target = center;
		controls.minDistance = camera.near * 2;
		controls.maxDistance = camera.far * 0.9;

		controls.update();
	} else {
		// Update control constraints to match new frustum
		controls.minDistance = camera.near * 2;
		controls.maxDistance = camera.far * 0.9;
	}
}

// =========================
// Helper functions
// =========================

/**
 * Parses a color string in multiple formats to a THREE.Color object.
 * Supported formats:
 * - Hex: "#C7A5A5", "C7A5A5"
 * - RGB: "199, 165, 165"
 * - CSS named colors: "red", "blue", etc.
 * @param colorString - The color string to parse.
 * @returns A THREE.Color object.
 */
export function parseColor(colorString: string): THREE.Color {
	if (!colorString || typeof colorString !== 'string') {
		getLogger().warn(`Invalid color input: ${colorString}, using white`);
		return new THREE.Color(0xffffff);
	}

	const trimmed = colorString.trim();

	// Try hex format (#C7A5A5 or C7A5A5)
	if (trimmed.startsWith('#') || /^[0-9A-Fa-f]{6}$/.test(trimmed)) {
		try {
			const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
			return new THREE.Color(hex);
		} catch {
			getLogger().warn(`Invalid hex color: ${colorString}, using white`);
			return new THREE.Color(0xffffff);
		}
	}

	// Try RGB format (R, G, B)
	if (trimmed.includes(',')) {
		const rgb = trimmed.split(',').map((c) => parseInt(c.trim(), 10));
		if (rgb.length === 3 && rgb.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
			return new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
		}
	}

	// Try CSS named color
	try {
		return new THREE.Color(trimmed.toLowerCase());
	} catch {
		getLogger().warn(`Invalid color string: ${colorString}, using white`);
		return new THREE.Color(0xffffff);
	}
}

export function applyOffset(meshes: THREE.Mesh[], offsetY: number): void {
	meshes.forEach((mesh) => {
		mesh.position.y -= offsetY;
	});
}

export function computeCombinedBoundingBox(meshes: THREE.Mesh[]): THREE.Box3 {
	const combinedBoundingBox = new THREE.Box3();
	meshes.forEach((mesh) => {
		mesh.geometry.computeBoundingBox();
		if (mesh.geometry.boundingBox) {
			combinedBoundingBox.union(mesh.geometry.boundingBox);
		}
	});
	return combinedBoundingBox;
}

/**
 * Updates shadow camera bounds to match scene geometry.
 * This prevents shadow artifacts and ensures proper shadow coverage.
 */
export function updateShadowCameraBounds(
	scene: THREE.Scene,
	directionalLight: THREE.DirectionalLight
): void {
	const bbox = new THREE.Box3();

	scene.traverse((object) => {
		if (object instanceof THREE.Mesh && object.userData.id !== 'floor') {
			bbox.expandByObject(object);
		}
	});

	if (bbox.isEmpty()) return;

	const size = bbox.getSize(new THREE.Vector3());
	const center = bbox.getCenter(new THREE.Vector3());
	const maxDim = Math.max(size.x, size.y, size.z);

	// Position light relative to scene center
	const lightDistance = maxDim * 2;
	directionalLight.position.set(
		center.x + lightDistance * 0.5,
		center.y + lightDistance,
		center.z + lightDistance * 0.5
	);
	directionalLight.target.position.copy(center);

	// Adjust shadow camera bounds to scene size with padding
	const padding = maxDim * 0.2;
	directionalLight.shadow.camera.left = -maxDim / 2 - padding;
	directionalLight.shadow.camera.right = maxDim / 2 + padding;
	directionalLight.shadow.camera.top = maxDim / 2 + padding;
	directionalLight.shadow.camera.bottom = -maxDim / 2 - padding;
	directionalLight.shadow.camera.near = 0.1;
	directionalLight.shadow.camera.far = lightDistance * 3;

	// Improve shadow quality for extreme scales
	if (maxDim > 1000) {
		directionalLight.shadow.bias = -0.001;
		directionalLight.shadow.normalBias = 0.05;
	} else {
		directionalLight.shadow.bias = -0.0001;
		directionalLight.shadow.normalBias = 0.02;
	}

	directionalLight.shadow.camera.updateProjectionMatrix();
}

/**
 * Clears the given THREE.Scene by removing all meshes and disposing of associated resources.
 * @param scene - The THREE.Scene to clear.
 */
function clearScene(scene: THREE.Scene): void {
	const objectsToRemove: THREE.Object3D[] = [];

	// Collect all meshes except the floor
	scene.traverse((child: THREE.Object3D) => {
		if (child instanceof THREE.Mesh && child.userData.id !== 'floor') {
			objectsToRemove.push(child);
		}
	});

	// Remove and dispose of each object
	objectsToRemove.forEach((object: THREE.Object3D) => {
		if (object instanceof THREE.Mesh) {
			object.geometry?.dispose();

			const materials = Array.isArray(object.material) ? object.material : [object.material];
			materials.forEach((material) => {
				Object.values(material).forEach((value) => {
					if (value instanceof THREE.Texture) {
						value.dispose();
					}
				});
				material.dispose();
			});
		}

		object.removeFromParent();
	});
}
