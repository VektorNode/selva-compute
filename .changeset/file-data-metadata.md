---
"@selvajs/compute": minor
---

Add optional `metadata` (`Record<string, string>`) to `FileData`, carrying arbitrary key/value pairs attached in Grasshopper through to downstream consumers for tagging and indexing. Optional and backwards-compatible — existing payloads and the `isFileData` guard are unaffected.
