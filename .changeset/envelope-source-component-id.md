---
'@selvajs/compute': patch
---

Prefer the envelope's `sourceComponentId` over the blob's embedded value when building meshes. The
blob bakes in the id at encode time, but a reloaded part (e.g. a `.dmf` instanced many times)
re-stamps a fresh id on the envelope to keep web pick identity distinct per placement. The embedded
blob value remains the fallback for raw-blob transport, which carries no envelope.
