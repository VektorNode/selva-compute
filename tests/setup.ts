// tests/setup.ts
import { afterEach, vi } from 'vitest';

// Mock browser APIs if needed
if (typeof window === 'undefined') {
	global.window = {} as any;
}

// Setup global mocks
global.fetch = vi.fn();

// Cleanup after each test
afterEach(() => {
	vi.clearAllMocks();
});
