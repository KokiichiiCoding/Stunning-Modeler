# Trophy Panic Engine — Headless Prototype

A dependency-free C++20 simulation kernel for the proposed cooperative slapstick hunting game.

This is intentionally **not a full renderer or editor yet**. Milestone 0 built a deterministic, testable simulation layer. Milestone 1 (this version) makes that simulation **data-driven**: species and ammunition now live in JSON, wounds can traverse layered anatomy (skin → muscle → bone → organ, with real exit wounds), fragmentation is a seeded probabilistic roll instead of a hard threshold, and every hunt produces a four-part trophy score.

The same simulation can later run beneath Godot, Unreal, SDL, Vulkan, or a fully custom renderer.

## Why headless first?

The game's identity depends on systems being consistent. A rifle, boot, nail gun, fall, and trebuchet should all feed the same injury model. Building this as a standalone library makes those rules testable before animation, networking, and graphics complicate debugging.

## Build

Requirements:

- CMake 3.20+
- A C++20 compiler

### Windows (Visual Studio Developer PowerShell)

```powershell
cmake -S . -B build
cmake --build build --config Release
.\build\Release\tp_demo.exe
.\build\Release\tp_scenario.exe data\scenarios\lung_shot_deer.json
ctest --test-dir build -C Release --output-on-failure
```

### Linux / macOS

```bash
cmake -S . -B build
cmake --build build
./build/tp_demo
./build/tp_scenario data/scenarios/lung_shot_deer.json
ctest --test-dir build --output-on-failure
```

`tp_demo` is the original Milestone 0 hardcoded single-shot demo (kept for reference — it still uses the hand-built `makePrototypeDeer()` and the legacy non-layered code path). `tp_scenario` is the new, real entry point: it loads every species in `data/species/`, all ammunition in `data/ammunition.json`, runs whatever scenario file you point it at, and prints a full trophy score. Run it from the project root so its relative `data/` paths resolve.

## Current project structure

```text
src/
  engine/
    ballistics/   Projectile flight, impact, and multi-layer tissue traversal
    biology/      Anatomy, wounds, physiology, mobility
    core/         Fixed-step timing utility, seeded RNG
    io/           JSON parser, species/ammo/scenario data loading
    scoring/      Four-part trophy scoring (Biological/Shot/Integrity/Recovery)
    sim/          Hunt simulation coordinator, shared scenario runner, telemetry
  main.cpp            Milestone 0 hardcoded demo (legacy, still works)
  scenario_runner.cpp Data-driven CLI: loads data/, runs a scenario file, prints results
data/
  species/        JSON species definitions (deer, boar)
  ammunition.json JSON ammunition definitions (rifles, bow, slug, boot, nail gun, ...)
  scenarios/      JSON hunt scenarios used by tp_scenario and the golden tests
tests/            Regression tests (see below) + golden scenario baselines
docs/             Architecture and development roadmap
```

## Design rule

No weapon applies abstract comedy damage.

Every source of force should eventually become one or more physical events:

1. impact
2. penetration or blunt impulse (now optionally through explicit skin/muscle/bone/organ layers, with real exit wounds when a round overpenetrates)
3. tissue / bone damage
4. bleeding and shock
5. locomotion or consciousness changes
6. animal behavior response
7. trophy-quality consequences (now an actual computed score, not just a design intention)

## Tuning notes (v0.1 pacing pass)

The initial bleed-rate constants were physiologically-inspired but too
conservative for gameplay: a clean single-lung .308 hit took ~267s (4.5
minutes) to bring an animal down, which reads as broken rather than tense
against the design doc's expectation of a trackable, minutes-not-hours
recovery. Two changes address this:

- `bleedScaleFor()` coefficients were rescaled (Lung 0.008 → 0.085,
  Heart/MajorVessel 0.020 → 0.150, LiverGut 0.003 → 0.010) so a solid rifle
  hit produces a readable ~20-40s time-to-down instead of several minutes.
- Heart and major-vessel hits now trigger `cardiacEventTimerS`, a short
  fixed countdown (3s heart / 5s major vessel) that forces the animal down
  independent of the blood-loss curve. Previously a heart shot degraded
  consciousness at roughly the same rate as a lung shot, which contradicts
  the design pillar that different anatomy should produce genuinely
  different failure modes, not just different bleed multipliers.

## v0.2 pass: a real bug the tests caught

Wiring the cardiac timer into `stepPhysiology()` initially had a genuine
bug, found only by *running* the heart-shot scenario rather than reading
the code: once the timer forced the animal Down at 3s, the very next tick
recomputed consciousness from the ordinary blood-loss formula — which
hadn't yet crossed its own unconsciousness threshold — and consciousness
climbed back to ~48% while `life` stayed `Down`. The animal was, in
effect, waking back up from cardiac arrest.

