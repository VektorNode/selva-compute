import { RhinoComputeError, ErrorCodes, type ErrorCode } from '../errors';
import { getLogger } from '../utils/logger';
import { utf8ByteLength } from '../utils/encoding';

import type { ComputeConfig, RetryPolicy, ServerTiming } from '../types';

// ============================================================================
// Server-Timing
// ============================================================================

/**
 * Parse a `Server-Timing` header value into typed durations (ms).
 *
 * Header grammar (RFC 9110 §10.1.10), as emitted by the solve endpoint:
 *   `decode;dur=3, solve;dur=120, encode;dur=8`
 *
 * Returns null when the header is absent or carries no recognizable metric, so
 * the caller can skip the callback entirely.
 *
 * @internal exported for tests
 */
export function parseServerTiming(headerValue: string | null): ServerTiming | null {
	if (!headerValue) return null;
	const timing: ServerTiming = { raw: headerValue };
	let sawMetric = false;
	for (const part of headerValue.split(',')) {
		const [name, ...params] = part.trim().split(';');
		const durParam = params.find((p) => p.trim().toLowerCase().startsWith('dur'));
		if (!durParam) continue;
		const dur = Number(durParam.split('=')[1]);
		if (!Number.isFinite(dur)) continue;
		const key = name.trim().toLowerCase();
		if (key === 'decode' || key === 'solve' || key === 'encode') {
			timing[key] = dur;
			sawMetric = true;
		}
	}
	return sawMetric ? timing : null;
}

// ============================================================================
// Retry Policy
// ============================================================================

const DEFAULT_RETRY: Required<RetryPolicy> = {
	attempts: 0,
	baseDelayMs: 500,
	maxDelayMs: 30_000,
	retryOn429: true
};

const RETRYABLE_STATUS = new Set([502, 503, 504]);

function resolveRetryPolicy(policy: RetryPolicy | undefined): Required<RetryPolicy> {
	if (!policy) return DEFAULT_RETRY;
	return {
		attempts: policy.attempts ?? DEFAULT_RETRY.attempts,
		baseDelayMs: policy.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs,
		maxDelayMs: policy.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs,
		retryOn429: policy.retryOn429 ?? DEFAULT_RETRY.retryOn429
	};
}

/**
 * Parse a Retry-After header value (seconds-int or HTTP-date) into ms.
 * Returns null if the header is missing or unparseable.
 */
function parseRetryAfter(headerValue: string | null): number | null {
	if (!headerValue) return null;
	const seconds = Number(headerValue);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
	const dateMs = Date.parse(headerValue);
	if (Number.isFinite(dateMs)) {
		const delta = dateMs - Date.now();
		return delta > 0 ? delta : 0;
	}
	return null;
}

function backoffDelay(attempt: number, policy: Required<RetryPolicy>): number {
	const exponential = policy.baseDelayMs * Math.pow(2, attempt);
	const jitter = Math.random() * policy.baseDelayMs;
	return Math.min(exponential + jitter, policy.maxDelayMs);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException('Aborted', 'AbortError'));
			return;
		}
		const id = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(id);
			reject(new DOMException('Aborted', 'AbortError'));
		};
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

// ============================================================================
// Error Handling
// ============================================================================

