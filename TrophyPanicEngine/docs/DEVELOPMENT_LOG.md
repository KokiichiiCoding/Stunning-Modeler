# Development Log

## Session 2026-07-11 — v0.3 vertical-slice pass

### Verified baseline (before any changes)

Extracted `TrophyPanicEngine_v0_3.zip` (project version string said 0.2.0)
into the repository and validated it untouched:

- Toolchain: GCC 13.3, CMake 3.28, Ninja, Linux.
- `cmake -S . -B build && cmake --build build`: **clean build, zero warnings**
  (`-Wall -Wextra -Wpedantic` already enabled).
- `ctest`: **6/6 suites passed** (tp_tests, tp_json_smoke,
  tp_layered_ballistics_smoke, tp_gamedata_e2e, tp_trophy_score,
  tp_golden_scenarios).
- All three scenarios ran via `tp_scenario`:
  - `lung_shot_deer.json` → Down ~20s, Platinum 97.1
  - `heart_shot_deer.json` → cardiac timer down at 3s, Platinum 100.0
  - `boar_legs_immobilized.json` → immobilized (Crawling), No Recovery
    within 15s window as designed.
- `tp_demo` (legacy Milestone 0 path) ran and printed the expected table.

The README's claims about existing systems all checked out against the
actual source; nothing was found to be stub-only except the documented
"Biological Quality is a caller-supplied placeholder."

### Phase A — engineering hygiene

- CMake options added: `TP_BUILD_TESTS` (ON), `TP_BUILD_VIEWER` (OFF),
  `TP_ENABLE_STRICT_WARNINGS` (ON). Headless library + CLI tools always
  build; viewer is an isolated optional subdirectory.
- `scripts/validate.sh` — one command runs configure/build/tests/every
  scenario/every contract hunt.
- `CONTRIBUTING.md`, `.clang-format`, `.gitignore` added.
- No behavioral changes; all existing tests still green.

### Phase B — vertical-slice species roster

- `prototype_elk` (12 L blood, thick layered thorax, antler trophy) and
  `prototype_black_bear` (fat layer in every stack, skull trophy, layered
  gut) added. All four species files gained the extended profile schema
  (mass range, trophy score range, movement, senses, behavior tuning,
  track geometry) — see `docs/DATA_FORMATS.md`.
- Five new scenarios with golden regressions: clean elk lung shot
  (~60 s, exit wound, Gold), .22LR stopping in elk shoulder bone
  (No Recovery, lung integrity untouched), bear heart cardiac fast-path
  (3 s, Platinum), surviving bear gut shot (basis for wounded-aggressive
  behavior), antler destruction dropping trophy integrity to 0 (Silver).

### Phase C — deterministic animal generation

- `engine/ecology/AnimalGenerator`: (species, seed) → individual with age
  class, sex, mass, trophy size/symmetry, coat, health, temperament,
  alertness baseline, rare traits, stamina. **Biological quality is now
  computed**, replacing the placeholder. Blood volume scales with the
  individual's mass. RNG draw order documented as a replay-format
  compatibility contract (append-only).
- Scenarios accept optional `animal_seed`; legacy scenarios unaffected.

### Phase D — world layer

- `engine/world/Terrain`: hash-noise procedural grid (no draw-order
  dependence), guaranteed zones: camp, forest, meadow, creek, rocky
  slope, dense cover, extraction. Coordinates: x/y ground plane, z up.
- `engine/world/Wind`: seeded slow-drift direction/speed; single source
  of truth for scent, perception, and the player indicator.
- `engine/world/Evidence`: clues with surface- and rain-dependent aging;
  `TrackEmitter` derives gait/stride from actual mobility (limping
  shortens stride, flags injured gait); `BloodEvidenceEmitter` converts
  live bleed rate + exit wounds into drops/smears/pools.
- `engine/world/Scent`: wind-advected puff plume; directly upwind is
  provably scent-free; bleeding multiplies body scent.
- `engine/world/SoundEvents`: authoritative world sounds with standard
  source intensities (gunshot audible ~3.5 km under inverse-square).

### Phase E — perception & behavior

- `engine/ai/Perception`: graded vision (distance/FOV/motion/stance/
  cover/alert bonus), hearing with species sensitivity, movement
  loudness owned by the simulation, threshold-gated smell.
- `engine/ai/Behavior`: `AnimalAgent` with the Calm → Curious →
  Suspicious → Alert → Fleeing/Defensive/Aggressive → Incapacitated
  ladder on an alertness accumulator. Perception ~10 Hz, decisions
  ~5 Hz, movement/physiology 60 Hz. Wounded behavior follows species
  `wounded_style` data; physiology caps speed (broken limbs, lung
  wounds, stamina). Herd alarm propagation. One-line behavior debugger.

### Phases H/I/J — equipment, contracts, hunt loop, incident reports

- `data/items.json`: full professional + absurd equipment set; noisy
  items feed the world SoundLog; throwables are real projectiles.
  Tests pin the boot as blunt-only, the chicken as a sound tool, the
  leaf blower as unable to wound.
- `engine/game/Contracts`: three templates (clean harvest / problem
  animal / research observation) with embedded world + animal seeds.
- `engine/game/HuntLoop`: the complete loop headless — camp → travel →
  track → stalk → shoot (real ballistics) → trail blood from the hit
  site → claim/inspect → extract → score + adjudication. Driven by a
  deterministic bot policy OR manual input (`setManualHunter`) with
  byte-identical simulation rules.
- `engine/game/IncidentReport` + `tp_hunt` CLI: reproducible JSON hunt
  records; all three shipped contracts succeed deterministically.

### Phases F/G — viewer & player control

- `viewer/tp_viewer` (optional, `-DTP_BUILD_VIEWER=ON`, SDL2 + OpenGL
  fixed-function): procedural terrain/trees, toy-like original hunter,
  mass-scaled low-poly animal with trophy geometry and blood tint,
  overlay toggles (tracks, blood, scent, wind, vision cone, shot
  traces, AI debug), pause/step/timescale/reset, PPM screenshots,
  spectate and `--player` manual modes.
- Verified in this session by offscreen rendering (llvmpipe) with
  screenshot inspection; interactive windowed use needs a desktop.
- Dear ImGui not vendored: the dev environment's network policy blocks
  fetching it. Integration point is isolated in `viewer/`; adding it
  later does not touch engine code.

### Known limitations / next tasks

1. One animal per hunt; no herds in the hunt loop yet (herd alarm is
   implemented and tested at the behavior layer).
2. Bot/manual shots resolve against the broadside vital stack at true
   distance — free aim over anatomy volumes needs the viewer camera to
   grow a first-person aim mode.
3. No line-of-sight raycast in vision; cell cover stands in.
4. Scent uses discrete puffs (documented approximation).
5. Viewer has no in-window text; debug detail goes to stdout/title bar.
6. Trophy-score weights and many pacing constants remain first-pass
   (documented in code); retune only with scenario evidence.
7. Recovery quality scores time-to-incapacitation only; recovery
   distance is recorded in the incident report but unweighted.
