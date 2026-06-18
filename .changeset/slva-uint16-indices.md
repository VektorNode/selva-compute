---
'@selvajs/compute': minor
---

Shrink WebDisplay mesh payloads: uint16 indices and optional blob compression.

**uint16 indices (SLVA v2).** The binary mesh parser now reads a new flag (`FLAG_UINT16_INDICES`,
bit 1 of the geometry flags word) and decodes 16-bit indices when set, halving the index payload for
batches that address 65,535 or fewer vertices — typically the largest part of the blob for unwelded
brep meshes.

**Optional gzip container (SLVZ).** Mesh blobs otherwise ship uncompressed (no transport gzip on
dynamic compute responses or the local WebSocket). The parser now detects a `SLVZ`-magic container,
inflates it (raw DEFLATE via `fflate`), and parses the inner SLVA blob unchanged. The plugin applies
this only when it shrinks the payload, so an uncompressed `SLVA` blob still flows through untouched.

**Backward compatible.** v1 blobs are layout-identical to v2 with the uint16 flag implicitly clear,
so previously persisted or cached blobs continue to decode; only versions outside
`MIN_SUPPORTED_VERSION`..`BINARY_MESH_VERSION` are rejected. A plain (uncompressed) blob is detected
by its leading magic, so non-SLVZ inputs are unaffected.

Note: this is forward compatibility on the decoder only. A v2 / SLVZ blob produced by an updated
plugin will not decode on an older `@selvajs/compute`, so the plugin and this package must be
released together.
