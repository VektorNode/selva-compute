import * as fflate from 'fflate';

import { decodeBase64ToBinary } from '@/core/utils/encoding';
import { RhinoComputeError, ErrorCodes } from '@/core/errors';

import type { DecompressedMeshData } from './types';

interface MeshData {
	verticesArray: Float32Array;
	faceIndicesArray: Uint32Array;
}

/**
 * Decompresses a base64-encoded string using GZip.
 *
 * @internal Low-level decompression helper — keep internal to `@selvajs/compute`.
 * @param base64String - The base64-encoded string to decompress.
 * @returns The decompressed MeshData.
 * @throws {RhinoComputeError} If decompression fails or data is invalid.
 */
export function decompressMeshData(base64String: string): MeshData {
	try {
		const bytes = decodeBase64ToBinary(base64String);
		const decompressedData = fflate.gunzipSync(bytes);
		return parseMeshBinaryData(decompressedData);
	} catch (error) {
		throw new RhinoComputeError(
			error instanceof RhinoComputeError
				? error.message
				: `Failed to decompress data: ${error instanceof Error ? error.message : String(error)}`,
			error instanceof RhinoComputeError ? error.code : ErrorCodes.VALIDATION_ERROR,
			{
				context: { base64StringLength: base64String.length },
				originalError: error instanceof Error ? error : new Error(String(error))
			}
		);
	}
}

// In a browser environment, fflate.gunzip spawns a Web Worker so multi-MB payloads
// don't block paint. In Node there is no Worker pool, so the callback API just adds
// a microtask hop on top of the sync work — we use gunzipSync there for raw speed.
const IS_BROWSER =
	typeof globalThis !== 'undefined' &&
	typeof (globalThis as { window?: unknown }).window !== 'undefined' &&
	typeof (globalThis as { document?: unknown }).document !== 'undefined';

/**
 * Decompresses batched mesh data.
 *
 * In browsers, gunzip runs in a Web Worker (`fflate.gunzip`) so the main thread
 * stays responsive — important for the multi-MB payloads typical of WebDisplay.
 * In Node, runs synchronously since there is no main-thread/worker distinction.
 * The base64 → binary decode runs on the calling thread either way.
 *
 * When `applyCoordinateTransform=true`, the Rhino Z-up → Three.js orientation
 * rotation is folded into the vertex read, saving a full pass over the data.
 *
 * @internal Low-level decompression helper — keep internal to `@selvajs/compute`.
 * @param base64String - The base64-encoded compressed data.
 * @param applyCoordinateTransform - If true, rotate (x, y, z) → (x, z, -y) during read.
 * @returns Promise resolving to decompressed vertices and faces arrays.
 * @throws {RhinoComputeError} If decompression fails or data is invalid.
 */
export async function decompressBatchedMeshData(
	base64String: string,
	applyCoordinateTransform = false
): Promise<DecompressedMeshData> {
	const bytes = decodeBase64ToBinary(base64String);

	let decompressed: Uint8Array;
	try {
		decompressed = IS_BROWSER
			? await new Promise<Uint8Array>((resolve, reject) => {
					fflate.gunzip(bytes, (err, data) => {
						if (err) reject(err);
						else resolve(data);
					});
				})
			: fflate.gunzipSync(bytes);
	} catch (error) {
		throw new RhinoComputeError(
			`Failed to decompress batched data: ${error instanceof Error ? error.message : String(error)}`,
			ErrorCodes.VALIDATION_ERROR,
			{
				context: { base64StringLength: base64String.length },
				originalError: error instanceof Error ? error : new Error(String(error))
			}
		);
	}

	try {
		return parseBatchedMeshBinaryData(decompressed, applyCoordinateTransform);
	} catch (error) {
		throw new RhinoComputeError(
			error instanceof RhinoComputeError
				? error.message
				: `Failed to parse decompressed batched data: ${error instanceof Error ? error.message : String(error)}`,
			error instanceof RhinoComputeError ? error.code : ErrorCodes.VALIDATION_ERROR,
			{
				context: { base64StringLength: base64String.length },
				originalError: error instanceof Error ? error : new Error(String(error))
			}
		);
	}
}

