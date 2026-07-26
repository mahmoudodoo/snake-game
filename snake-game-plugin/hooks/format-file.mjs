#!/usr/bin/env node
// PostToolUse(Write|Edit) — format and lint-fix whichever file was just written.
// Advisory only: always exits 0, so a formatter problem never blocks an edit.

import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { projectRoot } from './project-root.mjs'

const root = projectRoot()

const raw = await readStdin()
let file = ''
try {
  const payload = JSON.parse(raw)
  file = payload?.tool_response?.filePath ?? payload?.tool_input?.file_path ?? ''
} catch {
  // Malformed payload — nothing to format.
}

if (!file || !existsSync(file)) process.exit(0)
// Project isn't scaffolded yet; prettier/eslint can't exist.
if (!existsSync(resolve(root, 'package.json'))) process.exit(0)

const PRETTIER = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css|scss|html|md|yml|yaml)$/i
const ESLINT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i

if (PRETTIER.test(file)) run(`npx --no-install prettier --write "${file}"`)
if (ESLINT.test(file)) run(`npx --no-install eslint --fix "${file}"`)

// --no-install keeps npx off the network mid-edit: if the tool isn't a local
// dependency yet, skip silently instead of stalling on a package download.
function run(cmd) {
  try {
    execSync(cmd, { cwd: root, stdio: 'ignore', timeout: 20_000 })
  } catch {
    // Advisory — a formatting failure is not worth interrupting the turn.
  }
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
