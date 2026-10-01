# Optional interactive debug viewer. Only built with -DTP_BUILD_VIEWER=ON.
# Dependencies are deliberately minimal and system-provided: SDL2 (window,
# input, GL context) and OpenGL (fixed-function is enough for a low-poly
# debug scene). Dear ImGui integration is planned but not vendored yet —
# the network-restricted dev environment could not fetch it; the debug UI
# is keyboard toggles + stdout until then. A missing SDL2 must never break
# the headless build: this directory is simply not added.

find_package(SDL2 REQUIRED)
find_package(OpenGL REQUIRED)

add_executable(tp_viewer main.cpp)
target_link_libraries(tp_viewer PRIVATE tp_engine OpenGL::GL)

if(TARGET SDL2::SDL2)
    target_link_libraries(tp_viewer PRIVATE SDL2::SDL2)
else()
    target_include_directories(tp_viewer PRIVATE ${SDL2_INCLUDE_DIRS})
    target_link_libraries(tp_viewer PRIVATE ${SDL2_LIBRARIES})
endif()

if(NOT MSVC)
    target_compile_options(tp_viewer PRIVATE -Wall -Wextra)
endif()
