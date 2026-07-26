Resuming the multiplayer Snake game project.

Layout:
- src/game/ — pure game logic (step, collision, food, difficulty). No DOM, no network.
- src/network/ — host/client sessions, protocol, signaling providers (PeerJS + Trystero).
- src/ui/ — canvas renderer, screens, HUD. Reads state, never mutates it.

Binding decisions:
- Host-authoritative: clients send inputs only, never simulate.
- Player identity is a localStorage UUID (sessionToken), not the peer ID.
- Host tick clock runs off a Web Worker metronome, not requestAnimationFrame.
- Never commit directly to main — feature branches and PRs only.

Current focus: [update as needed]