/**
 * Parses batched binary mesh data (all vertices and faces together).
 *
 * When `applyCoordinateTransform=true`, vertices are rotated (x, y, z) → (x, z, -y)
 * directly during the read, so we only ever pass over the data once.
 *
 * @param binaryMeshData - The binary mesh data to parse.
 * @param applyCoordinateTransform - If true, fold the Rhino → Three orientation rotation into the read.
 * @returns The parsed mesh data with vertices and faces.
 * @throws {RhinoComputeError} If data is invalid or insufficient.
 */
function parseBatchedMeshBinaryData(
	binaryMeshData: Uint8Array,
	applyCoordinateTransform: boolean
): DecompressedMeshData {
	const dataView = new DataView(
		binaryMeshData.buffer,
		binaryMeshData.byteOffset,
		binaryMeshData.byteLength
	);
	let offset = 0;

	// Read vertex data
	if (offset + 4 > dataView.byteLength) {
		throw new RhinoComputeError(
			'Insufficient data to read the number of vertex floats.',
			ErrorCodes.VALIDATION_ERROR,
			{ context: { expectedBytes: 4, availableBytes: dataView.byteLength, offset } }
		);
	}
	const numVertexFloats = dataView.getUint32(offset, true);
	offset += 4;

	if (numVertexFloats % 3 !== 0) {
		throw new RhinoComputeError(
			'Invalid number of vertex floats; should be divisible by 3.',
			ErrorCodes.VALIDATION_ERROR,
			{
				context: {
					numVertexFloats,
					remainder: numVertexFloats % 3,
					totalBytes: dataView.byteLength
				}
			}
		);
	}

	const verticesByteLength = numVertexFloats * Float32Array.BYTES_PER_ELEMENT;
	if (offset + verticesByteLength > dataView.byteLength) {
		throw new RhinoComputeError(
			'Insufficient data to read vertices.',
			ErrorCodes.VALIDATION_ERROR,
			{
				context: {
					expectedBytes: verticesByteLength,
					availableBytes: dataView.byteLength - offset,
					offset
				}
			}
		);
	}

	const vertexByteOffset = binaryMeshData.byteOffset + offset;
	let vertices: Float32Array;
	if (applyCoordinateTransform) {
		// Fold the Rhino Z-up → Three orientation rotation directly into the read.
		// Reading from a zero-copy view and writing to a fresh array avoids the
		// slice() copy + a second pass for the transform.
		const source = new Float32Array(binaryMeshData.buffer, vertexByteOffset, numVertexFloats);
		vertices = new Float32Array(numVertexFloats);
		for (let i = 0; i < numVertexFloats; i += 3) {
			const y = source[i + 1]!;
			const z = source[i + 2]!;
			vertices[i] = source[i]!;
			vertices[i + 1] = z;
			vertices[i + 2] = -y;
		}
	} else {
		// No mutation downstream — zero-copy view of the gunzip buffer is safe.
		vertices = new Float32Array(binaryMeshData.buffer, vertexByteOffset, numVertexFloats);
	}
	offset += verticesByteLength;

	if (offset + 4 > dataView.byteLength) {
		throw new RhinoComputeError(
			'Insufficient data to read the number of face indices.',
			ErrorCodes.VALIDATION_ERROR,
			{ context: { expectedBytes: 4, availableBytes: dataView.byteLength - offset, offset } }
		);
	}
	const numIndices = dataView.getUint32(offset, true);
	offset += 4;

	const indicesByteLength = numIndices * Uint32Array.BYTES_PER_ELEMENT;
	if (offset + indicesByteLength > dataView.byteLength) {
		throw new RhinoComputeError(
			'Insufficient data to read face indices.',
			ErrorCodes.VALIDATION_ERROR,
			{
				context: {
					expectedBytes: indicesByteLength,
					availableBytes: dataView.byteLength - offset,
					offset
				}
			}
		);
	}

	// Zero-copy view: faces are read-only downstream (createMergedMesh / createIndividualMeshes
	// rebase into fresh Uint32Arrays) so we don't need to detach from the gunzip buffer.
	// Byte offset is guaranteed 4-aligned: header (4) + verticesByteLength (4*n) + header (4).
	const faces = new Uint32Array(
		binaryMeshData.buffer,
		binaryMeshData.byteOffset + offset,
		numIndices
	);

	return {
		vertices,
		faces
	};
}

