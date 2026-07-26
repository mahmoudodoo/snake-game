#!/usr/bin/env node
// SessionStart(compact) — re-inject the project brief after compaction.
// The text lives in .claude/context-brief.md so it can be edited as plain
// markdown instead of as an escaped string inside settings.json.

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot } from './project-root.mjs'

const briefPath = resolve(projectRoot(), '.claude/context-brief.md')

const fallback =
  'Snake game project. Key areas: src/game/ (pure game logic), ' +
  'src/network/ (PeerJS + Trystero multiplayer), src/ui/ (canvas rendering).'

const brief = existsSync(briefPath) ? readFileSync(briefPath, 'utf8').trim() : fallback

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: brief,
    },
  }),
)
