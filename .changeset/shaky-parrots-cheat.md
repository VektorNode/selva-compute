---
"selva-compute": patch
---

Fix: Enhanced validation in extractFileData to properly check FileData object structure

- Changed property checks from uppercase (FileName, FileType, Data) to camelCase (fileName, fileType, data)
- Added type guards for isBase64Encoded (boolean) and subFolder (string) properties
- Improves type safety and ensures all required FileData properties are validated before parsing
