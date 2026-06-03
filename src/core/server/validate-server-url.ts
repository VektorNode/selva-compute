import { RhinoComputeError, ErrorCodes } from '@/core/errors';

/** The public McNeel endpoint — disallowed as a `serverUrl`; users must point at their own server. */
const DEFAULT_PUBLIC_ENDPOINT = 'https://compute.rhino3d.com/';

/**
 * Validate and normalize a Rhino Compute `serverUrl`.
 *
 * This is the single source of truth for "is this a usable server URL?" — both
 * `GrasshopperClient` (via `normalizeComputeConfig`) and the standalone-exported
 * `ComputeServerStats` constructor delegate here, so a given URL is accepted or
 * rejected identically no matter which entry point a caller uses.
 *
 * Rules (all enforced):
 * - non-empty (after trim)
 * - `http://` or `https://` scheme
 * - parseable by `new URL()`
 * - not the default public McNeel endpoint
 *
 * @param raw - The candidate server URL.
 * @returns The normalized URL with any trailing slashes removed.
 * @throws {RhinoComputeError} `INVALID_CONFIG` if any rule fails.
 */
export function validateServerUrl(raw: string): string {
	if (!raw?.trim()) {
		throw new RhinoComputeError('serverUrl is required', ErrorCodes.INVALID_CONFIG, {
			context: { receivedServerUrl: raw }
		});
	}

	if (!raw.match(/^https?:\/\//)) {
		throw new RhinoComputeError(
			`Invalid serverUrl: "${raw}". Must start with "http://" or "https://". ` +
				`For example: "http://localhost:5000" or "https://example.com"`,
			ErrorCodes.INVALID_CONFIG,
			{ context: { receivedServerUrl: raw } }
		);
	}

	try {
		new URL(raw);
	} catch (err) {
		throw new RhinoComputeError(
			`Invalid serverUrl: "${raw}". Must be a valid URL. ` +
				`Received error: ${err instanceof Error ? err.message : String(err)}`,
			ErrorCodes.INVALID_CONFIG,
			{
				context: { receivedServerUrl: raw },
				originalError: err instanceof Error ? err : undefined
			}
		);
	}

	if (raw === DEFAULT_PUBLIC_ENDPOINT) {
		throw new RhinoComputeError(
			'serverUrl must be set to your Compute server URL. The default public endpoint is not allowed.',
			ErrorCodes.INVALID_CONFIG,
			{ context: { receivedServerUrl: raw } }
		);
	}

	return raw.replace(/\/+$/, '');
}
