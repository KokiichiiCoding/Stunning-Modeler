#include "engine/ecology/AnimalGenerator.hpp"

#include <algorithm>

namespace tp {

namespace {

// Older animals carry more mass and bigger trophies; "Old" is slightly past
// prime. Used both for mass correlation and biological quality.
double ageFactorFor(AgeClass age) {
    switch (age) {
        case AgeClass::Juvenile: return 0.10;
        case AgeClass::Young:    return 0.45;
        case AgeClass::Mature:   return 0.95;
        case AgeClass::Old:      return 0.80;
    }
    return 0.5;
}

AgeClass drawAgeClass(Rng& rng) {
    const double r = rng.uniform01();
    if (r < 0.20) return AgeClass::Juvenile;
    if (r < 0.50) return AgeClass::Young;
    if (r < 0.85) return AgeClass::Mature;
    return AgeClass::Old;
}

Temperament drawTemperament(Rng& rng) {
    const double r = rng.uniform01();
    if (r < 0.20) return Temperament::Timid;
    if (r < 0.45) return Temperament::Nervous;
    if (r < 0.75) return Temperament::Steady;
    if (r < 0.92) return Temperament::Bold;
    return Temperament::Ornery;
}

const char* rareTraitNameFor(double roll) {
    if (roll < 0.34) return "Piebald";
    if (roll < 0.67) return "Melanistic";
    return "Ghost Gray";
}

} // namespace

const char* toString(AgeClass a) {
    switch (a) {
        case AgeClass::Juvenile: return "Juvenile";
        case AgeClass::Young:    return "Young";
        case AgeClass::Mature:   return "Mature";
        case AgeClass::Old:      return "Old";
    }
    return "Unknown";
}

const char* toString(Sex s) {
    switch (s) {
        case Sex::Female: return "Female";
        case Sex::Male:   return "Male";
    }
    return "Unknown";
}

const char* toString(Temperament t) {
    switch (t) {
        case Temperament::Timid:   return "Timid";
        case Temperament::Nervous: return "Nervous";
        case Temperament::Steady:  return "Steady";
        case Temperament::Bold:    return "Bold";
        case Temperament::Ornery:  return "Ornery";
    }
    return "Unknown";
}

GeneratedAnimal generateAnimal(const SpeciesProfile& profile, std::uint64_t seed) {
    // IMPORTANT: the sequence of rng draws below is a compatibility
    // contract. Replays and incident reports reference animals by
    // (species, seed) only, so inserting/reordering a draw silently changes
    // every animal ever recorded. Add new draws at the END only.
    Rng rng(seed);

    GeneratedAnimal a;
    a.speciesId = profile.id;
    a.seed = seed;
    a.individualId = profile.id + "#" + std::to_string(seed);

    a.sex = rng.uniform01() < 0.5 ? Sex::Female : Sex::Male;
    a.ageClass = drawAgeClass(rng);
    const double age = ageFactorFor(a.ageClass);

    const double massRoll = rng.uniform01();
    const double massT = std::clamp(age * 0.6 + massRoll * 0.4, 0.0, 1.0);
    a.bodyMassKg =
        profile.bodyMassKgMin + (profile.bodyMassKgMax - profile.bodyMassKgMin) * massT;

    const double trophyRoll = rng.uniform01();
    a.trophySize01 = std::clamp(trophyRoll * (0.3 + 0.7 * age), 0.0, 1.0);
    if (a.sex == Sex::Female) {
        // General rule for the prototype roster: female headgear/tusks run
        // smaller. Species-specific dimorphism can move into data later.
        a.trophySize01 *= 0.6;
    }

    a.trophySymmetry01 = 0.55 + rng.uniform01() * 0.45;
    a.coatVariation01 = rng.uniform01();
    a.healthCondition01 = 0.4 + rng.uniform01() * 0.6;
    a.temperament = drawTemperament(rng);

    double alertness = 0.2 + rng.uniform01() * 0.6;
    if (a.temperament == Temperament::Timid) alertness += 0.15;
    if (a.temperament == Temperament::Bold || a.temperament == Temperament::Ornery) {
        alertness -= 0.10;
    }
    a.alertnessBaseline01 = std::clamp(alertness, 0.0, 1.0);

    const double rareRoll = rng.uniform01();
    a.rareTrait = rareRoll < 0.03;
    if (a.rareTrait) {
        // Re-derive the trait from the same roll so no extra draw is spent.
        a.rareTraitName = rareTraitNameFor(rareRoll / 0.03);
    }

    a.maxStaminaS = profile.maxStaminaS * (0.8 + 0.4 * a.healthCondition01);

    const double quality01 = std::clamp(
        a.trophySize01 * 0.45 +
        a.trophySymmetry01 * 0.15 +
        age * 0.25 +
        a.healthCondition01 * 0.15,
        0.0, 1.0);
    double quality = profile.trophyScoreMin +
                     (profile.trophyScoreMax - profile.trophyScoreMin) * quality01;
    if (a.rareTrait) {
        quality += 5.0;
    }
    a.biologicalQualityPercent = std::clamp(quality, 0.0, 100.0);

    return a;
}

CreatureState instantiateGeneratedAnimal(
    const GameDataRegistry& registry, const GeneratedAnimal& animal) {
    CreatureState creature = registry.instantiateSpecies(animal.speciesId);

    const SpeciesProfile& profile = registry.speciesProfile(animal.speciesId);
    const double midMassKg = 0.5 * (profile.bodyMassKgMin + profile.bodyMassKgMax);
    if (midMassKg > 0.0) {
        // Blood volume scales linearly with body mass, so a big old bull
        // genuinely takes longer to bleed down than a juvenile — the
        // individual matters physiologically, not just cosmetically.
        const double factor = animal.bodyMassKg / midMassKg;
        creature.maxBloodVolumeMl *= factor;
        creature.bloodVolumeMl = creature.maxBloodVolumeMl;
    }

    return creature;
}

} // namespace tp
