---
name: verify-game-changes
description: Verify changes to Snake game logic, networking, or UI. Runs tests, typecheck and lint, then reviews the diff for weakened tests, render-side state mutation, off-protocol messages, and `any` types. Use after editing anything under src/, and before committing or opening a PR.
---

# Game Change Verification

Nine checks. Run them in order — the automated ones first, because a failing
build makes the review checks moot. Report **PASS** or **FAIL** per check with
the evidence that justifies it, then an overall verdict.

Never report PASS for a check you did not actually run. "No findings" and "not
checked" are different results, and only one of them is a pass.

---

## 1. Test suite

```bash
npm test
```

The script is already `vitest run`, so it exits rather than watching. Do **not**
write `npm test --run` — npm swallows the flag before vitest sees it, and if the
script were ever changed to bare `vitest` that command would hang forever.

**Evidence:** the files/tests passed line, e.g. `Test Files 20 passed (20)` and
`Tests 237 passed (237)`.

**FAIL** on any failing test. Also FAIL if the total count _dropped_ versus the
previous run without a deletion being justified in the diff — that is check 5
surfacing as a number.

> This suite is sensitive to how it is invoked. If a run reports jsdom worker
> timeouts, re-run it alone before believing it: concurrent vitest processes on
> one machine cause exactly that failure, and it is not a code defect.

## 2. Type check

```bash
npm run typecheck
```

**Evidence:** empty output (tsc prints nothing on success).
**FAIL** on any diagnostic. Do not filter or excuse errors from test files.

## 3. Lint

```bash
npm run lint
```

**Evidence:** empty output.
**FAIL** on any error. Note that this config enforces two project rules
directly — `@typescript-eslint/no-explicit-any` and a ban on default exports —
so a lint failure may already be check 8 firing.

## 4. Read the diff

```bash
git diff --stat $(git merge-base HEAD origin/main)..HEAD
git diff $(git merge-base HEAD origin/main)..HEAD -- src/
```

Include unstaged work with a plain `git diff` as well. Read the actual hunks;
checks 5–8 are judgements about _what changed_, and a stat line cannot support
them.

**Evidence:** the list of changed files and a one-line summary of each change.

## 5. No test was weakened to make the suite pass

The failure mode this catches: a real regression gets hidden by editing the test
instead of the code.

Look in the diff for:

- Removed `it(` / `test(` / `describe(` blocks
- Removed or commented-out `expect(` calls
- `.skip` / `.only` / `.todo` added to a test
- An expected value edited to match new actual output
- A strict assertion swapped for a loose one — `toEqual` → `toMatchObject`,
  `toBe` → `toBeTruthy`, an exact number → `toBeGreaterThan`
- `expect.any(...)` replacing a concrete value
- A narrowed input range (fewer `it.each` cases, a smaller loop bound)

A weakened test is only acceptable when the _specification_ changed, and the
diff must show the behaviour change that justifies it.

**Evidence:** either "no assertions removed or loosened", or the specific hunk
plus the behaviour change that justifies it.

## 6. Rendering never mutates game state

`GameState` is deeply `readonly` and `step()` is the only thing that produces a
new one. Rendering reads; it does not write.

```bash
git diff $(git merge-base HEAD origin/main)..HEAD -- src/ui/ | grep -nE '^\+' | grep -nE '\.(push|pop|shift|unshift|splice|sort|reverse|fill)\(|state\.[a-zA-Z]+ *=|players\[[^]]*\] *='
```

Treat a hit as a finding to explain, not an automatic failure — `sort()` on a
locally-built array inside a renderer is fine; `state.players.sort()` is not.

Also confirm by reading:

- Nothing in `src/ui/` imports `step`, `createInitialState`, or `spawnFood`
- Renderer functions take `state` and return `void`
- Any array a UI module sorts or reverses is one it built itself, via a copy

**Evidence:** the grep result, plus the import check.
**FAIL** on any in-place write to a value reached from `GameState`.

## 7. Multiplayer messages follow the protocol

Two invariants, both enforced at the wire boundary in `src/network/protocol.ts`:

- **Outbound** frames are typed `NetMessage`. A new message shape means a new
  member of that union, not an object literal smuggled into `channel.send()`.
- **Inbound** data is `unknown` and passes through `parseMessage()` before
  anything reads a field. Nothing else may trust the wire.

```bash
git diff $(git merge-base HEAD origin/main)..HEAD -- src/network/ src/main.ts
grep -rnE '\.send\(' src/ --include=*.ts | grep -v '\.test\.ts'
grep -rnE 'JSON\.parse|as [A-Z][A-Za-z]*Message|raw as ' src/network/ --include=*.ts | grep -v '\.test\.ts'
```

Then confirm:

- Every new or changed message type is in the `NetMessage` union **and** has a
  case in `parseMessage`, with a validator per field
- No `as` cast substitutes for validation
- If any existing message's shape changed, `PROTOCOL_VERSION` was bumped. A
  stale cached bundle is guaranteed on GitHub Pages, and the version handshake
  is the only thing that turns that into a clean rejection instead of a desync
- Host authority holds: clients send `input` and `hello` only. A client-sent
  `state` or `roster` frame must still be ignored by the host

**Evidence:** the union/parser pairing for each changed message, and the
`PROTOCOL_VERSION` decision with its reason.

## 8. No `any` types

```bash
grep -rnE ':\s*any\b|<any>|as any|Array<any>|Promise<any>' src/ --include=*.ts
grep -rn 'eslint-disable.*no-explicit-any\|@ts-ignore\|@ts-expect-error\|@ts-nocheck' src/ --include=*.ts
```

The lint rule already errors on explicit `any`, so the second grep matters more
than the first: a suppression comment is how `any` actually gets in.

**Evidence:** both greps empty, or each hit named and justified.
**FAIL** on any unexplained suppression. Prefer `unknown` plus a type guard —
`src/network/protocol.ts` is the worked example.

## 9. Report

Emit a table, then a verdict:

```
| # | Check                    | Result | Evidence                        |
|---|--------------------------|--------|---------------------------------|
| 1 | Tests                    | PASS   | 20 files, 237 tests passed      |
| 2 | Typecheck                | PASS   | tsc clean                       |
| 3 | Lint                     | PASS   | eslint clean                    |
| 4 | Diff reviewed            | PASS   | 3 files under src/              |
| 5 | No weakened tests        | PASS   | no assertions removed/loosened  |
| 6 | Render does not mutate   | PASS   | no writes through GameState     |
| 7 | Protocol respected       | PASS   | no message shapes changed       |
| 8 | No `any`                 | PASS   | no matches, no suppressions     |
```

**VERDICT: PASS** only when all nine pass. Otherwise **FAIL**, listing the
failing checks first and what to do about each.

State plainly what you did not verify. Two things this procedure cannot reach,
worth naming when they are in scope:

- **Canvas rendering** — nothing here proves pixels are correct. Say so when the
  diff touches `src/ui/renderer.ts`.
- **Real peer connections** — the session tests use in-memory transports. A
  change to `src/network/peer.ts` is unverified until two real browsers connect.
