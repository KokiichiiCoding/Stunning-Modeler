#include "engine/biology/Creature.hpp"
#include "engine/ballistics/Ballistics.hpp"
#include <iostream>
#include <iomanip>

using namespace tp;

int main() {
    ProjectileSpec rifle;
    rifle.name = ".30-06 Soft Point";
    rifle.massKg = 0.0108;
    rifle.muzzleVelocityMps = 850.0;
    rifle.basePenetrationM = 0.45;
    rifle.expansionFactor = 1.9;

    CreatureState deer = makePrototypeDeer();

    ImpactInput input;
    input.distanceM = 60.0;
    input.incidenceAngleDeg = 90.0;
    input.tissueResistance = 1.0;

    auto res = applyImpact(deer, "core_pump_cavity", rifle, input);
    std::cout << "Heart hit -> penetrates=" << res.impact.penetrates
              << " transferredEnergyJ=" << res.impact.transferredEnergyJ
              << " cardiacTimer=" << deer.cardiacEventTimerS << "\n\n";

    std::cout << std::fixed << std::setprecision(2);
    for (int t = 0; t <= 8; ++t) {
        stepPhysiology(deer, 1.0);
        std::cout << "t=" << t+1 << "s  consciousness=" << deer.consciousness
                  << "  mobility=" << toString(deer.mobility)
                  << "  life=" << toString(deer.life) << "\n";
        if (deer.life == LifeState::Down || deer.life == LifeState::Dead) break;
    }
    return 0;
}
