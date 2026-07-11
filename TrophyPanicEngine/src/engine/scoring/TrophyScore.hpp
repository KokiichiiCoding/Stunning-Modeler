#pragma once
#include "engine/biology/Creature.hpp"

#include <string>

namespace tp {

struct TrophyScoreInput {
    // The animal's natural size/maturity/rarity, independent of how it was
    // hunted. There is no animal-generation system yet (that's ecology /
    // Milestone 2+ territory), so this is a caller-supplied placeholder —
    // defaulting to 100 ("an unremarkable but fully mature specimen") until
    // a real system produces it per-animal.
    double biologicalQualityPercent{100.0};

    int shotsFired{1};

    // Seconds from first hit to Down/Dead, or -1.0 if the animal was never
    // incapacitated within the observed simulation window (HuntSimulation
    // tracks this directly).
    double timeToIncapacitationSeconds{-1.0};
};

struct TrophyScoreResult {
    double biologicalQuality{};
    double shotQuality{};
    double trophyIntegrity{};
    double recoveryQuality{};
    double overall{};
    bool recovered{false}; // did the animal actually go down/dead at all?
    std::string tier;      // "Platinum" | "Gold" | "Silver" | "Bronze" | "Field Dressed Only" | "No Recovery"
};

[[nodiscard]] TrophyScoreResult computeTrophyScore(
    const CreatureState& creature,
    const TrophyScoreInput& input);

} // namespace tp
