# Trophy Panic (browser build)

An open-world hunting game in the spirit of a serious hunting sim, played by
chibi trekkers with huge heads, pom-pom beanies, bedrolls and any skin colour
you like. The simulation is careful:
real ballistics, layered anatomy and blood trails. The presentation is
cartoon: big-eyed critters, confetti mode and slapstick tumbles.

Everything here is original. Art is built from primitives at runtime,
sound is synthesised with WebAudio, and no third-party game assets, names
or UI are used.

## Play

`npm run build` writes `dist/trophy-panic.html`. That file is the whole
game: three.js loads from jsDelivr and everything else is inline. Open
`dist/dev.html` locally, or publish `dist/trophy-panic.html` as a claude.ai
artifact declaring the `room` capability to get online co-op.

### Controls

| Key | Action |
| --- | --- |
| W A S D, Shift | move, sprint (hold breath while aiming) |
| C / Z / Space | crouch / prone / jump (badly) |
| Mouse, right click, left click | look, aim/scope, fire, throw, snap a photo |
| R | reload (with a full shotgun: cycle bird/buck/slug) |
| 1–9, wheel | equipment |
| B | binoculars with rangefinder and animal ID |
| Q | hunter sense: highlights tracks and blood, reveals need zones you stand in |
| E | harvest, pick up, climb a tower, ride a quad, use a supply box |
| T / H / F / G | animal call / bandage / flashlight / wave |
| X | ping what you're looking at (the party sees it) |
| K / P / J | dog: find it or heel / pitch or pack the ground blind / victory dance |
| L | light or stomp out a campfire; E next to it roasts a marshmallow |
| N / Y | Scent Killer (cures skunk stink) / Moss Cola (stamina, shaky aim) |
| Enter | party chat |
| V | first or third person (chase cam on a quad) |
| M | map and fast travel |

## What's in the reserve

- **Open world.** A 1 km² seeded reserve (Wobblewood) with forest, meadow,
  marsh, ridges, snowcaps, a lake and a river, one lodge and four outposts.
  Wildlife streams in around every hunter; there are no levels or set hunts.
- **Thirteen species.** Deer, elk, boar, turkey (ornery toms peck ankles),
  rabbit, fox, skunk (it sprays, and you reek), black bear, grizzly, moose,
  bison, wolf and cougar. Each is generated from a seed with its own sex,
  age, mass, trophy size, temperament, a nickname and an occasional rare
  coat.
- **Need zones.** Every species has feeding, drinking and resting zones,
  each active during a daily window. Herds commute between them. You find
  zones by spotting animals using them or by reading sign (Q) inside one,
  and they go on your map with their hours.
- **Hunting pressure.** Shooting in an area pushes wildlife away from it
  for a while.
- **Perception.** Animals see through a sight cone (trees block it), hear
  footsteps, calls, engines and gunshots, and smell you downwind. Fog cuts
  their sight and rain masks sound.
- **Dangerous game.**
  - Grizzlies and moose defend their territory.
  - Black bears bluff-charge.
  - Wolves circle as a pack and rush you.
  - Cougars stalk; staring one down makes it back off.
  - Playing dead (prone and still) works on bears.
  - Hits come as hit-and-run lunges with knockdown tumbles, and you get
    a short window of invulnerability after one.
- **Shooting and anatomy.** Projectiles take drag, drop and wind, then
  travel through layered anatomy: skin, muscle, bone and organs. That
  anatomy decides whether an animal drops, runs, limps or bleeds out, and
  what track and blood sign it leaves.
- **Harvest.** Four-part trophy scoring: biology, shot, integrity and
  recovery. Calibre suitability counts, and wound cavities damage pelts.
  Trophies earn cash and XP.
- **Arsenal.** Five rifles, a shotgun with three shell types, a revolver,
  two bows and a .22, plus throwable boots and a squeaky rubber chicken
  (curious animals come to look), a leaf blower and a wildlife camera.
- **Camera and album.** Photos are rated 1–5 stars on framing, angle,
  occlusion and behaviour. New species and great shots pay. Real
  thumbnails go into a photo album on the trophy wall.
