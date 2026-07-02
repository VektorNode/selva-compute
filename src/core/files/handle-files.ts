import { RhinoComputeError, ErrorCodes } from '@/core/errors';
import { getLogger } from '@/core/utils/logger';
import { decodeBase64ToBinary } from '@/core/utils/encoding';

import { FileBaseInfo, FileData, ProcessedFile } from './types';

/**
 * Extracts and processes files from compute response data without downloading them.
 * Returns an array of ProcessedFile objects that can be used programmatically.
 *
 * @param downloadableFiles - An array of FileData items from the compute response.
 * @param additionalFiles - Optional additional files to include (fetched from URLs).
 * @returns A Promise resolving to an array of ProcessedFile objects.
 * @throws Will throw an error if file processing fails.
 *
 * @example
 * const files = await extractFilesFromComputeResponse(fileData);
 * files.forEach(file => {
 *   console.log(`File: ${file.fileName}, Size: ${file.content.length}`);
 * });
 */
export const extractFilesFromComputeResponse = async (
	downloadableFiles: FileData[],
	additionalFiles: FileBaseInfo[] | FileBaseInfo | null = null
): Promise<ProcessedFile[]> => {
	try {
		return await processFiles(downloadableFiles, additionalFiles);
	} catch (err) {
		throw new RhinoComputeError(
			'Failed to extract files from compute response',
			ErrorCodes.INVALID_STATE,
			{
				context: { originalError: err instanceof Error ? err.message : String(err) },
				originalError: err instanceof Error ? err : undefined
			}
		);
	}
};

/**
 * Downloads files from a compute response as a ZIP archive.
 * Packages multiple files into a single ZIP file and triggers a browser download.
 *
 * @param downloadableFiles - An array of FileData items from the compute response.
 * @param additionalFiles - Optional additional files to include in the ZIP (fetched from URLs).
 * @param fileFoldername - The name of the ZIP file (without extension).
 * @throws Will throw an error if the file handling or download fails.
 *
 * @example
 * await downloadDataFromComputeResponse(fileData, null, 'my-export');
 * // Downloads 'my-export.zip'
 */
export const downloadFileData = async (
	downloadableFiles: FileData[],
	fileFoldername: string,
	additionalFiles: FileBaseInfo[] | FileBaseInfo | null = null
): Promise<void> => {
	// Check if we're in a browser environment
	if (typeof document === 'undefined' || typeof Blob === 'undefined') {
		throw new RhinoComputeError(
			'File download functionality is only available in browser environments. This function requires the DOM API (document, Blob).',
			ErrorCodes.BROWSER_ONLY,
			{
				context: {
					environment: typeof window !== 'undefined' ? 'browser (SSR)' : 'Node.js',
					documentAvailable: typeof document !== 'undefined',
					blobAvailable: typeof Blob !== 'undefined'
				}
			}
		);
	}

	try {
		const processedFiles = await processFiles(downloadableFiles, additionalFiles);
		await createAndDownloadZip(processedFiles, fileFoldername);
	} catch (err) {
		// Re-throw if it's already a RhinoComputeError
		if (err instanceof RhinoComputeError) {
			throw err;
		}
		throw new RhinoComputeError(
			'Failed to download files from compute response',
			ErrorCodes.INVALID_STATE,
			{
				context: { originalError: err instanceof Error ? err.message : String(err) },
				originalError: err instanceof Error ? err : undefined
			}
		);
	}
};

/**
 * Decode the inline files carried in a compute response into `ProcessedFile`s.
 *
 * Pure and synchronous: base64 items are decoded to binary, plain-text items are
 * passed through, and the archive path is derived from `subFolder` + name.
 * Degrades per-file like {@link fetchRemoteFiles}: an item with no usable `data`
 * or with undecodable base64 is logged and skipped, never aborting the batch.
 * This is the half of file handling that both public entry points share; it
 * never touches the network and never throws.
 *
 * @param dataItems - `FileData` items from the compute response.
 * @returns The decoded files.
 */
const decodeResponseFiles = (dataItems: FileData[]): ProcessedFile[] => {
	const processedFiles: ProcessedFile[] = [];

	dataItems.forEach((item) => {
		const fileName = `${item.fileName}${item.fileType}`;
		const filePath =
			item.subFolder && item.subFolder.trim() !== '' ? `${item.subFolder}/${fileName}` : fileName;

		if (item.isBase64Encoded === true && item.data) {
			// `decodeBase64ToBinary` already returns a correctly-bounded view;
			// re-wrapping `.buffer` would discard its byteOffset/byteLength and
			// expose the whole (possibly pooled) backing buffer as corrupt content.
			try {
				processedFiles.push({
					fileName,
					content: decodeBase64ToBinary(item.data),
					path: filePath
				});
			} catch (err) {
				getLogger().warn(`Skipping file "${filePath}": base64 decode failed.`, err);
			}
		} else if (item.isBase64Encoded === false && item.data) {
			processedFiles.push({
				fileName,
				content: item.data,
				path: filePath
			});
		} else {
			getLogger().warn(`Skipping file "${filePath}": item carries no usable data.`);
		}
	});

	return processedFiles;
};

/** Abort a hung external-file fetch — one dead URL must degrade the batch, not stall it forever. */
const REMOTE_FILE_TIMEOUT_MS = 30_000;

