#include "engine/io/GameData.hpp"
#include "engine/sim/HuntSimulation.hpp"
#include "engine/scoring/TrophyScore.hpp"
#include <iostream>
#include <cassert>

using namespace tp;

int main() {
    GameDataRegistry registry;
    registry.loadSpeciesFile("data/species/prototype_deer.json");
    registry.loadAmmunitionFile("data/ammunition.json");
    const ProjectileSpec& rifle = registry.ammunition("308_soft_point");
    const ProjectileSpec& boot = registry.ammunition("throwing_boot");

    // Case 1: one clean lung shot, quick recovery -> should score well.
    {
        HuntSimulation sim(registry.instantiateSpecies("prototype_deer"));
        sim.fire("primary_thorax_left", rifle, {80.0, 90.0, 1.0, false});
        sim.runFor(120.0);

        TrophyScoreInput in;
        in.shotsFired = sim.shotsFired();
        in.timeToIncapacitationSeconds = sim.timeToIncapacitationSeconds();
        auto score = computeTrophyScore(sim.creature(), in);

        std::cout << "Case1 clean lung shot: overall=" << score.overall
                  << " tier=" << score.tier
                  << " shotQ=" << score.shotQuality
                  << " recoveryQ=" << score.recoveryQuality
                  << " integrity=" << score.trophyIntegrity << "\n";
        assert(score.recovered);
        assert(score.overall > 60.0 && "A single clean lung shot should score well");
    }

    // Case 2: same lung shot, but also plink the antler rack (trophy
    // damage) and fire several wasted shots -> integrity and shot quality
    // should both drop, even though it's still a "successful" hunt.
    {
        HuntSimulation sim(registry.instantiateSpecies("prototype_deer"));
        sim.fire("primary_thorax_left", rifle, {80.0, 90.0, 1.0, false});
        sim.fire("antler_rack", rifle, {80.0, 90.0, 1.8, true});
        sim.fire("gait_column_rear_left", boot, {5.0, 90.0, 1.0, false}); // wasted, doesn't penetrate
        sim.fire("gait_column_rear_right", boot, {5.0, 90.0, 1.0, false}); // wasted
        sim.runFor(120.0);

        TrophyScoreInput in;
        in.shotsFired = sim.shotsFired();
        in.timeToIncapacitationSeconds = sim.timeToIncapacitationSeconds();
        auto score = computeTrophyScore(sim.creature(), in);

        std::cout << "Case2 messy hunt (antler hit + wasted shots): overall=" << score.overall
                  << " tier=" << score.tier
                  << " shotQ=" << score.shotQuality
                  << " integrity=" << score.trophyIntegrity << "\n";
        assert(score.trophyIntegrity < 100.0 && "Hitting the antler rack should reduce trophy integrity");
        assert(score.shotQuality < 90.0 && "Four shots for one meaningful wound should reduce shot quality");
    }

    // Case 3: underpowered round, animal never goes down in the observed
    // window -> "No Recovery", not a low-but-valid score.
    {
        HuntSimulation sim(registry.instantiateSpecies("prototype_deer"));
        const ProjectileSpec& weak = registry.ammunition("22lr_solid");
        sim.fire("gait_column_rear_left", weak, {60.0, 90.0, 1.8, true});
        sim.runFor(90.0);

        TrophyScoreInput in;
        in.shotsFired = sim.shotsFired();
        in.timeToIncapacitationSeconds = sim.timeToIncapacitationSeconds();
        auto score = computeTrophyScore(sim.creature(), in);

        std::cout << "Case3 underpowered round, no recovery: overall=" << score.overall
                  << " tier=" << score.tier << "\n";
        assert(!score.recovered);
        assert(score.tier == "No Recovery");
    }

    std::cout << "\nAll trophy scoring tests passed.\n";
    return 0;
}
