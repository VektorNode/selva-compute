import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Optional postprocessing pipeline for ambient occlusion. Default-OFF: the viewer only constructs
 * this when `render.ambientOcclusion` is enabled, and otherwise renders with a plain
 * `renderer.render` so the cheap path stays cheap (the chosen tradeoff — see cad-viewer-plan.md).
 *
 * Pipeline: RenderPass → GTAOPass → OutputPass. GTAO (ground-truth AO) is the modern replacement for
 * SSAO/SAO — better contact shadows in crevices, the "engineered" depth cue. `screenSpaceRadius` is
 * on so the AO radius is in screen space, which keeps it scale-robust across the viewer's mm→m
 * scenes without per-scene tuning. OutputPass applies tone mapping + color space (taking over the
 * roles the renderer did directly in the non-composer path).
 *
 * Camera swaps: the active camera can flip perspective↔ortho. Rather than rebuild the composer, we
 * retarget the passes' `camera` each render via {@link setCamera}.
 */

export interface RenderPipeline {
	render(deltaTime: number): void;
	setSize(width: number, height: number, pixelRatio: number): void;
	/** Point the passes at the currently active camera (call when projection changes). */
	setCamera(camera: THREE.Camera): void;
	dispose(): void;
}

export interface RenderPipelineOptions {
	/** Tone mapping to apply in OutputPass (mirror the renderer's). */
	toneMapping: THREE.ToneMapping;
	toneMappingExposure: number;
	/** AO strength 0–1. Default 1. */
	aoIntensity?: number;
}

export function createRenderPipeline(
	renderer: THREE.WebGLRenderer,
	scene: THREE.Scene,
	camera: THREE.Camera,
	width: number,
	height: number,
	options: RenderPipelineOptions
): RenderPipeline {
	const composer = new EffectComposer(renderer);

	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	const gtaoPass = new GTAOPass(scene, camera, width, height);
	gtaoPass.blendIntensity = options.aoIntensity ?? 1;
	gtaoPass.updateGtaoMaterial({ screenSpaceRadius: true });
	composer.addPass(gtaoPass);

	const outputPass = new OutputPass();
	composer.addPass(outputPass);

	// OutputPass owns tone mapping in the composer path; match the renderer's settings.
	renderer.toneMapping = options.toneMapping;
	renderer.toneMappingExposure = options.toneMappingExposure;

	composer.setSize(width, height);

	return {
		render: (deltaTime) => composer.render(deltaTime),
		setSize: (w, h, pixelRatio) => {
			composer.setPixelRatio(pixelRatio);
			composer.setSize(w, h);
			gtaoPass.setSize(w, h);
		},
		setCamera: (cam) => {
			renderPass.camera = cam;
			gtaoPass.camera = cam;
		},
		// composer.dispose() doesn't free added passes — dispose them explicitly.
		dispose: () => {
			composer.dispose();
			gtaoPass.dispose();
			outputPass.dispose();
		}
	};
}
