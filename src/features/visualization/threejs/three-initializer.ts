import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

import { getLogger } from '@/core';
import { ThreeInitializerOptions } from '../types';

const defaultUp = new THREE.Vector3(0, 0, 1);

// Returns scale-specific values for mm, cm, and m scales
const getScaleValue = (scale: string, mmVal: number, cmVal: number, mVal: number): number => {
	switch (scale) {
		case 'mm':
			return mmVal;
		case 'cm':
			return cmVal;
		default:
			return mVal;
	}
};

/**
 * Initializes a Three.js environment with scene, camera, renderer, and event handling.
 */
export const initThree = function (
	canvas: HTMLCanvasElement,
	options?: ThreeInitializerOptions
): {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	renderer: THREE.WebGLRenderer;
	dispose: () => void;
	fitToView: () => void;
	clearSelection: () => void;
} {
	const config = applyDefaults(options || {});

	const scene = createScene(config);
	const camera = createCamera(config, canvas);
	const renderer = setupRenderer(canvas, config);
	const controls = setupControls(camera, canvas, config);

	setupEnvironment(scene, config);
	setupLighting(scene, config);

	if (config.floor?.enabled) {
		addFloor(scene, config);
	}

	const eventHandlers =
		config.events.enableEventHandlers !== false
			? setupEventHandlers(canvas, scene, camera, controls, config)
			: { dispose: () => {}, fitToView: () => {}, clearSelection: () => {} };

	const parent = canvas.parentElement;
	const getCanvasSize = () =>
		parent
			? { width: parent.clientWidth, height: parent.clientHeight }
			: { width: window.innerWidth, height: window.innerHeight };

	// Resize checked every frame so buffer resize and render happen in the same frame,
	// preventing visible blank frames on resize
	const { animate, dispose: disposeAnimation } = createAnimationLoop(
		renderer,
		scene,
		camera,
		controls,
		getCanvasSize,
		config.events.onFrame
	);
	animate();

	const sceneUp = config.environment?.sceneUp || defaultUp;
	scene.up.set(sceneUp.x, sceneUp.y, sceneUp.z);

	const dispose = () => {
		disposeAnimation();
		eventHandlers.dispose();
		controls.dispose();
		renderer.dispose();

		scene.traverse((object) => {
			if (object instanceof THREE.Mesh) {
				object.geometry?.dispose();
				if (Array.isArray(object.material)) {
					object.material.forEach((material) => material.dispose());
				} else {
					object.material?.dispose();
				}
			}
		});
	};

	return {
		scene,
		camera,
		controls,
		renderer,
		dispose,
		fitToView: eventHandlers.fitToView,
		clearSelection: eventHandlers.clearSelection
	};
};

