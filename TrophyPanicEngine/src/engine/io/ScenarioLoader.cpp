#include "engine/io/ScenarioLoader.hpp"
#include "engine/io/Json.hpp"

#include <fstream>
#include <sstream>

namespace tp {

namespace {

std::string readFileOrThrow(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) {
        throw GameDataError("Could not open scenario file: " + path);
    }
    std::ostringstream contents;
    contents << file.rdbuf();
    return contents.str();
}

ScenarioShot parseShot(const json::Value& shotJson) {
    ScenarioShot shot;
    shot.ammunitionId = shotJson["ammunition"].asString();
    shot.bodyPartId = shotJson["body_part"].asString();
    shot.distanceM = shotJson.numberOr("distance_m", 50.0);
    shot.incidenceAngleDeg = shotJson.numberOr("angle_deg", 90.0);
    shot.tissueResistance = shotJson.numberOr("tissue_resistance", 1.0);
    shot.denseBoneOverride = shotJson.boolOr("dense_bone", false);
    shot.fireAtSeconds = shotJson.numberOr("fire_at_seconds", 0.0);
    return shot;
}

} // namespace

Scenario loadScenarioFromFile(const std::string& path) {
    const std::string text = readFileOrThrow(path);

    json::Value root;
    try {
        root = json::Value::parse(text);
    } catch (const json::JsonError& e) {
        throw GameDataError("JSON parse error in scenario '" + path + "': " + e.what());
    }

    try {
        Scenario scenario;
        scenario.title = root.stringOr("title", path);
        scenario.speciesId = root["species"].asString();
        scenario.runDurationSeconds = root.numberOr("run_duration_seconds", 120.0);
        scenario.biologicalQualityPercent =
            root.numberOr("biological_quality_percent", 100.0);

        for (const auto& shotJson : root["shots"].asArray()) {
            scenario.shots.push_back(parseShot(shotJson));
        }

        if (scenario.shots.empty()) {
            throw GameDataError("Scenario '" + path + "' defines zero shots");
        }

        return scenario;
    } catch (const json::JsonError& e) {
        throw GameDataError("Malformed scenario file '" + path + "': " + e.what());
    }
}

} // namespace tp
