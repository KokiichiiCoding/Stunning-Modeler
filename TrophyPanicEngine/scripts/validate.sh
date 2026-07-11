#!/usr/bin/env bash
# One-shot validation: configure, build, run every test and every scenario.
# Run from anywhere; operates on the project root it lives inside.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUILD_DIR="${BUILD_DIR:-build}"

cmake -S . -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE=Release -DTP_BUILD_TESTS=ON
cmake --build "$BUILD_DIR" --parallel

ctest --test-dir "$BUILD_DIR" --output-on-failure

echo
echo "=== Scenario sweep ==="
for scenario in data/scenarios/*.json; do
    echo "--- $scenario"
    "./$BUILD_DIR/tp_scenario" "$scenario" > /dev/null
    echo "    OK"
done

if [ -d data/contracts ] && [ -x "./$BUILD_DIR/tp_hunt" ]; then
    echo
    echo "=== Contract hunt sweep (seed 42) ==="
    for contract in data/contracts/*.json; do
        echo "--- $contract"
        "./$BUILD_DIR/tp_hunt" "$contract" 42 > /dev/null
        echo "    OK"
    done
fi

echo
echo "ALL VALIDATION STEPS PASSED"
