# 🐍 Multiplayer Snake Game: A Claude Code Practice Guide

> *Build and deploy a multiplayer Snake game on GitHub Pages while mastering every core concept of Claude Code.*

---

## 📖 What You'll Learn

This guide takes you from zero to a fully functional multiplayer game. Along the way, you'll practice:

| Concept | Tool / Feature |
|---------|----------------|
| 🗺️ Architecture planning | Plan Mode, `/goal` |
| 📁 Project context | CLAUDE.md (User / Project / Local) |
| 🔒 Safety & automation | Hooks (PreToolUse, PostToolUse, Stop, SessionStart) |
| 🧠 Context management | `/compact`, Rewind, `/loop` |
| ⚡ Parallel development | Worktrees |
| 🔐 Permission models | 6 modes (Manual → Bypass) |
| 🤖 CI/CD integration | GitHub Actions, `@claude` on PRs |
| 🧪 Verification | Custom skills, cold-reviewer subagent |
| 📦 Reusability | Plugins |
| 🚀 Deployment | GitHub Pages with multiplayer support |

---

## 📋 Prerequisites

Before starting, ensure you have:

- [ ] **Node.js** (v18+) and **npm** / **yarn**
- [ ] **Claude Code CLI** (`claude` command available)
- [ ] **Git** (and optionally `gh` for GitHub CLI)
- [ ] A **GitHub account** (for hosting and Actions)

Verify your setup:

```bash
claude --version
mkdir snake-game && cd snake-game
git init
npm init -y
```

---

## Phase 1: Project Setup & CLAUDE.md

### Step 1: Create your Project CLAUDE.md

Create `.claude/CLAUDE.md` with the following content — this defines the project's conventions, commands, and architecture for every Claude session in this repo.

```markdown
# Project
Multiplayer Snake Game — browser-based, deployed on GitHub Pages.
Single-player mode + multiplayer via WebSocket (peer-to-peer with a signaling server).
Built with vanilla TypeScript, HTML5 Canvas, and Vite for bundling.

# Commands
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview production: `npm run preview`
- Run tests: `npm test`
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Deploy to GitHub Pages: `npm run deploy`

# Code Style
- Use 2-space indentation
- Use named exports, not default exports
- All game logic in src/game/
- All networking in src/network/
- All UI components in src/ui/
- Use TypeScript strict mode
- No `any` types — use proper interfaces

# Architecture
- Game loop uses requestAnimationFrame
- Game state is a pure object — rendering reads state, never mutates it
- Multiplayer uses WebSocket for signaling + WebRTC data channels for gameplay
- Room system: host creates room, gets shareable link, others join via link

# Testing
- Tests live next to source files as *.test.ts
- Use vitest for all tests
- Every game mechanic needs at least one test

# IMPORTANT
- Never commit directly to main — always use feature branches
- All multiplayer state sync must be authoritative from host — clients send inputs only
```

### Step 2: Create your Local CLAUDE.md

Create `.claude/local/CLAUDE.md` (this file is git‑ignored, so it can contain personal notes):

```markdown
# Local Notes
- Currently setting up the project from scratch
- GitHub repo: [your-username]/snake-game
- Using GitHub Pages for deployment (free)
```

### Step 3: Create your User‑level CLAUDE.md

This file follows you across all projects. To set it up:

```bash
claude
# Inside Claude Code, type:
/config
```

Navigate to **User CLAUDE.md** and add your personal preferences (e.g., default editor, shell, etc.).

> ✅ **Checkpoint:** You now have 3 of the 4 CLAUDE.md layers (User, Project, Local). The Managed Policy layer is set by org admins.

---

## Phase 2: Plan Mode — Architecture Design

### Step 4: Plan the full architecture

Launch Claude Code and switch to **Plan Mode** by pressing `Shift + Tab` until **"Plan Mode"** appears in the status bar. Then prompt:

```text
I need to build a multiplayer Snake game for the web, deployed on GitHub Pages.
Requirements:
1. Single-player mode with score tracking and increasing difficulty
2. Multiplayer mode where a host creates a room and shares an invite link
3. Any user can join via the link — no accounts needed
4. Multiple players see each other's snakes in real-time on the same board
5. Collision with other players' snakes kills you
6. Last snake standing wins
7. Works on GitHub Pages (static hosting only)

Constraints:
- GitHub Pages is static-only, so we need a separate signaling server OR use a free WebSocket service
- For this project, let's use PeerJS (free WebRTC signaling) so we don't need our own server
- Use Vite for bundling
- Use TypeScript
- Use HTML5 Canvas for rendering

Plan the full file structure, the game loop architecture, the networking layer, 
the room/invite system, and the deployment pipeline. Don't write any code yet.
```

