/**
 * Represents raw file data from Grasshopper/Rhino Compute response.
 *
 * This type encapsulates file output from compute operations, with metadata
 * for processing (decoding, naming, organization). Files are typically combined
 * with additional files and packaged into a ZIP archive for download.
 *
 * @see {@link ProcessedFile} for the normalized format after processing
 * @see {@link extractFilesFromComputeResponse} for extraction from compute responses
 */
export type FileData = {
	/** Base filename without extension (e.g., "model") */
	FileName: string;
	/** File content as a base64-encoded or plain string, depending on {@link IsBase64Encoded} */
	Data: string;
	/** File extension including the dot (e.g., ".3dm", ".json"). Appended to {@link FileName} to create the full filename */
	FileType: string;
	/** Whether {@link Data} is base64-encoded. If true, must be decoded to binary before use. If false, can be used as a plain text string */
	IsBase64Encoded: boolean;
	/** Directory path for organizing the file in archive structures (e.g., ZIP). Typically empty string for root-level files, or a path like "subfolder/nested" */
	SubFolder: string;
};

/**
 * Represents a normalized, processed file ready for consumption or archival.
 *
 * This is the unified intermediate format produced by processing both {@link FileData}
 * and {@link FileBaseInfo}. Files in this format are ready to be packaged into archives
 * (e.g., ZIP files) or returned to callers for programmatic use.
 *
 * @see {@link FileData} for raw compute response files
 * @see {@link FileBaseInfo} for external file references
 */
export type ProcessedFile = {
	/** Full filename including extension (e.g., "model.3dm") */
	fileName: string;
	/** File content as either binary data or text. Binary format (Uint8Array) is used for decoded base64 or fetched binary files; text format is used for plain text content */
	content: Uint8Array | string;
	/** File path for archive organization (e.g., "subfolder/model.3dm"). Used when creating ZIP archives or other hierarchical structures */
	path: string;
};

/**
 * Represents a reference to an external file to be included in file operations.
 *
 * This type is used to specify additional files (beyond compute response files)
 * that should be fetched and included when processing files. The file is fetched
 * from the provided URL and processed as a {@link ProcessedFile}.
 *
 * Note: Uses PascalCase naming for consistency with {@link FileData}, even though
 * this type is created internally rather than received from an external API. This
 * unified naming convention makes it clear that both types work together in the
 * file handling workflow.
 *
 * @see {@link FileData} for files from compute responses
 * @see {@link processFiles} for how FileBaseInfo is processed (fetched and converted)
 */
export type FileBaseInfo = {
	/** Destination filename for the file in the archive or result set (e.g., "additional-data.json") */
	FileName: string;
	/** URL to fetch the file from. Must be accessible from the runtime environment */
	FilePath: string;
};
