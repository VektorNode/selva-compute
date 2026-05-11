---
'@selvajs/compute': patch
---

Forward response body and headers on `RhinoComputeError.context` for all
non-2xx responses. Adds `context.responseBody` (full body) and
`context.responseHeaders`, and unifies the message format across status
codes with a 200-char body hint. Makes upstream 500s easier to diagnose
when the body is non-empty, and reveals whether the response came from
Rhino Compute or from a proxy in front of it.
