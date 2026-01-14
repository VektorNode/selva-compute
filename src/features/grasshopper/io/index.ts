/**
 * Grasshopper I/O processing - explicit public re-exports
 *
 * This module consolidates input/output processing utilities for
 * Grasshopper definition I/O and parameter handling.
 */

// ============================================================================
// DEFINITION I/O
// ============================================================================
export { fetchDefinitionIO, fetchParsedDefinitionIO } from './definition-io';

// ============================================================================
// INPUT PROCESSING
// ============================================================================
export { processInput, processInputs } from './input';
export type { ValidationContext } from './input';

// ============================================================================
// OUTPUT PROCESSING
// ============================================================================
export {
	getValues,
	getValue,
	extractFileData,
	registerDecoder,
	decodeRhinoGeometry,
	decodeRhinoObject
} from './output';
export type { GetValuesOptions, GetValuesResult, ParsedContext, DecodeRhinoOptions } from './output';
