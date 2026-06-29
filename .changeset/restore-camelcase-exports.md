---
'@selvajs/compute': patch
---

Re-export `camelcaseKeys` and `toCamelCase` from `@selvajs/compute/core`. These string utilities were removed in the public-API slim-down, but downstream consumers (e.g. `@selvajs/selva`) still import them, breaking their build.
