/**
 * Lazily load and cache the rhino3dm WASM module for demos that decode curve display items.
 *
 * The library never owns the WASM instance (it's heavy and the host app initializes it once); demos
 * stand in for that host. We load rhino3dm from a CDN at the version pinned in `package.json` rather
 * than importing the npm package: rhino3dm's npm entry pulls in Node-only deps (`ws`) that confuse
 * web bundlers. The CDN build is the browser ESM build with no such baggage — and it mirrors how a
 * host app typically wires rhino3dm into a web client.
 */
import type { RhinoModule } from 'rhino3dm';

// Keep in sync with the rhino3dm version in package.json.
const RHINO3DM_VERSION = '8.17.0';
const CDN_URL = `https://cdn.jsdelivr.net/npm/rhino3dm@${RHINO3DM_VERSION}/rhino3dm.module.min.js`;

let cached: Promise<RhinoModule> | null = null;

/** Resolve the shared rhino3dm instance, initializing it on first call. */
export function loadRhino(): Promise<RhinoModule> {
	cached ??= import(/* @vite-ignore */ CDN_URL).then(
		(mod) => (mod.default as () => Promise<RhinoModule>)()
	);
	return cached;
}
