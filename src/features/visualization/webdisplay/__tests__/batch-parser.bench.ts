import { bench, describe } from 'vitest';

import { buildMeshBatch } from '@tests/helpers/mesh-batch-builder';

import { parseMeshBatch, parseMeshBatchObject } from '../batch-parser';
import { decompressBatchedMeshData } from '../mesh-compression';

// Realistic-ish workload: ~500 meshes, ~10 materials, ~400 verts/mesh = 200k verts.
// Build once, reuse across iterations — vitest bench calls the fn many times.
const realistic = buildMeshBatch({
	materialCount: 10,
	meshCount: 500,
	vertsPerMesh: 400,
	seed: 1
});
const realisticJson = JSON.stringify(realistic.batch);

// Smaller workload to surface fixed-cost overhead.
const small = buildMeshBatch({
	materialCount: 4,
	meshCount: 50,
	vertsPerMesh: 60,
	seed: 2
});

// Heavy workload to amplify the JSON.parse + decompress costs.
const heavy = buildMeshBatch({
	materialCount: 12,
	meshCount: 1000,
	vertsPerMesh: 800,
	seed: 3
});
const heavyJson = JSON.stringify(heavy.batch);

describe('decompressBatchedMeshData', () => {
	bench('realistic (~200k verts)', async () => {
		await decompressBatchedMeshData(realistic.batch.compressedData);
	});

	bench('heavy (~800k verts)', async () => {
		await decompressBatchedMeshData(heavy.batch.compressedData);
	});
});

describe('parseMeshBatchObject (decompress + assemble)', () => {
	bench('small, merged', async () => {
		await parseMeshBatchObject(small.batch, {
			mergeByMaterial: true,
			applyTransforms: true
		});
	});

	bench('realistic, merged', async () => {
		await parseMeshBatchObject(realistic.batch, {
			mergeByMaterial: true,
			applyTransforms: true
		});
	});

	bench('realistic, individual', async () => {
		await parseMeshBatchObject(realistic.batch, {
			mergeByMaterial: false,
			applyTransforms: true
		});
	});

	bench('realistic, no transform', async () => {
		await parseMeshBatchObject(realistic.batch, {
			mergeByMaterial: true,
			applyTransforms: false
		});
	});

	bench('heavy, merged', async () => {
		await parseMeshBatchObject(heavy.batch, {
			mergeByMaterial: true,
			applyTransforms: true
		});
	});
});

describe('parseMeshBatch (JSON.parse + decompress + assemble)', () => {
	bench('realistic JSON', async () => {
		await parseMeshBatch(realisticJson, {
			mergeByMaterial: true,
			applyTransforms: true
		});
	});

	bench('heavy JSON', async () => {
		await parseMeshBatch(heavyJson, {
			mergeByMaterial: true,
			applyTransforms: true
		});
	});
});