Fix: once `life` leaves `Active` (for any reason — cardiac timer or
ordinary blood loss), the general consciousness/mobility recompute is
skipped entirely for the rest of the hunt; only blood volume keeps
draining in the background, which can still carry the animal from `Down`
to `Dead` later. `tests/GoldenScenarioTests.cpp` now has a standing
regression guard for this exact failure mode ("consciousness stayed
pinned at 0 after Down").

## Milestone 1 status: data-driven hunting sandbox

What's real and tested in this version:

- ✅ JSON species definitions (`data/species/*.json`) — dependency-free
  hand-rolled parser (`engine/io/Json.*`), not a third-party library, to
  keep the project's "dependency-free" identity honest.
- ✅ JSON ammunition definitions (`data/ammunition.json`)
- ✅ Layered body traversal (`engine/ballistics` `TissueLayer` /
  `resolveLayeredImpact`) — skin/muscle/bone/organ ordered stacks, with
  underpenetration (stops in bone), organ hits scaled by energy actually
  remaining after overcoming earlier layers, and real exit wounds when a
  round overpenetrates. Opt-in per body part — parts with no `layers`
  defined keep using the original single-resistance model untouched, so
  Milestone 0's hand-built prototype creature and its tests are unaffected.
- ✅ Exit wounds (part of the above)
- ✅ Trophy integrity scoring, folded into a full four-part trophy score
  (`engine/scoring/TrophyScore.*`): Biological Quality (currently a
  caller-supplied placeholder — there's no animal-generation system yet),
  Shot Quality (vital-hit ratio + shots-fired efficiency), Trophy Integrity
  (condition of `trophyOrgan` body parts), Recovery Quality (time-to-down
  curve).
- ✅ Deterministic random service (`engine/core/Rng.hpp`) — currently wired
  into fragmentation only (`resolveImpact(projectile, impact, rng)`
  overload); ricochet has no probabilistic model yet.
- ✅ Command-line scenario loader (`tp_scenario` + `engine/io/ScenarioLoader`
  + `engine/sim/ScenarioRunner`) — the CLI is a thin printer over a shared
  `runScenario()` function, specifically so the CLI and the golden tests
  can't silently diverge into two different simulation behaviors.
- ✅ Golden regression files (`tests/GoldenScenarioTests.cpp` +
  `data/scenarios/*.json`) — three canonical scenarios (clean lung shot,
  cardiac heart shot, boar leg-immobilization) with locked-in expected
  outcomes and one explicit regression guard for the cardiac/consciousness
  bug above.

What's explicitly NOT done yet (don't assume these exist):

- Species/ammo data only covers two animals (deer, boar) and nine
  projectiles — not the full vertical-slice roster (elk, black bear still
  need data files).
- No animal generation system, so "Biological Quality" is a stub input,
  not a computed property of an individual animal's size/maturity/rarity.
- Ricochet has no model at all, probabilistic or otherwise.
- Trophy scoring weights (0.20/0.30/0.25/0.25) are first-pass, same
  caveat as the bleed constants — not balanced against actual playtesting.
- Everything below this point in the roadmap (tracking/ecology, animal
  behavior AI, debug renderer, physical hunters, networking) is
  untouched — still exactly as scoped in `docs/ROADMAP.md`.

## Running the test suite

```bash
ctest --test-dir build --output-on-failure
```

Six suites, all currently green:

- `tp_tests` — original Milestone 0 regression tests (unchanged, still
  exercising the legacy non-layered path)
- `tp_json_smoke` — JSON parser correctness
- `tp_layered_ballistics_smoke` — layered traversal (underpenetration,
  organ reach, exit wounds) + seeded-RNG fragmentation reproducibility
- `tp_gamedata_e2e` — loads the real `data/` files end-to-end and fires a
  shot through data-driven anatomy
- `tp_trophy_score` — the three headline trophy-scoring cases (clean shot,
  messy multi-shot hunt, never-recovered)
- `tp_golden_scenarios` — the three canonical scenarios, including the
  standing cardiac/consciousness regression guard

## Immediate next milestones

1. Add elk and black bear species data files to reach the vertical slice's four-species roster.
2. Move trophy-score weights into data (per-contract-type tuning, e.g. a "Gold or better" contract).
3. Add a ricochet model using the existing seeded `Rng` service.
4. Begin Milestone 2 (tracking and ecology): footprints, blood droplets, scent, clue aging.
5. Add an SDL3 debug viewer.
6. Add replay snapshots for multiplayer validation.

See `docs/ROADMAP.md` for the larger plan.
