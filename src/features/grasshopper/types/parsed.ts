/**
 * Parsed data structures for processed Grasshopper input/output
 */

import type { InputParam } from './parameters';
import type { InputParamSchema } from './schemas';
import type { OutputParamSchema } from './schemas';

/**
 * Parsed input/output structure with raw schemas
 */
export interface GrasshopperParsedIORaw {
	inputs: InputParamSchema[];
	outputs: OutputParamSchema[];
}

/**
 * Parsed input/output structure with processed types
 */
export interface GrasshopperParsedIO {
	inputs: InputParam[];
	outputs: OutputParamSchema[];
}