function applyDefaults(options: ThreeInitializerOptions): Required<ThreeInitializerOptions> {
	const scale = options.sceneScale || 'm';

	// All Rhino geometry is normalized to METERS (1 unit = 1 meter), sceneScale just changes the viewing perspective
	const scaleDefaults = {
		mm: {
			cameraDistance: 20,
			near: 0.1,
			far: 2000,
			floorSize: 100,
			lightDistance: 10,
			lightHeight: 20,
			minDistance: 0.1,
			shadowSize: 100,
			scaleFactor: 1000
		},
		cm: {
			cameraDistance: 20,
			near: 0.1,
			far: 2000,
			floorSize: 100,
			lightDistance: 25,
			lightHeight: 50,
			minDistance: 0.1,
			shadowSize: 100,
			scaleFactor: 100
		},
		m: {
			cameraDistance: 10,
			near: 0.01,
			far: 2000,
			floorSize: 50,
			lightDistance: 25,
			lightHeight: 50,
			minDistance: 0.001,
			shadowSize: 100,
			scaleFactor: 1
		},
		inches: {
			cameraDistance: 15,
			near: 0.1,
			far: 2000,
			floorSize: 80,
			lightDistance: 20,
			lightHeight: 40,
			minDistance: 0.1,
			shadowSize: 80,
			scaleFactor: 39.37
		},
		feet: {
			cameraDistance: 8,
			near: 0.1,
			far: 2000,
			floorSize: 40,
			lightDistance: 15,
			lightHeight: 30,
			minDistance: 0.1,
			shadowSize: 60,
			scaleFactor: 3.28084
		}
	};

	const defaults = scaleDefaults[scale];

	return {
		sceneScale: scale,
		camera: {
			position:
				options.camera?.position ||
				new THREE.Vector3(
					-defaults.cameraDistance,
					defaults.cameraDistance,
					defaults.cameraDistance
				),
			fov: options.camera?.fov || 20,
			near: options.camera?.near || defaults.near,
			far: options.camera?.far || defaults.far,
			target: options.camera?.target || new THREE.Vector3(0, 0, 0)
		},
		lighting: {
			enableSunlight: options.lighting?.enableSunlight ?? true,
			sunlightIntensity: options.lighting?.sunlightIntensity || 1,
			sunlightPosition:
				options.lighting?.sunlightPosition ||
				new THREE.Vector3(defaults.lightDistance, defaults.lightHeight, defaults.lightDistance),
			ambientLightColor: options.lighting?.ambientLightColor || new THREE.Color(0x404040),
			ambientLightIntensity: options.lighting?.ambientLightIntensity || 1,
			sunlightColor: options.lighting?.sunlightColor || 0xffffff // Default to white sunlight
		},
		environment: {
			hdrPath: options.environment?.hdrPath || '/baseHDR.hdr',
			backgroundColor: options.environment?.backgroundColor || new THREE.Color(0xf0f0f0),
			enableEnvironmentLighting: options.environment?.enableEnvironmentLighting ?? true,
			sceneUp: options.environment?.sceneUp || defaultUp,
			showEnvironment: options.environment?.showEnvironment ?? false
		},
		floor: {
			enabled: options.floor?.enabled ?? false,
			size: options.floor?.size || defaults.floorSize,
			color: options.floor?.color || new THREE.Color(0x808080),
			roughness: options.floor?.roughness || 0.7,
			metalness: options.floor?.metalness || 0.0,
			receiveShadow: options.floor?.receiveShadow ?? true
		},
		render: {
			enableShadows: options.render?.enableShadows ?? true,
			shadowMapSize: options.render?.shadowMapSize || 2048,
			antialias: options.render?.antialias ?? true,
			pixelRatio: options.render?.pixelRatio || Math.min(window.devicePixelRatio, 2),
			toneMapping: options.render?.toneMapping || THREE.NeutralToneMapping,
			toneMappingExposure: options.render?.toneMappingExposure || 1,
			preserveDrawingBuffer: options.render?.preserveDrawingBuffer ?? false
		},
		controls: {
			enableDamping: options.controls?.enableDamping ?? false,
			dampingFactor: options.controls?.dampingFactor || 0.05,
			autoRotate: options.controls?.autoRotate ?? false,
			autoRotateSpeed: options.controls?.autoRotateSpeed || 0.5,
			enableZoom: options.controls?.enableZoom ?? true,
			enablePan: options.controls?.enablePan ?? true,
			minDistance: options.controls?.minDistance || defaults.minDistance,
			maxDistance: options.controls?.maxDistance || Infinity
		},
		events: {
			onBackgroundClicked: options.events?.onBackgroundClicked,
			onObjectSelected: options.events?.onObjectSelected,
			onMeshMetadataClicked: options.events?.onMeshMetadataClicked,
			onMeshDoubleClicked: options.events?.onMeshDoubleClicked,
			selectionColor: options.events?.selectionColor || '#ff0000', // Default to red
			enableEventHandlers: options.events?.enableEventHandlers ?? true,
			enableKeyboardControls: options.events?.enableKeyboardControls ?? true,
			enableClickToFocus: options.events?.enableClickToFocus ?? true,
			enableDoubleClickZoom: options.events?.enableDoubleClickZoom ?? true,
			onReady: options.events?.onReady,
			onFrame: options.events?.onFrame
		}
	};
}

function createScene(config: Required<ThreeInitializerOptions>): THREE.Scene {
	const scene = new THREE.Scene();

	const bgColor =
		typeof config.environment.backgroundColor === 'string'
			? new THREE.Color(config.environment.backgroundColor)
			: config.environment.backgroundColor;
	scene.background = bgColor || null;

	return scene;
}

function animateCameraTo(
	camera: THREE.PerspectiveCamera,
	controls: OrbitControls,
	toPosition: THREE.Vector3,
	toTarget: THREE.Vector3,
	durationMs = 200
): void {
	const fromPosition = camera.position.clone();
	const fromTarget = controls.target.clone();
	const startTime = performance.now();

	const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

	const tick = () => {
		const elapsed = performance.now() - startTime;
		const t = easeOut(Math.min(elapsed / durationMs, 1));

		camera.position.lerpVectors(fromPosition, toPosition, t);
		controls.target.lerpVectors(fromTarget, toTarget, t);
		controls.update();

		if (t < 1) requestAnimationFrame(tick);
	};

	requestAnimationFrame(tick);
}

