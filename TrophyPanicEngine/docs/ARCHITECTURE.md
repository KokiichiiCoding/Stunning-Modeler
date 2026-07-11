# Architecture

## Separation of concerns

The engine is split into two future layers.

### Simulation layer

Runs at a fixed tick rate and owns authoritative game state:

- animals
- players
- projectiles
- anatomy
- wounds
- weather
- scent
- tracks
- AI intent
- contracts
- trophy scoring

It should remain deterministic enough for testing, replays, and server authority.

### Presentation layer

Consumes snapshots from the simulation:

- rendering
- animation
- audio
- particles
- UI
- camera
- input
- accessibility

Presentation must never decide whether a bullet hit a lung or whether a leg is broken.

## Recommended frame model

- Simulation: fixed 60 Hz
- Rendering: variable refresh
- Networking: 15–30 authoritative snapshots per second
- Expensive ecology updates: staggered at lower frequencies

## Entity strategy

Do not begin with a giant general-purpose ECS.

Start with strongly typed domain objects for creatures, wounds, projectiles, and clues. Introduce an ECS only when profiling shows that broad, repeated component iteration is genuinely useful.

## Determinism

All probabilistic systems should take an explicit random seed:

- projectile fragmentation
- ricochet
- animal temperament variation
- clue placement
- weather evolution

This allows a failed hunt to be reproduced exactly in tests.

## Coordinate convention

- meters
- kilograms
- seconds
- Joules
- milliliters for blood volume
- degrees only at user-facing boundaries; radians internally when practical

## Module map (v0.3)

```text
engine/core        Fixed-step loop, seeded Rng (determinism backbone)
engine/math        Vec3 (x/y ground plane, z up, meters)
engine/ballistics  Flight, impact, layered tissue traversal
engine/biology     Anatomy, wounds, physiology, mobility (authoritative)
engine/ecology     Deterministic individual-animal generation
engine/io          JSON parser, species/ammo/items/scenario loading
engine/world       Terrain grid, wind, evidence (tracks/blood/clues),
                   scent plume, world sound events
engine/ai          Perception (vision/hearing/smell) and AnimalAgent
                   behavior (alertness ladder, wounded styles, memory)
engine/scoring     Four-part trophy score
engine/sim         HuntSimulation (single-creature), ScenarioRunner
engine/game        Contracts, HuntLoopSim (full loop, bot or manual
                   input), incident reports
viewer/            OPTIONAL SDL2/OpenGL debug viewer — presentation
                   only; reads simulation state, never writes gameplay
                   facts
```

Dependency direction: `viewer -> engine/game -> (ai, world, ecology,
scoring, sim) -> (ballistics, biology, io) -> (core, math)`. Nothing in
`engine/` includes SDL or OpenGL; the headless build has zero external
dependencies.

The hunter in `HuntLoopSim` is driven either by the deterministic bot
policy (headless tests, spectate mode) or by `ManualInput` from a human
(viewer `--player`). Both paths call the same fire/claim/adjudication
code — input source is the only difference, which is also the shape a
future networked client/server split needs (input as commands,
simulation as authority).