- **Ranger jobs.** Optional daily jobs at the lodge and outposts:
  - specific harvests, Gold-grade or bow kills, long shots, blood trails
  - photo requests and dangerous close-ups
  - quad stunts, outpost visits, prop boops
  - staring down a cougar, playing dead with a bear
- **Quad bikes.** A quad is parked at every outpost. They take crests
  airborne (with mid-air flips) and roll on steep side-hills, throwing the
  rider. They bonk animals through the anatomy sim, and the engine is a
  sound every animal can hear.
- **Weather and time.**
  - A 20-minute day/night cycle.
  - Seeded weather: clear, overcast, rain with lightning, and morning fog
    that burns off.
  - Rain washes tracks and blood away and hides your footsteps; fog hides
    everyone.
- **Friendslop co-op.**
  - Type the same party code to join. The earliest joiner hosts the
    wildlife, and guests' shots are re-simulated against the host's
    anatomy.
  - Shared harvests, pings, chat with speech bubbles, friendly fire
    (mostly boots), leaf-blowing your friends, and seeing them ride quads.
- **Friendslop extras.**
  - Downed friends wait 40 s to be hauled up (E) before the rangers come.
  - Big hits knock your hat off; go and pick it up.
  - Victory dance (J), with friends watching.
  - Bear spray: sprayed bears sneeze and flee; sprayed friends cough.
  - Every harvest snaps a trophy photo of you posing with the animal.
- **Presentation.**
  - A field-terminal HUD in VT323 with a mission-state panel and a
    stance, wind and weather status bar.
  - Golden-hour light, purple nights with a crescent moon, and a ring of
    snowy peaks.
  - Lantern-lit camps with tents (first aid, naps that skip time), arrow
    signposts on the trails, and Whispering Falls at the river's source.
  - A storybook post pass: bloom, warm grade and vignette.
  - Toon shading with ink outlines.
  - Wobbly vegetation with far-LOD impostors.
  - Cartoon splats: full, mild, or confetti instead.
  - Adaptive quality, a WebAudio soundscape, and a per-browser save.

## Layout

```
src/
  core/      rng (seeded sfc32), input
  sim/       headless, deterministic simulation (no three.js):
             ballistics, creature (layered anatomy + physiology), scoring,
             species, generator, arsenal, worldsim (wind, scent, sound,
             evidence, perception), weather
  world/     terrain data + mesh, water, sky, vegetation, structures, weather FX
  entities/  animals (AI + manager: zones, streaming, pressure), animal
             models, hunter model, vehicles
  player/    player body, weapons, first-person viewmodel
  render/    toon materials/outlines, FX (particles, decals, evidence)
  game/      game loop/states, profile (save), jobs, photo rating
  net/       co-op over the artifact `room` capability
  ui/        HUD/menus (markup, style, ui.js), social (chat, pings, bubbles)
tests/       parity tests against the C++ engine's golden scenarios
tools/       build (esbuild → single HTML), smoke (headless Chromium scripts)
```

The simulation runs at a fixed 60 Hz. Anything that changes an outcome
uses a seeded `Rng`, never `Math.random`, and rendering never decides a
gameplay fact: light level, time period and weather are owned by the
simulation.

## Build and test

```
npm install
npm run build                 # dist/trophy-panic.html (+ dist/dev.html)
npm test                      # sim parity vs ../TrophyPanicEngine goldens
node tools/smoke.mjs --script <name>
```

Smoke scripts run the real page in headless Chromium using SwiftShader.
Each one fails on any page or console error and writes screenshots to
`shots/`:

- `basic`
- `gallery`
- `portraits` (`--only deer,wolf`, `--rest`)
- `hunt`
- `menus`
- `danger`
- `atv`
- `weather`
- `social`
- `jobs`
- `zones`
- `dog`, `blind`, `tips`, `slapstick`, `lineup`, `falls`, `revive`, `goofy`, `spray`, `honey`, `rest`, `legsup`, `skunk`, `turkey`, `signs`, `soak`
