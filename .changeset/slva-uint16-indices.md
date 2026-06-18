---
'@selvajs/compute': minor
---

Add SLVA wire format v2 with optional uint16 mesh indices.

The binary mesh parser now reads a new flag (`FLAG_UINT16_INDICES`, bit 1 of the geometry flags
word) and decodes 16-bit indices when set, halving the index payload for batches that address
65,535 or fewer vertices — typically the largest part of the blob for unwelded brep meshes.

The parser stays backward compatible: v1 blobs are layout-identical to v2 with the flag implicitly
clear (v1 always used uint32 indices), so previously persisted or cached blobs continue to decode.
Only versions outside the supported range (`MIN_SUPPORTED_VERSION`..`BINARY_MESH_VERSION`) are
rejected.

Note: this is forward compatibility on the decoder only. A v2 blob produced by an updated plugin
will not decode on a v1-only `@selvajs/compute`, so the plugin and this package must be released
together.