/**
 * Fetch externally-referenced files over HTTP into `ProcessedFile`s.
 *
 * Async and fallible by nature. A failed fetch (network error, non-OK status,
 * or timeout after {@link REMOTE_FILE_TIMEOUT_MS}) is logged and that file is
 * dropped — the rest still resolve — so one dead URL degrades the result rather
 * than aborting the whole batch. This swallow is deliberate and pinned by
 * tests; callers receive only the files that succeeded.
 *
 * @param refs - External file references to fetch.
 * @returns The successfully-fetched files (failures omitted).
 */
const fetchRemoteFiles = async (refs: FileBaseInfo[]): Promise<ProcessedFile[]> => {
	const fetched = await Promise.all(
		refs.map(async (file) => {
			try {
				const signal =
					typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
						? AbortSignal.timeout(REMOTE_FILE_TIMEOUT_MS)
						: undefined;
				const response = await fetch(file.filePath, { signal });
				if (!response.ok) {
					getLogger().warn(`Failed to fetch additional file from URL: ${file.filePath}`);
					return null;
				}
				const fileBlob = await response.blob();
				const arrayBuffer = await fileBlob.arrayBuffer();
				return {
					fileName: file.fileName,
					content: new Uint8Array(arrayBuffer),
					path: file.fileName
				} as ProcessedFile;
			} catch (error) {
				getLogger().error(`Error fetching additional file from URL: ${file.filePath}`, error);
				return null;
			}
		})
	);

	return fetched.filter((f): f is ProcessedFile => f !== null);
};

/**
 * Compose the decoded response files with any fetched external files.
 *
 * @param dataItems - `FileData` items from the compute response.
 * @param additionalFiles - Optional external file references to fetch and include.
 * @returns A Promise resolving to the combined `ProcessedFile` list.
 */
const processFiles = async (
	dataItems: FileData[],
	additionalFiles: FileBaseInfo[] | FileBaseInfo | null
): Promise<ProcessedFile[]> => {
	const processedFiles = decodeResponseFiles(dataItems);

	if (additionalFiles) {
		const filesArray = Array.isArray(additionalFiles) ? additionalFiles : [additionalFiles];
		processedFiles.push(...(await fetchRemoteFiles(filesArray)));
	}

	return processedFiles;
};

/**
 * Creates a ZIP archive from processed files and triggers a browser download.
 *
 * @param files - An array of ProcessedFile objects to include in the ZIP.
 * @param zipName - The name of the ZIP file (without extension).
 * @returns A Promise that resolves when the ZIP is generated and download is triggered.
 */
async function createAndDownloadZip(files: ProcessedFile[], zipName: string): Promise<void> {
	const { zip, strToU8 } = await import('fflate');

	// Convert files to fflate format. Zip entries are keyed by path, so two
	// files with the same path would silently overwrite each other — rename
	// collisions ("model.txt" → "model-2.txt") instead of losing data.
	const zipData: Record<string, Uint8Array> = {};
	files.forEach((file) => {
		const path = uniqueZipPath(file.path, zipData);
		if (path !== file.path) {
			getLogger().warn(`Duplicate archive path "${file.path}" — storing as "${path}".`);
		}
		zipData[path] = typeof file.content === 'string' ? strToU8(file.content) : file.content;
	});

	// Async `zip` deflates on a worker thread instead of blocking the main thread
	// like `zipSync` — keeps the UI responsive for large geometry exports.
	const zipped = await new Promise<Uint8Array>((resolve, reject) => {
		zip(zipData, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)));
	});

	const blob = new Blob([zipped as BlobPart], { type: 'application/zip' });
	saveFile(blob, `${zipName}.zip`);
}

/**
 * First archive path not already taken in `taken`, disambiguating with a
 * numeric suffix before the extension: `dir/model.txt` → `dir/model-2.txt`.
 */
function uniqueZipPath(path: string, taken: Record<string, Uint8Array>): string {
	const has = (p: string) => Object.prototype.hasOwnProperty.call(taken, p);
	if (!has(path)) return path;
	const slash = path.lastIndexOf('/');
	const dot = path.lastIndexOf('.');
	const stemEnd = dot > slash ? dot : path.length;
	const stem = path.slice(0, stemEnd);
	const ext = path.slice(stemEnd);
	for (let i = 2; ; i++) {
		const candidate = `${stem}-${i}${ext}`;
		if (!has(candidate)) return candidate;
	}
}

/**
 * Saves a Blob object as a file in the user's browser.
 *
 * @param blob - The Blob object representing the file content.
 * @param filename - The name to give the downloaded file (including extension).
 * @throws {RhinoComputeError} If not running in a browser environment.
 */
function saveFile(blob: Blob, filename: string) {
	if (typeof document === 'undefined') {
		throw new RhinoComputeError(
			'saveFile requires a browser environment with DOM API access.',
			ErrorCodes.BROWSER_ONLY,
			{
				context: { function: 'saveFile', requiredAPI: 'document' }
			}
		);
	}

	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	// Firefox requires the anchor to be in the DOM for the click to download.
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Revoking synchronously can abort the download in some browsers — the
	// browser only pins the blob once the download has actually started.
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
