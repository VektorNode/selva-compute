/**
 * Shared playground shell for the @selvajs/compute examples.
 *
 * Every demo is a small module that calls {@link createPlayground} to get a ready THREE viewer
 * (via the library's own `initThree`), a sidebar to hang controls on, and a status line. The goal:
 * a new demo is "set up the viewer, add some objects, write a status" — no boilerplate per file.
 *
 * Runs under Vite (`pnpm example`), which transpiles these `.ts` imports and resolves the `@` alias.
 * Opening the HTML directly via `file://` or a static server (Live Server) will NOT work — the
 * browser can't transpile TypeScript or resolve bare imports.
 */
import * as THREE from 'three';

import { initThree } from '@/features/visualization/threejs/three-initializer';
import type { ThreeInitializerOptions } from '@/features/visualization/types';

export interface Playground {
	/** The library viewer handle (scene, camera, controls, fitToView, dispose, …). */
	viewer: ReturnType<typeof initThree>;
	/** Sidebar container — add buttons/labels here, or use the {@link addButton} helpers. */
	sidebar: HTMLElement;
	/** Add a clickable action button to the sidebar. Returns the element for further tweaking. */
	addButton(label: string, onClick: () => void): HTMLButtonElement;
	/**
	 * Add an on/off toggle button that tracks its own state and reflects it in the label + `.active`
	 * style. `onChange` receives the new state. Returns a `set(value)` to drive it programmatically.
	 */
	addToggle(
		label: string,
		initial: boolean,
		onChange: (on: boolean) => void
	): { set(value: boolean): void };
	/** Add a labelled range slider with a live value readout. Returns a `set(value)`. */
	addSlider(
		label: string,
		opts: { min: number; max: number; step: number; value: number },
		onChange: (value: number) => void
	): { set(value: number): void };
	/** Add a labelled dropdown. Returns a `set(value)`. */
	addSelect(
		label: string,
		options: string[],
		value: string,
		onChange: (value: string) => void
	): { set(value: string): void };
	/** Add a labelled section header in the sidebar. */
	addSection(title: string): void;
	/** Write a line (or lines) to the status panel. Replaces previous content. */
	setStatus(text: string): void;
	/** Remove every renderable the demo added, keeping lights/floor/helpers from initThree. */
	clearObjects(): void;
	/** Add objects to the scene and track them so {@link clearObjects} can remove them. */
	addObjects(objects: THREE.Object3D[]): void;
}

export interface PlaygroundOptions {
	/** Demo title shown at the top of the sidebar. */
	title: string;
	/** Passed straight through to the library's `initThree`. */
	viewer?: ThreeInitializerOptions;
	/** Add an XYZ axis gizmo at the origin so an empty scene still shows something. Default true. */
	axes?: boolean;
}

/**
 * Mount the playground into the page. Expects two elements to exist: `#sidebar` and `#viewer-canvas`
 * (the demo HTML provides them via the shared template — see any `demos/*.html`).
 */
export function createPlayground(options: PlaygroundOptions): Playground {
	const { title, viewer: viewerOptions, axes = true } = options;

	const sidebar = requireEl('sidebar');
	const canvas = requireEl<HTMLCanvasElement>('viewer-canvas');

	renderSidebarHeader(sidebar, title);
	const statusEl = renderStatusPanel(sidebar);

	// No HDR ships with the examples, so default environment lighting off unless a demo opts in;
	// otherwise HDRLoader hits the SPA fallback and throws on render.
	// Surface any init failure on the page — a thrown initThree leaves a blank canvas otherwise.
	let viewer: ReturnType<typeof initThree>;
	try {
		viewer = initThree(canvas, {
			...viewerOptions,
			environment: {
				enableEnvironmentLighting: false,
				...viewerOptions?.environment
			}
		});
	} catch (err) {
		statusEl.textContent = `initThree threw:\n${err instanceof Error ? err.stack || err.message : String(err)}`;
		throw err;
	}

	if (axes) viewer.scene.add(new THREE.AxesHelper(10));

	// Objects the demo adds, so we can clear just those without touching lights/floor/axes.
	const tracked = new Set<THREE.Object3D>();

	const addObjects = (objects: THREE.Object3D[]) => {
		for (const obj of objects) {
			viewer.scene.add(obj);
			tracked.add(obj);
		}
	};

	const clearObjects = () => {
		for (const obj of tracked) {
			disposeObject(obj);
			obj.removeFromParent();
		}
		tracked.clear();
	};

	const addSection = (sectionTitle: string) => {
		const el = document.createElement('div');
		el.className = 'section-title';
		el.textContent = sectionTitle;
		sidebar.appendChild(el);
	};

	const addButton = (label: string, onClick: () => void) => {
		const btn = document.createElement('button');
		btn.textContent = label;
		btn.addEventListener('click', onClick);
		sidebar.appendChild(btn);
		return btn;
	};

	const addToggle = (label: string, initial: boolean, onChange: (on: boolean) => void) => {
		let on = initial;
		const render = () => {
			btn.textContent = `${label}: ${on ? 'On' : 'Off'}`;
			btn.classList.toggle('active', on);
		};
		const btn = addButton(label, () => {
			on = !on;
			render();
			onChange(on);
		});
		render();
		return {
			set(value: boolean) {
				on = value;
				render();
			}
		};
	};

	const addSlider = (
		label: string,
		opts: { min: number; max: number; step: number; value: number },
		onChange: (value: number) => void
	) => {
		const wrap = document.createElement('label');
		wrap.className = 'control-row';
		const text = document.createElement('span');
		const input = document.createElement('input');
		input.type = 'range';
		input.min = String(opts.min);
		input.max = String(opts.max);
		input.step = String(opts.step);
		input.value = String(opts.value);
		const render = (v: number) => {
			text.textContent = `${label}: ${v}`;
		};
		render(opts.value);
		input.addEventListener('input', () => {
			const v = Number(input.value);
			render(v);
			onChange(v);
		});
		wrap.append(text, input);
		sidebar.appendChild(wrap);
		return {
			set(value: number) {
				input.value = String(value);
				render(value);
			}
		};
	};

	const addSelect = (
		label: string,
		options: string[],
		value: string,
		onChange: (value: string) => void
	) => {
		const wrap = document.createElement('label');
		wrap.className = 'control-row';
		const text = document.createElement('span');
		text.textContent = label;
		const select = document.createElement('select');
		for (const opt of options) {
			const o = document.createElement('option');
			o.value = opt;
			o.textContent = opt;
			if (opt === value) o.selected = true;
			select.appendChild(o);
		}
		select.addEventListener('change', () => onChange(select.value));
		wrap.append(text, select);
		sidebar.appendChild(wrap);
		return {
			set(v: string) {
				select.value = v;
			}
		};
	};

	const setStatus = (text: string) => {
		statusEl.textContent = text;
	};

	// Built-in camera section every demo gets for free.
	addSection('Camera');
	addButton('Fit to View (F)', () => viewer.fitToView());
	addToggle('Auto Rotate', viewer.controls.autoRotate, (on) => {
		viewer.controls.autoRotate = on;
	});

	// Performance / debug HUD pinned to the top-right of the viewport. Always on — it's the first thing
	// you want when a demo misbehaves (blank canvas, runaway camera, draw-call spikes).
	mountDebugHud(viewer);

	return {
		viewer,
		sidebar,
		addButton,
		addToggle,
		addSlider,
		addSelect,
		addSection,
		setStatus,
		clearObjects,
		addObjects
	};
}

