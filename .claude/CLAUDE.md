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
