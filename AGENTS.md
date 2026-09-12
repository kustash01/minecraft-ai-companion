# Minecraft Bot Development Instructions

## Architecture Review Gate

- Treat every proposed architecture as a hypothesis, not as automatically correct.
- Before planning or implementing a major architectural component, independently delegate a design review to `@architect-review`.
- Architectural review is mandatory before and after work on Agent Core, Memory, Natural Language, Multi-Agent Social System, Planning, Group Coordination, Autonomous Simulation, and LLM Gateway.
- Give the pre-implementation review the proposed module boundaries, public contracts, data and control flow, persistence and failure assumptions, alternatives considered, and relevant existing files.
- Do not begin implementation while a mandatory review is pending.
- If `@architect-review` reports a fundamental architectural problem, analyze its findings, revise the design, and obtain a follow-up review before continuing implementation.
- After a major change, independently delegate `@architect-review` again to compare the implementation with the intended design and identify integration or architectural regressions.
- Resolve fundamental post-implementation findings before starting the next major architectural component.
