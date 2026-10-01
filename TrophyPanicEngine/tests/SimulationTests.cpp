#include "engine/sim/HuntSimulation.hpp"

#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>

namespace {

int failures = 0;

void check(bool condition, const std::string& message) {
    if (!condition) {
        ++failures;
        std::cerr << "[FAIL] " << message << '\n';
    } else {
        std::cout << "[PASS] " << message << '\n';
    }
}

tp::ProjectileSpec rifle308() {
    return {
        ".308 Soft Point",
        tp::ProjectileKind::ExpandingBullet,
        0.0097,
        840.0,
        150.0,
        0.45,
        2.0,
        1.0
    };
}

tp::ProjectileSpec throwingBoot() {
    return {
        "Throwing Boot",
        tp::ProjectileKind::BluntObject,
        0.8,
        15.0,
        20.0,
        0.01,
        2.5,
        1.0
    };
}

} // namespace

int main() {
    using namespace tp;

    {
        const auto rifle = rifle308();
        const double muzzle = kineticEnergyJ(
            rifle.massKg, rifle.muzzleVelocityMps);
        const double at150 = kineticEnergyJ(
            rifle.massKg, velocityAtDistance(rifle, 150.0));

        check(std::abs(at150 / muzzle - 0.5) < 0.001,
              "Energy halves at the configured half-distance.");
    }

    {
        HuntSimulation sim(makePrototypeDeer());
        const auto hit = sim.fire(
            "primary_thorax_left",
            rifle308(),
            {150.0, 90.0, 1.0, false});

        check(hit.validBodyPart, "A named body part can be hit.");
        check(hit.wound.bleedRateMlPerSec > 5.0,
              "A penetrating lung shot creates meaningful bleeding.");

        sim.runFor(300.0);
        check(sim.creature().life != LifeState::Active,
              "An untreated major lung wound eventually incapacitates the animal.");
    }

    {
        HuntSimulation sim(makePrototypeDeer());
        const auto hit = sim.fire(
            "gait_column_front_left",
            rifle308(),
            {30.0, 90.0, 1.8, true});

        check(hit.wound.boneDamage > 0.0,
              "A dense-bone strike calculates structural damage.");

        stepPhysiology(sim.creature(), 0.1);
        check(sim.creature().mobility == MobilityState::Limping,
              "Failure of one load-bearing limb causes a limp.");
    }

    {
        HuntSimulation sim(makePrototypeDeer());
        const auto hit = sim.fire(
            "primary_thorax_left",
            throwingBoot(),
            {10.0, 90.0, 1.0, false});

        check(!hit.impact.penetrates,
              "A throwing boot does not penetrate a thorax.");
        check(hit.wound.painShock > 0.0,
              "A throwing boot still creates blunt pain shock.");
    }

    {
        HuntSimulation sim(makePrototypeDeer());
        const auto hit = sim.fire(
            "not_a_real_part",
            rifle308(),
            {50.0, 90.0, 1.0, false});

        check(!hit.validBodyPart,
              "Invalid anatomy identifiers fail safely.");
    }

    if (failures != 0) {
        std::cerr << failures << " test(s) failed.\n";
        return EXIT_FAILURE;
    }

    std::cout << "All tests passed.\n";
    return EXIT_SUCCESS;
}
