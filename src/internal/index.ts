/**
 * Internal-only re-exports for `@selva/compute`.
 *
 * These are implementation details exposed under the opt-in `@selva/compute/internal`
 * namespace for advanced use cases only. They are **not** part of the public API
 * and may change without notice.
 *
 * @example
 * ```typescript
 * // Only use if you really know what you're doing
 * import { zipArgs } from '@selva/compute/internal';
 * ```
 */

// ============================================================================
// ENCODING UTILITIES
// ============================================================================
export {
	base64ByteArray,
	decodeBase64ToBinary,
	base64ToRhinoObject,
	encodeStringToBase64,
	decodeBase64ToString,
	isBase64
} from '../core/utils/encoding';

// ============================================================================
// ARGUMENT UTILITIES
// ============================================================================
export { zipArgs } from '../core/utils/args';

// ============================================================================
// MESH PROCESSING UTILITIES
// ============================================================================
export { parseMeshBatch } from '../features/visualization/webdisplay';
export { decompressMeshData, decompressBatchedMeshData } from '../features/visualization/webdisplay/mesh-compression';
