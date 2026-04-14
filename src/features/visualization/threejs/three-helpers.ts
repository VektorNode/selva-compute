import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getLogger } from '@/core';

// Camera configuration constants
const CAMERA_CONFIG = {
	HUGE_THRESHOLD: 10000,
	LARGE_THRESHOLD: 1000,
	SCALE_RATIO_THRESHOLD: 100,
	NEAR_PLANE_FACTOR: {
		TINY: 0.0001,
		SMALL: 0.001,
		NORMAL: 0.01
	},
	FAR_PLANE_FACTOR: {
		HUGE: 100,
		LARGE: 50,
		NORMAL: 20
	},
	INITIAL_DISTANCE_MULTIPLIER: 4
};

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

	// Add new meshes to scene
	meshes.forEach((mesh) => {
		scene.add(mesh);
	});

	// Calculate bounds of the new content
	const unionBoundingBox = computeCombinedBoundingBox(meshes);

	// Get the center of the union bounding box
	const center = unionBoundingBox.getCenter(new THREE.Vector3());
	const size = unionBoundingBox.getSize(new THREE.Vector3());

	// Calculate a distance that is slightly larger than the largest dimension of the union bounding box
	const maxDim = Math.max(size.x, size.y, size.z);

	// Always update camera frustum to ensure geometry is visible
	// This prevents clipping when geometry size changes significantly
	const scaleRatio = maxDim / Math.min(size.x || 1, size.y || 1, size.z || 1);

	if (scaleRatio > CAMERA_CONFIG.SCALE_RATIO_THRESHOLD || maxDim > CAMERA_CONFIG.HUGE_THRESHOLD) {
		// Large scale range detected - use logarithmic depth buffer approach
		camera.near = maxDim * CAMERA_CONFIG.NEAR_PLANE_FACTOR.TINY;
		camera.far = maxDim * CAMERA_CONFIG.FAR_PLANE_FACTOR.HUGE;
	} else if (maxDim > CAMERA_CONFIG.LARGE_THRESHOLD) {
		// Large scene
		camera.near = maxDim * CAMERA_CONFIG.NEAR_PLANE_FACTOR.SMALL;
		camera.far = maxDim * CAMERA_CONFIG.FAR_PLANE_FACTOR.LARGE;
	} else {
		// Normal scene
		camera.near = Math.max(0.01, maxDim * CAMERA_CONFIG.NEAR_PLANE_FACTOR.NORMAL);
		camera.far = Math.max(2000, maxDim * CAMERA_CONFIG.FAR_PLANE_FACTOR.NORMAL);
	}

	camera.updateProjectionMatrix();

	// Only reposition camera and controls on first frame
	if (!initialPositionSet) {
		const distance = maxDim * CAMERA_CONFIG.INITIAL_DISTANCE_MULTIPLIER;

		camera.position.set(center.x + distance * 0.8, center.y + distance, center.z + distance * 1.2);
		controls.target.copy(center);
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

/**
 * Computes the combined world-axis-aligned bounding box of a set of meshes.
 * Correctly accounts for mesh transformations (rotation, position, scale).
 */
export function computeCombinedBoundingBox(meshes: THREE.Mesh[]): THREE.Box3 {
	const combinedBoundingBox = new THREE.Box3();
	if (meshes.length === 0) return combinedBoundingBox;
	meshes.forEach((mesh) => {
		// Ensure the world matrix is up to date before calculating the box
		mesh.updateMatrixWorld(true);
		const bbox = new THREE.Box3().setFromObject(mesh);
		combinedBoundingBox.union(bbox);
	});
	return combinedBoundingBox;
}

/**
 * Clears the given THREE.Scene by removing all non-floor top-level children and
 * recursively disposing of their geometry and materials.
 *
 * Removes at the top level rather than traversing for meshes, so parent Groups
 * don't accumulate as ghost nodes after their mesh children are disposed.
 */
function clearScene(scene: THREE.Scene): void {
	// Snapshot children — we mutate the array via removeFromParent during iteration
	const topLevel = [...scene.children];

	topLevel.forEach((object) => {
		if (object.userData.id === 'floor') return;

		// Recursively dispose all meshes in this subtree
		object.traverse((child) => {
			if (!(child instanceof THREE.Mesh)) return;

			child.geometry?.dispose();

			const materials = Array.isArray(child.material) ? child.material : [child.material];
			materials.forEach((material) => {
				for (const key in material) {
					const value = material[key as keyof THREE.Material];
					if (value instanceof THREE.Texture) {
						value.dispose();
					}
				}
				material.dispose();
			});
		});

		object.removeFromParent();
	});
}
