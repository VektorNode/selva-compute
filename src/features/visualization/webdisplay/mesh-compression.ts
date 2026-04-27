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

/**
 * Decompresses batched mesh data asynchronously using requestIdleCallback for non-blocking decompression.
 *
 * @internal Low-level decompression helper — keep internal to `@selvajs/compute`.
 * @param base64String - The base64-encoded compressed data.
 * @returns Promise resolving to decompressed vertices and faces arrays.
 * @throws {RhinoComputeError} If decompression fails or data is invalid.
 */
export async function decompressBatchedMeshData(
	base64String: string
): Promise<DecompressedMeshData> {
	return new Promise((resolve, reject) => {
		try {
			// Use requestIdleCallback for non-blocking decompression if available
			const decompressFn = () => {
				try {
					const bytes = decodeBase64ToBinary(base64String);
					const decompressedData = fflate.gunzipSync(bytes);
					const result = parseBatchedMeshBinaryData(decompressedData);
					resolve(result);
				} catch (error) {
					reject(
						new RhinoComputeError(
							error instanceof RhinoComputeError
								? error.message
								: `Failed to decompress batched data: ${error instanceof Error ? error.message : String(error)}`,
							error instanceof RhinoComputeError ? error.code : ErrorCodes.VALIDATION_ERROR,
							{
								context: { base64StringLength: base64String.length },
								originalError: error instanceof Error ? error : new Error(String(error))
							}
						)
					);
				}
			};

			if ('requestIdleCallback' in globalThis) {
				(globalThis as any).requestIdleCallback(decompressFn, { timeout: 5000 });
			} else {
				// Fallback: use setTimeout with 0 delay to yield to other tasks
				setTimeout(decompressFn, 0);
			}
		} catch (error) {
			reject(
				new RhinoComputeError(
					`Failed to schedule decompression: ${error instanceof Error ? error.message : String(error)}`,
					ErrorCodes.VALIDATION_ERROR,
					{ originalError: error instanceof Error ? error : new Error(String(error)) }
				)
			);
		}
	});
}

/**
 * Parses batched binary mesh data (all vertices and faces together).
 * @param binaryMeshData - The binary mesh data to parse.
 * @returns The parsed mesh data with vertices and faces.
 * @throws {RhinoComputeError} If data is invalid or insufficient.
 */
function parseBatchedMeshBinaryData(binaryMeshData: Uint8Array): DecompressedMeshData {
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

	// slice() detaches the views from the gunzip buffer so downstream in-place
	// mutations (coordinate transform) don't write back into shared memory.
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

	const faces = new Uint32Array(
		binaryMeshData.buffer.slice(
			binaryMeshData.byteOffset + offset,
			binaryMeshData.byteOffset + offset + indicesByteLength
		)
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
