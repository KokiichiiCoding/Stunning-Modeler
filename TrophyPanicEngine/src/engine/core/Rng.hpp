#pragma once
#include <cstdint>
#include <random>

namespace tp {

// A thin, explicit wrapper around a PRNG. The point isn't the algorithm
// (mt19937_64 is fine) — it's that every probabilistic system in the engine
// takes one of these *by reference* rather than reaching for a global/hidden
// generator. That keeps a failed hunt reproducible from a single seed, which
// matters for regression tests and for replay/multiplayer validation later
// (see ARCHITECTURE.md's determinism section).
class Rng {
public:
    explicit Rng(std::uint64_t seed) : engine_(seed) {}

    // [0.0, 1.0)
    double uniform01() {
        return dist01_(engine_);
    }

    // true with the given probability, clamped to [0,1]
    bool rollChance(double probability) {
        if (probability <= 0.0) return false;
        if (probability >= 1.0) return true;
        return uniform01() < probability;
    }

    double range(double lo, double hi) {
        if (hi <= lo) return lo;
        return lo + uniform01() * (hi - lo);
    }

private:
    std::mt19937_64 engine_;
    std::uniform_real_distribution<double> dist01_{0.0, 1.0};
};

} // namespace tp
