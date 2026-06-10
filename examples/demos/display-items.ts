/**
 * Demo: render the geometry in a Grasshopper compute response — meshes, curves, and points.
 *
 * Takes a raw GH compute response (the exact shape a host app receives) and runs it through the
 * library's `getThreeMeshesFromComputeResponse`: it walks the value trees, finds each Display batch,
 * decodes the binary mesh blob plus the non-mesh display items (curves via rhino3dm, points raw),
 * and returns a flat array of THREE objects. Points need no decode; curves need the rhino3dm instance.
 */
import { getThreeMeshesFromComputeResponse } from '@/features/visualization/webdisplay/webdisplay-parser';
import type { GrasshopperComputeResponse } from '@/features/grasshopper/types';

import { createPlayground } from '../shared/playground';
import { loadRhino } from '../shared/rhino';
import responseUrl from '../shared/samples/compute-response.json?url';

const pg = createPlayground({ title: 'Display Items' });

pg.addSection('Display Items');
pg.addButton('Reload sample', () => void load());

async function load() {
	pg.setStatus('Loading rhino3dm + response…');
	pg.clearObjects();

	const [rhino, response] = await Promise.all([
		loadRhino(),
		fetch(responseUrl).then((r) => r.json() as Promise<GrasshopperComputeResponse>)
	]);

	// Same call a host app makes. rhino decodes curves; meshes and points need no instance.
	const objects = await getThreeMeshesFromComputeResponse(response, { rhino });
	pg.addObjects(objects);

	const counts = objects.reduce<Record<string, number>>((acc, o) => {
		const kind = (o.userData.kind as string) ?? o.type;
		acc[kind] = (acc[kind] ?? 0) + 1;
		return acc;
	}, {});
	const summary = Object.entries(counts)
		.map(([k, n]) => `${n} ${k}`)
		.join(', ');
	pg.setStatus(`Decoded ${objects.length} objects\n→ ${summary || 'none'}`);

	// Fit on the next frame so the canvas has its real size before framing.
	requestAnimationFrame(() => pg.viewer.fitToView());
}

void load();
