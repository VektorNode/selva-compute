import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { buildMeshBatch, encodeBatchPayload } from '@tests/helpers/mesh-batch-builder';

import { parseMeshBatch, parseMeshBatchObject } from '../batch-parser';

const COORD_TRANSFORM_TOLERANCE = 1e-5;

describe('parseMeshBatchObject', () => {
	describe('merged path (mergeByMaterial=true)', () => {
		it('produces one mesh per material group', async () => {
			const { batch } = buildMeshBatch({ materialCount: 3, meshCount: 12, vertsPerMesh: 6 });

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: true,
				applyTransforms: false
			});

			expect(meshes).toHaveLength(3);
		});

		it('preserves total vertex and triangle counts', async () => {
			const { batch, rawVertices, rawFaces } = buildMeshBatch({
				materialCount: 2,
				meshCount: 8,
				vertsPerMesh: 5
			});

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: true,
				applyTransforms: false
			});

			let totalPositions = 0;
			let totalIndices = 0;
			for (const mesh of meshes) {
				const geom = mesh.geometry as THREE.BufferGeometry;
				totalPositions += geom.getAttribute('position').count;
				const index = geom.getIndex();
				expect(index).not.toBeNull();
				totalIndices += index!.count;
			}

			expect(totalPositions * 3).toBe(rawVertices.length);
			expect(totalIndices).toBe(rawFaces.length);
		});

		it('rebases indices so all triangles reference vertices that exist in the merged buffer', async () => {
			const { batch } = buildMeshBatch({ materialCount: 2, meshCount: 6, vertsPerMesh: 4 });

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: true,
				applyTransforms: false
			});

			for (const mesh of meshes) {
				const geom = mesh.geometry as THREE.BufferGeometry;
				const positionCount = geom.getAttribute('position').count;
				const index = geom.getIndex()!;
				for (let i = 0; i < index.count; i++) {
					const idx = index.getX(i);
					expect(idx).toBeGreaterThanOrEqual(0);
					expect(idx).toBeLessThan(positionCount);
				}
			}
		});

		it('populates userData with first-mesh metadata and mergedFrom for siblings', async () => {
			const { batch } = buildMeshBatch({ materialCount: 1, meshCount: 4, vertsPerMesh: 3 });

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: true,
				applyTransforms: false
			});

			expect(meshes).toHaveLength(1);
			const mesh = meshes[0]!;
			expect(mesh.userData.name).toBe('mesh_0');
			expect(mesh.userData.layer).toBe('Layer/0');
			expect(mesh.userData.originalIndex).toBe(0);
			expect(mesh.userData.mergedFrom).toHaveLength(3);
			expect(mesh.userData.mergedFrom[0].name).toBe('mesh_1');
		});

		it('falls through to individual path when a group has only one mesh', async () => {
			const { batch } = buildMeshBatch({ materialCount: 4, meshCount: 4, vertsPerMesh: 3 });

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: true,
				applyTransforms: false
			});

			// Single-mesh groups go through createIndividualMeshes; userData has no mergedFrom.
			expect(meshes).toHaveLength(4);
			for (const mesh of meshes) {
				expect(mesh.userData.mergedFrom).toBeUndefined();
			}
		});
	});

	describe('individual path (mergeByMaterial=false)', () => {
		it('produces one mesh per source mesh', async () => {
			const { batch } = buildMeshBatch({ materialCount: 2, meshCount: 7, vertsPerMesh: 4 });

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: false,
				applyTransforms: false
			});

			expect(meshes).toHaveLength(7);
		});

		it('rebases indices to be local (0..vertexCount) for each mesh', async () => {
			const { batch } = buildMeshBatch({ materialCount: 2, meshCount: 5, vertsPerMesh: 6 });

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: false,
				applyTransforms: false
			});

			for (const mesh of meshes) {
				const geom = mesh.geometry as THREE.BufferGeometry;
				const positionCount = geom.getAttribute('position').count;
				const index = geom.getIndex()!;
				for (let i = 0; i < index.count; i++) {
					const idx = index.getX(i);
					expect(idx).toBeGreaterThanOrEqual(0);
					expect(idx).toBeLessThan(positionCount);
				}
			}
		});

		it('carries mesh metadata into userData', async () => {
			const { batch } = buildMeshBatch({ materialCount: 1, meshCount: 3, vertsPerMesh: 3 });

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: false,
				applyTransforms: false
			});

			const names = meshes.map((m) => m.userData.name).sort();
			expect(names).toEqual(['mesh_0', 'mesh_1', 'mesh_2']);
		});
	});

	describe('coordinate transform', () => {
		it('rotates by -90deg around X: (x, y, z) -> (x, z, -y)', async () => {
			// Derived from applyCoordinateTransform with cos(-PI/2)=0, sin(-PI/2)=-1:
			//   y' = y*cos - z*sin = z
			//   z' = y*sin + z*cos = -y
			// Use forceFloat32 so we can compare exact float values without int16 quantization
			// noise (the quantized path is covered by binary-parser.test.ts).
			const { batch, rawVertices } = buildMeshBatch({
				materialCount: 1,
				meshCount: 1,
				vertsPerMesh: 3,
				seed: 42,
				forceFloat32: true
			});

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: true,
				applyTransforms: true
			});

			const position = meshes[0]!.geometry.getAttribute('position');

			for (let v = 0; v < position.count; v++) {
				const ox = rawVertices[v * 3]!;
				const oy = rawVertices[v * 3 + 1]!;
				const oz = rawVertices[v * 3 + 2]!;

				expect(position.getX(v)).toBeCloseTo(ox, 5);
				expect(position.getY(v)).toBeCloseTo(oz, 5);
				expect(position.getZ(v)).toBeCloseTo(-oy, 5);
			}
		});

		it('does not mutate vertices when applyTransforms=false', async () => {
			const { batch, rawVertices } = buildMeshBatch({
				materialCount: 1,
				meshCount: 1,
				vertsPerMesh: 3,
				seed: 7,
				forceFloat32: true
			});

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: true,
				applyTransforms: false
			});

			const position = meshes[0]!.geometry.getAttribute('position');
			for (let v = 0; v < position.count; v++) {
				expect(position.getX(v)).toBeCloseTo(rawVertices[v * 3]!, 5);
				expect(position.getY(v)).toBeCloseTo(rawVertices[v * 3 + 1]!, 5);
				expect(position.getZ(v)).toBeCloseTo(rawVertices[v * 3 + 2]!, 5);
			}
		});
	});

	describe('material assignment', () => {
		it('assigns the correct material to each group', async () => {
			const { batch } = buildMeshBatch({ materialCount: 3, meshCount: 9, vertsPerMesh: 4 });

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: true,
				applyTransforms: false
			});

			// Each merged mesh should use a distinct material instance — the parser
			// creates one material per entry in batch.materials.
			const materialIds = new Set(meshes.map((m) => (m.material as THREE.Material).uuid));
			expect(materialIds.size).toBe(3);
		});

		it('reflects material color from input', async () => {
			// Materials live inside the binary blob's metadata header. Mutate the materials and
			// re-encode so the parser sees the change — mirrors what the C# writer does end-to-end.
			const built = buildMeshBatch({ materialCount: 1, meshCount: 2, vertsPerMesh: 3 });
			built.batch.materials[0]!.color = '#ff0000';
			built.batch.compressedData = encodeBatchPayload(built.rawVertices, built.rawFaces, {
				materials: built.batch.materials,
				groups: built.batch.groups,
				sourceComponentId: built.batch.sourceComponentId
			});

			const meshes = await parseMeshBatchObject(built.batch, {
				mergeByMaterial: true,
				applyTransforms: false
			});

			const mat = meshes[0]!.material as THREE.MeshPhysicalMaterial;
			expect(mat.color.r).toBeCloseTo(1, COORD_TRANSFORM_TOLERANCE);
			expect(mat.color.g).toBeCloseTo(0, COORD_TRANSFORM_TOLERANCE);
			expect(mat.color.b).toBeCloseTo(0, COORD_TRANSFORM_TOLERANCE);
		});
	});

	describe('options', () => {
		it('applies scaleFactor uniformly', async () => {
			const { batch } = buildMeshBatch({ materialCount: 1, meshCount: 2, vertsPerMesh: 3 });

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: true,
				applyTransforms: false,
				scaleFactor: 2.5
			});

			for (const mesh of meshes) {
				expect(mesh.scale.x).toBe(2.5);
				expect(mesh.scale.y).toBe(2.5);
				expect(mesh.scale.z).toBe(2.5);
			}
		});

		it('leaves scale at 1 when scaleFactor is omitted', async () => {
			const { batch } = buildMeshBatch({ materialCount: 1, meshCount: 2, vertsPerMesh: 3 });

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: true,
				applyTransforms: false
			});

			expect(meshes[0]!.scale.x).toBe(1);
		});

		it('propagates sourceComponentId to userData', async () => {
			const { batch } = buildMeshBatch({
				materialCount: 1,
				meshCount: 2,
				vertsPerMesh: 3,
				sourceComponentId: 'gh-component-xyz'
			});

			const meshes = await parseMeshBatchObject(batch, {
				mergeByMaterial: true,
				applyTransforms: false
			});

			expect(meshes[0]!.userData.sourceComponentId).toBe('gh-component-xyz');
		});
	});
});

describe('parseMeshBatch (JSON entry point)', () => {
	it('parses a JSON-stringified MeshBatch end-to-end', async () => {
		const { batch } = buildMeshBatch({ materialCount: 2, meshCount: 6, vertsPerMesh: 4 });

		const meshes = await parseMeshBatch(JSON.stringify(batch), {
			mergeByMaterial: true,
			applyTransforms: false
		});

		expect(meshes).toHaveLength(2);
	});

	it('returns empty array on invalid JSON instead of throwing', async () => {
		const meshes = await parseMeshBatch('not-json', { applyTransforms: false });
		expect(meshes).toEqual([]);
	});
});
