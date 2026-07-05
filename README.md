# When the Dragon Blinks

A polished Canvas2D + TypeScript mythic platformer inspired by **Zhulong, the Torch Dragon** (Candle Dragon). Open and close the dragon's eye to blink the world between day and night, climb toward the mountain gate, and break the Lantern Eater's mask to restore the balance of light and dark.

Play a live build via the Render deployment (see **Deploy** below), or run it locally.

## Features

- **Three handcrafted levels + a phased boss fight** (The Lantern Eater)
- **Day/Night "blink" mechanic** driven by the Zhulong eye myth — platforms, hazards, bridges, enemies and secrets all change state, with a smooth flash/particle transition
- **Rich platformer feel**: coyote time, jump buffering, variable + apex-hang jump, corner correction, wall slide/jump, dash with afterimages, fast-fall, squash & stretch, trauma-based screen shake, and hit-stop
- **Additive night lighting**, fog, vignette, animated parallax with floating lanterns, and an opening/closing dragon eye on the title screen
- **Moving, vertical, and crumbling platforms**, one-way platforms, wind updrafts, and four enemy types (moth, stone guardian, spirit wisp, lantern sentry)
- **Layered procedural audio**: a warm day / cool night ambient bed plus synthesized SFX (no asset files needed)
- **Educational Myth & History codex** with careful Myth / Historical Note / Game Inspiration framing, unlocked as you progress
- **Settings** (master volume, music, screen shake, reduced motion), **best-time tracking**, and **localStorage** save
- **Keyboard, gamepad, and mobile landscape touch** controls, with a portrait "rotate device" screen
- **F1 collision debug overlay**

## Run locally

The compiled JavaScript is committed in `dist/`, so no build step is required to play — just serve the folder:

```bash
python3 -m http.server 5173
# then open http://localhost:5173
```

To rebuild the TypeScript after editing `src/`:

```bash
npm install
npm run build        # compiles src/ -> dist/
npm run dev          # build + http-server on :5173
```

Dev deep-link: append `?level=0..3` to jump straight into a level, and add `&night=1` to start at night (e.g. `index.html?level=2&night=1`).

## Deploy (Render static site)

The game is a pure static SPA. `render.yaml` describes a Render static site, and `npm run build:site` assembles a clean, self-contained `public/` directory (index.html + styles.css + dist/ + assets/).

```bash
npm run build:site   # -> ./public, ready to publish on any static host
```

On Render it deploys with:

- **Build command:** `npm install && npm run build:site`
- **Publish directory:** `./public`

## Controls

Run-and-gun: fire **dragon-light** at everything. Tap to shoot an aimed bolt; **hold** to charge a big piercing fire-blast. Aim by holding a direction — straight, **Up** for vertical, Up + forward for a diagonal. Blink Day/Night mid-fight as a tactical tool.

**Keyboard** — Move: A/D or ←/→ · **Jump: Space** · **Aim up: W/↑** (hold while shooting) · Shoot: J/X (hold = charge) · Dash: Shift/K · Blink Day/Night: E/C/L · Fast-fall: S/↓ · Pause: Esc/P · Myth & History (from title): H · Debug: F1

**Gamepad** — Move: stick/D-pad · Jump: South · Aim: stick/D-pad up · Shoot: West (hold = charge) · Dash: East · Blink: North/shoulders · Pause: Start

**Mobile** — Landscape only (portrait shows a rotate screen). **Left thumb = a drag joystick**: tilt to move, push **up** to aim shots up, push **down** to crouch (diagonals work — crouch-walk, aim-up-while-moving). **Right thumb**: blink (☯) and one combined **✦ button — tap to fire, hold to jump** (hold longer for a higher jump; release + re-hold in the air to double-jump). **Dash = double-tap the joystick.** Shrines auto-open on approach.

All inputs support the double jump — tap jump again in mid-air for a second boost.

## Architecture

Clean ES modules compiled with `tsc` and loaded natively in the browser (no bundler):

| Module | Responsibility |
| --- | --- |
| `main.ts` | bootstrap, fixed-timestep loop, DPR sizing, deep-links |
| `game.ts` | orchestrator: state machine, collision, render dispatch |
| `player.ts` / `enemy.ts` / `boss.ts` | entities and their behavior |
| `platform.ts` | moving / vertical / crumbling platforms |
| `content.ts` | level layouts, lore panels, codex entries |
| `background.ts` / `ui.ts` | environment + lighting rendering / HUD + menus |
| `camera.ts` / `particles.ts` | follow camera & shake / particle system |
| `input.ts` / `audio.ts` / `storage.ts` | input, procedural audio, save |
| `math.ts` / `types.ts` | helpers, shared types & constants |

Collision uses AABB with separate X/Y resolution, movement subdivision to avoid tunneling, one-way platform support, and corner correction. Day/Night platform swaps are checked before toggling so the player is never crushed or trapped.

## Educational framing

Text is separated into **Myth** (source-inspired ideas), **Historical Note / History** (cautious context), and **Game Inspiration** (what the game invented or adapted). The codex carries a disclaimer that this is *inspired by* tradition, not a scholarly reconstruction, and that details vary across texts, translations, and retellings. The Lantern Eater boss is explicitly flagged as an original creation.

## Art pipeline (AutoSprite)

Character art — the **player** (idle/run/jump/attack), all four **enemies** (moth, wisp, guardian, sentry), and the **boss** (idle/attack) — is generated with [AutoSprite](https://www.autosprite.io) and lives in `assets/sprites/` as 8-frame sheets. `src/spritedata.ts` registers them into the `SpriteBank` (`src/sprites.ts`); every entity falls back to procedural art until its sheet finishes loading, so the game always runs even with assets missing. Tiles, parallax, shrines/relics, and the HUD remain procedural. See `assets/asset-manifest.json` for the full map and how to regenerate a sheet.

## Future improvements

Real sprite sheets and music stems, more boss patterns and seasonal mechanics, remappable controls, high-contrast mode, and a Tiled/LDtk level importer.
