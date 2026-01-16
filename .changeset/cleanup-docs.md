---
'selva-compute': patch
---

Documentation and code quality improvements:

- Fixed README.md spelling and grammar throughout
- Restructured sections for better clarity and readability
- Added comprehensive "Why this project exists" section with bullet points
- Improved Acknowledgement section with proper formatting and links
- Updated Requirements section with clear setup instructions for both standard and enhanced setup
- Refactored error handling system:
  - Moved ValidationErrors factory methods to RhinoComputeError static methods for simpler API
  - Removed unused error factory classes (InputErrors, DataErrors, ConfigErrors)
  - Updated all callsites to use new simplified error creation pattern
- Added implementation requirements documentation to GrasshopperResponseProcessor:
  - extractMeshesFromResponse requires Selva Display component and custom VektorNode compute
  - getFileData requires Block to File, Geometry To File components and custom compute
- Added context-specific README files:
  - src/features/file-handling/README.md with setup workflow
  - src/features/visualization/webdisplay/Readme.md with usage instructions
- Improved compute-fetch documentation with clearer API explanations
- Removed unused error-factory.ts file
- Cleaned up unused imports across the codebase
