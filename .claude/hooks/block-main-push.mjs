#!/usr/bin/env node
// PreToolUse(Bash) — refuse any `git push` whose destination is main or master.
// Enforces the "never commit directly to main" rule in .claude/CLAUDE.md.

import { execSync } from 'node:child_process'
import { projectRoot } from './project-root.mjs'

const root = projectRoot()
const PROTECTED = /^(main|master)$/

// Flags that consume the following token, so it isn't mistaken for a refspec.
const TAKES_VALUE = new Set(['-o', '--push-option', '--receive-pack', '--exec', '--repo'])

const raw = await readStdin()
let cmd = ''
try {
  cmd = JSON.parse(raw)?.tool_input?.command ?? ''
} catch {
  allow()
}

if (!/\bgit\b[\s\S]*\bpush\b/.test(cmd)) allow()

// Inspect each chained command separately: `cd x && git push origin main`.
for (const segment of cmd.split(/&&|\|\||;|\|/)) {
  const reason = inspect(segment.trim())
  if (reason) deny(reason)
}
allow()

function inspect(segment) {
  const m = segment.match(/\bgit\b([\s\S]*)/)
  if (!m) return null

  const tokens = m[1].trim().split(/\s+/).filter(Boolean)
  const pushAt = tokens.indexOf('push')
  if (pushAt === -1) return null

  const positional = []
  for (let i = pushAt + 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '--all' || t === '--mirror') {
      return `\`${segment}\` pushes every branch, which includes main/master.`
    }
    if (TAKES_VALUE.has(t)) {
      i++
      continue
    }
    if (t.startsWith('-')) continue
    positional.push(t)
  }

  const refspecs = positional.slice(1) // positional[0] is the remote
  if (refspecs.length === 0) {
    // No refspec: git pushes the current branch.
    const branch = currentBranch()
    if (branch && PROTECTED.test(branch)) {
      return `You are on \`${branch}\`, so \`${segment}\` would push it directly.`
    }
    return null
  }

  for (const spec of refspecs) {
    // Only the destination half matters: `main:feature` is fine, `HEAD:main` is not.
    const dst = (spec.includes(':') ? spec.slice(spec.indexOf(':') + 1) : spec)
      .replace(/^\+/, '')
      .replace(/^refs\/heads\//, '')
    if (PROTECTED.test(dst)) {
      return `\`${segment}\` targets the protected branch \`${dst}\`.`
    }
  }
  return null
}

function currentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `${reason} Push a feature branch and open a PR instead.`,
      },
    }),
  )
  process.exit(0)
}

function allow() {
  process.exit(0)
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