// Resize applied before render so buffer clear and draw happen in the same frame,
// preventing visible blank frames when the canvas is resized
function createAnimationLoop(
	renderer: THREE.WebGLRenderer,
	scene: THREE.Scene,
	camera: THREE.PerspectiveCamera,
	controls: OrbitControls,
	getCanvasSize: () => { width: number; height: number },
	onFrame?: (delta: number) => void
): { animate: () => void; dispose: () => void } {
	let animationId: number | null = null;
	let lastTime = performance.now();

	const checkResize = () => {
		const { width, height } = getCanvasSize();
		if (width === 0 || height === 0) return;

		const pixelRatio = Math.min(window.devicePixelRatio, 2);
		const newW = Math.round(width * pixelRatio);
		const newH = Math.round(height * pixelRatio);

		if (renderer.domElement.width !== newW || renderer.domElement.height !== newH) {
			renderer.setPixelRatio(pixelRatio);
			renderer.setSize(width, height, false);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		}
	};

	const animate = function () {
		animationId = requestAnimationFrame(animate);

		const now = performance.now();
		const delta = (now - lastTime) / 1000;
		lastTime = now;

		checkResize();

		if (controls.enableDamping || controls.autoRotate) {
			controls.update();
		}

		onFrame?.(delta);

		renderer.render(scene, camera);
	};

	const dispose = () => {
		if (animationId !== null) {
			cancelAnimationFrame(animationId);
			animationId = null;
		}
	};

	return { animate, dispose };
}

function setupEnvironment(scene: THREE.Scene, config: Required<ThreeInitializerOptions>) {
	if (config.environment.enableEnvironmentLighting) {
		new HDRLoader().load(
			config.environment.hdrPath || '/baseHDR.hdr',
			function (envMap) {
				envMap.mapping = THREE.EquirectangularReflectionMapping;
				scene.environment = envMap;
				if (config.environment.showEnvironment) {
					scene.background = envMap;
				}
				config.events.onReady?.();
			},
			undefined,
			function (error) {
				getLogger().warn('HDR texture could not be loaded, falling back to basic lighting:', error);
				config.events.onReady?.();
			}
		);
	} else {
		config.events.onReady?.();
	}
}

function setupLighting(scene: THREE.Scene, config: Required<ThreeInitializerOptions>) {
	const ambientLight = new THREE.AmbientLight(
		config.lighting.ambientLightColor,
		config.lighting.ambientLightIntensity
	);
	scene.add(ambientLight);

	if (config.lighting.enableSunlight) {
		const sunlight = new THREE.DirectionalLight(
			config.lighting.sunlightColor ?? 0xffffff,
			config.lighting.sunlightIntensity
		);
		const pos = config.lighting.sunlightPosition;
		if (pos) {
			sunlight.position.set(pos.x, pos.y, pos.z);
		}

		if (config.render.enableShadows) {
			sunlight.castShadow = true;
			const shadowSize = getScaleValue(config.sceneScale, 0.1, 10, 100);

			sunlight.shadow.camera.left = -shadowSize;
			sunlight.shadow.camera.right = shadowSize;
			sunlight.shadow.camera.top = shadowSize;
			sunlight.shadow.camera.bottom = -shadowSize;

			const shadowNear = getScaleValue(config.sceneScale, 0.001, 0.1, 0.5);
			const shadowFar = getScaleValue(config.sceneScale, 1, 100, 500);

			sunlight.shadow.camera.near = shadowNear;
			sunlight.shadow.camera.far = shadowFar;

			sunlight.shadow.mapSize.width = config.render.shadowMapSize || 2048;
			sunlight.shadow.mapSize.height = config.render.shadowMapSize || 2048;

			sunlight.shadow.bias = -0.0001;
			sunlight.shadow.normalBias = 0.02;
		}

		scene.add(sunlight);
	}
}

