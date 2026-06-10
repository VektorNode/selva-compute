/**
 * Demo: the full `initThree` viewer surface — every public runtime control in one place.
 *
 * Exercises what a host app can drive without any compute pipeline: selection, fit-to-view, the
 * camera controller (2D/3D + preset views + rotate lock), the grid, the nav-cube gizmo, mesh edge
 * overlays, ambient occlusion, and the two-click measurement tool. Geometry is plain THREE
 * primitives added through the shared playground.
 *
 * Optional subsystems whose handles must exist at runtime (grid, gizmo, measure) are enabled at
 * construction; their controls then drive the live handle. Ambient occlusion and edges are fully
 * live — toggled on/off here via `setAmbientOcclusion`, `applyEdges`, and `removeEdges`.
 */
import * as THREE from 'three';

import { createPlayground } from '../shared/playground';
import { removeEdges } from '@/features/visualization/threejs/edges';
import type { ViewPreset } from '@/features/visualization/threejs/camera-controller';

const pg = createPlayground({
	title: 'Viewer — Full API',
	axes: false, // the grid gives us orientation; axes would clutter it
	viewer: {
		floor: { enabled: false },
		// Enable the subsystems whose handles must exist at runtime. AO and edges start off and are
		// toggled live below.
		grid: { enabled: true, cellSize: 1, fadeDistance: 60 },
		gizmo: { enabled: true },
		edges: { width: 1.5 },
		measure: { enabled: true },
		render: { aoIntensity: 0.9 },
		events: {
			onObjectSelected: (obj) =>
				pg.setStatus(
					`Selected: ${obj.name || obj.type}\n` +
						`pos: ${obj.position
							.toArray()
							.map((v) => v.toFixed(2))
							.join(', ')}`
				),
			onBackgroundClicked: () => pg.setStatus(defaultHint)
		}
	}
});

const { viewer } = pg;
const defaultHint = 'Click a mesh to select.\nDouble-click to zoom.\nEnable Measure, then click two points.';

let meshCount = 0;
let edgesOn = false; // tracks the Edges toggle so newly-added meshes stay consistent

function addMesh(geo: THREE.BufferGeometry, name: string, hue: number) {
	const mesh = new THREE.Mesh(
		geo,
		new THREE.MeshStandardMaterial({
			color: new THREE.Color().setHSL(hue, 0.6, 0.5),
			roughness: 0.5,
			metalness: 0.1
		})
	);
	mesh.name = name;
	// Scene is Z-up: scatter across the floor (X/Y) and lift along Z so meshes rest on it.
	mesh.position.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 0.75);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	pg.addObjects([mesh]);
	meshCount++;
	if (edgesOn) viewer.applyEdges(mesh); // keep new meshes consistent with the current edge toggle
}

/** A small cloud of points scattered above the floor — measurement targets that snap to each vertex. */
function addPoints(name: string, hue: number) {
	const verts: number[] = [];
	for (let i = 0; i < 24; i++) {
		verts.push((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 0.5 + Math.random() * 3);
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
	const points = new THREE.Points(
		geo,
		new THREE.PointsMaterial({
			color: new THREE.Color().setHSL(hue, 0.7, 0.6),
			size: 8,
			sizeAttenuation: false
		})
	);
	points.name = name;
	pg.addObjects([points]);
}

/** A sampled 3D curve drawn as a polyline — measure between its segment endpoints. */
function addCurve(name: string, hue: number) {
	const curve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(-4, -2, 0.5),
		new THREE.Vector3(-1, 2, 2.5),
		new THREE.Vector3(2, -1, 1.5),
		new THREE.Vector3(4, 3, 3)
	]);
	const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(60));
	const line = new THREE.Line(
		geo,
		new THREE.LineBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.7, 0.5) })
	);
	line.name = name;
	pg.addObjects([line]);
}

let pointsCount = 0;
let curveCount = 0;

