# Development Roadmap

## Milestone 0 — Simulation kernel

Included in this prototype:

- [x] fixed-step loop utility
- [x] projectile energy decay
- [x] impact resolution
- [x] creature anatomy
- [x] bleeding
- [x] pain shock
- [x] consciousness
- [x] mobility states
- [x] tests
- [x] text telemetry

## Milestone 1 — Data-driven hunting sandbox

- [x] JSON species definitions (JSON chosen over TOML; two species so far — deer, boar)
- [x] JSON ammunition definitions (nine projectiles)
- [x] layered body traversal (skin/muscle/bone/organ, opt-in per body part)
- [x] exit wounds
- [x] wound-channel geometry (permanent cavity volume; per-layer geometry is simplified, not a full 3D wound channel)
- [x] trophy integrity (folded into a full four-part trophy score, not integrity alone)
- [~] deterministic random service — implemented and wired into fragmentation; ricochet still has no probabilistic model
- [x] command-line scenario loader (`tp_scenario`, backed by a shared `runScenario()` used by both the CLI and the golden tests)
- [x] golden regression files (three canonical scenarios, `tests/GoldenScenarioTests.cpp`)

Not part of the original Milestone 1 list, but added because trophy
scoring needed it: hunt-level stats tracking (shots fired, time-to-
incapacitation) on `HuntSimulation`.

See `README.md`'s "Milestone 1 status" section for the fuller honest
breakdown of what's real vs. still a stub (e.g. "Biological Quality" has
no animal-generation system behind it yet).

## Milestone 2 — Tracking and ecology

- footprints
- blood droplets
- hair and bone fragments
- scent particles
- wind field
- clue aging
- feeding, bedding, drinking, and migration schedules
- simple terrain grid

## Milestone 3 — Animal behavior

- perception
- suspicion and alertness
- herd communication
- species-specific fleeing
- wounded bedding behavior
- predator stalking
- defensive charges
- behavior debugger

## Milestone 4 — Debug renderer

Use SDL3 initially:

- free camera
- terrain
- primitive animal rigs
- collider visualization
- projectile traces
- organ overlays
- track and scent visualization
- ImGui tuning panels

A custom Vulkan renderer can replace or supplement this later.

## Milestone 5 — Physical hunters

- capsule locomotion
- climbing
- grabbing
- ropes
- carried equipment
- player injuries
- carcass dragging
- cooperative lifting

## Milestone 6 — Networking

- server-authoritative simulation
- client input commands
- state snapshots
- interpolation
- lag-compensated shot validation
- replay capture
- deterministic incident reports

## Milestone 7 — Vertical slice

One map:

- deer
- elk
- boar
- black bear
- one rifle
- one bow
- one boot
- one rubber chicken
- one leaf blower
- contracts
- extraction
- trophy lodge result screen
