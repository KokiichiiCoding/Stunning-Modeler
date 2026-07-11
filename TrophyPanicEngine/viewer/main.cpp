// tp_viewer: interactive/spectator debug viewer for the Trophy Panic hunt
// loop. Renders the procedural terrain, the animal, the hunter, and the
// simulation's evidence/scent/sound state with a low-poly fixed-function
// OpenGL scene. The simulation is the same HuntLoopSim the headless tests
// run — the viewer only *displays* facts, it never decides them.
//
// Usage:
//   tp_viewer [contract.json] [--player] [--seed N] [--timescale X]
//             [--frames N] [--screenshot out.ppm]
//
// Modes:
//   default   spectate the autonomous bot hunter (free camera)
//   --player  drive the hunter yourself (third-person follow camera)
//
// Controls are printed at startup (see printControls()).

#include "engine/game/HuntLoop.hpp"
#include "engine/game/IncidentReport.hpp"

#include <SDL.h>
#include <SDL_opengl.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <numbers>
#include <string>
#include <vector>

namespace fs = std::filesystem;
using namespace tp;

namespace {

// ---------------------------------------------------------------- helpers

struct Color { float r, g, b; };

Color zoneColor(ZoneType zone) {
    switch (zone) {
        case ZoneType::Camp:       return {0.55f, 0.42f, 0.30f};
        case ZoneType::Forest:     return {0.18f, 0.34f, 0.16f};
        case ZoneType::Meadow:     return {0.42f, 0.58f, 0.25f};
        case ZoneType::Creek:      return {0.20f, 0.38f, 0.62f};
        case ZoneType::RockySlope: return {0.48f, 0.46f, 0.44f};
        case ZoneType::DenseCover: return {0.10f, 0.24f, 0.10f};
        case ZoneType::Extraction: return {0.65f, 0.60f, 0.20f};
    }
    return {1, 0, 1};
}

double cellHash(std::uint64_t seed, int x, int y) {
    std::uint64_t h = seed ^ (static_cast<std::uint64_t>(x) * 0x9E3779B97F4A7C15ull) ^
                      (static_cast<std::uint64_t>(y) * 0xC2B2AE3D27D4EB4Full);
    h ^= h >> 30; h *= 0xBF58476D1CE4E5B9ull; h ^= h >> 27;
    return static_cast<double>(h >> 11) / 9007199254740992.0;
}

void drawBox(double cx, double cy, double cz, double sx, double sy, double sz) {
    const double x0 = cx - sx / 2, x1 = cx + sx / 2;
    const double y0 = cy - sy / 2, y1 = cy + sy / 2;
    const double z0 = cz - sz / 2, z1 = cz + sz / 2;
    glBegin(GL_QUADS);
    // top / bottom
    glVertex3d(x0, y0, z1); glVertex3d(x1, y0, z1); glVertex3d(x1, y1, z1); glVertex3d(x0, y1, z1);
    glVertex3d(x0, y0, z0); glVertex3d(x0, y1, z0); glVertex3d(x1, y1, z0); glVertex3d(x1, y0, z0);
    // sides
    glVertex3d(x0, y0, z0); glVertex3d(x1, y0, z0); glVertex3d(x1, y0, z1); glVertex3d(x0, y0, z1);
    glVertex3d(x1, y1, z0); glVertex3d(x0, y1, z0); glVertex3d(x0, y1, z1); glVertex3d(x1, y1, z1);
    glVertex3d(x0, y1, z0); glVertex3d(x0, y0, z0); glVertex3d(x0, y0, z1); glVertex3d(x0, y1, z1);
    glVertex3d(x1, y0, z0); glVertex3d(x1, y1, z0); glVertex3d(x1, y1, z1); glVertex3d(x1, y0, z1);
    glEnd();
}

void perspective(double fovYDeg, double aspect, double zNear, double zFar) {
    const double fh = std::tan(fovYDeg * std::numbers::pi / 360.0) * zNear;
    const double fw = fh * aspect;
    glFrustum(-fw, fw, -fh, fh, zNear, zFar);
}

// Column-major "lookAt" without GLU.
void lookAt(double ex, double ey, double ez, double tx, double ty, double tz) {
    double fx = tx - ex, fy = ty - ey, fz = tz - ez;
    const double fl = std::sqrt(fx * fx + fy * fy + fz * fz);
    fx /= fl; fy /= fl; fz /= fl;
    // up = +z (world up)
    double sx = fy * 1.0 - fz * 0.0, sy = fz * 0.0 - fx * 1.0, sz = fx * 0.0 - fy * 0.0;
    const double sl = std::sqrt(sx * sx + sy * sy + sz * sz);
    if (sl < 1e-9) { sx = 1; sy = 0; sz = 0; } else { sx /= sl; sy /= sl; sz /= sl; }
    const double ux = sy * fz - sz * fy;
    const double uy = sz * fx - sx * fz;
    const double uz = sx * fy - sy * fx;
    const double m[16] = {sx, ux, -fx, 0, sy, uy, -fy, 0, sz, uz, -fz, 0, 0, 0, 0, 1};
    glMultMatrixd(m);
    glTranslated(-ex, -ey, -ez);
}

void printControls(bool playerMode) {
    std::puts("--- tp_viewer controls -------------------------------------");
    if (playerMode) {
        std::puts("  WASD        move hunter    LShift  sprint");
        std::puts("  C           crouch toggle  X       prone toggle");
        std::puts("  F           fire at visible animal (aim-assisted)");
        std::puts("  E           claim downed animal within 4 m");
    } else {
        std::puts("  WASD + RF   free camera    arrows  orbit    T  re-follow hunter");
    }
    std::puts("  SPACE pause | N single-step | -/= time scale | ESC quit");
    std::puts("  overlays: 1 tracks  2 blood  3 scent  4 wind  5 vision cone");
    std::puts("            6 AI debug to stdout  7 shot traces  F12 screenshot");
    std::puts("------------------------------------------------------------");
}

void writeScreenshotPpm(const std::string& path, int w, int h) {
    std::vector<unsigned char> pixels(static_cast<std::size_t>(w) * h * 3);
    glReadPixels(0, 0, w, h, GL_RGB, GL_UNSIGNED_BYTE, pixels.data());
    std::ofstream out(path, std::ios::binary);
    out << "P6\n" << w << " " << h << "\n255\n";
    for (int y = h - 1; y >= 0; --y) { // GL rows are bottom-up
        out.write(reinterpret_cast<const char*>(&pixels[static_cast<std::size_t>(y) * w * 3]),
                  static_cast<std::streamsize>(w) * 3);
    }
    std::printf("Screenshot written: %s (%dx%d)\n", path.c_str(), w, h);
}

GameDataRegistry loadAllData() {
    GameDataRegistry registry;
    for (const auto& entry : fs::directory_iterator("data/species")) {
        if (entry.path().extension() == ".json") {
            registry.loadSpeciesFile(entry.path().string());
        }
    }
    registry.loadAmmunitionFile("data/ammunition.json");
    registry.loadItemsFile("data/items.json");
    return registry;
}

} // namespace

