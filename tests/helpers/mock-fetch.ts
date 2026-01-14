// tests/helpers/mock-fetch.ts
import { vi } from 'vitest';

/**
 * Creates a mock fetch response for testing
 */
export function createMockResponse(data: any, options: Partial<Response> = {}): Response {
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		json: async () => data,
		text: async () => JSON.stringify(data),
		blob: async () => new Blob([JSON.stringify(data)]),
		arrayBuffer: async () => new ArrayBuffer(0),
		...options
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
