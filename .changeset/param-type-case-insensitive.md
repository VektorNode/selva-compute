---
"@selvajs/compute": patch
---

Match input `paramType` case-insensitively so lowercase schema types (e.g. `valueList`) no longer fail with "Unsupported paramType". Any casing now resolves to its canonical type before parsing.
