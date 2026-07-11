# Contributing to Trophy Panic Engine

## Build (headless — always works, no dependencies)

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

## Run everything that matters

```bash
./scripts/validate.sh          # configure + build + all tests + all scenarios
```

Or piece by piece:

```bash
ctest --test-dir build --output-on-failure          # regression tests
./build/tp_scenario data/scenarios/lung_shot_deer.json
./build/tp_hunt data/contracts/clean_harvest_deer.json 42   # full hunt loop
./build/tp_demo                                     # legacy Milestone 0 demo
```

Run scenario/hunt tools **from the project root** so relative `data/` paths
resolve.

## Optional viewer

```bash
cmake -S . -B build -DTP_BUILD_VIEWER=ON
```

The viewer needs SDL2 + OpenGL development packages. If they are missing the
headless build must still succeed — that is a hard architectural rule.

## Ground rules

- The fixed-step simulation owns all authoritative gameplay facts.
  Presentation code never decides whether a lung was hit.
- All probabilistic behavior takes an explicit seed (`tp::Rng` by reference).
  No hidden globals, no `rand()`.
- Real units: meters, kilograms, seconds, Joules, ml of blood.
- No abstract comedy damage — every interaction becomes a physical event.
- Keep the headless build free of graphics dependencies.
- Every new headless subsystem gets tests; behavior changes need an updated
  golden scenario or regression test explaining why.
- Don't retune pacing constants without a scenario demonstrating the reason
  (see README "Tuning notes").
