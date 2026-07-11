#include "engine/sim/HuntSimulation.hpp"

#include <iomanip>
#include <iostream>

int main() {
    using namespace tp;

    const ProjectileSpec rifle308{
        ".308 Soft Point",
        ProjectileKind::ExpandingBullet,
        0.0097,
        840.0,
        150.0,
        0.45,
        2.0,
        1.0
    };

    HuntSimulation simulation(makePrototypeDeer());

    const ImpactInput impact{
        150.0, // range
        90.0,  // broadside
        1.0,   // soft tissue
        false
    };

    const HitResolution hit = simulation.fire(
        "primary_thorax_left",
        rifle308,
        impact);

    if (!hit.validBodyPart) {
        std::cerr << "Invalid body part.\n";
        return 1;
    }

    std::cout << "TROPHY PANIC HEADLESS BALLISTICS DEMO\n\n";
    std::cout << "Projectile: " << rifle308.name << '\n';
    std::cout << "Target: " << simulation.creature().species << '\n';
    std::cout << "Body part: primary_thorax_left\n";
    std::cout << std::fixed << std::setprecision(2);
    std::cout << "Impact energy: " << hit.impact.impactEnergyJ << " J\n";
    std::cout << "Penetration: " << hit.impact.penetrationM * 100.0 << " cm\n";
    std::cout << "Permanent cavity: "
              << hit.wound.permanentCavityCm3 << " cm^3\n";
    std::cout << "Bleed rate: "
              << hit.wound.bleedRateMlPerSec << " ml/s\n\n";

    simulation.runFor(300.0);

    std::cout << "TIME  BLOOD LOST  CONSCIOUS  BLEED    MOBILITY   LIFE\n";
    for (const auto& sample : simulation.telemetry()) {
        // Print every 5 seconds plus final incapacitation/death events.
        const int rounded = static_cast<int>(sample.timeSeconds + 0.5);
        if (rounded % 5 != 0 &&
            sample.life == LifeState::Active) {
            continue;
        }

        std::cout << std::setw(4) << rounded << "s  "
                  << std::setw(8) << sample.bloodLostPercent << "%  "
                  << std::setw(8) << sample.consciousness << "%  "
                  << std::setw(7) << sample.bleedRateMlPerSec << "  "
                  << std::setw(9) << toString(sample.mobility) << "  "
                  << toString(sample.life) << '\n';
    }

    return 0;
}
