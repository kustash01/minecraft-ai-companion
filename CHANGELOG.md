# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-17

### Added
- **Code-as-Action Sandbox (`ActionSandbox`)**: Secure in-process JavaScript sandbox enabling dynamic execution of complex multi-tick Minecraft sequences (`run_code`) with state-diff feedback (position, health, food, inventory tracking).
- **Sensory Cortex & Environmental Awareness (`SceneObserver`)**: Real-time perception of lighting levels underfoot (1.18+ mob spawning safety), weather, celestial cycles (sunsets, thunderstorms), teammate gaze and held items, and metabolic state (hunger/saturation).
- **Biological Error Engine (`HumanErrorEngine`)**: Replaced all naive uniform pseudo-randomness across the entire codebase with Gaussian distribution (Box-Muller transform) and realistic physiological limits (0.995 biological ceiling modulated by adrenaline and exhaustion).
- **Adrenaline & Yerkes-Dodson Model (`AdrenalineController`)**: Dynamic pulse and adrenaline tracking with inverted-U performance curve, tremor amplification under panic, and focus tunnel vision.
- **3D Auditory Localization & Inattentional Deafness (`AuditoryEngine`)**: Spatial sound processing with ear angular uncertainty and attention-gated sound filtering during intense focus.
- **Pro Gamer Tricks (`ProGamerTricks`)**: Gravel torch-column collapse, 3D BFS ore-vein extraction, right-hand wall torch placement rule, underwater air pocket creation via door placement, safe waterfall descent, sneak-bridging over voids/lava, and nether/end safe-bed checks.
- **Natural Gaze System (`NaturalGazeEngine`)**: 20 TPS autonomous gaze loop with running saccades, peripheral mob detection (30°-110°), situational ground glances, celestial weather observation, mutual gaze break etiquette, and task focus locking.
- **Buddy Dynamics (`BuddyDynamics`)**: Teammate care routines including emergency food sharing, resource handover with shift-taps, synchronized sleeping, hallway yield courtesy, and victory crouch celebrations.
- **Landmark Topology (`LandmarkTopology`)**: Semantic spatial memory describing locations relative to landmarks rather than raw coordinate numbers.
- **Free-Form Associative Memory Stream (`MemoryManager` free_notes)**: Unrestricted memory notes and thought reflections stored in persistent SQLite.
- **Stream of Consciousness & Free Will (`StreamOfConsciousness`, `ThoughtStream`)**: Autonomous inner dialogue and spontaneous decision making without requiring user prompts.
- **Hotbar Ergonomics & Muscle Memory (`HotbarErgonomics`)**: Pro-layout slot conventions, adjacent key slips under stress with self-correction delay, and low-durability panic preservation.
- **Combat Micro-Mechanics (`CombatMicroEngine`)**: Jump critical hit timing verification on falling phase (`velocity.y < -0.05`), weapon cooldown pacing, W-tap sprint-reset knockback, and circle-strafing.

### Changed
- **Eliminated 100% Determinism & Math.random**: Migrated 24 behavioral, social, cognitive, motor, and goal subsystems to `HumanErrorEngine` (`chance`, `range`, `jitter`, `choice`, `weightedChoice`).
- **Human Chat Flow (`HumanChatFlow`)**: Realistic typing speed (200-350 CPM), QWERTY/JCUKEN keyboard typo simulation with gamer rule (65% uncorrected if intelligible, 35% asterisk quick-correction), and multi-message splitting.
- **Conversation Routing**: Non-deterministic direct response chances under pressure with realistic pause delays.
- **Test Suite**: Expanded coverage to 104 suites and 552 unit/integration/endurance tests with 100% pass rate.

## [0.1.0] - 2026-09-15

### Added
- Initial project release: Mineflayer-based companion bot powered by Google Gemini API.
- Basic autonomous survival, pathfinding, and chat interaction.
