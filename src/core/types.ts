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

/**
 * Retry policy for transient errors (network, 502, 503, 504, optionally 429).
 *
 * Retries use exponential backoff with jitter, capped at `maxDelayMs`.
 * If the server returns `Retry-After`, that value is honored instead.
 */
export interface RetryPolicy {
	/** Maximum number of retry attempts after the initial request (default: 0). */
	attempts?: number;
	/** Base delay in milliseconds for exponential backoff (default: 500). */
	baseDelayMs?: number;
	/** Upper bound for backoff delay (default: 30_000). */
	maxDelayMs?: number;
	/** Whether to retry on 429 responses (default: true — honors Retry-After). */
	retryOn429?: boolean;
}

export interface ComputeConfig {
	/** The base URL of the Rhino Compute server (e.g., http://localhost:6500) */
	serverUrl: string;
	/** Optional API key for authenticating with the server (RhinoComputeKey) */
	apiKey?: string;
	/** Optional Bearer token for authentication (e.g., when behind a proxy or API gateway) */
	authToken?: string;
	/** Enable debug logging to the console */
	debug?: boolean;
	/** Suppress browser security warnings in the console */
	suppressBrowserWarning?: boolean;
	/** @deprecated Renamed to `suppressBrowserWarning`. */
	suppressClientSideWarning?: boolean;
	/**
	 * Per-request timeout in milliseconds. Set to `0` to disable (useful for long
	 * solves where any timeout is the wrong answer). Default: no timeout.
	 *
	 * Uses `AbortSignal.timeout` so the timer is not throttled when the tab is hidden.
	 */
	timeoutMs?: number;
	/**
	 * Retry policy for transient errors. Default: no retries.
	 */
	retry?: RetryPolicy;
	/**
	 * Optional caller-supplied AbortSignal. Composes with the internal timeout —
	 * whichever fires first wins. Lets callers cancel in-flight requests
	 * (e.g. on component unmount or when superseding a stale solve).
	 */
	signal?: AbortSignal;
}
