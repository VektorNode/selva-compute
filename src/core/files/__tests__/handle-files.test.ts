import { describe, it, expect, vi, afterEach } from 'vitest';

import { extractFilesFromComputeResponse } from '../handle-files';
import { base64ByteArray } from '@/core/utils/encoding';
import type { FileData, FileBaseInfo } from '../types';

const fd = (over: Partial<FileData> = {}): FileData => ({
	fileName: 'model',
	data: 'hello',
	fileType: '.txt',
	isBase64Encoded: false,
	subFolder: '',
	...over
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('extractFilesFromComputeResponse — decode half', () => {
	it('passes plain-text items through unchanged', async () => {
		const [file] = await extractFilesFromComputeResponse([fd({ data: 'plain text' })]);
		expect(file).toMatchObject({
			fileName: 'model.txt',
			content: 'plain text',
			path: 'model.txt'
		});
	});

	it('decodes base64 items to binary', async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const [file] = await extractFilesFromComputeResponse([
			fd({ data: base64ByteArray(bytes), isBase64Encoded: true, fileType: '.bin' })
		]);
		expect(file.content).toBeInstanceOf(Uint8Array);
		expect(Array.from(file.content as Uint8Array)).toEqual([1, 2, 3, 4]);
	});

	it('prefixes the archive path with subFolder when present', async () => {
		const [file] = await extractFilesFromComputeResponse([
			fd({ subFolder: 'nested/dir', fileName: 'a', fileType: '.json' })
		]);
		expect(file.path).toBe('nested/dir/a.json');
		expect(file.fileName).toBe('a.json');
	});

	it('skips items with no usable data', async () => {
		const files = await extractFilesFromComputeResponse([fd({ data: '' }), fd({ data: 'kept' })]);
		expect(files).toHaveLength(1);
		expect(files[0].content).toBe('kept');
	});
});

describe('extractFilesFromComputeResponse — fetch half', () => {
	const ref: FileBaseInfo = { fileName: 'extra.bin', filePath: 'https://example.com/extra.bin' };

	it('includes successfully-fetched external files', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				blob: async () => ({ arrayBuffer: async () => new Uint8Array([9, 9]).buffer })
			})
		);

		const files = await extractFilesFromComputeResponse([fd({ data: 'a' })], ref);
		expect(files).toHaveLength(2);
		const fetched = files.find((f) => f.fileName === 'extra.bin');
		expect(fetched).toBeDefined();
		expect(Array.from(fetched!.content as Uint8Array)).toEqual([9, 9]);
	});

	// The swallow is deliberate: a failed remote fetch must drop that file and let
	// the rest proceed, never abort the batch. Pinned so it stays intentional.
	it('drops a file on a non-OK response, keeping the others', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

		const files = await extractFilesFromComputeResponse([fd({ data: 'kept' })], ref);
		expect(files).toHaveLength(1);
		expect(files[0].content).toBe('kept');
	});

	it('drops a file on a network error, keeping the others', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

		const files = await extractFilesFromComputeResponse([fd({ data: 'kept' })], ref);
		expect(files).toHaveLength(1);
		expect(files[0].content).toBe('kept');
	});
});