/**
 * A fixed, always-on debug/perf HUD in the top-right corner of the viewport. Reports FPS, the
 * renderer's draw-call/triangle counts, the active camera's position/target/distance, and the
 * gizmo's animation state — the readouts that pinpoint a blank canvas or a collapsed camera at a
 * glance. Reads from the live `viewer` handle; no per-demo wiring needed.
 */
function mountDebugHud(viewer: ReturnType<typeof initThree>): void {
	const hud = document.createElement('pre');
	hud.id = 'debug-hud';
	hud.style.cssText =
		'position:fixed;top:6px;right:6px;z-index:9999;margin:0;padding:6px 8px;' +
		'background:rgba(0,0,0,.6);color:#3f6;font:10px/1.35 monospace;white-space:pre;' +
		'pointer-events:none;border-radius:4px';
	document.body.appendChild(hud);

	const fmt = (v: THREE.Vector3) =>
		`${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}`;

	let frames = 0;
	let fps = 0;
	let fpsWindowStart = performance.now();

	const tick = () => {
		frames++;
		const now = performance.now();
		if (now - fpsWindowStart >= 500) {
			fps = Math.round((frames * 1000) / (now - fpsWindowStart));
			frames = 0;
			fpsWindowStart = now;
		}

		const cam = viewer.cameraController.getActiveCamera();
		const target = viewer.controls.target;
		const info = viewer.renderer.info.render;
		hud.textContent =
			`fps      ${fps}\n` +
			`calls    ${info.calls}\n` +
			`tris     ${info.triangles}\n` +
			`proj     ${viewer.cameraController.getProjection()}\n` +
			`cam      ${fmt(cam.position)}\n` +
			`target   ${fmt(target)}\n` +
			`dist     ${cam.position.distanceTo(target).toFixed(2)}\n` +
			`gizmo    ${viewer.gizmo?.isAnimating ? 'animating' : 'idle'}`;

		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

function requireEl<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Playground: missing #${id} element in the page.`);
	return el as T;
}

function renderSidebarHeader(sidebar: HTMLElement, title: string) {
	const h2 = document.createElement('h2');
	h2.textContent = title;
	sidebar.appendChild(h2);

	const back = document.createElement('a');
	back.href = './index.html';
	back.textContent = '← All examples';
	back.className = 'back-link';
	sidebar.appendChild(back);
}

function renderStatusPanel(sidebar: HTMLElement): HTMLElement {
	const title = document.createElement('div');
	title.className = 'section-title';
	title.textContent = 'Status';
	sidebar.appendChild(title);

	const panel = document.createElement('div');
	panel.id = 'status-panel';
	panel.textContent = 'Ready.';
	sidebar.appendChild(panel);
	return panel;
}

/** Dispose geometry + materials (and their textures) in a subtree. Mirrors the library's cleanup. */
function disposeObject(root: THREE.Object3D) {
	root.traverse((child) => {
		const renderable = child as Partial<THREE.Mesh> & THREE.Object3D;
		renderable.geometry?.dispose();
		const material = renderable.material;
		if (!material) return;
		const materials = Array.isArray(material) ? material : [material];
		for (const m of materials) {
			for (const value of Object.values(m)) {
				if (value instanceof THREE.Texture) value.dispose();
			}
			m.dispose();
		}
	});
}