**Practice:**
- Actually read the plan Claude produces.
- Ask Claude to revise parts: *"Move the collision detection into its own module."*
- Ask *"What happens if PeerJS's free server is down? Add a fallback."*
- Only approve when satisfied.

### Step 5: Plan the multiplayer networking in detail

Still in Plan Mode, prompt:

```text
Now plan the multiplayer networking in detail. 
How does the room invite link work on GitHub Pages (static site)?
How does the host's game state get synced to peers?
What's the message protocol between host and clients?
How do we handle player disconnects mid-game?
What happens when the host disconnects?
Plan this before any code.
```

---

## Phase 3: Set Up Hooks Before Coding

### Step 6: Create enforcement hooks

Switch out of Plan Mode (`Shift + Tab` back to normal mode). Create the following hooks in `.claude/settings.json`:

1. **PostToolUse** – auto‑format and lint after every file edit.
2. **PreToolUse** – block `git push` to `main`/`master`.
3. **Stop** – run `npm test` and `npm run typecheck` – block completion unless both pass.
4. **SessionStart** (compact matcher) – re‑inject context after compaction.

Here's a template for `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|MultiEdit|Write",
        "command": "npx prettier --write \"$TOOL_INPUT_PATH\" 2>/dev/null; npx eslint --fix \"$TOOL_INPUT_PATH\" 2>/dev/null || true"
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": ".claude/hooks/block-main-push.sh"
      }
    ],
    "Stop": [
      {
        "command": "npm test --run 2>&1 && npm run typecheck 2>&1 || exit 2"
      }
    ],
    "SessionStart": [
      {
        "matcher": "compact",
        "command": "echo 'Resuming Snake game project. Key areas: src/game/ (game logic), src/network/ (PeerJS multiplayer), src/ui/ (canvas rendering). Current focus: [update as needed].'"
      }
    ]
  }
}
```

### Step 7: Create the `block-main-push` hook script

Create `.claude/hooks/block-main-push.sh` with this content and make it executable:

```bash
#!/bin/bash
# Block git push to main or master
if grep -qE "git push.* (main|master)" ; then
  echo "❌ Blocked: Pushing directly to main or master is not allowed. Use a feature branch and open a PR." >&2
  exit 2