int main(int argc, char** argv) {
    std::string contractPath = "data/contracts/clean_harvest_deer.json";
    bool playerMode = false;
    std::uint64_t seedOverride = 0;
    double timeScale = 1.0;
    long maxFrames = -1;
    std::string screenshotPath;

    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--player") playerMode = true;
        else if (arg == "--seed" && i + 1 < argc) seedOverride = std::strtoull(argv[++i], nullptr, 10);
        else if (arg == "--timescale" && i + 1 < argc) timeScale = std::atof(argv[++i]);
        else if (arg == "--frames" && i + 1 < argc) maxFrames = std::atol(argv[++i]);
        else if (arg == "--screenshot" && i + 1 < argc) screenshotPath = argv[++i];
        else if (arg[0] != '-') contractPath = arg;
    }

    GameDataRegistry registry;
    Contract contract;
    try {
        registry = loadAllData();
        contract = loadContractFromFile(contractPath, registry);
    } catch (const GameDataError& e) {
        std::fprintf(stderr, "Data error: %s\n", e.what());
        return 1;
    }

    auto makeSim = [&] {
        auto sim = std::make_unique<HuntLoopSim>(registry, contract, seedOverride);
        sim->setManualHunter(playerMode);
        return sim;
    };
    std::unique_ptr<HuntLoopSim> sim = makeSim();

    if (SDL_Init(SDL_INIT_VIDEO) != 0) {
        std::fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
        return 1;
    }
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);
    const int winW = 1280, winH = 720;
    SDL_Window* window = SDL_CreateWindow(
        "Trophy Panic — debug viewer", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
        winW, winH, SDL_WINDOW_OPENGL);
    if (!window) {
        std::fprintf(stderr, "SDL_CreateWindow failed: %s\n", SDL_GetError());
        SDL_Quit();
        return 1;
    }
    SDL_GLContext gl = SDL_GL_CreateContext(window);
    if (!gl) {
        std::fprintf(stderr, "SDL_GL_CreateContext failed: %s\n", SDL_GetError());
        SDL_DestroyWindow(window);
        SDL_Quit();
        return 1;
    }
    SDL_GL_SetSwapInterval(1);
    std::printf("GL renderer: %s\n", reinterpret_cast<const char*>(glGetString(GL_RENDERER)));
    printControls(playerMode);

    glEnable(GL_DEPTH_TEST);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    const TerrainGrid& terrain = sim->terrain();

    // Camera state (spectate mode).
    double camYaw = 0.8, camPitch = 0.7, camDist = 45.0;
    Vec3 camFocus = sim->hunterPos();
    bool followHunter = true; // spectate camera tracks the hunter until WASD

    bool paused = false;
    bool singleStep = false;
    bool showTracks = true, showBlood = true, showScent = false, showWind = true;
    bool showVision = false, aiDebug = false, showShots = true;
    double aiDebugAccum = 0.0;
    double statusAccum = 0.0;

    struct ShotTrace { Vec3 from, to; double bornS; };
    std::vector<ShotTrace> shotTraces;
    std::size_t knownShots = 0;

    bool running = true;
    long frame = 0;
    Uint32 prevTicks = SDL_GetTicks();

    while (running) {
        SDL_Event ev;
        while (SDL_PollEvent(&ev)) {
            if (ev.type == SDL_QUIT) running = false;
            if (ev.type == SDL_KEYDOWN) {
                switch (ev.key.keysym.sym) {
                    case SDLK_ESCAPE: running = false; break;
                    case SDLK_SPACE: paused = !paused; break;
                    case SDLK_n: singleStep = true; break;
                    case SDLK_MINUS: timeScale = std::max(0.25, timeScale * 0.5); break;
                    case SDLK_EQUALS: timeScale = std::min(16.0, timeScale * 2.0); break;
                    case SDLK_1: showTracks = !showTracks; break;
                    case SDLK_2: showBlood = !showBlood; break;
                    case SDLK_3: showScent = !showScent; break;
                    case SDLK_4: showWind = !showWind; break;
                    case SDLK_5: showVision = !showVision; break;
                    case SDLK_6: aiDebug = !aiDebug; break;
                    case SDLK_7: showShots = !showShots; break;
                    case SDLK_F12: writeScreenshotPpm("tp_viewer_screenshot.ppm", winW, winH); break;
                    case SDLK_r:
                        sim = makeSim();
                        shotTraces.clear();
                        knownShots = 0;
                        break;
                    default: break;
                }
            }
        }

        const Uint8* keys = SDL_GetKeyboardState(nullptr);
        const Uint32 nowTicks = SDL_GetTicks();
        double frameDt = (nowTicks - prevTicks) / 1000.0;
        prevTicks = nowTicks;
        frameDt = std::min(frameDt, 0.1);

        // --- Input -> either camera or hunter ---------------------------
        static Stance manualStance = Stance::Standing;
        if (playerMode) {
            HuntLoopSim::ManualInput input;
            // Camera-relative movement on the ground plane.
            const double cy = std::cos(camYaw), sy = std::sin(camYaw);
            Vec3 dir{};
            if (keys[SDL_SCANCODE_W]) { dir.x += cy; dir.y += sy; }
            if (keys[SDL_SCANCODE_S]) { dir.x -= cy; dir.y -= sy; }
            if (keys[SDL_SCANCODE_A]) { dir.x += -sy; dir.y += cy; }
            if (keys[SDL_SCANCODE_D]) { dir.x += sy; dir.y += -cy; }
            static bool prevC = false, prevX = false;
            const bool nowC = keys[SDL_SCANCODE_C], nowX = keys[SDL_SCANCODE_X];
            if (nowC && !prevC) {
                manualStance = manualStance == Stance::Crouched ? Stance::Standing
                                                                : Stance::Crouched;
            }
            if (nowX && !prevX) {
                manualStance = manualStance == Stance::Prone ? Stance::Standing
                                                             : Stance::Prone;
            }
            prevC = nowC; prevX = nowX;
            input.moveDir = dir;
            input.sprint = keys[SDL_SCANCODE_LSHIFT];
            input.stance = manualStance;
            input.fire = keys[SDL_SCANCODE_F];
            input.interact = keys[SDL_SCANCODE_E];
            sim->manualControl(input);
            if (keys[SDL_SCANCODE_LEFT]) camYaw += 1.5 * frameDt;
            if (keys[SDL_SCANCODE_RIGHT]) camYaw -= 1.5 * frameDt;
        } else {
            if (followHunter) camFocus = sim->hunterPos();
            const double camSpeed = 60.0 * frameDt;
            if (keys[SDL_SCANCODE_W] || keys[SDL_SCANCODE_A] ||
                keys[SDL_SCANCODE_S] || keys[SDL_SCANCODE_D]) followHunter = false;
            if (keys[SDL_SCANCODE_T]) followHunter = true;
            if (keys[SDL_SCANCODE_W]) {
                camFocus.x += std::cos(camYaw) * camSpeed;
                camFocus.y += std::sin(camYaw) * camSpeed;
            }
            if (keys[SDL_SCANCODE_S]) {
                camFocus.x -= std::cos(camYaw) * camSpeed;
                camFocus.y -= std::sin(camYaw) * camSpeed;
            }
            if (keys[SDL_SCANCODE_A]) {
                camFocus.x -= std::sin(camYaw) * camSpeed;
                camFocus.y += std::cos(camYaw) * camSpeed;
            }
            if (keys[SDL_SCANCODE_D]) {
                camFocus.x += std::sin(camYaw) * camSpeed;
                camFocus.y -= std::cos(camYaw) * camSpeed;
            }
            if (keys[SDL_SCANCODE_R]) camDist = std::max(15.0, camDist - 60.0 * frameDt);
            if (keys[SDL_SCANCODE_F]) camDist = std::min(500.0, camDist + 60.0 * frameDt);
            if (keys[SDL_SCANCODE_LEFT]) camYaw += 1.5 * frameDt;
            if (keys[SDL_SCANCODE_RIGHT]) camYaw -= 1.5 * frameDt;
            if (keys[SDL_SCANCODE_UP]) camPitch = std::min(1.5, camPitch + 1.0 * frameDt);
            if (keys[SDL_SCANCODE_DOWN]) camPitch = std::max(0.15, camPitch - 1.0 * frameDt);
        }

        // --- Fixed-step simulation (rendering never decides outcomes) ---
        static double simAccum = 0.0;
        const double tick = 1.0 / 60.0;
        if (!paused || singleStep) {
            simAccum += (singleStep ? tick : frameDt * timeScale);
            singleStep = false;
            int guard = 0;
            while (simAccum >= tick && !sim->finished() && guard++ < 600) {
                sim->step(tick);
                simAccum -= tick;
            }
        }

        // Record new shots as traces.
        while (knownShots < sim->result().shots.size()) {
            shotTraces.push_back({sim->hunterPos(), sim->animal().position(), sim->nowS()});
            ++knownShots;
        }

        // Periodic status to stdout (there is no in-window font yet).
        statusAccum += frameDt;
        if (statusAccum >= 1.0) {
            statusAccum = 0.0;
            char title[256];
            std::snprintf(title, sizeof(title),
                          "Trophy Panic — %s | t=%.0fs x%.2g%s | shots %d | wind %.0f deg %.1f m/s",
                          toString(sim->phase()), sim->nowS(), timeScale,
                          paused ? " PAUSED" : "", sim->shotsFired(),
                          sim->wind().directionRad() * 180.0 / std::numbers::pi,
                          sim->wind().speedMps());
            SDL_SetWindowTitle(window, title);
        }
        if (aiDebug) {
            aiDebugAccum += frameDt;
            if (aiDebugAccum >= 1.0) {
                aiDebugAccum = 0.0;
                std::puts(sim->animal().debugString().c_str());
            }
        }

        // --- Render -------------------------------------------------------
        glViewport(0, 0, winW, winH);
        glClearColor(0.53f, 0.72f, 0.90f, 1.0f); // sky gradient stand-in
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        glMatrixMode(GL_PROJECTION);
        glLoadIdentity();
        perspective(55.0, static_cast<double>(winW) / winH, 0.5, 2000.0);
        glMatrixMode(GL_MODELVIEW);
        glLoadIdentity();

        Vec3 focus = playerMode ? sim->hunterPos() : camFocus;
        if (playerMode) camDist = 25.0;
        const double ex = focus.x - std::cos(camYaw) * std::cos(camPitch) * camDist;
        const double ey = focus.y - std::sin(camYaw) * std::cos(camPitch) * camDist;
        const double ez = focus.z + std::sin(camPitch) * camDist + 2.0;
        lookAt(ex, ey, ez, focus.x, focus.y, focus.z + 2.0);

        // Terrain cells.
        const double cs = terrain.cellSizeM();
        for (int cyc = 0; cyc < terrain.heightCells(); ++cyc) {
            for (int cxc = 0; cxc < terrain.widthCells(); ++cxc) {
                const TerrainCell& cell = terrain.cell(cxc, cyc);
                Color col = zoneColor(cell.zone);
                const float shade =
                    0.85f + 0.15f * static_cast<float>(cell.heightM / 60.0);
                glColor3f(col.r * shade, col.g * shade, col.b * shade);
                const double x0 = cxc * cs, y0 = cyc * cs;
                const double h00 = cell.heightM;
                const double h10 = terrain.cell(cxc + 1, cyc).heightM;
                const double h01 = terrain.cell(cxc, cyc + 1).heightM;
                const double h11 = terrain.cell(cxc + 1, cyc + 1).heightM;
                glBegin(GL_QUADS);
                glVertex3d(x0, y0, h00);
                glVertex3d(x0 + cs, y0, h10);
                glVertex3d(x0 + cs, y0 + cs, h11);
                glVertex3d(x0, y0 + cs, h01);
                glEnd();

                // Simple trees on dense vegetation.
                if (!cell.water && cell.vegetationDensity01 > 0.65) {
                    const double jx = cellHash(terrain.seed(), cxc, cyc) * cs;
                    const double jy = cellHash(terrain.seed() + 1, cxc, cyc) * cs;
                    const double tx = x0 + jx, ty = y0 + jy;
                    const double th = 4.0 + cell.vegetationDensity01 * 5.0;
                    glColor3f(0.35f, 0.25f, 0.15f);
                    drawBox(tx, ty, h00 + th * 0.25, 0.5, 0.5, th * 0.5);
                    glColor3f(0.10f, 0.30f + 0.2f * static_cast<float>(jx / cs), 0.12f);
                    glBegin(GL_TRIANGLES); // cheap cone: 4 fins
                    for (int fin = 0; fin < 4; ++fin) {
                        const double a = fin * std::numbers::pi / 2.0;
                        glVertex3d(tx, ty, h00 + th);
                        glVertex3d(tx + std::cos(a) * 2.0, ty + std::sin(a) * 2.0, h00 + th * 0.35);
                        glVertex3d(tx - std::cos(a) * 2.0, ty - std::sin(a) * 2.0, h00 + th * 0.35);
                    }
                    glEnd();
                }
            }
        }

        // Evidence overlays.
        const double nowS = sim->nowS();
        if (showTracks || showBlood) {
            for (const Clue& clue : sim->evidence().clues()) {
                const SurfaceType surf =
                    terrain.cellAtWorld(clue.position.x, clue.position.y).surface;
                const double read = EvidenceMap::readability(clue, nowS, surf);
                if (read < 0.05) continue;
                const double z = terrain.heightAt(clue.position.x, clue.position.y) + 0.15;
                if (clue.kind == ClueKind::Footprint && showTracks) {
                    glColor4f(clue.injuredGait ? 0.8f : 0.3f, 0.2f, 0.1f,
                              static_cast<float>(read));
                    glBegin(GL_TRIANGLES); // arrowhead pointing along travel
                    const Vec3 d = clue.direction;
                    glVertex3d(clue.position.x + d.x * 0.8, clue.position.y + d.y * 0.8, z);
                    glVertex3d(clue.position.x - d.y * 0.3, clue.position.y + d.x * 0.3, z);
                    glVertex3d(clue.position.x + d.y * 0.3, clue.position.y - d.x * 0.3, z);
                    glEnd();
                } else if ((clue.kind == ClueKind::BloodDrop ||
                            clue.kind == ClueKind::BloodSmear ||
                            clue.kind == ClueKind::BloodPool) &&
                           showBlood) {
                    const double s = clue.kind == ClueKind::BloodPool ? 0.9 : 0.3;
                    glColor4f(0.75f, 0.05f, 0.05f, static_cast<float>(read));
                    drawBox(clue.position.x, clue.position.y, z, s, s, 0.05);
                }
            }
        }

        if (showScent) {
            glColor4f(0.4f, 0.9f, 0.4f, 0.15f);
            for (const ScentPuff& puff : sim->scent().puffs()) {
                const double z = terrain.heightAt(puff.position.x, puff.position.y) + 1.0;
                glBegin(GL_TRIANGLE_FAN);
                glVertex3d(puff.position.x, puff.position.y, z);
                for (int i = 0; i <= 12; ++i) {
                    const double a = i * std::numbers::pi / 6.0;
                    glVertex3d(puff.position.x + std::cos(a) * puff.radiusM,
                               puff.position.y + std::sin(a) * puff.radiusM, z);
                }
                glEnd();
            }
        }

        // The animal: low-poly but anatomically readable.
        {
            const AnimalAgent& animal = sim->animal();
            const Vec3 p = animal.position();
            const bool down = animal.alertState() == AlertState::Incapacitated;
            const SpeciesProfile& sp = animal.profile();
            const double scale = std::cbrt(animal.identity().bodyMassKg / 80.0);
            const double bodyL = 1.6 * scale, bodyW = 0.55 * scale;
            const double bodyH = down ? 0.5 * scale : 1.1 * scale;
            const double facing = animal.facingRad();

            glPushMatrix();
            glTranslated(p.x, p.y, terrain.heightAt(p.x, p.y));
            glRotated(facing * 180.0 / std::numbers::pi, 0, 0, 1);

            const double bloodLoss = 1.0 - animal.creature().bloodVolumeMl /
                                               std::max(1.0, animal.creature().maxBloodVolumeMl);
            glColor3d(0.45 + bloodLoss * 0.4, 0.32 - bloodLoss * 0.15,
                      0.20 - bloodLoss * 0.1);
            drawBox(0, 0, bodyH, bodyL, bodyW, 0.7 * scale); // torso
            drawBox(bodyL * 0.55, 0, bodyH + 0.35 * scale, 0.5 * scale, 0.35 * scale,
                    0.45 * scale); // head
            if (!down) {
                for (int leg = 0; leg < 4; ++leg) {
                    const double lx = (leg < 2 ? 1.0 : -1.0) * bodyL * 0.35;
                    const double ly = (leg % 2 == 0 ? 1.0 : -1.0) * bodyW * 0.4;
                    drawBox(lx, ly, bodyH * 0.4, 0.16 * scale, 0.16 * scale, bodyH * 0.8);
                }
            }
            // Trophy headgear scaled by the generated individual.
            if (animal.identity().trophySize01 > 0.05 && sp.trophyOrganId != "") {
                glColor3d(0.85, 0.8, 0.7);
                const double t = animal.identity().trophySize01;
                drawBox(bodyL * 0.55, 0.18 * scale, bodyH + 0.75 * scale, 0.1, 0.1,
                        0.6 * t + 0.1);
                drawBox(bodyL * 0.55, -0.18 * scale, bodyH + 0.75 * scale, 0.1, 0.1,
                        0.6 * t + 0.1);
            }
            glPopMatrix();

            // Alertness pip above the animal (debug UI, not game UI).
            Color pip{0.2f, 0.8f, 0.2f};
            switch (animal.alertState()) {
                case AlertState::Calm: break;
                case AlertState::Curious: pip = {0.7f, 0.8f, 0.2f}; break;
                case AlertState::Suspicious: pip = {0.9f, 0.7f, 0.1f}; break;
                case AlertState::Alert: pip = {1.0f, 0.5f, 0.0f}; break;
                case AlertState::Fleeing:
                case AlertState::Defensive:
                case AlertState::Aggressive: pip = {1.0f, 0.1f, 0.1f}; break;
                case AlertState::Incapacitated: pip = {0.4f, 0.4f, 0.4f}; break;
            }
            glColor3f(pip.r, pip.g, pip.b);
            drawBox(p.x, p.y, terrain.heightAt(p.x, p.y) + 2.6 * scale, 0.25, 0.25, 0.25);

            if (showVision && !down) {
                glColor4f(1.0f, 1.0f, 0.2f, 0.12f);
                const double half = sp.visionFovDeg * 0.5 * std::numbers::pi / 180.0;
                const double z = terrain.heightAt(p.x, p.y) + 1.0;
                glBegin(GL_TRIANGLE_FAN);
                glVertex3d(p.x, p.y, z);
                for (int i = 0; i <= 24; ++i) {
                    const double a = facing - half + (2.0 * half * i) / 24.0;
                    glVertex3d(p.x + std::cos(a) * sp.visionRangeM * 0.25,
                               p.y + std::sin(a) * sp.visionRangeM * 0.25, z);
                }
                glEnd();
            }
        }

        // The hunter: compact, toy-like, bright, visibly underprepared.
        {
            const Vec3 p = sim->hunterPos();
            const double ground = terrain.heightAt(p.x, p.y);
            double bodyZ = 1.0, headZ = 1.75, torsoH = 0.9;
            if (sim->hunterStance() == Stance::Crouched) { bodyZ = 0.7; headZ = 1.2; torsoH = 0.6; }
            if (sim->hunterStance() == Stance::Prone) { bodyZ = 0.25; headZ = 0.45; torsoH = 0.25; }

            glColor3d(0.95, 0.45, 0.10); // bright jacket
            drawBox(p.x, p.y, ground + bodyZ, 0.55, 0.45, torsoH); // bean torso
            glColor3d(0.94, 0.80, 0.62);
            drawBox(p.x, p.y, ground + headZ, 0.42, 0.42, 0.40);   // big head
            glColor3d(0.15, 0.45, 0.20);
            drawBox(p.x - 0.32, p.y, ground + bodyZ + 0.1, 0.25, 0.5, torsoH * 0.8); // backpack
            if (sim->hunterStance() != Stance::Prone) {
                glColor3d(0.25, 0.22, 0.35);
                drawBox(p.x, p.y - 0.14, ground + bodyZ * 0.35, 0.2, 0.16, bodyZ * 0.7);
                drawBox(p.x, p.y + 0.14, ground + bodyZ * 0.35, 0.2, 0.16, bodyZ * 0.7);
            }
        }

        // Wind arrow above the hunter (points where the wind blows toward).
        if (showWind) {
            const Vec3 p = sim->hunterPos();
            const Vec3 w = sim->wind().directionVector();
            const double z = terrain.heightAt(p.x, p.y) + 4.0;
            glColor3f(0.2f, 0.6f, 1.0f);
            glLineWidth(3.0f);
            glBegin(GL_LINES);
            glVertex3d(p.x, p.y, z);
            glVertex3d(p.x + w.x * 4.0, p.y + w.y * 4.0, z);
            glEnd();
            glBegin(GL_TRIANGLES);
            glVertex3d(p.x + w.x * 5.0, p.y + w.y * 5.0, z);
            glVertex3d(p.x + w.x * 4.0 - w.y * 0.6, p.y + w.y * 4.0 + w.x * 0.6, z);
            glVertex3d(p.x + w.x * 4.0 + w.y * 0.6, p.y + w.y * 4.0 - w.x * 0.6, z);
            glEnd();
        }

        if (showShots) {
            glColor4f(1.0f, 0.9f, 0.2f, 0.8f);
            glLineWidth(2.0f);
            glBegin(GL_LINES);
            for (const ShotTrace& trace : shotTraces) {
                glVertex3d(trace.from.x, trace.from.y,
                           terrain.heightAt(trace.from.x, trace.from.y) + 1.5);
                glVertex3d(trace.to.x, trace.to.y,
                           terrain.heightAt(trace.to.x, trace.to.y) + 1.0);
            }
            glEnd();
        }

        SDL_GL_SwapWindow(window);
        ++frame;

        if (sim->finished() && maxFrames < 0) {
            static bool reported = false;
            if (!reported) {
                reported = true;
                const HuntResult& r = sim->result();
                std::printf("\nHUNT %s%s — overall %.1f (%s)\n",
                            r.success ? "COMPLETE" : "FAILED",
                            r.failureReason.empty() ? "" : (" (" + r.failureReason + ")").c_str(),
                            r.trophyScore.overall, r.trophyScore.tier.c_str());
                std::puts("Press R to restart, ESC to quit.");
            }
        }
        if (maxFrames >= 0 && frame >= maxFrames) {
            if (!screenshotPath.empty()) writeScreenshotPpm(screenshotPath, winW, winH);
            running = false;
        }
    }

    SDL_GL_DeleteContext(gl);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}
