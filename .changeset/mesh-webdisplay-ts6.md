---
'@selvajs/compute': minor
---

WebDisplay mesh payloads: uint16 indices, optional gzip container, and stable per-placement identity.

**uint16 indices (SLVA v2).** The binary mesh parser reads a new flag (`FLAG_UINT16_INDICES`,
bit 1 of the geometry flags word) and decodes 16-bit indices when set, halving the index payload
for batches that address 65,535 or fewer vertices — typically the largest part of the blob for
unwelded brep meshes.

**Optional gzip container (SLVZ).** Mesh blobs that ship wrapped in a `SLVZ`-magic container are
inflated (raw DEFLATE via `fflate`) and the inner SLVA blob is parsed unchanged. Plain
(uncompressed) `SLVA` blobs are detected by their leading magic and flow through untouched.

**Per-placement identity.** When building meshes, the envelope's `sourceComponentId` is preferred
over the blob's embedded value, so a reloaded part instanced many times keeps a distinct web-pick
identity per placement. The embedded blob value remains the fallback for raw-blob transport, which
carries no envelope.

Backward compatible: v1 blobs decode as v2 with the uint16 flag implicitly clear. This is forward
compatibility on the decoder only — a v2 / SLVZ blob produced by an updated plugin will not decode
on an older `@selvajs/compute`, so the plugin and this package must be released together.

The package now builds on TypeScript 6.
