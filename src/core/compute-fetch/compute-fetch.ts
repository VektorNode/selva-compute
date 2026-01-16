import { RhinoComputeError, ErrorCodes } from '../errors';
import { getLogger } from '../utils/logger';

import type { ComputeConfig } from '../types';
import type {
	GrasshopperComputeConfig,
	GrasshopperComputeResponse,
	IoResponseSchema
} from '@/features/grasshopper/types';

/**
 * Valid endpoints for Rhino Compute (improved response type handling).
 */
export type Endpoint = 'grasshopper' | 'io' | string;

export type EndpointResponseMap = {
	grasshopper: GrasshopperComputeResponse;
	io: IoResponseSchema;
};

export type ComputeResponseFor<E extends string> = E extends keyof EndpointResponseMap
	? EndpointResponseMap[E]
	: unknown;

// ============================================================================
// Error Handling
// ============================================================================

function throwHttpError(
	response: Response,
	fullUrl: string,
	requestId: string,
	requestSize: number,
	serverUrl: string,
	errorBody: string
): never {
	const { status, statusText } = response;
	const context = { url: fullUrl, requestId, method: 'POST', requestSize, serverUrl };

	const errorMap: Record<number, { message: string; code: string }> = {
		401: { message: `HTTP ${status}: ${statusText}`, code: ErrorCodes.AUTH_ERROR },
		403: { message: `HTTP ${status}: ${statusText}`, code: ErrorCodes.AUTH_ERROR },
		404: { message: `Endpoint not found: ${fullUrl}`, code: ErrorCodes.NETWORK_ERROR },
		413: {
			message: `Request too large: ${(requestSize / 1024).toFixed(2)}KB`,
			code: ErrorCodes.VALIDATION_ERROR
		},
		429: { message: 'Rate limit exceeded', code: ErrorCodes.NETWORK_ERROR },
		500: {
			message: `Server error: ${errorBody || statusText}`,
			code: ErrorCodes.COMPUTATION_ERROR
		},
		502: { message: `Service unavailable: ${statusText}`, code: ErrorCodes.NETWORK_ERROR },
		503: { message: `Service unavailable: ${statusText}`, code: ErrorCodes.NETWORK_ERROR },
		504: { message: `Service unavailable: ${statusText}`, code: ErrorCodes.NETWORK_ERROR }
	};

	const error = errorMap[status] || {
		message: `HTTP ${status}: ${statusText}`,
		code: ErrorCodes.UNKNOWN_ERROR
	};

	throw new RhinoComputeError(error.message, error.code, { statusCode: status, context });
}

// ============================================================================
// Request Helpers
// ============================================================================

function buildUrl(endpoint: string, serverUrl: string): string {
	const base = serverUrl.replace(/\/+$/, '');
	const path = endpoint.replace(/^\/+/, '');
	return `${base}/${path}`;
}

function isLocalhost(serverUrl: string): boolean {
	try {
		const host = new URL(serverUrl).host;
		return /^(localhost|127\.0\.0\.1|::1)(:\d+)?$/i.test(host);
	} catch {
		return /(localhost|127\.0\.0\.1)/i.test(serverUrl);
	}
}

function buildHeaders(requestId: string, config: ComputeConfig): HeadersInit {
	const headers: HeadersInit = {
		'X-Request-ID': requestId,
		'Content-Type': 'application/json',
		...(config.authToken && { Authorization: config.authToken }),
		...(config.apiKey && { RhinoComputeKey: config.apiKey })
	};

	if (!config.apiKey && !isLocalhost(config.serverUrl)) {
		getLogger().warn(
			`⚠️ [Rhino Compute] Request [${requestId}] targets remote server (${config.serverUrl}) but no API key is configured. Requests may fail or be rate-limited.`
		);
	}

	return headers;
}

function generateRequestId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function log(message: string, debug?: boolean): void {
	if (debug) getLogger().debug(message);
}

// ============================================================================
// Response Processing
// ============================================================================