function throwHttpError(
	response: Response,
	fullUrl: string,
	requestId: string,
	requestSize: number,
	serverUrl: string,
	errorBody: string,
	serverCode?: string
): never {
	const { status, statusText } = response;

	const responseHeaders: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		responseHeaders[key] = value;
	});

	const trimmed = errorBody.trim();
	const bodyHint = trimmed ? ` — ${trimmed.slice(0, 200)}${trimmed.length > 200 ? '…' : ''}` : '';

	const context = {
		url: fullUrl,
		requestId,
		method: 'POST',
		requestSize,
		serverUrl,
		responseBody: errorBody || undefined,
		responseHeaders
	};

	const errorMap: Record<number, { message: string; code: ErrorCode }> = {
		401: { message: `HTTP ${status}: ${statusText}${bodyHint}`, code: ErrorCodes.AUTH_ERROR },
		403: { message: `HTTP ${status}: ${statusText}${bodyHint}`, code: ErrorCodes.AUTH_ERROR },
		404: { message: `Endpoint not found: ${fullUrl}`, code: ErrorCodes.NETWORK_ERROR },
		413: {
			message: `Request too large: ${(requestSize / 1024).toFixed(2)}KB`,
			code: ErrorCodes.VALIDATION_ERROR
		},
		429: { message: `Rate limit exceeded${bodyHint}`, code: ErrorCodes.NETWORK_ERROR },
		500: { message: `Server error: ${statusText}${bodyHint}`, code: ErrorCodes.COMPUTATION_ERROR },
		502: {
			message: `Service unavailable: ${statusText}${bodyHint}`,
			code: ErrorCodes.NETWORK_ERROR
		},
		503: {
			message: `Service unavailable: ${statusText}${bodyHint}`,
			code: ErrorCodes.NETWORK_ERROR
		},
		504: {
			message: `Service unavailable: ${statusText}${bodyHint}`,
			code: ErrorCodes.NETWORK_ERROR
		}
	};

	const error = errorMap[status] || {
		message: `HTTP ${status}: ${statusText}${bodyHint}`,
		code: ErrorCodes.UNKNOWN_ERROR
	};

	// A machine code in the server's error body (e.g. "definition_not_cached")
	// outranks the status-based mapping: it's stable across the server's
	// production message-scrubbing, where the human message is replaced with a
	// generic string. Keep the status-derived message for context.
	const code = mapServerErrorCode(serverCode) ?? error.code;

	throw new RhinoComputeError(error.message, code, { statusCode: status, context });
}

/**
 * Map a server-supplied error code (from the JSON error body's `code` field) to
 * one of our {@link ErrorCodes}. Returns `undefined` for an absent or unknown
 * code so the caller falls back to its status-based mapping.
 */
function mapServerErrorCode(serverCode?: string): ErrorCode | undefined {
	switch (serverCode) {
		case 'definition_not_cached':
			return ErrorCodes.DEFINITION_NOT_CACHED;
		default:
			return undefined;
	}
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
		// `hostname` (not `host`) strips the port; IPv6 hostnames keep their
		// brackets, so `http://[::1]:6500` yields `[::1]`.
		const hostname = new URL(serverUrl).hostname.toLowerCase();
		return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
	} catch {
		return /(localhost|127\.0\.0\.1|\[::1\])/i.test(serverUrl);
	}
}

/** Server URLs already warned about missing auth — warn once per server, not per request. */
const warnedNoAuth = new Set<string>();

