// tests/setup.ts
import { afterEach, vi } from 'vitest';

// Mock browser APIs if needed
if (typeof window === 'undefined') {
	global.window = {} as any;
}

// Stash Node's native fetch before stubbing so opt-in live suites can restore
// it (see tests/contract/*.live.test.ts). Unit suites use the stub below.
(globalThis as any).__nativeFetch = global.fetch;

// Setup global mocks
global.fetch = vi.fn();

// Cleanup after each test
afterEach(() => {
	vi.clearAllMocks();
});