function addFloor(scene: THREE.Scene, config: Required<ThreeInitializerOptions>) {
	const floorSize = config.floor.size;
	const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize);

	const floorColor =
		typeof config.floor.color === 'string'
			? new THREE.Color(config.floor.color)
			: config.floor.color;

	const floorMaterial = new THREE.MeshStandardMaterial({
		color: floorColor,
		roughness: config.floor.roughness,
		metalness: config.floor.metalness,
		side: THREE.DoubleSide
	});

	const floor = new THREE.Mesh(floorGeometry, floorMaterial);
	floor.userData.id = 'floor';
	floor.name = 'floor';
	floor.rotation.x = -Math.PI / 2;
	floor.position.y = 0;

	if (config.floor.receiveShadow && config.render.enableShadows) {
		floor.receiveShadow = true;
	}

	scene.add(floor);
}

function createCamera(
	config: Required<ThreeInitializerOptions>,
	canvas: HTMLCanvasElement
): THREE.PerspectiveCamera {
	const parent = canvas.parentElement;
	const width = parent ? parent.clientWidth : window.innerWidth;
	const height = parent ? parent.clientHeight : window.innerHeight;

	const camera = new THREE.PerspectiveCamera(
		config.camera.fov,
		width / height,
		config.camera.near,
		config.camera.far
	);

	const pos = config.camera.position;
	if (pos) {
		camera.position.set(pos.x, pos.y, pos.z);
	}

	return camera;
}

// Logarithmic depth buffer improves depth precision for mixed scales (mm to km)
function setupRenderer(
	canvas: HTMLCanvasElement,
	config: Required<ThreeInitializerOptions>
): THREE.WebGLRenderer {
	const renderer = new THREE.WebGLRenderer({
		antialias: config.render.antialias,
		canvas,
		alpha: true,
		powerPreference: 'high-performance',
		preserveDrawingBuffer: config.render.preserveDrawingBuffer,
		logarithmicDepthBuffer: true
	});

	const parent = canvas.parentElement;
	const width = parent ? parent.clientWidth : window.innerWidth;
	const height = parent ? parent.clientHeight : window.innerHeight;

	if (parent) {
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		canvas.style.display = 'block';
	}

	renderer.setSize(width, height, false);
	renderer.setPixelRatio(config.render.pixelRatio || Math.min(window.devicePixelRatio, 2));

	if (config.render.enableShadows) {
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.VSMShadowMap;
	}

	renderer.toneMapping = config.render.toneMapping!;
	renderer.toneMappingExposure = config.render.toneMappingExposure || 1.0;
	renderer.outputColorSpace = THREE.SRGBColorSpace;

	renderer.sortObjects = true;

	return renderer;
}