function buildHeaders(requestId: string, config: ComputeConfig): HeadersInit {
	const headers: HeadersInit = {
		'X-Request-ID': requestId,
		'Content-Type': 'application/json',
		...(config.authToken && { Authorization: config.authToken }),
		...(config.apiKey && { RhinoComputeKey: config.apiKey })
	};

	if (
		!config.apiKey &&
		!config.authToken &&
		!warnedNoAuth.has(config.serverUrl) &&
		!isLocalhost(config.serverUrl)
	) {
		warnedNoAuth.add(config.serverUrl);
		getLogger().warn(
			`⚠️ [Rhino Compute] Request [${requestId}] targets remote server (${config.serverUrl}) but no API key or auth token is configured. Requests may fail or be rate-limited. (warned once per server)`
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

/**
 * Compose a caller-supplied AbortSignal with an optional timeout. Returns a
 * combined signal, or `undefined` if neither was given.
 *
 * Uses `AbortSignal.timeout` (not setTimeout) so the timer is not throttled
 * when the tab is hidden. Falls back to a manual timer for older runtimes.
 *
 * @internal exported for tests
 */
export function composeSignal(
	callerSignal: AbortSignal | undefined,
	timeoutMs: number | undefined
): { signal: AbortSignal | undefined; cleanup: () => void } {
	const signals: AbortSignal[] = [];
	let cleanup = () => {};

	if (callerSignal) signals.push(callerSignal);

	if (timeoutMs && timeoutMs > 0) {
		if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
			signals.push(AbortSignal.timeout(timeoutMs));
		} else {
			// Fallback for runtimes without AbortSignal.timeout
			const ctrl = new AbortController();
			const id = setTimeout(() => ctrl.abort(), timeoutMs);
			cleanup = () => clearTimeout(id);
			signals.push(ctrl.signal);
		}
	}

	if (signals.length === 0) return { signal: undefined, cleanup };
	if (signals.length === 1) return { signal: signals[0], cleanup };

	if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).any === 'function') {
		return { signal: (AbortSignal as any).any(signals) as AbortSignal, cleanup };
	}

	// Manual composition fallback
	const ctrl = new AbortController();
	const onAbort = () => ctrl.abort();
	for (const s of signals) {
		if (s.aborted) {
			ctrl.abort();
			break;
		}
		s.addEventListener('abort', onAbort, { once: true });
	}
	const prevCleanup = cleanup;
	cleanup = () => {
		prevCleanup();
		for (const s of signals) s.removeEventListener('abort', onAbort);
	};
	return { signal: ctrl.signal, cleanup };
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
	debug?: boolean,
	onServerTiming?: (timing: ServerTiming) => void
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

		// A machine-readable code the server may tag onto its error body (e.g.
		// "definition_not_cached"). Unlike the human `message`, it isn't scrubbed in
		// the server's production (non-debug) mode, so it's the reliable signal for
		// classifying the error (see throwHttpError → mapServerErrorCode).
		let serverCode: string | undefined;

		// The machine code (e.g. `definition_not_cached`) can ride any error status,
		// not just 500, and must outrank the status-based mapping — so read it here.
		try {
			const parsedForCode = JSON.parse(errorBody);
			if (typeof parsedForCode?.code === 'string') serverCode = parsedForCode.code;
		} catch {
			// Non-JSON body — nothing to extract.
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

				// Raw server-side exception. The Compute8 server's exception handler
				// (compute.geometry Startup.cs) emits:
				//   { error: "Internal Server Error", message: "<category>: <detail>",
				//     stackTrace?: string[] }   // stackTrace only when Config.Debug
				// The actionable part is `message` — surface it, with the optional
				// stack appended for debugging. We prefer `message`/`error` (current
				// server) and keep `Message`/`ExceptionType`/`StackTrace` (old
				// PascalCase .NET shape) as a back-compat fallback so an older server
				// still produces a useful message.
				const serverMessage =
					(typeof parsed?.message === 'string' && parsed.message) ||
					(typeof parsed?.Message === 'string' && parsed.Message) ||
					'';
				const exceptionType =
					(typeof parsed?.ExceptionType === 'string' && parsed.ExceptionType) || '';
				const stack = parsed?.stackTrace ?? parsed?.StackTrace;
				const stackStr = Array.isArray(stack) ? stack.join('\n') : stack || '';

				if (serverMessage) {
					// Don't repeat the generic "Internal Server Error" label when the
					// message already carries the real detail.
					const prefix = exceptionType ? `${exceptionType}: ` : '';
					errorBody = `${prefix}${serverMessage}${stackStr ? `\n${stackStr}` : ''}`;
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

		throwHttpError(response, fullUrl, requestId, requestSize, serverUrl, errorBody, serverCode);
	}

	log(`✅ Request [${requestId}] completed in ${responseTime}ms`, debug);

	// Surface the server's per-request timing breakdown (if it sent one and a
	// caller is listening). Best-effort: a throwing callback must not fail the
	// request, since the body parse below is the real result.
	if (onServerTiming) {
		const timing = parseServerTiming(response.headers.get('Server-Timing'));
		if (timing) {
			try {
				onServerTiming(timing);
			} catch (err) {
				if (debug) log(`   onServerTiming callback threw: ${err}`, true);
			}
		}
	}

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
// Single attempt
// ============================================================================

interface AttemptContext {
	endpoint: string;
	body: string;
	requestSize: number;
	fullUrl: string;
	requestId: string;
	headers: HeadersInit;
	config: ComputeConfig;
}

interface AttemptResult {
	ok: true;
	value: any;
}

interface AttemptRetry {
	ok: false;
	retry: true;
	delayMs: number;
	cause: RhinoComputeError;
}

interface AttemptFatal {
	ok: false;
	retry: false;
	cause: RhinoComputeError;
}

async function attemptFetch(
	ctx: AttemptContext,
	retryPolicy: Required<RetryPolicy>,
	attempt: number,
	totalAttempts: number
): Promise<AttemptResult | AttemptRetry | AttemptFatal> {
	const { signal, cleanup } = composeSignal(ctx.config.signal, ctx.config.timeoutMs);
	const startTime = performance.now();

	try {
		const response = await fetch(ctx.fullUrl, {
			method: 'POST',
			body: ctx.body,
			headers: ctx.headers,
			signal
		});

		// 429 with Retry-After or retryable 5xx → maybe retry
		const isRetryableStatus =
			RETRYABLE_STATUS.has(response.status) || (retryPolicy.retryOn429 && response.status === 429);

		if (isRetryableStatus && attempt < totalAttempts - 1) {
			const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
			// Clamp Retry-After to maxDelayMs so a bad header can't force an
			// arbitrarily long sleep. backoffDelay already clamps.
			const delayMs =
				retryAfterMs !== null
					? Math.min(retryAfterMs, retryPolicy.maxDelayMs)
					: backoffDelay(attempt, retryPolicy);
			// Drain the body so the connection can be reused on the next attempt.
			// On the *final* attempt we deliberately fall through — handleResponse
			// reads the body itself to surface the error context.
			await response.text().catch(() => {});
			return {
				ok: false,
				retry: true,
				delayMs,
				cause: new RhinoComputeError(
					`HTTP ${response.status} ${response.statusText} (will retry)`,
					ErrorCodes.NETWORK_ERROR,
					{ statusCode: response.status, context: { requestId: ctx.requestId } }
				)
			};
		}

		const value = await handleResponse(
			response,
			ctx.fullUrl,
			ctx.requestId,
			ctx.requestSize,
			ctx.config.serverUrl,
			startTime,
			ctx.config.debug,
			ctx.config.onServerTiming
		);
		return { ok: true, value };
	} catch (error) {
		// Caller-aborted vs timeout-aborted distinction
		if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
			const callerAborted = ctx.config.signal?.aborted === true;

			if (callerAborted) {
				// Caller cancellation is never retried — propagate immediately
				return {
					ok: false,
					retry: false,
					cause: new RhinoComputeError('Request aborted by caller', ErrorCodes.ABORTED, {
						context: {
							endpoint: ctx.endpoint,
							requestId: ctx.requestId,
							requestSize: ctx.requestSize
						},
						originalError: error
					})
				};
			}

			// Timeout — retryable up to attempts limit
			const fatal = new RhinoComputeError(
				`Request timed out after ${ctx.config.timeoutMs}ms`,
				ErrorCodes.TIMEOUT_ERROR,
				{
					context: {
						serverUrl: ctx.config.serverUrl,
						timeoutMs: ctx.config.timeoutMs,
						url: ctx.fullUrl,
						requestId: ctx.requestId,
						endpoint: ctx.endpoint,
						requestSize: ctx.requestSize
					}
				}
			);
			if (attempt < totalAttempts - 1) {
				return {
					ok: false,
					retry: true,
					delayMs: backoffDelay(attempt, retryPolicy),
					cause: fatal
				};
			}
			return { ok: false, retry: false, cause: fatal };
		}

		// Network error (TypeError) — retryable
		if (error instanceof TypeError) {
			const fatal = new RhinoComputeError(
				`Network error: ${error.message}`,
				ErrorCodes.NETWORK_ERROR,
				{
					context: {
						serverUrl: ctx.config.serverUrl,
						url: ctx.fullUrl,
						requestId: ctx.requestId,
						endpoint: ctx.endpoint,
						requestSize: ctx.requestSize
					},
					originalError: error
				}
			);
			if (attempt < totalAttempts - 1) {
				return {
					ok: false,
					retry: true,
					delayMs: backoffDelay(attempt, retryPolicy),
					cause: fatal
				};
			}
			return { ok: false, retry: false, cause: fatal };
		}

		// RhinoComputeError thrown from handleResponse — already has full context.
		// Retryable only if it carries a retryable status code.
		if (error instanceof RhinoComputeError) {
			const status = error.statusCode;
			// A 2xx whose body failed to parse (NETWORK_ERROR from handleResponse)
			// means the stream was cut mid-body — as transient as any network error.
			const isTruncatedSuccess =
				error.code === ErrorCodes.NETWORK_ERROR &&
				status !== undefined &&
				status >= 200 &&
				status < 300;
			const retryable =
				isTruncatedSuccess ||
				(status !== undefined &&
					(RETRYABLE_STATUS.has(status) || (retryPolicy.retryOn429 && status === 429)));
			if (retryable && attempt < totalAttempts - 1) {
				return {
					ok: false,
					retry: true,
					delayMs: backoffDelay(attempt, retryPolicy),
					cause: error
				};
			}
			return { ok: false, retry: false, cause: error };
		}

		// Unknown — wrap and don't retry
		return {
			ok: false,
			retry: false,
			cause: new RhinoComputeError(
				error instanceof Error ? error.message : String(error),
				ErrorCodes.UNKNOWN_ERROR,
				{
					context: { endpoint: ctx.endpoint, requestId: ctx.requestId },
					originalError: error instanceof Error ? error : new Error(String(error))
				}
			)
		};
	} finally {
		cleanup();
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
 * The transport is response-type-agnostic: it does not know which response a
 * given endpoint returns. Callers supply the response type via `R` (defaulting
 * to `unknown`, which forces an explicit narrowing before use).
 *
 * @typeParam R - The expected response shape. The caller names it at the call site.
 * @param endpoint - The Compute API endpoint (e.g., 'grasshopper', 'io', 'mesh').
 * @param args - Pre-prepared arguments for the request body.
 * @param config - Compute configuration (server URL, API key, timeout, debug, retry, signal).
 * @returns The parsed JSON response from the server, typed as `R`.
 *
 * @example
 * // Basic usage for the Grasshopper endpoint:
 * const response = await fetchRhinoCompute(
 *   'grasshopper',
 *   { ... },
 *   {
 *     serverUrl: 'https://my-server.com',
 *     debug: true,
 *     timeoutMs: 30_000,
 *     retry: { attempts: 2 },
 *     signal: controller.signal,
 *   }
 * );
 */
export async function fetchRhinoCompute<R = unknown>(
	endpoint: string,
	args: Record<string, any>,
	config: ComputeConfig
): Promise<R> {
	const requestId = generateRequestId();
	const body = JSON.stringify(args);
	// Wire size in UTF-8 bytes — `body.length` counts UTF-16 code units and
	// undercounts non-ASCII payloads (matters for the 413 message and size logs).
	const requestSize = utf8ByteLength(body);
	const fullUrl = buildUrl(endpoint, config.serverUrl);
	const headers = buildHeaders(requestId, config);
	const retryPolicy = resolveRetryPolicy(config.retry);
	const totalAttempts = retryPolicy.attempts + 1;

	if (config.debug) {
		const sizeKb = (requestSize / 1024).toFixed(2);
		const emoji = requestSize > 100000 ? '⚠️' : '🚀';
		log(`${emoji} Starting compute request [${requestId}]: ${endpoint} (${sizeKb}KB)`, true);
	}

	const ctx: AttemptContext = {
		endpoint,
		body,
		requestSize,
		fullUrl,
		requestId,
		headers,
		config
	};

	let lastError: RhinoComputeError | null = null;

	for (let attempt = 0; attempt < totalAttempts; attempt++) {
		const result = await attemptFetch(ctx, retryPolicy, attempt, totalAttempts);

		if (result.ok) return result.value as R;

		if (!result.retry) throw result.cause;

		lastError = result.cause;
		if (config.debug) {
			log(
				`🔁 Request [${requestId}] retrying after ${result.delayMs}ms (attempt ${attempt + 2}/${totalAttempts}): ${result.cause.message}`,
				true
			);
		}

		try {
			await sleep(result.delayMs, config.signal);
		} catch {
			// Caller cancelled during backoff
			throw new RhinoComputeError('Request aborted by caller', ErrorCodes.ABORTED, {
				context: { endpoint, requestId, requestSize },
				originalError: lastError
			});
		}
	}

	// Exhausted retries — throw the last seen error
	throw (
		lastError ??
		new RhinoComputeError('Unknown error after retries', ErrorCodes.UNKNOWN_ERROR, {
			context: { endpoint, requestId, requestSize }
		})
	);
}
