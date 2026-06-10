import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { applyOffset, computeCombinedBoundingBox } from '../three-helpers';

function meshAt(x: number, y: number, z: number): THREE.Mesh {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
	mesh.position.set(x, y, z);
	return mesh;
}

describe('applyOffset', () => {
	it('shifts along z by default (the unified Z-up scene frame)', () => {
		// Regression: grounding used to shift position.y — sideways in a Z-up
		// scene — instead of dropping content onto the Z=0 ground plane.
		const mesh = meshAt(1, 2, 5);
		applyOffset([mesh], 3);
		expect(mesh.position.z).toBe(2);
		expect(mesh.position.x).toBe(1);
		expect(mesh.position.y).toBe(2);
	});

	it('shifts along an explicit axis', () => {
		const mesh = meshAt(0, 4, 0);
		applyOffset([mesh], 4, 'y');
		expect(mesh.position.y).toBe(0);
	});

	it('grounds content onto Z=0 when offset by the bounding-box min z', () => {
		const meshes = [meshAt(0, 0, 5), meshAt(2, 1, 8)];
		const box = computeCombinedBoundingBox(meshes);
		applyOffset(meshes, box.min.z, 'z');
		const after = computeCombinedBoundingBox(meshes);
		expect(after.min.z).toBeCloseTo(0);
	});
});