function setupEventHandlers(
	canvas: HTMLCanvasElement,
	scene: THREE.Scene,
	camera: THREE.PerspectiveCamera,
	controls: OrbitControls,
	config: Required<ThreeInitializerOptions>
): {
	dispose: () => void;
	fitToView: () => void;
	clearSelection: () => void;
} {
	const selectedObjects = new Set<THREE.Object3D>();
	const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2();
	const mouseDownPosition = new THREE.Vector2();

	const fitToView = () => {
		const box = new THREE.Box3();

		scene.traverse((object) => {
			if (object.visible && object.userData.id !== 'floor' && object instanceof THREE.Mesh) {
				box.expandByObject(object);
			}
		});

		if (box.isEmpty()) {
			getLogger().warn('No objects to fit to view');
			return;
		}

		const center = box.getCenter(new THREE.Vector3());
		const size = box.getSize(new THREE.Vector3());

		const maxDim = Math.max(size.x, size.y, size.z);
		const fov = camera.fov * (Math.PI / 180);
		let distance = maxDim / (2 * Math.tan(fov / 2));

		distance *= 1.5;

		const direction = camera.position.clone().sub(controls.target).normalize();
		camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));

		controls.target.copy(center);
		controls.update();
	};

	const selectionColorObj =
		typeof config.events.selectionColor === 'string'
			? new THREE.Color(config.events.selectionColor)
			: config.events.selectionColor instanceof THREE.Color
				? config.events.selectionColor
				: new THREE.Color('#ff0000');

	const clearSelection = () => {
		selectedObjects.forEach((obj) => {
			if (obj instanceof THREE.Mesh && originalMaterials.has(obj)) {
				obj.material = originalMaterials.get(obj)!;
				originalMaterials.delete(obj);
			}
		});
		selectedObjects.clear();
	};

	const handleMouseDown = (event: MouseEvent) => {
		mouseDownPosition.set(event.clientX, event.clientY);
	};

	const handleCanvasClick = (event: MouseEvent) => {
		// Ignore if mouse has moved (drag)
		const currentMousePosition = new THREE.Vector2(event.clientX, event.clientY);
		if (mouseDownPosition.distanceTo(currentMousePosition) > 5) {
			return;
		}

		const rect = canvas.getBoundingClientRect();
		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		raycaster.setFromCamera(mouse, camera);
		const intersects = raycaster.intersectObjects(scene.children, true);

		if (intersects.length > 0) {
			const clickedObject = intersects[0].object;

			if (!selectedObjects.has(clickedObject)) {
				clearSelection();
				selectedObjects.add(clickedObject);

				// Clone material so we don't affect other meshes
				if (
					clickedObject instanceof THREE.Mesh &&
					clickedObject.material instanceof THREE.Material
				) {
					originalMaterials.set(clickedObject, clickedObject.material);

					const clonedMaterial = clickedObject.material.clone();
					(clonedMaterial as any).emissive = selectionColorObj.clone();
					clickedObject.material = clonedMaterial;
				}

				config.events?.onObjectSelected?.(clickedObject);

				if (clickedObject instanceof THREE.Mesh && Object.keys(clickedObject.userData).length > 0) {
					config.events?.onMeshMetadataClicked?.(clickedObject.userData);
				}
			}
		} else {
			clearSelection();
			config.events?.onBackgroundClicked?.({ x: mouse.x, y: mouse.y });
		}
	};

	const handleDoubleClick = (event: MouseEvent) => {
		const rect = canvas.getBoundingClientRect();
		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		raycaster.setFromCamera(mouse, camera);
		const intersects = raycaster.intersectObjects(scene.children, true);

		if (intersects.length === 0) return;

		const target = intersects[0].object;
		config.events?.onMeshDoubleClicked?.(target);

		if (!config.events?.enableDoubleClickZoom) return;

		const box = new THREE.Box3().setFromObject(target);
		if (box.isEmpty()) return;

		const center = box.getCenter(new THREE.Vector3());
		const size = box.getSize(new THREE.Vector3());
		const maxDim = Math.max(size.x, size.y, size.z);
		const fov = camera.fov * (Math.PI / 180);
		const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

		const direction = camera.position.clone().sub(controls.target).normalize();
		const targetPosition = center.clone().add(direction.multiplyScalar(distance));

		animateCameraTo(camera, controls, targetPosition, center);
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (!config.events?.enableKeyboardControls) return;

		switch (event.key.toLowerCase()) {
			case 'f':
				event.preventDefault();
				fitToView();
				break;
			case 'escape':
				event.preventDefault();
				clearSelection();
				break;
			case ' ':
				event.preventDefault();
				fitToView();
				break;
		}
	};

	if (config.events?.enableClickToFocus) {
		canvas.addEventListener('mousedown', handleMouseDown);
		canvas.addEventListener('click', handleCanvasClick);
		canvas.addEventListener('dblclick', handleDoubleClick);
	}

	if (config.events?.enableKeyboardControls) {
		canvas.setAttribute('tabindex', '0');
		canvas.addEventListener('keydown', handleKeydown);
	}

	const dispose = () => {
		canvas.removeEventListener('mousedown', handleMouseDown);
		canvas.removeEventListener('click', handleCanvasClick);
		canvas.removeEventListener('dblclick', handleDoubleClick);
		canvas.removeEventListener('keydown', handleKeydown);
		clearSelection();
	};

	return { dispose, fitToView, clearSelection };
}

function setupControls(
	camera: THREE.PerspectiveCamera,
	canvas: HTMLCanvasElement,
	config: Required<ThreeInitializerOptions>
): OrbitControls {
	const controls = new OrbitControls(camera, canvas);

	const target = config.camera.target;
	if (target) {
		controls.target.set(target.x, target.y, target.z);
	}

	controls.enableDamping = config.controls.enableDamping || false;
	controls.dampingFactor = config.controls.dampingFactor || 0.05;

	controls.autoRotate = config.controls.autoRotate || false;
	controls.autoRotateSpeed = config.controls.autoRotateSpeed || 0.5;

	controls.enableZoom = config.controls.enableZoom ?? true;
	controls.enablePan = config.controls.enablePan ?? true;
	controls.minDistance = config.controls.minDistance || 0.001;
	controls.maxDistance = config.controls.maxDistance || Infinity;

	controls.screenSpacePanning = false;
	controls.maxPolarAngle = Math.PI;

	controls.update();
	return controls;
}
