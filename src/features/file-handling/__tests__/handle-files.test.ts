import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RhinoComputeError, ErrorCodes } from '@/core';
import {
	extractFilesFromComputeResponse,
	downloadFileData
} from '../handle-files';
import type { FileData } from '../types';

describe('handle-files', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('extractFilesFromComputeResponse', () => {
		it('should extract base64-encoded files from compute response', async () => {
			const fileData: FileData[] = [
				{
					FileName: 'test',
					FileType: '.txt',
					Data: Buffer.from('Hello World').toString('base64'),
					IsBase64Encoded: true,
					SubFolder: ''
				}
			];

			const result = await extractFilesFromComputeResponse(fileData);

			expect(result).toHaveLength(1);
			expect(result[0].fileName).toBe('test.txt');
			expect(result[0].path).toBe('test.txt');
			expect(result[0].content).toBeInstanceOf(Uint8Array);
		});

		it('should extract non-encoded files from compute response', async () => {
			const fileData: FileData[] = [
				{
					FileName: 'data',
					FileType: '.json',
					Data: '{"key": "value"}',
					IsBase64Encoded: false,
					SubFolder: ''
				}
			];

			const result = await extractFilesFromComputeResponse(fileData);

			expect(result).toHaveLength(1);
			expect(result[0].fileName).toBe('data.json');
			expect(result[0].content).toBe('{"key": "value"}');
		});

		it('should handle files with subfolders', async () => {
			const fileData: FileData[] = [
				{
					FileName: 'nested',
					FileType: '.txt',
					Data: Buffer.from('test').toString('base64'),
					IsBase64Encoded: true,
					SubFolder: 'subfolder'
				}
			];

			const result = await extractFilesFromComputeResponse(fileData);

			expect(result).toHaveLength(1);
			expect(result[0].path).toBe('subfolder/nested.txt');
		});

		it('should throw RhinoComputeError on processing failure', async () => {
			const invalidFileData: any = [
				{
					FileName: 'test',
					FileType: '.txt',
					Data: 'invalid-base64!!!',
					IsBase64Encoded: true,
					SubFolder: ''
				}
			];

			await expect(extractFilesFromComputeResponse(invalidFileData)).rejects.toThrow(
				RhinoComputeError
			);
		});
	});

	describe('downloadFileData', () => {
		it('should throw BROWSER_ONLY error in Node.js environment', async () => {
			const fileData: FileData[] = [
				{
					FileName: 'test',
					FileType: '.txt',
					Data: Buffer.from('test').toString('base64'),
					IsBase64Encoded: true,
					SubFolder: ''
				}
			];

			await expect(downloadFileData(fileData, 'test-folder')).rejects.toThrow(RhinoComputeError);

			try {
				await downloadFileData(fileData, 'test-folder');
			} catch (error) {
				expect(error).toBeInstanceOf(RhinoComputeError);
				expect((error as RhinoComputeError).code).toBe(ErrorCodes.BROWSER_ONLY);
			}
		});

		it('should validate that document API is required', async () => {
			const fileData: FileData[] = [];

			try {
				await downloadFileData(fileData, 'test');
			} catch (error) {
				expect(error).toBeInstanceOf(RhinoComputeError);
				expect((error as RhinoComputeError).message).toContain('browser environments');
			}
		});
	});
});
