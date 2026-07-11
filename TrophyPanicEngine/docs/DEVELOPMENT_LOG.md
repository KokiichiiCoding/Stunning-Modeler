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

(Sections below are appended as each phase lands.)
