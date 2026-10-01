#include "engine/io/Json.hpp"
#include <cassert>
#include <iostream>

int main() {
    using namespace tp::json;

    const std::string sample = R"JSON(
    {
      "id": "test_species",
      "max_blood_volume_ml": 5000.5,
      "aggressive": false,
      "body_parts": [
        {"id": "leg", "bone_integrity": 40.0, "load_bearing": true},
        {"id": "lung", "tissue": "lung"}
      ],
      "nested": {"a": {"b": [1, 2, 3.5, -4]}}
    }
    )JSON";

    Value v = Value::parse(sample);
    assert(v.isObject());
    assert(v["id"].asString() == "test_species");
    assert(v["max_blood_volume_ml"].asNumber() == 5000.5);
    assert(v["aggressive"].asBool() == false);
    assert(v["body_parts"].asArray().size() == 2);
    assert(v["body_parts"].asArray()[0]["id"].asString() == "leg");
    assert(v["body_parts"].asArray()[0].boolOr("load_bearing", false) == true);
    assert(v["body_parts"].asArray()[1].stringOr("tissue", "") == "lung");
    assert(v["nested"]["a"]["b"].asArray().size() == 4);
    assert(v["nested"]["a"]["b"].asArray()[3].asNumber() == -4);
    assert(v.numberOr("missing_key", 42.0) == 42.0);

    bool threw = false;
    try {
        (void)v["does_not_exist"];
    } catch (const JsonError& e) {
        threw = true;
        std::cout << "Correctly threw: " << e.what() << "\n";
    }
    assert(threw);

    std::cout << "All JSON parser smoke tests passed.\n";
    return 0;
}
