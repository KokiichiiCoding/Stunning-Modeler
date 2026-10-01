#include "engine/game/IncidentReport.hpp"

#include <filesystem>
#include <fstream>
#include <iomanip>

namespace tp {

namespace {

std::string escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += c;
                }
        }
    }
    return out;
}

} // namespace

void writeIncidentReportJson(const HuntResult& result, const Contract& contract,
                             std::ostream& out) {
    out << std::fixed << std::setprecision(2);
    out << "{\n";
    out << "  \"contract\": {\n";
    out << "    \"id\": \"" << escape(contract.id) << "\",\n";
    out << "    \"title\": \"" << escape(contract.title) << "\",\n";
    out << "    \"type\": \"" << toString(contract.type) << "\",\n";
    out << "    \"species\": \"" << escape(contract.speciesId) << "\",\n";
    out << "    \"world_seed\": " << contract.worldSeed << ",\n";
    out << "    \"animal_seed\": " << result.animal.seed << ",\n";
    out << "    \"min_trophy_quality\": " << contract.minTrophyQuality << ",\n";
    out << "    \"max_shots\": " << contract.maxShots << ",\n";
    out << "    \"time_limit_s\": " << contract.timeLimitS << "\n";
    out << "  },\n";

    out << "  \"animal\": {\n";
    out << "    \"individual_id\": \"" << escape(result.animal.individualId) << "\",\n";
    out << "    \"age_class\": \"" << toString(result.animal.ageClass) << "\",\n";
    out << "    \"sex\": \"" << toString(result.animal.sex) << "\",\n";
    out << "    \"body_mass_kg\": " << result.animal.bodyMassKg << ",\n";
    out << "    \"trophy_size_01\": " << result.animal.trophySize01 << ",\n";
    out << "    \"trophy_symmetry_01\": " << result.animal.trophySymmetry01 << ",\n";
    out << "    \"temperament\": \"" << toString(result.animal.temperament) << "\",\n";
    out << "    \"rare_trait\": " << (result.animal.rareTrait ? "true" : "false") << ",\n";
    out << "    \"rare_trait_name\": \"" << escape(result.animal.rareTraitName) << "\",\n";
    out << "    \"biological_quality\": " << result.animal.biologicalQualityPercent << "\n";
    out << "  },\n";

    out << "  \"shots\": [\n";
    for (std::size_t i = 0; i < result.shots.size(); ++i) {
        const HuntShotRecord& s = result.shots[i];
        out << "    {\"time_s\": " << s.timeS << ", \"distance_m\": " << s.distanceM
            << ", \"body_part\": \"" << escape(s.bodyPartId) << "\""
            << ", \"projectile\": \"" << escape(s.projectileId) << "\""
            << ", \"impact_energy_j\": " << s.impactEnergyJ
            << ", \"bleed_ml_per_s\": " << s.bleedRateMlPerSec
            << ", \"exit_wound\": " << (s.exitWound ? "true" : "false") << "}"
            << (i + 1 < result.shots.size() ? "," : "") << "\n";
    }
    out << "  ],\n";

    out << "  \"outcome\": {\n";
    out << "    \"success\": " << (result.success ? "true" : "false") << ",\n";
    out << "    \"failure_reason\": \"" << escape(result.failureReason) << "\",\n";
    out << "    \"final_phase\": \"" << toString(result.finalPhase) << "\",\n";
    out << "    \"shots_fired\": " << result.shotsFired << ",\n";
    out << "    \"first_shot_distance_m\": " << result.firstShotDistanceM << ",\n";
    out << "    \"time_to_incapacitation_s\": " << result.timeToIncapacitationS << ",\n";
    out << "    \"recovery_distance_m\": " << result.recoveryDistanceM << ",\n";
    out << "    \"animal_recovered\": " << (result.animalRecovered ? "true" : "false")
        << ",\n";
    out << "    \"observed_only\": " << (result.observedOnly ? "true" : "false") << ",\n";
    out << "    \"total_time_s\": " << result.totalTimeS << "\n";
    out << "  },\n";

    out << "  \"trophy_score\": {\n";
    out << "    \"biological_quality\": " << result.trophyScore.biologicalQuality << ",\n";
    out << "    \"shot_quality\": " << result.trophyScore.shotQuality << ",\n";
    out << "    \"trophy_integrity\": " << result.trophyScore.trophyIntegrity << ",\n";
    out << "    \"recovery_quality\": " << result.trophyScore.recoveryQuality << ",\n";
    out << "    \"overall\": " << result.trophyScore.overall << ",\n";
    out << "    \"tier\": \"" << escape(result.trophyScore.tier) << "\"\n";
    out << "  },\n";

    out << "  \"transcript\": [\n";
    for (std::size_t i = 0; i < result.transcript.size(); ++i) {
        const HuntEvent& e = result.transcript[i];
        out << "    {\"time_s\": " << e.timeS << ", \"event\": \"" << escape(e.text)
            << "\"}" << (i + 1 < result.transcript.size() ? "," : "") << "\n";
    }
    out << "  ]\n";
    out << "}\n";
}

bool saveIncidentReport(const HuntResult& result, const Contract& contract,
                        const std::string& path) {
    std::error_code ec;
    const std::filesystem::path p(path);
    if (p.has_parent_path()) {
        std::filesystem::create_directories(p.parent_path(), ec);
    }
    std::ofstream out(path);
    if (!out) return false;
    writeIncidentReportJson(result, contract, out);
    return static_cast<bool>(out);
}

} // namespace tp