function randomScene() {
	pg.clearObjects();
	meshCount = 0;
	pointsCount = 0;
	curveCount = 0;
	// Three's cylinder/cone/torus are built Y-up; rotate them into the Z-up scene so they stand on
	// the grid instead of lying on their sides.
	const geos: Array<() => THREE.BufferGeometry> = [
		() => new THREE.BoxGeometry(1 + Math.random(), 1 + Math.random(), 1 + Math.random()),
		() => new THREE.SphereGeometry(0.4 + Math.random() * 0.6, 24, 24),
		() => new THREE.CylinderGeometry(0.3, 0.5, 1 + Math.random(), 16).rotateX(Math.PI / 2),
		() => new THREE.TorusGeometry(0.5, 0.2, 12, 48).rotateX(Math.PI / 2),
		() => new THREE.ConeGeometry(0.5, 1.5, 16).rotateX(Math.PI / 2)
	];
	for (let i = 0; i < 12; i++) {
		addMesh(geos[Math.floor(Math.random() * geos.length)](), `Mesh_${meshCount}`, i / 12);
	}
	// A point cloud and a curve too, so the measure tool has line/point targets to snap to.
	addPoints(`Points_${pointsCount++}`, 0.6);
	addCurve(`Curve_${curveCount++}`, 0.95);
	requestAnimationFrame(() => viewer.fitToView());
	pg.setStatus(defaultHint);
}

// ── Geometry ────────────────────────────────────────────────────────────────
pg.addSection('Geometry');
pg.addButton('Add Box', () => addMesh(new THREE.BoxGeometry(1, 1, 1), `Box_${meshCount}`, Math.random()));
pg.addButton('Add Sphere', () =>
	addMesh(new THREE.SphereGeometry(0.6, 32, 32), `Sphere_${meshCount}`, Math.random())
);
pg.addButton('Add Torus', () =>
	addMesh(
		new THREE.TorusGeometry(0.6, 0.25, 16, 64).rotateX(Math.PI / 2),
		`Torus_${meshCount}`,
		Math.random()
	)
);
pg.addButton('Add Points', () => addPoints(`Points_${pointsCount++}`, Math.random()));
pg.addButton('Add Curve', () => addCurve(`Curve_${curveCount++}`, Math.random()));
pg.addButton('Random Scene', randomScene);
pg.addButton('Clear', () => {
	pg.clearObjects();
	pg.setStatus('Scene cleared.');
});

// ── Projection & preset views (cameraController) ──────────────────────────────
pg.addSection('Projection & Views');
pg.addToggle('Orthographic (2D)', false, (on) => {
	viewer.cameraController.setProjection(on ? 'orthographic' : 'perspective');
});
pg.addToggle('Rotate', viewer.cameraController.isRotateEnabled(), (on) => {
	viewer.cameraController.setRotateEnabled(on);
});
const presets: ViewPreset[] = ['top', 'front', 'right', 'back', 'left', 'bottom', 'iso'];
pg.addSelect('Go to view', ['—', ...presets], '—', (v) => {
	if (v !== '—') viewer.cameraController.setView(v as ViewPreset);
});

// ── Display aids (grid + gizmo) ───────────────────────────────────────────────
pg.addSection('Display');
pg.addToggle('Grid', true, (on) => viewer.grid?.setVisible(on));
pg.addToggle('Nav Cube', true, (on) => viewer.gizmo?.setVisible(on));

// ── Edges (live applyEdges / removeEdges) ─────────────────────────────────────
pg.addSection('Edges');
pg.addToggle('Mesh Edges', false, (on) => {
	edgesOn = on;
	if (on) viewer.applyEdges(viewer.scene);
	else removeEdges(viewer.scene);
});

// ── Measurement ───────────────────────────────────────────────────────────────
pg.addSection('Measurement');
pg.addToggle('Measure Tool', false, (on) => {
	viewer.measureTool?.setEnabled(on);
	pg.setStatus(on ? 'Measure: click two points to read the distance.' : defaultHint);
});
pg.addButton('Clear Measurement', () => viewer.measureTool?.clear());

// ── Rendering ─────────────────────────────────────────────────────────────────
pg.addSection('Rendering');
pg.addToggle('Ambient Occlusion', false, (on) => viewer.setAmbientOcclusion(on));

randomScene();
