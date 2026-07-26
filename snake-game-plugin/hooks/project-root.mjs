import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The project directory, canonicalised.
 *
 * CLAUDE_PROJECT_DIR arrives as `d:/Aspire/snake-game` — forward slashes and a
 * lowercase drive letter. Handing that to a child process as `cwd` breaks Vite
 * on Windows: it normalises module paths and compares them by string, so a
 * lowercase drive yields a module graph the test workers cannot match against,
 * and every suite dies with "Vitest failed to find the runner". The slashes are
 * harmless; only the drive-letter case matters.
 *
 * realpathSync.native asks the OS for the canonical spelling, which fixes both.
 */
export function projectRoot() {
  const raw = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  try {
    return realpathSync.native(raw)
  } catch {
    // Path does not exist yet — resolving is the best we can do.
    return resolve(raw)
  }
}
