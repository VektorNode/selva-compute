import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { snapToVertex, makeFormatter } from '../measure';

const SCREEN = { width: 800, height: 600 };

/** A camera aimed down -Z at the origin, far enough to see a unit quad. */
function frontCamera(): THREE.PerspectiveCamera {
	const cam = new THREE.PerspectiveCamera(50, SCREEN.width / SCREEN.height, 0.1, 100);
	cam.position.set(0, 0, 5);
	cam.lookAt(0, 0, 0);
	cam.updateMatrixWorld(true);
	return cam;
}

/** A 2x2 quad in the XY plane (two triangles), corners at (±1, ±1, 0). */
function quad(): THREE.Mesh {
	const geometry = new THREE.PlaneGeometry(2, 2);
	const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
	mesh.updateMatrixWorld(true);
	return mesh;
}

function hitAt(mesh: THREE.Mesh, point: THREE.Vector3, face: THREE.Face): THREE.Intersection {
	return { distance: 0, point: point.clone(), object: mesh, face } as THREE.Intersection;
}

describe('snapToVertex', () => {
	it('snaps to a corner vertex when the hit is near it on screen', () => {
		const mesh = quad();
		const camera = frontCamera();

		// PlaneGeometry triangle indices: one triangle is (0,2,1) → corners include (-1,1) and (1,1).
		const face = { a: 0, b: 2, c: 1, normal: new THREE.Vector3(0, 0, 1), materialIndex: 0 };
		// Hit just inside the top-right corner (1,1,0).
		const result = snapToVertex(
			hitAt(mesh, new THREE.Vector3(0.97, 0.97, 0), face),
			camera,
			SCREEN,
			12
		);

		// Snaps to an actual corner, not the raw point.
		expect(result.x).toBeCloseTo(1, 5);
		expect(result.y).toBeCloseTo(1, 5);
	});

	it('keeps the raw point when no vertex is within the snap radius', () => {
		const mesh = quad();
		const camera = frontCamera();
		const face = { a: 0, b: 2, c: 1, normal: new THREE.Vector3(0, 0, 1), materialIndex: 0 };

		const raw = new THREE.Vector3(0.1, 0.05, 0); // near the center, far from any corner
		const result = snapToVertex(hitAt(mesh, raw, face), camera, SCREEN, 12);

		expect(result.x).toBeCloseTo(raw.x, 5);
		expect(result.y).toBeCloseTo(raw.y, 5);
	});

	it('returns the raw point for a hit with no face (e.g. a non-mesh)', () => {
		const points = new THREE.Points(new THREE.BufferGeometry());
		const raw = new THREE.Vector3(3, 4, 5);
		const hit = { distance: 0, point: raw.clone(), object: points } as THREE.Intersection;

		expect(snapToVertex(hit, frontCamera(), SCREEN, 12)).toEqual(raw);
	});

	it('snaps to the nearer endpoint of a struck line segment', () => {
		// A line from (-1,0,0) to (1,0,0); segment 0 spans indices 0→1.
		const geometry = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(-1, 0, 0),
			new THREE.Vector3(1, 0, 0)
		]);
		const line = new THREE.Line(geometry, new THREE.LineBasicMaterial());
		line.updateMatrixWorld(true);
		const camera = frontCamera();

		// Hit near the right endpoint (1,0,0); index is the first vertex of the struck segment.
		const hit = {
			distance: 0,
			point: new THREE.Vector3(0.95, 0, 0),
			object: line,
			index: 0
		} as THREE.Intersection;

		const result = snapToVertex(hit, camera, SCREEN, 12);
		expect(result.x).toBeCloseTo(1, 5);
		expect(result.y).toBeCloseTo(0, 5);
	});

	it('snaps to the struck vertex of a Points object', () => {
		const geometry = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(0, 0, 0),
			new THREE.Vector3(0.5, 0.5, 0)
		]);
		const pointsObj = new THREE.Points(geometry, new THREE.PointsMaterial());
		pointsObj.updateMatrixWorld(true);

		// A Points hit lands slightly off the exact vertex; snapping should pull it onto index 1.
		const hit = {
			distance: 0,
			point: new THREE.Vector3(0.51, 0.49, 0),
			object: pointsObj,
			index: 1
		} as THREE.Intersection;

		const result = snapToVertex(hit, frontCamera(), SCREEN, 12);
		expect(result.x).toBeCloseTo(0.5, 5);
		expect(result.y).toBeCloseTo(0.5, 5);
	});

	it('respects the mesh world transform when snapping', () => {
		const mesh = quad();
		mesh.position.set(10, 0, 0); // shift the quad; corner now at (11, 1, 0)
		mesh.updateMatrixWorld(true);
		const camera = new THREE.PerspectiveCamera(50, SCREEN.width / SCREEN.height, 0.1, 100);
		camera.position.set(10, 0, 5);
		camera.lookAt(10, 0, 0);
		camera.updateMatrixWorld(true);

		const face = { a: 0, b: 2, c: 1, normal: new THREE.Vector3(0, 0, 1), materialIndex: 0 };
		const result = snapToVertex(
			hitAt(mesh, new THREE.Vector3(10.97, 0.97, 0), face),
			camera,
			SCREEN,
			12
		);

		expect(result.x).toBeCloseTo(11, 5);
		expect(result.y).toBeCloseTo(1, 5);
	});
});

describe('makeFormatter', () => {
	// Scene distances are in meters; the formatter converts to the model unit.
	it('defaults to meters', () => {
		expect(makeFormatter()(1.5)).toBe('1.50 m');
	});

	it('converts meters to millimeters', () => {
		expect(makeFormatter('Millimeters')(0.025)).toBe('25.0 mm');
	});

	it('converts meters to feet', () => {
		expect(makeFormatter('Feet')(1)).toBe('3.28 ft');
	});

	it('falls back to meters for an unknown unit', () => {
		expect(makeFormatter('Furlongs')(2)).toBe('2.00 m');
	});
});
