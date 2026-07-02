---
"@selvajs/compute": patch
---

Hardened `core` against several edge-case bugs found in review:

- `validateServerUrl` now blocks the public McNeel endpoint by parsed hostname instead of exact string match, closing bypasses via trailing slash, scheme, casing, port, or path.
- Caller-initiated aborts from `fetchRhinoCompute` now reject with `code: 'ABORTED'` instead of `'UNKNOWN_ERROR'`.
- IPv6 `localhost` (`[::1]`) is now correctly recognized, avoiding a spurious "no API key configured" warning; that warning also now fires once per server instead of once per request.
- `decodeBase64ToBinary` validates input consistently across Node and browser runtimes and throws `ENCODING_ERROR` on malformed input instead of silently producing garbage (Node) or an unwrapped DOMException (browser).
- File extraction (`extractFilesFromComputeResponse`, `downloadFileData`) now degrades per-file on a bad item (unusable data or undecodable base64) instead of aborting the whole batch, matching the existing remote-fetch behavior.
- Remote file fetches (`additionalFiles`) now time out after 30s instead of being able to hang indefinitely.
- ZIP archive building now disambiguates duplicate archive paths instead of silently overwriting one file with another.
- Browser file downloads (`saveFile`) now append the anchor to the DOM and defer revoking the object URL, fixing downloads that could be silently dropped in some browsers.
- `ComputeServerStats`'s internal `fetchWithTimeout` now merges caller-supplied headers instead of letting them replace the default headers outright (which could drop the API key).
- `setLogger` now validates that a custom logger implements all four required methods, failing fast with a clear error instead of a confusing crash at a later, unrelated call site.
- `RhinoComputeError`'s `code` is now typed as `ErrorCode` instead of `string`.
- Minor: request size accounting now counts UTF-8 bytes instead of UTF-16 code units; `readField`/`hasField` cache per-object key lookups; a truncated 2xx response body is now retried like other transient network errors; `camelcaseKeys` is marked `@deprecated` in favor of `readField`/`hasField`.
