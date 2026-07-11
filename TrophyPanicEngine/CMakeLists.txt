cmake_minimum_required(VERSION 3.20)
project(TrophyPanicEngine VERSION 0.3.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# The headless simulation library and its CLI tools always build and must
# never acquire graphics dependencies. Optional subsystems hang off these
# switches so a missing SDL/OpenGL toolchain can't break the simulation.
option(TP_BUILD_TESTS "Build the headless regression test suite" ON)
option(TP_BUILD_VIEWER "Build the interactive debug viewer (needs SDL2/OpenGL)" OFF)
option(TP_ENABLE_STRICT_WARNINGS "Compile the engine with a high warning level" ON)

add_library(tp_engine
    src/engine/ballistics/Ballistics.cpp
    src/engine/biology/Creature.cpp
    src/engine/ecology/AnimalGenerator.cpp
    src/engine/sim/HuntSimulation.cpp
    src/engine/sim/ScenarioRunner.cpp
    src/engine/io/Json.cpp
    src/engine/io/GameData.cpp
    src/engine/io/ScenarioLoader.cpp
    src/engine/scoring/TrophyScore.cpp
    src/engine/world/Terrain.cpp
    src/engine/world/Wind.cpp
    src/engine/world/Evidence.cpp
    src/engine/world/Scent.cpp
    src/engine/world/SoundEvents.cpp
)

target_include_directories(tp_engine PUBLIC src)

if(TP_ENABLE_STRICT_WARNINGS)
    if(MSVC)
        target_compile_options(tp_engine PRIVATE /W4 /permissive-)
    else()
        target_compile_options(tp_engine PRIVATE -Wall -Wextra -Wpedantic)
    endif()
endif()

add_executable(tp_demo src/main.cpp)
target_link_libraries(tp_demo PRIVATE tp_engine)

add_executable(tp_scenario src/scenario_runner.cpp)
target_link_libraries(tp_scenario PRIVATE tp_engine)

if(TP_BUILD_TESTS)
    enable_testing()

    # Every test that touches data/ files needs to run with the project root as
    # its working directory, regardless of where the build/ directory lives.
    function(tp_add_test name source)
        add_executable(${name} ${source})
        target_link_libraries(${name} PRIVATE tp_engine)
        add_test(NAME ${name} COMMAND ${name}
                 WORKING_DIRECTORY ${CMAKE_SOURCE_DIR})
    endfunction()

    tp_add_test(tp_tests tests/SimulationTests.cpp)
    tp_add_test(tp_json_smoke tests/json_smoke_test.cpp)
    tp_add_test(tp_layered_ballistics_smoke tests/layered_ballistics_smoke_test.cpp)
    tp_add_test(tp_gamedata_e2e tests/gamedata_e2e_test.cpp)
    tp_add_test(tp_trophy_score tests/trophy_score_test.cpp)
    tp_add_test(tp_golden_scenarios tests/GoldenScenarioTests.cpp)
    tp_add_test(tp_animal_generation tests/animal_generation_test.cpp)
    tp_add_test(tp_world tests/world_test.cpp)
    # Note: tests/heart_shot_check.cpp is a print-only diagnostic scratch file
    # (no assertions, always exits 0) used while developing the cardiac-timer
    # fast-path. It's kept in the repo for manual inspection but intentionally
    # NOT registered as a ctest, since GoldenScenarioTests.cpp's
    # "consciousness stayed pinned at 0 after Down" check already covers this
    # behavior with real pass/fail assertions.
endif()

if(TP_BUILD_VIEWER)
    add_subdirectory(viewer)
endif()
