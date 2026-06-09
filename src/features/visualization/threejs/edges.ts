import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/**
 * Crisp boundary/crease edges overlaid on meshes — the defining "technical drawing" look that makes
 * shaded geometry read as discrete objects rather than blobs.
 *
 * Built with `EdgesGeometry` (which keeps only edges whose adjacent faces meet above a threshold
 * angle, so flat tessellation noise is dropped) rendered as a fat `LineSegments2` using the same
 * `LineMaterial` family as curves (Phase 1) — so edges get controllable thickness, not the 1px cap
 * of `THREE.LineSegments`. The overlay is added as a *child* of each mesh, so it inherits the mesh's
 * transform and is disposed when the mesh subtree is cleared.
 */

export interface EdgeOptions {
	/** Edge color. Default near-black. */
	color?: THREE.ColorRepresentation;
	/** Edge thickness in CSS px. Default 1.5. */
	width?: number;
	/**
	 * Crease angle in degrees: an edge is kept only where its two faces differ by more than this.
	 * Default 30. Higher = fewer edges (only sharp creases); lower = more (catches gentle bends).
	 */
	thresholdAngle?: number;
}

/** Tag on edge overlays so pick/fit/clear logic can recognize and skip or dispose them. */
export const EDGE_USERDATA_KIND = 'edge-overlay';

const DEFAULT_EDGE_COLOR = 0x222222;
const DEFAULT_EDGE_WIDTH = 1.5;
const DEFAULT_THRESHOLD_ANGLE = 30;

/**
 * Walk an object subtree and attach an edge overlay to every `Mesh` found, returning the created
 * overlays (so callers can dispose them explicitly if they don't clear the whole subtree). Meshes
 * that already carry an overlay are skipped, so this is safe to call more than once.
 *
 * Skips the floor and the grid (they're aids, not content) and anything already tagged as an edge.
 */
export function addEdges(root: THREE.Object3D, options: EdgeOptions = {}): LineSegments2[] {
	const color = new THREE.Color(options.color ?? DEFAULT_EDGE_COLOR);
	const width = options.width ?? DEFAULT_EDGE_WIDTH;
	const thresholdAngle = options.thresholdAngle ?? DEFAULT_THRESHOLD_ANGLE;

	const created: LineSegments2[] = [];

	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		if (object.userData.id === 'floor' || object.userData.id === 'grid') return;
		if (object.userData.kind === EDGE_USERDATA_KIND) return;
		if (object.children.some((c) => c.userData?.kind === EDGE_USERDATA_KIND)) return; // already done
		if (!object.geometry) return;

		const overlay = buildEdgeOverlay(object.geometry, color, width, thresholdAngle);
		object.add(overlay); // child → inherits transform, disposed with the parent subtree
		created.push(overlay);
	});

	return created;
}

function buildEdgeOverlay(
	geometry: THREE.BufferGeometry,
	color: THREE.Color,
	width: number,
	thresholdAngle: number
): LineSegments2 {
	const edges = new THREE.EdgesGeometry(geometry, thresholdAngle);

	// EdgesGeometry yields a position attribute of line-segment endpoint pairs; LineSegmentsGeometry
	// consumes exactly that flat array.
	const lineGeometry = new LineSegmentsGeometry();
	lineGeometry.setPositions(Array.from(edges.attributes.position.array));
	edges.dispose(); // positions copied; the intermediate geometry is no longer needed

	// LineMaterialParameters omits linewidth/opacity from its type though both exist at runtime.
	const material = new LineMaterial({ color });
	(material as LineMaterial & { linewidth: number }).linewidth = width;
	// Pull edges slightly toward the camera in depth so they don't z-fight the shaded surface.
	material.polygonOffset = true;
	material.polygonOffsetFactor = -1;
	material.polygonOffsetUnits = -1;

	const overlay = new LineSegments2(lineGeometry, material);
	overlay.userData.kind = EDGE_USERDATA_KIND;
	overlay.raycast = () => {}; // never pickable; clicks should hit the mesh, not its outline
	return overlay;
}

/** Whether an object is an edge overlay (for pick/fit filters elsewhere). */
export function isEdgeOverlay(object: THREE.Object3D): boolean {
	return object.userData?.kind === EDGE_USERDATA_KIND;
}

/**
 * Remove every edge overlay under `root`, disposing its geometry and material. The inverse of
 * {@link addEdges}; together they make edges a live on/off toggle. Returns how many were removed.
 */
export function removeEdges(root: THREE.Object3D): number {
	const overlays: LineSegments2[] = [];
	root.traverse((object) => {
		if (object instanceof LineSegments2 && isEdgeOverlay(object)) overlays.push(object);
	});

	for (const overlay of overlays) {
		overlay.geometry.dispose();
		(overlay.material as LineMaterial).dispose();
		overlay.removeFromParent();
	}
	return overlays.length;
}
