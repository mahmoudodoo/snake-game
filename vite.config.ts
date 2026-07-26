import { defineConfig } from 'vitest/config'

export default defineConfig({
  /* Project Pages serve from /<repo>/, so every asset URL needs this prefix.
     Read it back at runtime via import.meta.env.BASE_URL — never hardcode the
     origin, or invite links break on localhost. */
  base: '/snake-game/',
  test: {
    /* Default to node: most of src/game/ is pure and jsdom would only add
       startup cost. DOM-touching suites opt in with a
       `// @vitest-environment jsdom` docblock at the top of the file. */
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /* Worker threads, not child processes. Standing up jsdom in a fresh process
       measured ~56s here against ~0.9s in a thread — slow enough to blow past
       vitest's 60s worker-start timeout and fail the DOM suites intermittently.
       Nothing here needs process-level isolation: the tests are pure functions
       plus jsdom, and globals are stubbed and restored per test. */
    pool: 'threads',
    /* One worker, reused across files. Threads alone stopped being enough once
       there were six jsdom suites: each spun up its own worker, they contended
       for the machine, and five of eighteen files routinely died on that same
       60s worker-start timeout — hardcoded in vitest, so it cannot be raised.
       Paying for jsdom once and running files in sequence costs about a second
       in total, which is cheaper than the parallelism it gives up. */
    maxWorkers: 1,
  },
})
