# Snake Game Standards

Conventions for a browser multiplayer Snake game: vanilla TypeScript, HTML5
Canvas, Vite, and WebRTC data channels over a signaling broker.

## Commands

- Dev server: `npm run dev`
- Build: `npm run build`
- Preview production: `npm run preview`
- Run tests: `npm test`
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Deploy to GitHub Pages: `npm run deploy`

`test` must be non-watch (`vitest run`, not `vitest`). The Stop hook in this
plugin runs it on every turn, and a watch-mode script would hang the session
rather than fail it.

## Code style

- 2-space indentation
- Named exports, not default exports
- Game logic in `src/game/`, networking in `src/network/`, UI in `src/ui/`
- TypeScript strict mode
- No `any` — use `unknown` plus a type guard at the boundary

## Architecture

Four invariants. A violation is a defect even when the tests pass.

**`src/game/` is pure.** No DOM, no `Date.now()`, no `Math.random()`.
Randomness comes from a seeded PRNG threaded through the state, so a match is
reproducible from one number and food spawns are testable.

**`step()` is the only producer of a new `GameState`.** Rendering reads state
and never writes to it. Keeping the reducer pure is what makes every mechanic
testable without a canvas.

**The host is authoritative.** Clients send inputs only; they never call
`step()`. A client-sent state or roster frame is dropped at the host. The rule
is enforced at the wire boundary so no downstream code has to remember it.

**Everything off the wire is `unknown` until proven.** A single parser validates
each field of each message type and returns a typed message or nothing. No `as`
cast substitutes for validation — a peer can send any shape at all.

## Networking

- Star topology: the host relays, clients connect only to the host
- Signaling for connection setup only; gameplay runs over the data channels
- Room codes use an alphabet with no ambiguous glyphs, and ride in the URL
  fragment so static hosting never has to route them
- Bump the protocol version whenever a message shape changes. Browser caching
  guarantees a stale client eventually joins; the handshake turns that into a
  clean rejection instead of a silent desync

## Testing

- Tests live next to source as `*.test.ts`, run with vitest
- Every game mechanic needs at least one test
- Prefer testing pure logic over DOM. Suites that need a document opt in with a
  `// @vitest-environment jsdom` docblock

Two things tests here cannot reach, worth stating in any review: **canvas
output** and **real peer connections**. In-memory transports prove the session
contract, not that two browsers connect.

## Git

- Never commit directly to `main` — feature branches and PRs only
- The `PreToolUse` hook enforces this; it is a guard, not a suggestion

## What this plugin installs

| Component                     | Effect                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `hooks/format-file.mjs`       | Prettier + ESLint `--fix` on each edited file. Advisory — never blocks an edit.                                                |
| `hooks/block-main-push.mjs`   | Denies `git push` targeting `main`/`master`, including bare `git push` while on it, `HEAD:main`, `--all`, and branch deletion. |
| `hooks/verify.mjs`            | Runs `npm test` and `npm run typecheck` on Stop; blocks with the real failure output. No-ops before the project is scaffolded. |
| `agents/cold-reviewer.md`     | Read-only reviewer with no session context.                                                                                    |
| `skills/verify-game-changes/` | Nine-check verification procedure.                                                                                             |

The hooks read `CLAUDE_PROJECT_DIR`, so they act on the host project rather than
the plugin directory, and each exits cleanly when the project has no
`package.json`, no `node_modules`, or no matching npm script.
