# 🎮 Minecraft AI Companion

An AI-powered Minecraft bot built on [mineflayer](https://github.com/PrismarineJS/mineflayer) that plays like a **real human teammate** — not a scripted NPC.

The core design goal is **maximum human-likeness with zero templated behavior**: the bot talks in its own words (never from canned phrase lists), reacts emotionally, makes mistakes, gets distracted, pursues its own goals, and interacts with the world the way a real player does.

---

## ✨ Features

### Human-like behavior (no templates)
- **Natural speech** — every line is generated live by an LLM with full context (chat history, emotions, physical state, relationships). No hardcoded phrase pools.
- **16-emotion dynamic model** with inertia and personality baselines.
- **Three-tier contextual memory** with realistic forgetting and detail distortion.
- **Realistic imperfections** — distractions, procrastination, hesitation, natural mistakes, and learning from them.
- **Stays silent ~85% of the time** on routine events, like a real person.

### World interaction
The bot uses **85+ tools** covering nearly everything a player can do:
- Mining, crafting, smelting, **brewing, enchanting, anvil** work, trading
- Combat, archery, riding, fishing, farming, animal breeding
- **Universal interaction primitives** that cover the (infinite) rest of Minecraft:
  - `use_item_on_block` — bone meal, flint & steel, hoe, composter, cauldron, dyeing…
  - `use_item` — fireworks (elytra boost), ender pearls, potions, horns…
  - `use_item_on_entity` — saddle/armor a horse, leash, name tag, shear, feed…
  - `interact_block` — levers, buttons, doors, trapdoors, pressure plates…
- Taming animals, **elytra flight**, and more

### Survival reflexes (spinal-cord layer, 20 Hz)
Fast, LLM-free reflexes: MLG water-bucket clutch, creeper shield-block, fire extinguish, suffocation escape, and a **death-save totem reflex** that only fires on a near-lethal hit — everything else is decided contextually by the bot itself.

### Two run modes
- **Single companion** — one bot playing alongside you.
- **Company of 6** — a squad of distinct personalities (Sam, Max, Jack, Ryan, Alex, Leo) that talk to each other and coordinate.

---

## 🚀 Quick start

### Requirements
- Node.js **≥ 20**
- A Minecraft Java server (default target: **1.20.4**)
- An LLM backend — local [Ollama](https://ollama.com/) (default), or an OpenAI-compatible / Gemini API key

### Install
```bash
git clone https://github.com/kustash01/minecraft-ai-companion.git
cd minecraft-ai-companion
npm install
```

### Configure
```bash
cp .env.example .env
```
Edit `.env` with your server address, bot name, and AI provider. See [Configuration](#-configuration) below.

### Run
```bash
npm start              # single companion
npm start -- --company # company of 6 bots
```

---

## ⚙️ Configuration

All configuration is via `.env` (loaded by `config/default.js`). Key settings:

| Variable | Description | Default |
|---|---|---|
| `AI_PROVIDER` | `ollama` \| `gemini` \| `openai` \| `openai_compatible` | `ollama` |
| `AI_MODEL` | Model name | `qwen2.5:3b` |
| `MC_HOST` / `MC_PORT` | Minecraft server address | `127.0.0.1:25565` |
| `MC_USERNAME` | Bot username | `GeminiBot` |
| `MC_VERSION` | Minecraft version | `1.20.4` |
| `BOT_OWNER` | Your in-game username (the bot treats you as a friend) | — |
| `BOT_LANGUAGE` | Chat language | `ru` |
| `LOG_LEVEL` | `info` \| `debug` | `info` |

> ⚠️ **Never commit your `.env`** — it holds API keys and is git-ignored by default.

---

## 🧪 Tests

```bash
npm test          # run the full vitest suite (455+ tests)
npm run test:watch
```

---

## 🗂️ Project structure

```
src/
├── index.js           # single-bot entry point
├── cli.js             # launcher (single / --company)
├── brain/             # AI orchestration, providers, context, tools registry
├── tools/             # 85+ world-interaction tools (20 files)
├── behavior/          # human-like systems: speech, emotions, reflexes, mistakes
├── cognition/         # attention, beliefs, appraisal, fast-path decisions
├── perception/        # world state, vision, scene observation
├── personality/       # traits, friendship, autonomous goals, initiative
├── social/            # conversation engine, routing, group dialogue
├── memory/            # short/long-term, episodic, emotional memory
├── combat/  control/  planning/  safety/  world/  ...
config/
├── default.js         # config loader
└── personality.js     # system prompt / character definition
tests/                 # 83 test files (unit + integration)
```

---

## 🛠️ Built with
- [mineflayer](https://github.com/PrismarineJS/mineflayer) + pathfinder, pvp, tool, collectblock, armor-manager, auto-eat
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for persistent memory
- LLM providers: Ollama / OpenAI-compatible / Google Gemini
- [vitest](https://vitest.dev/) for testing

---

## 📄 License

MIT — see [LICENSE](LICENSE).
