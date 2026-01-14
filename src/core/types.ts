/**
 * Rhino model unit types supported by Rhino.Compute
 */
export type RhinoModelUnit =
	| 'None'
	| 'Microns'
	| 'Millimeters'
	| 'Centimeters'
	| 'Meters'
	| 'Kilometers'
	| 'Microinches'
	| 'Mils'
	| 'Inches'
	| 'Feet'
	| 'Miles'
	| 'CustomUnits'
	| 'Angstroms'
	| 'Nanometers'
	| 'Decimeters'
	| 'Dekameters'
	| 'Hectometers'
	| 'Megameters'
	| 'Gigameters'
	| 'Yards'
	| 'PrinterPoints'
	| 'PrinterPicas'
	| 'NauticalMiles'
	| 'AstronomicalUnits'
	| 'LightYears'
	| 'Parsecs'
	| 'Unset';

// ============================================================================
// Config
// ============================================================================

export interface ComputeConfig {
	/** The base URL of the Rhino Compute server (e.g., http://localhost:6500) */
	serverUrl: string;
	/** Optional API key for authenticating with the server */
	apiKey?: string;
	/** Optional auth token (Bearer token) for authentication */
	authToken?: string;
	/** Enable debug logging to the console */
	debug?: boolean;
	/** Suppress browser security warnings in the console */
	suppressClientSideWarning?: boolean;
	timeoutMs?: number;
}
