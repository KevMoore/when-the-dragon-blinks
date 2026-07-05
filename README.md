# When the Dragon Blinks

A playable Canvas2D/TypeScript vertical slice inspired by Zhulong, the Torch Dragon.

The game includes:

- Three handcrafted platforming levels
- One boss fight: The Lantern Eater
- Day/Night world switching based on the Zhulong eye motif
- Coyote time, jump buffering, variable jump height, dash, attack, checkpoints, hazards, relics
- Accurate AABB tile collision with separate X/Y resolution and movement subdivision
- Controller support
- Mobile landscape touch controls with portrait rotate overlay
- Parallax backgrounds and procedural placeholder art
- Myth & History codex with unlockable educational entries
- Lore panels before/after levels and at shrines
- localStorage progress saving
- F1 collision debug overlay

## Run locally

No build tool is required at runtime because the compiled JavaScript is included in `dist/main.js`.

From this folder:

```bash
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

To rebuild TypeScript:

```bash
npm install
npm run build
```

Optional dev server after install:

```bash
npm run dev
```

If `npx http-server` is unavailable, use:

```bash
npm run serve:python
```

## Controls

Keyboard:

- A/D or Arrow keys: move
- Space/W/Up: jump
- Shift/K: dash
- J/X: dragon-light pulse attack
- E/C/L: toggle Day/Night
- F near shrine: open lore shrine
- Esc: pause/back
- H: Myth & History from title
- L: Level select from title
- F1: collision debug

Controller:

- Left stick / D-pad: move
- South button: jump/confirm
- West button: attack
- East button: dash/back
- North button or shoulder: toggle Day/Night
- Start: pause

Mobile:

- Landscape only. Portrait shows a rotate-device screen.
- Touch buttons appear in landscape on coarse-pointer devices.

## Educational framing

The game separates text into:

- **Myth**: source-inspired mythic ideas
- **Historical Note / History**: cautious contextual statements
- **Game Inspiration**: what the game invented or adapted for mechanics

The codex includes a disclaimer that this is not a scholarly reconstruction and that mythological details vary across texts, translations, and retellings.

## AutoSprite MCP

This environment cannot call your local AutoSprite MCP. The game currently uses procedural placeholder art, but the asset replacement plan is ready.

Use:

- `assets/autosprite-prompts.md`
- `assets/asset-manifest.json`

Then replace procedural drawing hooks listed in the manifest with sprite-sheet rendering.

## Architecture

The MVP is intentionally compact and dependency-light:

- `src/main.ts`: game loop, input, physics, collision, levels, entities, boss, rendering, UI, lore/codex
- `styles.css`: responsive canvas, mobile controls, rotate overlay
- `index.html`: SPA shell
- `dist/main.js`: compiled JavaScript

The renderer uses a fixed 960x540 logical canvas and CSS `object-fit: contain` for responsive scaling.

## Notes for expansion

Recommended next improvements:

1. Replace procedural art with AutoSprite-generated sheets.
2. Add real audio/music layers for Day and Night.
3. Split `src/main.ts` into modules once features stabilize.
4. Add LDtk/Tiled level import.
5. Add more boss attack patterns and seasonal mechanics.
6. Add accessibility options: reduced shake, high contrast, remappable controls.
