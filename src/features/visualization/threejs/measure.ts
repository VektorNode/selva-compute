import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import type { LabelLayer, LabelHandle } from './label-layer';

/**
 * A two-click distance measurement tool — the CAD verb users expect. Click a point, click a second,
 * read the distance off a label on the connecting line; a third click starts a new measurement.
 *
 * Picking snaps to geometry so measurements are exact, not "wherever the ray happened to land":
 * on a mesh hit we snap to the nearest vertex of the struck triangle if it's within
 * {@link MeasureOptions.snapPixels} on screen, else use the raw hit point. This is a cheap local
 * snap (three candidate vertices), no spatial index — enough for clean vertex-to-vertex measurement
 * without the cost/complexity of full edge/midpoint snapping (a later refinement).
 *
 * The tool is dormant until {@link MeasureTool.setEnabled}(true). While enabled it intercepts clicks
 * (the caller forwards them and swallows the event when {@link MeasureTool.handleClick} returns
 * true) so measuring doesn't also select objects.
 */

export interface MeasureTool {
	setEnabled(enabled: boolean): void;
	isEnabled(): boolean;
	/** Process a click. Returns true if the tool consumed it (caller should not also select). */
	handleClick(event: MouseEvent): boolean;
	/** Clear the current measurement (markers, line, label). */
	clear(): void;
	dispose(): void;
}

export interface MeasureOptions {
	/** Snap to a vertex when the cursor is within this many screen pixels of it. Default 12. */
	snapPixels?: number;
	/** Marker + line color. Default yellow. */
	color?: THREE.ColorRepresentation;
	/** CSS class applied to the distance label, for styling. */
	labelClassName?: string;
	/** Format the distance number → label text. Default: 3 significant digits + " m". */
	format?: (distance: number) => string;
}

interface MeasureDeps {
	canvas: HTMLCanvasElement;
	scene: THREE.Scene;
	getActiveCamera: () => THREE.Camera;
	labelLayer: LabelLayer;
	options?: MeasureOptions;
}

const DEFAULT_SNAP_PIXELS = 12;
const DEFAULT_COLOR = 0xffcc00;
const defaultFormat = (d: number) => `${d.toPrecision(3)} m`;

/**
 * Snap a raycast hit to the nearest vertex of the struck triangle if it's within `snapPixels` on
 * screen; otherwise return the raw hit point. Pure (no DOM) so it's unit-testable: it takes the
 * screen size explicitly rather than reading the canvas. Exported for that reason.
 *
 * Falls back to the raw point for non-mesh hits (e.g. a curve) or geometry without a face/positions.
 */
export function snapToVertex(
	hit: THREE.Intersection,
	camera: THREE.Camera,
	screenSize: { width: number; height: number },
	snapPixels: number
): THREE.Vector3 {
	const raw = hit.point.clone();
	const mesh = hit.object as THREE.Mesh;
	if (!(mesh instanceof THREE.Mesh) || hit.face == null || !mesh.geometry) return raw;

	const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
	if (!pos) return raw;

	const toScreen = (worldP: THREE.Vector3): THREE.Vector2 => {
		const ndc = worldP.clone().project(camera);
		return new THREE.Vector2(
			((ndc.x + 1) / 2) * screenSize.width,
			((1 - ndc.y) / 2) * screenSize.height
		);
	};
	const rawScreen = toScreen(raw);

	let best = raw;
	let bestPx = snapPixels;
	for (const idx of [hit.face.a, hit.face.b, hit.face.c]) {
		const local = new THREE.Vector3().fromBufferAttribute(pos, idx);
		const world = local.applyMatrix4(mesh.matrixWorld);
		const px = toScreen(world).distanceTo(rawScreen);
		if (px < bestPx) {
			bestPx = px;
			best = world;
		}
	}
	return best;
}

export function createMeasureTool(deps: MeasureDeps): MeasureTool {
	const { canvas, scene, getActiveCamera, labelLayer, options = {} } = deps;
	const snapPixels = options.snapPixels ?? DEFAULT_SNAP_PIXELS;
	const color = new THREE.Color(options.color ?? DEFAULT_COLOR);
	const format = options.format ?? defaultFormat;

	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();

	let enabled = false;
	const points: THREE.Vector3[] = [];

	// Visuals, created lazily and reused. Markers are small always-on-top points; the line connects
	// them; the label rides the line's midpoint.
	const markers: THREE.Points[] = [];
	let line: Line2 | null = null;
	let label: LabelHandle | null = null;

	const markerMaterial = new THREE.PointsMaterial({
		color,
		size: 8,
		sizeAttenuation: false,
		depthTest: false // markers stay visible through geometry, like CAD snap dots
	});

	const makeMarker = (p: THREE.Vector3): THREE.Points => {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute([p.x, p.y, p.z], 3));
		const marker = new THREE.Points(geometry, markerMaterial);
		marker.renderOrder = 999;
		marker.userData.id = 'measure'; // excluded from pick/fit
		marker.raycast = () => {}; // don't let markers be measure targets themselves
		scene.add(marker);
		return marker;
	};

	const clear = () => {
		points.length = 0;
		markers.forEach((m) => {
			m.geometry.dispose();
			m.removeFromParent();
		});
		markers.length = 0;
		if (line) {
			line.geometry.dispose();
			(line.material as LineMaterial).dispose();
			line.removeFromParent();
			line = null;
		}
		label?.remove();
		label = null;
	};

	const drawMeasurement = () => {
		if (points.length !== 2) return;
		const [a, b] = points;

		const geometry = new LineGeometry();
		geometry.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
		const material = new LineMaterial({ color });
		(material as LineMaterial & { linewidth: number; depthTest: boolean }).linewidth = 2;
		material.depthTest = false;

		line = new Line2(geometry, material);
		line.renderOrder = 998;
		line.userData.id = 'measure';
		line.raycast = () => {};
		scene.add(line);

		const mid = a.clone().add(b).multiplyScalar(0.5);
		label = labelLayer.addLabel(format(a.distanceTo(b)), mid, options.labelClassName);
	};

	const handleClick = (event: MouseEvent): boolean => {
		if (!enabled) return false;

		// A third click after a completed measurement starts fresh.
		if (points.length === 2) clear();

		const rect = canvas.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		const camera = getActiveCamera();
		raycaster.setFromCamera(pointer, camera);
		const hits = raycaster
			.intersectObjects(scene.children, true)
			.filter((i) => i.object.userData.id !== 'measure' && i.object.userData.id !== 'grid');

		if (hits.length === 0) return true; // consumed: a measuring click that missed still isn't a select

		const point = snapToVertex(hits[0], camera, { width: rect.width, height: rect.height }, snapPixels);
		points.push(point);
		markers.push(makeMarker(point));

		if (points.length === 2) drawMeasurement();
		return true;
	};

	return {
		setEnabled: (value) => {
			enabled = value;
			if (!value) clear();
		},
		isEnabled: () => enabled,
		handleClick,
		clear,
		dispose: () => {
			clear();
			markerMaterial.dispose();
		}
	};
}
