import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * An HTML label layer that tracks 3D positions, via three's {@link CSS2DRenderer}. Labels are real
 * DOM nodes (crisp text, CSS-stylable) positioned each frame to follow points in the scene — the
 * foundation for measurement readouts, dimension annotations, and point tags.
 *
 * The CSS2D renderer draws into its own absolutely-positioned DOM overlay stacked on top of the
 * WebGL canvas (pointer-events disabled so it never steals clicks from the viewer). The viewer owns
 * one of these; features like the measure tool add/remove labels through it.
 */

export interface LabelHandle {
	/** The CSS2DObject in the scene graph. */
	readonly object: CSS2DObject;
	/** Move the label to a new world position. */
	setPosition(position: THREE.Vector3): void;
	/** Replace the label's text/HTML. */
	setText(text: string): void;
	/** Remove the label from the scene and the DOM. */
	remove(): void;
}

export interface LabelLayer {
	/** Create a label at a world position. `className` lets callers theme groups of labels. */
	addLabel(text: string, position: THREE.Vector3, className?: string): LabelHandle;
	/** Render the DOM overlay. Call each frame after the WebGL render, with the active camera. */
	render(scene: THREE.Scene, camera: THREE.Camera): void;
	setSize(width: number, height: number): void;
	dispose(): void;
}

/**
 * @param container element to overlay labels onto — normally the canvas's parent, so the overlay and
 * canvas share a positioning context. The overlay is appended here and absolutely positioned.
 * @param scene labels are parented to a group added to this scene, so they render and follow the
 * camera without the caller wiring scene-graph parenting.
 */
export function createLabelLayer(container: HTMLElement, scene: THREE.Scene): LabelLayer {
	const renderer = new CSS2DRenderer();
	const dom = renderer.domElement;
	dom.style.position = 'absolute';
	dom.style.top = '0';
	dom.style.left = '0';
	// The overlay must never intercept viewer interaction. CSS2DRenderer sizes its root div to the
	// renderer size and stacks it above the canvas; without an explicit non-interactive, clipped box
	// it can cover the canvas and swallow orbit/clicks. Pin it to the container and clip overflow.
	dom.style.width = '100%';
	dom.style.height = '100%';
	dom.style.overflow = 'hidden';
	dom.style.pointerEvents = 'none';
	// The container is the canvas's positioning context; make sure it actually establishes one.
	if (getComputedStyle(container).position === 'static') {
		container.style.position = 'relative';
	}
	container.appendChild(dom);

	const size = { width: container.clientWidth || 1, height: container.clientHeight || 1 };
	renderer.setSize(size.width, size.height);

	// Labels live under a dedicated group so they're easy to find/exclude and removed en masse on
	// dispose. Tagged so pick/fit logic ignores it.
	const group = new THREE.Group();
	group.name = 'label-layer';
	group.userData.id = 'label-layer';
	scene.add(group);

	const labels = new Set<CSS2DObject>();

	const addLabel = (text: string, position: THREE.Vector3, className?: string): LabelHandle => {
		const el = document.createElement('div');
		el.textContent = text;
		if (className) {
			el.className = className;
		} else {
			// Default styling that stays legible on any background (light or dark scene/page): a dark
			// translucent pill with light text. Callers wanting their own look pass a className, which
			// opts out of all of this. Kept inline so the layer needs no external stylesheet.
			Object.assign(el.style, {
				padding: '2px 6px',
				borderRadius: '4px',
				background: 'rgba(20, 20, 20, 0.78)',
				color: '#fff',
				font: '12px/1.3 system-ui, sans-serif',
				// `pre` so a multi-line readout (e.g. total + per-axis deltas) keeps its line breaks.
				whiteSpace: 'pre',
				textAlign: 'center',
				userSelect: 'none'
			} satisfies Partial<CSSStyleDeclaration>);
		}
		// Individual labels stay non-interactive by default (the overlay is too, but be explicit so a
		// caller that opts a label into pointer-events doesn't get surprised by inherited none).
		el.style.pointerEvents = 'none';

		const object = new CSS2DObject(el);
		object.position.copy(position);
		group.add(object);
		labels.add(object);

		return {
			object,
			setPosition: (p) => object.position.copy(p),
			setText: (t) => {
				el.textContent = t;
			},
			remove: () => {
				object.removeFromParent();
				el.remove();
				labels.delete(object);
			}
		};
	};

	return {
		addLabel,
		render: (scene, camera) => renderer.render(scene, camera),
		setSize: (width, height) => renderer.setSize(width, height),
		dispose: () => {
			labels.forEach((object) => {
				object.removeFromParent();
				(object.element as HTMLElement).remove();
			});
			labels.clear();
			group.removeFromParent();
			dom.remove();
		}
	};
}