async function handleResponse(
	response: Response,
	fullUrl: string,
	requestId: string,
	requestSize: number,
	serverUrl: string,
	startTime: number,
	debug?: boolean
): Promise<any> {
	const responseTime = Math.round(performance.now() - startTime);

	if (!response.ok) {
		// Read body once and reuse
		let errorBody = await response.text();

		// Enhanced logging for errors
		if (debug) {
			log(
				`❌ Request [${requestId}] failed with HTTP ${response.status} in ${responseTime}ms`,
				true
			);
			log(`   URL: ${fullUrl}`, true);
			log(`   Status: ${response.status} ${response.statusText}`, true);
			if (errorBody) {
				log(
					`   Response body: ${errorBody.substring(0, 500)}${errorBody.length > 500 ? '...' : ''}`,
					true
				);
			}
		}

		// Check if it's a valid compute response with errors/warnings
		if (response.status === 500) {
			try {
				const parsed = JSON.parse(errorBody);
				// If it has values, it's a partial success with errors
				if (parsed?.values && (parsed.errors || parsed.warnings)) {
					if (debug) {
						log(
							`⚠️ Request [${requestId}] completed with Grasshopper errors in ${responseTime}ms`,
							true
						);
						if (parsed.errors?.length > 0) {
							log(`   Errors: ${JSON.stringify(parsed.errors, null, 2)}`, true);
						}
						if (parsed.warnings?.length > 0) {
							log(`   Warnings: ${JSON.stringify(parsed.warnings, null, 2)}`, true);
						}
					}
					return parsed;
				}

				// If it's a raw exception from the server (like ArgumentException), include it in the error message
				if (parsed?.Message) {
					errorBody = `${parsed.ExceptionType ? parsed.ExceptionType + ': ' : ''}${parsed.Message}\n${parsed.StackTrace || ''}`;
				} else if (parsed?.error) {
					errorBody =
						typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error, null, 2);
				}
			} catch (e) {
				if (debug) {
					log(`   Failed to parse error body as JSON: ${e}`, true);
				}
				// Not valid JSON, proceed with HTTP error
			}
		}

		throwHttpError(response, fullUrl, requestId, requestSize, serverUrl, errorBody);
	}

	log(`✅ Request [${requestId}] completed in ${responseTime}ms`, debug);

	try {
		return await response.json();
	} catch (error) {
		throw new RhinoComputeError('Failed to parse JSON response', ErrorCodes.NETWORK_ERROR, {
			statusCode: response.status,
			context: {
				url: fullUrl,
				requestId
			},
			originalError: error instanceof Error ? error : new Error(String(error))
		});
	}
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generic Rhino Compute fetch function.
 * Sends a POST request to any Compute endpoint with pre-prepared arguments.
 *
 * Use this for advanced, low-level control over compute requests. For most use cases, prefer higher-level APIs.
 *
 * @typeParam E - The endpoint name (e.g., 'grasshopper', 'io'). Determines the response type for better type safety.
 * @param endpoint - The Compute API endpoint (e.g., 'grasshopper', 'io', 'mesh').
 * @param args - Pre-prepared arguments for the request body.
 * @param config - Compute configuration (server URL, API key, timeout, debug).
 * @returns The parsed JSON response from the server, typed according to the endpoint.
 *
 * @example
 * // Basic usage for the Grasshopper endpoint:
 * const response = await fetchRhinoCompute(
 *   'grasshopper',
 *   {
 *     pointer: { url: 'https://example.com/definition.gh' },
 *     values: [{ ParamName: 'x', InnerTree: { '0': [{ type: 'System.Double', data: 10 }] } }]
 *   },
 *   { serverUrl: 'https://my-server.com', debug: true, timeoutMs: 30000 }
 * );
 */
export async function fetchRhinoCompute<E extends Endpoint>(
	endpoint: E,
	args: Record<string, any>,
	config: ComputeConfig | GrasshopperComputeConfig
): Promise<ComputeResponseFor<E>> {
	const requestId = generateRequestId();
	const body = JSON.stringify(args);
	const requestSize = body.length;
	const fullUrl = buildUrl(endpoint, config.serverUrl);

	if (config.debug) {
		const sizeKb = (requestSize / 1024).toFixed(2);
		const emoji = requestSize > 100000 ? '⚠️' : '🚀';
		log(`${emoji} Starting compute request [${requestId}]: ${endpoint} (${sizeKb}KB)`, true);
	}

	const controller = new AbortController();
	const timeoutId = config.timeoutMs
		? setTimeout(() => controller.abort(), config.timeoutMs)
		: null;

	try {
		const startTime = performance.now();
		const response = await fetch(fullUrl, {
			method: 'POST',
			body,
			headers: buildHeaders(requestId, config),
			signal: controller.signal
		});

		return await handleResponse(
			response,
			fullUrl,
			requestId,
			requestSize,
			config.serverUrl,
			startTime,
			config.debug
		);
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError' && config.timeoutMs) {
			throw new RhinoComputeError(
				`Request timed out after ${config.timeoutMs}ms`,
				ErrorCodes.TIMEOUT_ERROR,
				{
					context: {
						serverUrl: config.serverUrl,
						timeoutMs: config.timeoutMs,
						url: fullUrl,
						requestId,
						args
					}
				}
			);
		}

		// Handle fetch errors (network issues, connection refused, etc.)
		if (error instanceof TypeError) {
			throw new RhinoComputeError(`Network error: ${error.message}`, ErrorCodes.NETWORK_ERROR, {
				context: {
					serverUrl: config.serverUrl,
					url: fullUrl,
					requestId,
					endpoint
				},
				originalError: error
			});
		}

		// Wrap any unhandled errors
		if (error instanceof RhinoComputeError) {
			throw error;
		}

		throw new RhinoComputeError(
			error instanceof Error ? error.message : String(error),
			ErrorCodes.UNKNOWN_ERROR,
			{
				context: { endpoint, requestId },
				originalError: error instanceof Error ? error : new Error(String(error))
			}
		);
	} finally {
		if (timeoutId !== null) clearTimeout(timeoutId);
	}
}
