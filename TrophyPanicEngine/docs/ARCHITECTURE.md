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
