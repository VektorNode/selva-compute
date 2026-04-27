# Migration notes — `selva` app → `@selvajs/compute@1.5.0`

This release moves request scheduling, abort/timeout plumbing, and retry logic
**into the library**. A bunch of code in your `selva` repo was working around
gaps that no longer exist. This file lists what you can delete, what you should
rewire, and what to leave alone.

> Target file unless noted otherwise:
> `D:\Coding\selva\packages\shared\src\lib\`

---

## TL;DR — the headline changes

| In selva today | Replace with |
|---|---|
| `createComputeThrottle(performSolveInternal, { timeout })` | `client.createScheduler({ mode: 'latest-wins', timeoutMs })` |
| Manual `AbortController` plumbing inside `performSolveInternal` | `scheduler.solve(def, tree)` (signal is internal) |
| `computeThrottle.isComputing` | `scheduler.isSolving` |
| `computeThrottle.cancel()` | `scheduler.cancelAll()` |
| `utils/computeThrottle.svelte.ts` | **delete the file** |

The `createSolvingIndicator` and `debounce` helpers stay where they are — those
are slated for Phase 3 of the library work, not in 1.5.0.

---

## Files you can delete

### `utils/computeThrottle.svelte.ts`

Fully replaced by `SolveScheduler` from `@selvajs/compute`. No exported behavior
that isn't now available via `client.createScheduler({ mode: 'latest-wins' })`.

**Before deleting:** grep for any other consumer beyond `ComputeApp.svelte`:

```bash
cd D:/Coding/selva
grep -rn "createComputeThrottle\b" packages --include="*.ts" --include="*.svelte"
```

If `ComputeApp.svelte` is the only consumer, the file goes.

---

## Files to refactor

### `components/app-shell/ComputeApp.svelte`

Lines around 8, 30, 113–121 currently look like this:

```ts
import { createComputeThrottle } from '../../utils/computeThrottle.svelte';

// ...

const computeThrottle = createComputeThrottle<Record<string, unknown>>(performSolveInternal, {
  timeout: solveTimeoutMs
});

let solving = $derived(computeThrottle.isComputing);
const solvingIndicator = createSolvingIndicator(() => solving);

function performSolve() {
  computeThrottle.trigger($state.snapshot(values));
}
```

Replace with:

```ts
import { GrasshopperClient } from '@selvajs/compute';
// ...

// Assuming `client` is already a GrasshopperClient in scope.
// Create the scheduler once per ComputeApp instance.
const scheduler = client.createScheduler({
  mode: 'latest-wins',
  timeoutMs: solveTimeoutMs,
  // Optional — turn on once you have a feel for cache hit rate:
  // cache: { maxEntries: 50, ttlMs: 5 * 60_000 },
});

// Reactive bridge — subscribe() fires on any state change.
let solving = $state(false);
let hasPending = $state(false);
const unsub = scheduler.subscribe(() => {
  solving = scheduler.isSolving;
  hasPending = scheduler.hasPending;
});

const solvingIndicator = createSolvingIndicator(() => solving);

async function performSolve() {
  try {
    const response = await scheduler.solve(definition, dataTree);
    // existing handling — meshes, outputs, etc.
  } catch (err) {
    // Three error shapes you may want to distinguish:
    //  - "Superseded by newer solve" — newer slider value arrived; ignore
    //  - "Request aborted by caller" — cancelAll() was called; ignore
    //  - everything else — real error, surface to the user
    if (err instanceof Error && /superseded|aborted/i.test(err.message)) return;
    error = err instanceof Error ? err.message : String(err);
  }
}

// Clean up on component teardown
$effect(() => () => {
  unsub();
  scheduler.dispose();
});
```

Things that change semantically:

- `performSolveInternal` no longer needs to take a `signal` argument or wire up
  `AbortError` handling. The library does it. You can simplify or inline that
  function entirely — it's just "build inputs, await `scheduler.solve`, write
  outputs to state."
- The `if (err.name === 'AbortError') return;` early-return at line 107 becomes
  the superseded/aborted check above.
- If you were tracking `hasPendingChanges` based on `computeThrottle.hasPending`,
  rename to `scheduler.hasPending` — same semantics.

### `compute-app/src/lib/server/computeLimits.ts`

The grep showed `createComputeThrottle` referenced here. If it's just a doc
comment, no action needed. If it's actually invoked server-side, you probably
want to keep the existing implementation there until 1.5.0 is published —
schedulers run client-side too, but the server-side limit logic has different
constraints (rate limit per user, etc.) that the library's scheduler doesn't
know about. Confirm the file's purpose before changing.

---

## Patterns to adopt across the platform

For the user-uploaded-definition workflow, you'll want **two scheduler instances
per session**, not one:

```ts
// Live preview while the user adjusts inputs
const previewScheduler = client.createScheduler({
  mode: 'latest-wins',
  timeoutMs: 30_000,
  cache: { maxEntries: 50, ttlMs: 5 * 60_000 },
});

// "Submit" / heavy compute, with user-facing Cancel
const submitScheduler = client.createScheduler({
  mode: 'queue',
  maxConcurrent: 1,
  timeoutMs: 0,
  retry: { attempts: 1 },
});
```

They share the same `GrasshopperClient` (and its connection pool) but have
independent queues, caches, and cancel scopes. See the README's
"Configuring the scheduler" table for the full set of knobs.

**Replace any leftover `new AbortController()` plumbing in selva** with a
per-call `signal` passed to `scheduler.solve(def, tree, { signal })`, or rely on
`scheduler.cancelAll()` / `scheduler.dispose()` on component teardown.

---

## Things you might *not* want to change yet

- **`createSolvingIndicator`** — keep using it. Subscribes to a `() => boolean`,
  same as before. Phase 3 of the library work will eventually port this in but
  it's not in 1.5.0.
- **`debounce.ts`** — same story. Useful for text inputs; library doesn't ship
  it yet.
- **`server/computeLimits.ts`** if it's enforcing per-user rate limits — that's
  a server policy concern, not a client scheduling concern. The library's
  scheduler is per-client, not per-user.

---

## Quick checklist when you upgrade

1. Bump `@selvajs/compute` to `^1.5.0` in the relevant `package.json` files
   (`packages/shared`, `packages/compute-app`, etc.).
2. `pnpm install`.
3. Edit `ComputeApp.svelte` per the diff above.
4. Delete `packages/shared/src/lib/utils/computeThrottle.svelte.ts`.
5. Search for any remaining imports of `createComputeThrottle` and remove them.
6. Run the app, scrub a slider, confirm:
   - in-flight solve is aborted on each new value (network panel)
   - `solvingIndicator.show` still toggles correctly
   - cancel-on-unmount still works (route change shouldn't leak in-flight requests)
7. Run the test suite if you have one for `ComputeApp`.

---

## What to file as follow-ups in selva

- **Move `createSolvingIndicator` to a future `@selvajs/compute` Phase 3 ticket.**
  Once it lives in the library, the `solving` state and the indicator can
  collapse into one binding driven by `scheduler.subscribe()`.
- **Consider replacing per-form `setTimeout`-based `debounce` calls** with
  the library's stable hash + cache once you adopt 1.5.0:
  ```ts
  const scheduler = client.createScheduler({
    mode: 'latest-wins',
    cache: { maxEntries: 50, ttlMs: 60_000 },
  });
  ```
  The cache makes "scrub back to a value you just had" instant, which often
  removes the need for debouncing in the first place.
