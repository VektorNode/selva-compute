// tests/helpers/mock-fetch.ts
import { vi } from 'vitest';

interface MockResponseOptions {
	ok?: boolean;
	status?: number;
	statusText?: string;
	/** Response headers (e.g. { 'Retry-After': '2' }). */
	headers?: Record<string, string>;
	/**
	 * Raw response body. When provided, `text()` returns it verbatim and
	 * `json()` parses it — use this to exercise non-JSON or partial-success
	 * bodies. When omitted, the body is `JSON.stringify(data)`.
	 */
	body?: string;
}

/**
 * Creates a mock fetch Response for testing. Includes a real `Headers` object
 * so transport code that does `response.headers.forEach(...)` /
 * `response.headers.get(...)` works as it would against a real Response.
 */
export function createMockResponse(data: any, options: MockResponseOptions = {}): Response {
	const { ok = true, status = 200, statusText = 'OK', headers = {}, body } = options;
	const text = body ?? JSON.stringify(data);

	return {
		ok,
		status,
		statusText,
		headers: new Headers(headers),
		json: async () => JSON.parse(text),
		text: async () => text,
		blob: async () => new Blob([text]),
		arrayBuffer: async () => new ArrayBuffer(0)
	} as Response;
}

/**
 * Creates a mock fetch function that returns a specific response
 */
export function mockFetchSuccess(data: any) {
	return vi.fn().mockResolvedValue(createMockResponse(data));
}

/**
 * Creates a mock fetch function that returns an error
 */
export function mockFetchError(
	statusCode: number = 500,
	statusText: string = 'Internal Server Error'
) {
	return vi.fn().mockResolvedValue(
		createMockResponse(
			{ error: statusText },
			{
				ok: false,
				status: statusCode,
				statusText
			}
		)
	);
}

/**
 * Creates a mock fetch function that rejects with a network error
 */
export function mockFetchNetworkError(message: string = 'Network error') {
	return vi.fn().mockRejectedValue(new Error(message));
}