/**
 * Parses binary data and returns mesh data.
 * @param binaryMeshData - The binary mesh data to parse.
 * @returns The parsed mesh data.
 * @throws {RhinoComputeError} If data is invalid or insufficient.
 */
function parseMeshBinaryData(binaryMeshData: Uint8Array): MeshData {
	const dataView = new DataView(
		binaryMeshData.buffer,
		binaryMeshData.byteOffset,
		binaryMeshData.byteLength
	);
	let offset = 0;

	if (offset + 4 > dataView.byteLength) {
		throw new RhinoComputeError(
			'Insufficient data to read the number of vertex floats.',
			ErrorCodes.VALIDATION_ERROR,
			{ context: { expectedBytes: 4, availableBytes: dataView.byteLength, offset } }
		);
	}
	const numVertexFloats = dataView.getUint32(offset, true);
	offset += 4;

	if (numVertexFloats % 3 !== 0) {
		throw new RhinoComputeError(
			'Invalid number of vertex floats; should be divisible by 3.',
			ErrorCodes.VALIDATION_ERROR,
			{ context: { numVertexFloats, remainder: numVertexFloats % 3 } }
		);
	}

	const verticesByteLength = numVertexFloats * Float32Array.BYTES_PER_ELEMENT;
	if (offset + verticesByteLength > dataView.byteLength) {
		throw new RhinoComputeError(
			'Insufficient data to read vertices.',
			ErrorCodes.VALIDATION_ERROR,
			{
				context: {
					expectedBytes: verticesByteLength,
					availableBytes: dataView.byteLength - offset,
					offset
				}
			}
		);
	}

	// slice() detaches views from the gunzip buffer so downstream consumers
	// cannot accidentally mutate shared memory.
	const vertices = new Float32Array(
		binaryMeshData.buffer.slice(
			binaryMeshData.byteOffset + offset,
			binaryMeshData.byteOffset + offset + verticesByteLength
		)
	);
	offset += verticesByteLength;

	if (offset + 4 > dataView.byteLength) {
		throw new RhinoComputeError(
			'Insufficient data to read the number of face indices.',
			ErrorCodes.VALIDATION_ERROR,
			{ context: { expectedBytes: 4, availableBytes: dataView.byteLength - offset, offset } }
		);
	}
	const numIndices = dataView.getUint32(offset, true);
	offset += 4;

	const indicesByteLength = numIndices * Uint32Array.BYTES_PER_ELEMENT;
	if (offset + indicesByteLength > dataView.byteLength) {
		throw new RhinoComputeError(
			'Insufficient data to read face indices.',
			ErrorCodes.VALIDATION_ERROR,
			{
				context: {
					expectedBytes: indicesByteLength,
					availableBytes: dataView.byteLength - offset,
					offset
				}
			}
		);
	}

	const faceIndices = new Uint32Array(
		binaryMeshData.buffer.slice(
			binaryMeshData.byteOffset + offset,
			binaryMeshData.byteOffset + offset + indicesByteLength
		)
	);

	return {
		verticesArray: vertices,
		faceIndicesArray: faceIndices
	};
}
