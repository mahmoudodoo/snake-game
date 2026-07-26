#!/usr/bin/env node
// Stop — gate turn completion on `npm test` and `npm run typecheck`.
// Blocks with the actual failure output so the problem is fixable in place.

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { projectRoot } from './project-root.mjs'

const root = projectRoot()

const raw = await readStdin()
let input = {}
try {
  input = JSON.parse(raw)
} catch {
  // Treat an unreadable payload as "no prior block".
}

// Already blocked once this turn — blocking again would loop forever.
if (input.stop_hook_active) process.exit(0)

const pkgPath = resolve(root, 'package.json')
if (!existsSync(pkgPath)) process.exit(0) // not scaffolded yet
if (!existsSync(resolve(root, 'node_modules'))) process.exit(0) // deps not installed

let scripts = {}
try {
  scripts = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {}
} catch {
  process.exit(0) // unparseable package.json is not this hook's problem
}

const checks = [
  ['test', ['test']],
  ['typecheck', ['run', 'typecheck']],
].filter(([name]) => scripts[name])

if (checks.length === 0) process.exit(0)

const failures = []
for (const [, args] of checks) {
  const r = spawnSync('npm', args, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    timeout: 240_000,
    env: { ...process.env, CI: '1' }, // keeps vitest out of watch mode
  })
  if (r.status !== 0) {
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
    failures.push(`### \`npm ${args.join(' ')}\` failed\n${tail(out, 3000)}`)
  }
}

if (failures.length > 0) {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: `Verification gate failed — fix before finishing:\n\n${failures.join('\n\n')}`,
    }),
  )
}
process.exit(0)

function tail(s, n) {
  return s.length <= n ? s : `…(truncated)\n${s.slice(-n)}`
}

function readStdin() {
  return new Promise((res) => {
    let s = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (d) => {
      s += d
    })
    process.stdin.on('end', () => res(s))
    process.stdin.on('error', () => res(''))
  })
}
