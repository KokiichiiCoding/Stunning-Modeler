#include "engine/ballistics/Ballistics.hpp"
#include "engine/core/Rng.hpp"
#include <iostream>
#include <cassert>
#include <vector>

using namespace tp;

int main() {
    // A .308-ish round, and a chest cavity modeled as skin -> muscle -> rib -> lung.
    ProjectileSpec rifle;
    rifle.name = ".308";
    rifle.massKg = 0.0097;
    rifle.muzzleVelocityMps = 840.0;
    rifle.basePenetrationM = 0.45;
    rifle.expansionFactor = 2.0;

    std::vector<TissueLayer> chest = {
        {"skin", 0.3, 0.4, false},
        {"muscle", 3.0, 1.0, false},
        {"rib_bone", 1.0, 4.0, false},
        {"lung", 15.0, 0.7, true},
    };

    // Case 1: solid broadside hit at moderate range should reach the lung.
    {
        ImpactInput in{80.0, 90.0, 1.0, false};
        auto res = resolveLayeredImpact(rifle, in, chest);
        std::cout << "Case1 (broadside 80m): reachedOrgan=" << res.reachedOrganLayer
                  << " exit=" << res.exitWound
                  << " penetrationCm=" << res.penetrationAchievedCm
                  << " capacityCm=" << res.totalCapacityCm << "\n";
        assert(res.reachedOrganLayer && "A solid .308 hit at 80m should reach the lung layer");
    }

    // Case 2: a very weak round (like a .22LR-ish spec) should plausibly stop
    // before or within the rib layer and never reach the lung.
    {
        ProjectileSpec weak;
        weak.name = ".22LR";
        weak.massKg = 0.0025;
        weak.muzzleVelocityMps = 320.0;
        weak.basePenetrationM = 0.08;
        weak.expansionFactor = 1.0;

        ImpactInput in{40.0, 90.0, 1.0, false};
        auto res = resolveLayeredImpact(weak, in, chest);
        std::cout << "Case2 (.22LR at 40m): reachedOrgan=" << res.reachedOrganLayer
                  << " penetrationCm=" << res.penetrationAchievedCm << "\n";
        assert(!res.reachedOrganLayer && "An underpowered round should not reach the lung through a rib");
    }

    // Case 3: point-blank heavy slug should blow through and exit.
    {
        ProjectileSpec slug;
        slug.name = "12ga slug";
        slug.massKg = 0.028;
        slug.muzzleVelocityMps = 460.0;
        slug.basePenetrationM = 0.9;
        slug.expansionFactor = 2.2;

        ImpactInput in{5.0, 90.0, 1.0, false};
        auto res = resolveLayeredImpact(slug, in, chest);
        std::cout << "Case3 (12ga slug point-blank): reachedOrgan=" << res.reachedOrganLayer
                  << " exit=" << res.exitWound
                  << " exitEnergyJ=" << res.exitEnergyJ << "\n";
        assert(res.reachedOrganLayer && res.exitWound &&
               "A heavy slug at point-blank range should blow through and exit");
    }

    // Case 4: RNG-based fragmentation is reproducible given the same seed,
    // and differs (with overwhelming likelihood) across different seeds.
    {
        ProjectileSpec rifle2 = rifle;
        ImpactInput boneHit{20.0, 90.0, 1.8, true};

        Rng rngA(12345);
        Rng rngB(12345);
        Rng rngC(999);

        int fragA = 0, fragB = 0, fragC = 0;
        for (int i = 0; i < 50; ++i) {
            if (resolveImpact(rifle2, boneHit, rngA).fragments) ++fragA;
            if (resolveImpact(rifle2, boneHit, rngB).fragments) ++fragB;
            if (resolveImpact(rifle2, boneHit, rngC).fragments) ++fragC;
        }
        std::cout << "Case4 fragmentation counts over 50 rolls: seedA=" << fragA
                  << " seedA_repeat=" << fragB << " seedC=" << fragC << "\n";
        assert(fragA == fragB && "Same seed must produce identical fragmentation sequence");
    }

    std::cout << "\nAll layered-ballistics and RNG smoke tests passed.\n";
    return 0;
}
