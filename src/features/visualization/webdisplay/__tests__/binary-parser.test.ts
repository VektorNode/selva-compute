import { describe, expect, it } from 'vitest';

import { encodeBatchPayload } from '@tests/helpers/mesh-batch-builder';

import {
	BINARY_MESH_MAGIC,
	BINARY_MESH_VERSION,
	FLAG_FLOAT32,
	FLAG_UINT16_INDICES,
	parseBinaryMeshBatch
} from '../binary-parser';

const EMPTY_METADATA = { materials: [], groups: [] };

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('parseBinaryMeshBatch', () => {
	describe('roundtrip', () => {
		it('decodes int16 quantized vertices within precision', () => {
			// 10m bbox => int16 step ~0.15mm.
			const vertices = new Float32Array([
				0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10
			]);
			const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);

			const blob = encodeBatchPayload(vertices, indices, EMPTY_METADATA);
			const parsed = parseBinaryMeshBatch(blob);

			expect(parsed.flags & FLAG_FLOAT32).toBe(0);
			expect(parsed.vertices).toBeInstanceOf(Int16Array);
			expect(parsed.indices.length).toBe(indices.length);

			// Reconstruct with the documented formula and verify within step precision.
			const q = parsed.vertices as Int16Array;
			for (let i = 0; i < q.length; i += 3) {
				const wx = parsed.origin[0] + (q[i]! + 32767) * parsed.scale[0];
				const wy = parsed.origin[1] + (q[i + 1]! + 32767) * parsed.scale[1];
				const wz = parsed.origin[2] + (q[i + 2]! + 32767) * parsed.scale[2];
				expect(wx).toBeCloseTo(vertices[i]!, 3);
				expect(wy).toBeCloseTo(vertices[i + 1]!, 3);
				expect(wz).toBeCloseTo(vertices[i + 2]!, 3);
			}
		});

		it('decodes float32 vertices exactly', () => {
			const vertices = new Float32Array([0, 0, 0, 1, 2, 3, 4, 5, 6]);
			const indices = new Uint32Array([0, 1, 2]);

			const blob = encodeBatchPayload(vertices, indices, {
				...EMPTY_METADATA,
				forceFloat32: true
			});
			const parsed = parseBinaryMeshBatch(blob);

			expect(parsed.flags & FLAG_FLOAT32).toBe(FLAG_FLOAT32);
			expect(parsed.vertices).toBeInstanceOf(Float32Array);
			for (let i = 0; i < vertices.length; i++) {
				expect((parsed.vertices as Float32Array)[i]).toBe(vertices[i]);
			}
		});

		it('auto-falls back to float32 for extreme bbox', () => {
			// 100km bbox => int16 step ~1.5m, way over the 5cm threshold.
			const vertices = new Float32Array([
				0, 0, 0, 100000, 0, 0, 100000, 100000, 0, 0, 100000, 100000
			]);
			const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);

			const blob = encodeBatchPayload(vertices, indices, EMPTY_METADATA);
			const parsed = parseBinaryMeshBatch(blob);

			expect(parsed.flags & FLAG_FLOAT32).toBe(FLAG_FLOAT32);
			expect(parsed.origin).toEqual([0, 0, 0]);
			expect(parsed.scale).toEqual([1, 1, 1]);
		});

		it('uses uint16 indices for small batches and round-trips them', () => {
			const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]);
			const indices = new Uint32Array([0, 1, 2]);

			const blob = encodeBatchPayload(vertices, indices, EMPTY_METADATA);
			const parsed = parseBinaryMeshBatch(blob);

			expect(parsed.flags & FLAG_UINT16_INDICES).toBe(FLAG_UINT16_INDICES);
			expect(parsed.indices).toBeInstanceOf(Uint16Array);
			expect(Array.from(parsed.indices)).toEqual([0, 1, 2]);
		});

		it('uses uint32 indices when the batch exceeds 65535 vertices', () => {
			// 65537 vertices forces the wide index path. Keep the bbox tiny so int16 verts still apply.
			const vertexCount = 65537;
			const vertices = new Float32Array(vertexCount * 3);
			for (let v = 0; v < vertexCount; v++) {
				vertices[v * 3] = (v % 100) * 0.001;
			}
			const indices = new Uint32Array([0, 1, 65536]);

			const blob = encodeBatchPayload(vertices, indices, EMPTY_METADATA);
			const parsed = parseBinaryMeshBatch(blob);

			expect(parsed.flags & FLAG_UINT16_INDICES).toBe(0);
			expect(parsed.indices).toBeInstanceOf(Uint32Array);
			expect(Array.from(parsed.indices)).toEqual([0, 1, 65536]);
		});

		it('handles empty geometry', () => {
			const blob = encodeBatchPayload(new Float32Array(0), new Uint32Array(0), EMPTY_METADATA);
			const parsed = parseBinaryMeshBatch(blob);

			expect(parsed.vertices.length).toBe(0);
			expect(parsed.indices.length).toBe(0);
		});

		it('roundtrips embedded metadata JSON', () => {
			const metadata = {
				materials: [
					{ color: '#ff0000', metalness: 0.5, roughness: 0.4, opacity: 1, transparent: false }
				],
				groups: [
					{
						materialId: 0,
						meshes: [
							{
								name: 'cube',
								layer: 'Walls',
								originalIndex: 0,
								vertexCount: 3,
								indexCount: 3,
								vertexStart: 0,
								indexStart: 0,
								metadata: { tag: 'A' }
							}
						]
					}
				],
				sourceComponentId: 'gh-component-xyz'
			};

			const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]);
			const indices = new Uint32Array([0, 1, 2]);

			const blob = encodeBatchPayload(vertices, indices, metadata);
			const parsed = parseBinaryMeshBatch(blob);

			expect(parsed.metadata.materials).toHaveLength(1);
			expect(parsed.metadata.materials[0]!.color).toBe('#ff0000');
			expect(parsed.metadata.groups).toHaveLength(1);
			expect(parsed.metadata.groups[0]!.meshes[0]!.name).toBe('cube');
			expect(parsed.metadata.sourceComponentId).toBe('gh-component-xyz');
		});
	});

	describe('input forms', () => {
		it('accepts ArrayBuffer input', () => {
			const vertices = new Float32Array([0, 0, 0, 1, 2, 3]);
			const indices = new Uint32Array([0, 1]);
			const base64 = encodeBatchPayload(vertices, indices, EMPTY_METADATA);

			const buffer = Buffer.from(base64, 'base64');
			const arrayBuf = buffer.buffer.slice(
				buffer.byteOffset,
				buffer.byteOffset + buffer.byteLength
			);

			const parsed = parseBinaryMeshBatch(arrayBuf);
			expect(parsed.indices.length).toBe(2);
		});

		it('accepts Uint8Array input', () => {
			const vertices = new Float32Array([0, 0, 0, 1, 2, 3]);
			const indices = new Uint32Array([0, 1]);
			const base64 = encodeBatchPayload(vertices, indices, EMPTY_METADATA);

			const u8 = new Uint8Array(Buffer.from(base64, 'base64'));
			const parsed = parseBinaryMeshBatch(u8);
			expect(parsed.indices.length).toBe(2);
		});
	});

	describe('validation', () => {
		it('rejects invalid magic', () => {
			const buf = new ArrayBuffer(12);
			const view = new DataView(buf);
			view.setUint32(0, 0xdeadbeef, true);
			view.setUint32(4, BINARY_MESH_VERSION, true);
			view.setUint32(8, 0, true);
			expect(() => parseBinaryMeshBatch(buf)).toThrow(/magic/i);
		});

		it('rejects unknown version', () => {
			const buf = new ArrayBuffer(12);
			const view = new DataView(buf);
			view.setUint32(0, BINARY_MESH_MAGIC, true);
			view.setUint32(4, 999, true);
			view.setUint32(8, 0, true);
			expect(() => parseBinaryMeshBatch(buf)).toThrow(/version/i);
		});

		it('still decodes a v1 blob (uint32 indices, no uint16 flag)', () => {
			// v1 layout == v2 with the uint16 flag implicitly clear. Hand-build one: empty metadata,
			// float32 verts, uint32 indices, version field = 1.
			const metadata = utf8('{"materials":[],"groups":[]}');
			const vertCount = 3;
			const indices = [0, 1, 2];
			const total = 12 + metadata.length + 4 + 48 + 4 + vertCount * 3 * 4 + 4 + indices.length * 4;
			const buf = new ArrayBuffer(total);
			const view = new DataView(buf);
			const u8 = new Uint8Array(buf);
			let o = 0;
			view.setUint32(o, BINARY_MESH_MAGIC, true);
			o += 4;
			view.setUint32(o, 1, true); // version 1
			o += 4;
			view.setUint32(o, metadata.length, true);
			o += 4;
			u8.set(metadata, o);
			o += metadata.length;
			view.setUint32(o, FLAG_FLOAT32, true); // float32, no uint16 bit
			o += 4;
			for (let i = 0; i < 6; i++) {
				view.setFloat64(o, i < 3 ? 0 : 1, true); // origin (0,0,0), scale (1,1,1)
				o += 8;
			}
			view.setUint32(o, vertCount, true);
			o += 4;
			const verts = [0, 0, 0, 1, 0, 0, 1, 1, 0];
			for (const f of verts) {
				view.setFloat32(o, f, true);
				o += 4;
			}
			view.setUint32(o, indices.length, true);
			o += 4;
			for (const idx of indices) {
				view.setUint32(o, idx, true);
				o += 4;
			}

			const parsed = parseBinaryMeshBatch(buf);
			expect(parsed.indices).toBeInstanceOf(Uint32Array);
			expect(Array.from(parsed.indices)).toEqual([0, 1, 2]);
			expect(Array.from(parsed.vertices as Float32Array)).toEqual(verts);
		});

		it('rejects truncated input', () => {
			expect(() => parseBinaryMeshBatch(new ArrayBuffer(4))).toThrow(/header/i);
		});

		it('rejects truncated metadata', () => {
			const buf = new ArrayBuffer(12);
			const view = new DataView(buf);
			view.setUint32(0, BINARY_MESH_MAGIC, true);
			view.setUint32(4, BINARY_MESH_VERSION, true);
			view.setUint32(8, 100, true); // claim 100 metadata bytes
			expect(() => parseBinaryMeshBatch(buf)).toThrow(/metadata/i);
		});
	});
});
