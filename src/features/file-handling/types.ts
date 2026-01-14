/**
 * This type is defining a FileData object that comes from the IO Compuceraptor components.
 */
export type FileData = {
	FileName: string;
	Data: string;
	/** eg. **.3dm** will be added to the file name*/
	FileType: string;
	/** Helps to determine if the file needs to be decoded first */
	IsBase64Encoded: boolean;
	/** Create a directory structure to be used to create the the ZIP in the end @file handle-files.ts  */
	SubFolder: string;
};

/**
 * Represents a processed file ready for use.
 */
export type ProcessedFile = {
	fileName: string;
	content: Uint8Array | string;
	path: string;
};

export type FileBaseInfo = {
	FileName: string;
	FilePath: string;
};