fi
exit 0
```

Make it executable:

```bash
chmod +x .claude/hooks/block-main-push.sh
```

> 💡 **Exit codes:**  
> - `0` = allowed  
> - `2` = BLOCK (stderr is sent to Claude)  
> - `1` = non‑blocking error (does NOT block)

---

## Phase 4: Build Single-Player Mode

### Step 8: Scaffold the project

Exit Plan Mode and prompt:

```text
Set up the project scaffolding based on our plan:
1. Initialize with Vite + TypeScript
2. Set up vitest for testing
3. Set up ESLint + Prettier
4. Create the directory structure: src/game/, src/network/, src/ui/
5. Create a basic HTML canvas page that shows "Snake Game" 
6. Make sure `npm run dev` works
Use the plan we created earlier.
```

### Step 9: Build the game engine with `/goal`

Now use `/goal` for autonomous implementation:

```text
/goal The single-player snake game is fully playable: arrow keys move the snake, 
food spawns randomly, eating food grows the snake and increases score, 
hitting walls or yourself ends the game, score displays on screen, 
and all tests in src/game/ pass with npm test
```

**Observe:**
- Claude works across multiple turns automatically.
- The evaluator checks conditions after each turn.
- Claude reads test output and fixes failures without prompting.
- The Stop hook runs tests before Claude can finish.

If Claude goes wrong — practice **Rewind**:  
Double‑tap `Escape` on an empty prompt. You'll see checkpoints. Try each option:

- *"Restore code and conversation"* – full rollback  
- *"Restore conversation only"* – keep code, reset chat  
- *"Restore code only"* – keep chat, undo file changes  
- *"Summarize from here"* / *"Summarize up to here"* – compress parts of the history

### Step 10: Practice `/compact` with direction

When your context window fills up, run:

```text
/compact Focus on the game engine architecture and the Canvas rendering. 
Drop the project setup conversation — that's done. Keep the plan for 
multiplayer networking since we haven't started that yet.
```

> **Note:** The SessionStart hook fires after compaction, re‑injecting project context.

---

## Phase 5: Build Multiplayer Mode

### Step 11: Use Worktrees for parallel development

Create a `.worktreeinclude` file in the repo root to share common files across worktrees:

```text
.env
.claude/local/CLAUDE.md
```

Open two terminal windows. In terminal 1:

```bash
claude
# Prompt: Build the multiplayer networking layer using PeerJS.
# Implement room creation, invite link generation, and peer connection.
# Work on a feature branch: feature/multiplayer-network
```

In terminal 2 (simultaneously):

```bash
claude
# Prompt: Build the game UI — lobby screen, game over screen, 
# score display, player list for multiplayer. 
# Work on a feature branch: feature/game-ui
```

**Result:** Each session gets its own file tree; no conflicts; `.worktreeinclude` ensures both have the same `.env`.

### Step 12: Build the room/invite system

In your main Claude session, prompt:

```text
Build the multiplayer room system:
1. Host clicks "Create Room" — generates a unique room ID
2. The URL updates to include the room ID: https://[username].github.io/snake-game/#room=abc123
3. Host shares this link with friends
4. When someone opens the link, they automatically connect as a client
5. The lobby shows all connected players
6. Host clicks "Start Game" to begin
7. Use PeerJS for WebRTC signaling (no server needed for GitHub Pages)
The room ID should be in the URL hash so GitHub Pages routing works 
(hash changes don't trigger page reloads on static hosts).
```

### Step 13: Practice `/loop` for testing

```text
/loop Every 30 seconds, run npm test and report any new failures. 
If a test that was passing before now fails, investigate and fix it.
```

Press `Escape` to stop the loop.

---

## Phase 6: GitHub Setup & Deployment

### Step 14: Create the GitHub repository

```bash
# Using GitHub CLI (or do it via browser)
gh repo create snake-game --public --source=. --push
```

### Step 15: Set up GitHub Pages deployment

Prompt:

```text
Set up GitHub Pages deployment for this project:
1. Configure Vite to build for GitHub Pages (set base path correctly)
2. Create a GitHub Actions workflow that builds and deploys to GitHub Pages 
   on every push to main
3. The workflow should run tests first — if tests fail, don't deploy
4. Use the official GitHub Pages actions
The repo name is snake-game and my GitHub username is [YOUR_USERNAME].
```

### Step 16: Install the Claude GitHub App

```bash
/install-github-app
```

Follow the prompts to install the app on your repository.

### Step 17: Create the `@claude` workflow

Create `.github/workflows/claude.yaml`:

```yaml
name: Claude Code
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          trigger_phrase: "@claude"
          prompt: |
            You are working on a multiplayer Snake game. 
            Follow the conventions in CLAUDE.md. 
            Run npm test after any code changes.
          claude_args: "--max-turns 5 --model claude-sonnet-4-20250514"
```

Also consider adding a scheduled workflow to scan for `TODO` comments and open issues.

---

## Phase 7: Permission Modes (6 modes)

Cycle through them with `Shift + Tab` and understand each:

| Mode | Description | Practice Suggestion |
|------|-------------|---------------------|
| **Manual** (default) | Approve every edit and command | Ask Claude to create a new file – notice the approval prompt |
| **Accept Edits** | Edits auto-approved, shell commands still ask | Ask Claude to refactor a module – edits happen automatically |
| **Plan** | Read‑only – no edits, no commands | Ask Claude to analyze your codebase architecture |
| **Auto** | Everything auto-approved, but a classifier checks for danger | Ask Claude to implement a feature end‑to‑end; try `git push origin main` – classifier flags it |
| **Don't Ask** | Auto‑denies anything not pre‑approved | Run in a script with specific allowed tools |
| **Bypass** | No safety net – **ONLY** use in VMs/containers | **DO NOT** practice this on your actual machine |

---

## Phase 8: Verification Framework

### Step 18: Create a verification skill

Create `.claude/skills/verify-game-changes/skill.md`:

```markdown
name: Game Change Verification
description: Automatically verifies any changes to game logic, 
networking, or UI components in the Snake game.

## Procedure
1. Run the full test suite: `npm test --run`
2. Run the TypeScript compiler: `npm run typecheck`  
3. Run the linter: `npm run lint`
4. Read the git diff of all changed files
5. Confirm no test was weakened (assertions removed, expected values 
   loosened, or test cases deleted) just to make tests pass
6. Confirm game state is never mutated directly by rendering code
7. Confirm multiplayer messages follow the defined protocol
8. Confirm no `any` types were introduced
9. Report PASS or FAIL with evidence for each check
```

### Step 19: Create a cold‑reviewer subagent

```bash
/agents
```

Select **"Create new agent"** with:
- **Scope:** project
- **Purpose:** code review
- **Tools:** read‑only
- **Name:** `cold-reviewer`

Then ask the cold‑reviewer:

```text
Review all changes made in the last session.
Check for:
- Multiplayer state sync correctness
- Memory leaks in the game loop
- XSS vulnerabilities in the room link system
- Proper cleanup on player disconnect
```

### Step 20: Practice the full verification flow

```bash
# 1. Let Claude work unsupervised in Auto mode on a feature
# (Shift+Tab to Auto mode)
# Prompt: "Add power-ups to the snake game — speed boost, invincibility, 
# and score multiplier. Each power-up spawns randomly and lasts 5 seconds."

# 2. After Claude finishes, review the diff
git diff main..HEAD

# 3. Run code review
# Inside Claude Code:
/code-review

# 4. Get cold second opinion
# Use the cold-reviewer subagent you created
```

---

## Phase 9: Build a Plugin

### Step 21: Package your setup as a plugin

Create a plugin called `snake-game-standards` that packages:
- The CLAUDE.md conventions
- The hooks (auto‑format, block‑main‑push, test gate)
- The cold‑reviewer agent
- The verification skill

**Plugin structure:**

```
snake-game-plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── verify-game-changes/
│       └── skill.md
├── agents/
│   └── cold-reviewer.md
├── hooks/
│   └── hooks.json
└── CLAUDE.md
```

### Step 22: Install and test the plugin

```bash
/plugin install ./snake-game-plugin
```

---

## Phase 10: Final Deployment & Testing

### Step 23: Full deployment with all safety nets

Prompt:

```text
Deploy the snake game to GitHub Pages. Use a feature branch, 
run all tests, get a cold review, then merge to main.
The deploy workflow should:
1. Build the project with Vite
2. Run all tests
3. Deploy to GitHub Pages
4. The game should be playable at https://[username].github.io/snake-game/
5. Multiplayer invite links should work: https://[username].github.io/snake-game/#room=abc123
```

### Step 24: Test the multiplayer flow

1. Open your deployed game in browser 1.
2. Click **"Create Room"**.
3. Copy the invite link.
4. Open the link in browser 2 (or incognito).
5. Both players should see each other in the lobby.
6. Host starts the game.
7. Both snakes should be visible and controllable.

### Step 25: Use `@claude` on a PR

1. Create a new branch and make a small change.
2. Open a PR on GitHub.
3. Comment: `@claude add a countdown timer before the multiplayer game starts — 3, 2, 1, GO!`
4. Watch Claude push commits to your PR.

---

## 📋 Quick Reference: Commands & Shortcuts

| Action | Command / Shortcut |
|--------|-------------------|
| Plan Mode | `Shift + Tab` (cycle) |
| Compact | `/compact [focus instructions]` |
| Rewind | Double‑tap `Escape` (empty prompt) |
| Goal | `/goal [conditions]` |
| Loop | `/loop [prompt]` |
| Stop Loop | `Escape` |
| Hooks | `/hooks` |
| Agents | `/agents` |
| Code Review | `/code-review` |
| Install GitHub App | `/install-github-app` |
| Schedule Routine | `/schedule [description]` |
| Headless | `claude -p "prompt"` |
| Clear Goal | `/goal clear` |
| Plugin Install | `/plugin install [path]` |

---

## ✅ Practice Checklist

Make sure you've practiced every item:

- [ ] Plan Mode — used Shift+Tab to plan before coding  
- [ ] `/compact` — ran with focus instructions  
- [ ] Rewind — double‑tapped Escape and tried restore options  
- [ ] `/goal` — set autonomous completion conditions  
- [ ] `/loop` — ran a polling prompt on interval  
- [ ] Worktrees — ran parallel Claude sessions  
- [ ] CLAUDE.md layers — created Project + Local + User levels  
- [ ] Lean CLAUDE.md — kept it focused, only 2‑3 IMPORTANT rules  
- [ ] PostToolUse hook — auto‑format after every edit  
- [ ] PreToolUse hook — blocked push to main  
- [ ] Stop hook — gated on test passage  
- [ ] SessionStart hook — re‑injected context after compact  
- [ ] Exit codes — understood 0 vs 1 vs 2  
- [ ] Routines — scheduled a cloud‑run prompt  
- [ ] Headless mode (`-p`) — used Claude as a CLI pipe  
- [ ] GitHub Action — set up `@claude` on PRs  
- [ ] Permission modes — cycled through all 6  
- [ ] Verification skill — auto‑verified game changes  
- [ ] Cold reviewer — got a second opinion from a subagent  
- [ ] Read the diff — checked `git diff` not Claude's summary  
- [ ] Plugin — packaged your setup for reuse  
- [ ] Deployed to GitHub Pages — game is live and playable  
- [ ] Multiplayer works — invite links connect players  

---



**Happy coding!** 🚀

