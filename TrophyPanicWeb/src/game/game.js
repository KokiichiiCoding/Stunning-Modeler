// Game: owns the renderer, the world, the fixed-step simulation and the
// game states (title / play / menus). Rendering never decides gameplay
// facts; it only displays what the 60 Hz simulation produced.

import { THREE } from '../three.js';
import { TerrainData, WATER_LEVEL, POIS } from '../world/terrainData.js';
import { buildTerrainMesh, buildHeightTexture } from '../world/terrainMesh.js';
import { buildWater } from '../world/water.js';
import { Sky, periodFor } from '../world/sky.js';
import { Vegetation, vegUniforms } from '../world/vegetation.js';
import { Structures } from '../world/structures.js';
import { Wind, ScentField, SoundLog, Evidence, SCENT_CARCASS, visualDetection } from '../sim/worldsim.js';
import { Input } from '../core/input.js';
import { Player } from '../player/player.js';
import { buildHunter, buildHat, JACKETS, SKINS } from '../entities/hunter.js';
import { setHandColors } from '../player/viewmodel.js';
import { AnimalManager } from '../entities/animals.js';
import { Weapons } from '../player/weapons.js';
import { FX } from '../render/fx.js';
import { Audio } from '../audio/audio.js';
import { UI } from '../ui/ui.js';
import { Profile } from './profile.js';
import { Coop } from '../net/coop.js';
import { Vehicles } from '../entities/vehicle.js';
import { Weather } from '../sim/weather.js';
import { WeatherFX } from '../world/weatherfx.js';
import { Waterfall } from '../world/waterfall.js';
import { Social } from '../ui/social.js';
import { Post } from '../render/post.js';
import { Jobs } from './jobs.js';
import { Dog } from '../entities/dog.js';
import { Blinds } from '../entities/blind.js';
import { Tips } from '../ui/tips.js';
import { Buddies } from '../entities/buddies.js';
import { TouchControls } from '../core/touch.js';
import { Campfires } from '../entities/campfire.js';

const TICK = 1 / 60;
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

export class Game {
  constructor(canvas, saved = {}) {
    this.canvas = canvas;
    this.saved = saved;
    this.state = 'loading';
    this.time = 0;          // simulation seconds since boot
    this.hour = 6.5;        // time of day
    this.daySeconds = 20 * 60; // one in-game day = 20 real minutes
    this.acc = 0;
    this.frameTimes = [];
    this.thirdPerson = false;
    this.fov = 72;
    this.sessionSeed = (Date.now() >>> 0) ^ 0x9e3779b9;
  }

  async boot() {
    const ui = this.ui = new UI(this);
    ui.loading(0.05, 'Waking up the renderer…');
    await nextFrame();

    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.autoClear = false;
    r.info.autoReset = false;
    this.post = new Post(r);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, window.innerWidth / window.innerHeight, 0.08, 2600);
    this.camera.rotation.order = 'YXZ';
    this.viewScene = new THREE.Scene();  // first-person viewmodel, drawn after a depth clear
    this.viewCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 10);
    window.addEventListener('resize', () => this.onResize());

    this.profile = new Profile(this.saved.profile);
    this.input = new Input(this.canvas);
    this.input.sensitivity = this.profile.settings.sens;
    this.input.onLockChange = (locked) => {
      if (!locked && this.social && this.social.isOpen) { this._suppressPause = false; return; }
      if (!locked && this.state === 'play' && !this._suppressPause) this.pause();
      this._suppressPause = false;
    };
    this.audio = new Audio(this);

    ui.loading(0.15, 'Raising hills and digging the lake…');
    await nextFrame();
    this.terrain = new TerrainData();
    this.terrainMesh = buildTerrainMesh(this.terrain);
    this.scene.add(this.terrainMesh);
    this.water = buildWater(buildHeightTexture(this.terrain));
    this.scene.add(this.water.mesh);

    ui.loading(0.35, 'Painting the sky…');
    await nextFrame();
    this.sky = new Sky(this.scene);

    ui.loading(0.45, 'Growing trees (this is the slow bit)…');
    await nextFrame();
    this.vegetation = new Vegetation(this.scene, this.terrain);
    ui.loading(0.7, 'Building the lodge…');
    await nextFrame();
    this.structures = new Structures(this.scene, this.terrain, this.vegetation);

    this.wind = new Wind(this.sessionSeed ^ 0x77, 0.8, 3.2);
    this.weather = new Weather(this.sessionSeed ^ 0xa11, this.hour);
    this.light = this.weather.light(this.hour);
    this.scent = new ScentField();
    this.sounds = new SoundLog();
    this.evidence = new Evidence();

    ui.loading(0.8, 'Hiding the animals…');
    await nextFrame();
    this.fx = new FX(this);
    this.weatherFx = new WeatherFX(this);
    this.waterfall = new Waterfall(this);
    this.player = new Player(this);
    this.hunterModel = buildHunter(this.profile.look());
    this.scene.add(this.hunterModel.group);
    this.hunterModel.setVisible(false);
    this.animals = new AnimalManager(this);
    this.applyHandColors();
    this.weapons = new Weapons(this);
    this.vehicles = new Vehicles(this);
    this.dog = new Dog(this);
    this.blinds = new Blinds(this);
    this.campfires = new Campfires(this);
    this.tips = new Tips(this);
    this.buddies = new Buddies(this);
    this.touch = new TouchControls(this);
    this.coop = new Coop(this);
    this.social = new Social(this);
    this.jobs = new Jobs(this);

    ui.loading(1, 'Ready!');
    await nextFrame();
    this.applySettings();
    this.spawnAtLodge();
    this.state = 'title';
    ui.showTitle();
    this.ready = true;
    this.lastT = performance.now();
    // Tests drive frames manually (software GL is too slow for a live loop).
    if (!window.__TP_TEST) {
      const loop = (t) => { this.frame(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }

  applySettings() {
    const s = this.profile.settings;
    this.input.sensitivity = s.sens;
    this.fov = s.fov;
    this.audio.setVolume(s.volume);
    // 'auto' starts high and steps down if frames get slow (see autoQuality).
    this.qualityLevel = s.quality === 'low' ? 3 : s.quality === 'high' ? 0 : (this.qualityLevel ?? 0);
    this.applyQualityLevel();
  }

  applyQualityLevel() {
    const L = this.qualityLevel;
    const dpr = window.devicePixelRatio || 1;
    const pr = [Math.min(dpr, 1.75), Math.min(dpr, 1.0), 0.85, 0.7][L];
    const shadows = L <= 1;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.sky.sun.castShadow = shadows;
      this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    }
    this.renderer.setPixelRatio(pr);
    this.vegetation.lodDistance = [170, 150, 120, 95][L];
    this.post.enabled = this.profile.settings.post !== false && L <= 1;
    this.onResize();
  }

  /** Keep the frame rate playable on modest laptops. */
  autoQuality(dt) {
    if (this.profile.settings.quality !== 'auto' || this.state !== 'play' || document.hidden) { this.qAcc = 0; this.qFrames = 0; return; }
    this.qAcc = (this.qAcc || 0) + dt; this.qFrames = (this.qFrames || 0) + 1;
    if (this.qAcc < 2.5) return;
    const avg = this.qAcc / this.qFrames;
    this.qAcc = 0; this.qFrames = 0;
    if (avg > 0.03 && this.qualityLevel < 3) {
      this.qualityLevel++; this.applyQualityLevel();
      this.ui.feed('Graphics lowered a notch to keep things smooth.', 'info');
    } else if (avg < 0.012 && this.qualityLevel > 0 && (this.qUpT = (this.qUpT || 0) + 1) > 4) {
      this.qUpT = 0; this.qualityLevel--; this.applyQualityLevel();
    }
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.post) this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h; this.viewCamera.updateProjectionMatrix();
  }

  spawnAtLodge() {
    const lodge = POIS.find(p => p.id === 'lodge');
    this.player.spawnAt(lodge.spawn.x, lodge.spawn.z, lodge.spawn.yaw);
  }

  // ---------------------------------------------------------------- states
  startPlaying({ party = null } = {}) {
    this.state = 'play';
    this.ui.hideScreens();
    this.ui.showHUD();
    this.audio.unlock();
    this.audio.startAmbience();
    if (party) this.coop.join(party);
    this.animals.populateAround(this.player.pos, true);
    this.input.requestLock();
    if (!this.welcomed) {
      this.welcomed = true;
      this.ui.feed(`Welcome to Wobblewood Reserve, ${this.profile.name}!`, 'good');
      this.ui.feed('Press Q for hunter sense. B for binoculars. Tread quietly.', 'info');
    }
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.ui.showPause();
  }
  resume() {
    this.state = 'play';
    this.ui.hideScreens();
    this.ui.showHUD();
    this.input.requestLock();
  }
  openMenu(name) {
    if (this.state === 'play') { this._suppressPause = true; this.input.exitLock(); }
    this.menuReturn = this.state === 'title' ? 'title' : 'play';
    this.state = 'menu';
    this.ui.openScreen(name);
  }
  closeMenu() {
    if (this.menuReturn === 'title') { this.state = 'title'; this.ui.showTitle(); }
    else this.resume();
  }
  quitToTitle() {
    this.coop.leave();
    this.social.clear();
    this.blinds.clear();
    this.campfires.clear();
    this.buddies.clear();
    if (this.player.vehicle) this.player.vehicle.exit(true);
    this.state = 'title';
    this.profile.save();
    this.ui.showTitle();
  }

  /** Downed: you flop over and your little ghost pops out. In a party you
   *  wait for a friend to haul you up; otherwise the rangers come. */
  onPlayerDowned(source) {
    const p = this.player;
    if (p.vehicle) p.vehicle.exit(true);
    this.coop.broadcastEvent('downed', { by: source });
    this.fx.ghost(p.pos.x, p.pos.y + 0.8, p.pos.z, 0xffffff, 0.6);
    this.audio.play('oof', p.pos);
    const party = this.coop.inParty() && this.coop.peers.size > 0;
    this.downedInfo = { source, t: 0, wait: party ? 40 : 2.8, party };
    if (party) { this.ui.feed('You\'re down! Friends can pull you up (E next to you). Press E to call the rangers instead.', 'warn'); this.coop.broadcastEvent('chat', { t: 'HELP!! I\'m down!' }); }
  }

  /** Revived by a friend: wobble back up with a bit of health. */
  revive(byName) {
    const p = this.player;
    if (!p.downed) return;
    p.downed = false; p.hp = 35; p.bleed = 0; p.invuln = 3; p.getUp = 0.8;
    this.downedInfo = null;
    this.ui.toast(`${byName} pulled you up!`, 'big', 2.4);
    this.say('huh');
    this.audio.play('boing', p.pos);
    this.coop.broadcastEvent('revived', {});
  }

  callRangers() {
    const info = this.downedInfo; this.downedInfo = null;
    const source = info ? info.source : 'misadventure';
    this.state = 'menu';
    this.menuReturn = 'play';
    this._suppressPause = true;
    this.input.exitLock();
    const bill = Math.min(this.profile.cash, 80 + Math.floor(this.profile.level * 10));
    this.profile.cash -= bill;
    this.profile.stats.downs++;
    this.profile.save();
    this.ui.showDowned(source, bill);
  }
  respawn() {
    this.downedInfo = null;
    if (this.hatOff) this.restoreHat();
    if (this.player.vehicle) this.player.vehicle.exit(true);
    this.spawnAtLodge();
    this.hour = Math.min(23.5, this.hour + 1.5);
    this.resume();
  }

  // ---------------------------------------------------------------- loop
  frame(t) {
    let dt = (t - this.lastT) / 1000;
    this.lastT = t;
    dt = Math.min(dt, 0.1);
    this.frameTimes.push(dt); if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.advance(dt);
    this.render(dt);
    this.audio.update(dt);
    this.autoQuality(dt);
    this.input.endFrame();
  }

  rebuildHunter() {
    if (!this.hunterModel) return;
    this.scene.remove(this.hunterModel.group);
    this.hunterModel = buildHunter(this.profile.look());
    this.hunterModel.setVisible(false);
    this.scene.add(this.hunterModel.group);
    this.applyHandColors();
    if (this.weapons) this.weapons.vm.rebuildHands();
  }

  /** A big hit sends your hat flying. Go and get it. */
  knockHat(knock) {
    if (this.hatOff) return;
    this.hatOff = true;
    const p = this.player, lk = this.profile.look();
    this.hunterModel.hat.visible = false;
    const mesh = new THREE.Mesh(buildHat(lk.hat, lk.jacket), this.hunterModel.hat.material);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const k = Math.hypot(knock.x, knock.z) || 1;
    this.weapons.props.push({ kind: 'hat', mesh, x: p.pos.x, y: p.pos.y + 1.4, z: p.pos.z, vx: knock.x / k * 5 + (this.weapons.rng.next() - 0.5) * 2, vy: 7, vz: knock.z / k * 5 + (this.weapons.rng.next() - 0.5) * 2, spin: 14, resting: false, label: 'your hat', age: 0 });
    this.ui.toast('Your hat went flying!', 'hit', 1.8);
    this.say('scared');
  }

  restoreHat() {
    this.hatOff = false;
    if (this.hunterModel.hat) this.hunterModel.hat.visible = true;
    for (const pr of this.weapons.props.filter(x => x.kind === 'hat')) this.scene.remove(pr.mesh);
    this.weapons.props = this.weapons.props.filter(x => x.kind !== 'hat');
    this.ui.feed('Hat back on. Dignity restored.', 'good');
    this.audio.play('boing', this.player.pos);
  }

  /** Sleep the clock forward to a time of day (host/solo only). */
  restUntil(target) {
    if (this.coop.isGuest()) { this.ui.feed('Only the party host can sleep the clock forward. Ask them nicely.', 'warn'); this.closeMenu(); return; }
    const skip = ((target - this.hour) % 24 + 24) % 24 || 24;
    const secs = skip / 24 * this.daySeconds;
    // the world keeps turning while you snore: weather, pressure fading, need-zone commutes
    for (let t = 0; t < secs; t += 20) { this.hour = (this.hour + 20 * 24 / this.daySeconds) % 24; this.weather.step(20, this.hour); }
    this.hour = target % 24;
    this.time += secs;
    this.period = periodFor(this.hour);
    this.light = this.weather.light(this.hour);
    if (this.animals.pressure) for (const pz of this.animals.pressure) pz.v *= Math.pow(0.5, secs / (this.daySeconds * 0.35));
    // calm animals wander off; new ones turn up for the new hour
    for (const a of this.animals.list) if (!a.creature.wounds.length && !a.downed) { a.dispose(); a.harvested = true; a.despawned = true; }
    this.animals.list = this.animals.list.filter(a => !a.harvested);
    this.animals.groups = this.animals.groups.filter(gp => gp.members.some(m => !m.harvested));
    this.animals.populateAround(this.player.pos, true);
    const p = this.player; p.hp = 100; p.bleed = 0; p.stamina = 100;
    this.closeMenu();
    const h = Math.floor(this.hour), m = Math.round((this.hour - h) * 60);
    this.ui.toast(`Zzz… awake at ${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, 'big', 2.4);
    this.say('happy');
  }

  nearestKit(pos) {
    for (const k of this.structures.tents) {
      // the crate sits at the tent's front-right
      const cx = k.x + Math.sin(k.rot) * 1.4 + Math.cos(k.rot) * 0.9, cz = k.z + Math.cos(k.rot) * 1.4 - Math.sin(k.rot) * 0.9;
      if (Math.hypot(pos.x - cx, pos.z - cz) < 2.4 || Math.hypot(pos.x - k.x, pos.z - k.z) < 2.8) return k;
    }
    return null;
  }

  /** Your chibi says something. Friends hear their own babble from your position. */
  say(mood) {
    const v = 0.85 + ((this.profile.skin | 0) % 6) * 0.07 + (this.profile.name.length % 3) * 0.04;
    this.audio.babble(this.player.pos, mood, v);
  }

  applyHandColors() {
    const lk = this.profile.look();
    setHandColors(SKINS[(lk.skin | 0) % SKINS.length].hex, lk.jacket);
  }

  /** Title screen: your trekker stands in the shot, waving at you. */
  posePreview(dt) {
    const cam = this.camera, hm = this.hunterModel;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); f.y = 0; f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const x = cam.position.x + f.x * 4.2 + r.x * 1.3, z = cam.position.z + f.z * 4.2 + r.z * 1.3;
    hm.setVisible(true);
    hm.group.rotation.order = 'XYZ';
    hm.group.position.set(x, this.terrain.heightAt(x, z), z);
    hm.group.rotation.set(0, Math.atan2(-f.x, -f.z) - 0.35, 0);
    hm.animate(dt, { speed: 0, stance: 'stand', pitch: -0.2, wave: (this.visualTime % 6) < 2.4, showRifle: false });
  }

  /** Advance the fixed-step simulation by real time dt. */
  advance(dt) {
    const playing = this.state === 'play';
    const cmd = playing ? this.readCommands(dt) : null;
    if (playing) this.acc += dt; else this.acc = 0;
    let steps = 0;
    while (this.acc >= TICK && steps < 6) {
      this.simStep(TICK, cmd);
      this.acc -= TICK;
      steps++;
      if (cmd) { cmd.jump = cmd.crouch = cmd.prone = false; }
    }
    // Cosmetic time keeps flowing on the title screen (clouds, water, sway).
    this.visualTime = (this.visualTime || 0) + dt;
    if (!playing && this.state === 'title') this.titleCam(dt);
    this.tips.step(dt);
    this.coop.update(dt);
  }

  readCommands(dt) {
    const I = this.input;
    const p = this.player;
    const sens = 0.0022 * I.sensitivity * (this.weapons.aimZoom ? 1 / this.weapons.aimZoom : 1);
    if (!p.tumble) {
      p.yaw -= I.mouse.dx * sens;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - I.mouse.dy * sens));
    }
    const cmd = {
      moveX: (I.isDown('KeyD') ? 1 : 0) - (I.isDown('KeyA') ? 1 : 0),
      moveZ: (I.isDown('KeyW') ? 1 : 0) - (I.isDown('KeyS') ? 1 : 0),
      sprint: I.isDown('ShiftLeft') || I.isDown('ShiftRight'),
      jump: I.wasPressed('Space'),
      crouch: I.wasPressed('KeyC') || I.wasPressed('ControlLeft'),
      prone: I.wasPressed('KeyZ'),
      aiming: I.mouse.right && !p.swimming,
      fire: I.mouse.left,
      firePressed: I.mouse.leftPressed,
      anyKey: I.pressed.size > 0 || I.mouse.leftPressed,
    };
    cmd.holdBreath = cmd.aiming && cmd.sprint;
    if (cmd.aiming) cmd.sprint = false;
    if (p.vehicle) {
      cmd.throttle = cmd.moveZ; cmd.steer = cmd.moveX;
      cmd.handbrake = I.isDown('Space');
      cmd.moveX = cmd.moveZ = 0; cmd.jump = cmd.crouch = cmd.prone = false;
      cmd.aiming = cmd.fire = cmd.firePressed = false;
    }
    if (this.campfires.roast) {
      if (cmd.firePressed) this.campfires.eat();
      cmd.aiming = cmd.fire = cmd.firePressed = false;
    }
    this.handleActionKeys(I);
    return cmd;
  }

  handleActionKeys(I) {
    const w = this.weapons;
    for (let i = 1; i <= 9; i++) if (I.wasPressed('Digit' + i)) w.selectSlot(i - 1);
    if (I.mouse.wheel) w.cycle(I.mouse.wheel);
    if (I.wasPressed('KeyR')) w.reload();
    if (I.wasPressed('KeyB')) w.toggleBinoculars();
    if (I.wasPressed('KeyQ')) { this.fx.hunterSense(true); this.animals.senseZones(this.player.pos); }
    if (I.wasPressed('KeyE')) this.interact();
    if (I.wasPressed('KeyT')) this.useCall();
    if (I.wasPressed('KeyH')) this.bandage();
    if (I.wasPressed('KeyF')) this.fx.toggleFlashlight();
    if (I.wasPressed('KeyG')) { this.waveT = 2.2; this.coop.broadcastEvent('wave', {}); this.say('happy'); }
    if (I.wasPressed('KeyV')) this.thirdPerson = !this.thirdPerson;
    if (I.wasPressed('KeyM')) this.openMenu('map');
    if (I.wasPressed('KeyX')) this.social.ping();
    if (I.wasPressed('KeyK')) this.dog.command();
    if (I.wasPressed('KeyP')) this.blinds.toggle();
    if (I.wasPressed('KeyL')) this.campfires.toggle();
    if (I.wasPressed('KeyN')) this.useScentKiller();
    if (I.wasPressed('KeyY')) this.drinkCola();
    if (I.wasPressed('KeyJ') && !this.player.vehicle && !this.player.tumble) { this.danceT = 4; this.coop.broadcastEvent('dance', {}); this.audio.play('levelup', this.player.pos); this.say('yay'); }
    if (I.wasPressed('Enter') || I.wasPressed('NumpadEnter')) this.social.open();
    if (I.wasPressed('Escape')) this.pause();
  }

  simStep(dt, cmd) {
    this.time += dt;
    this.hour = (this.hour + dt * 24 / this.daySeconds) % 24;
    this.period = periodFor(this.hour); // simulation-owned; the sky only displays it
    this.wind.update(dt);
    if (!this.coop.isGuest()) this.weather.step(dt, this.hour);
    if (this.weather.rain > 0.3) this.wind.speed = Math.max(this.wind.speed, 2 + this.weather.rain * 3.5);
    if (this.weather.fog > 0.5) this.wind.speed = Math.min(this.wind.speed, 1.6);
    this.light = this.weather.light(this.hour);
    this.evidence.rainAccum = this.weather.rainAccum;
    if (this.downedInfo) { this.downedInfo.t += dt; if (this.downedInfo.t >= this.downedInfo.wait) this.callRangers(); }
    this.tick = (this.tick || 0) + 1;
    if (this.tick % 60 === 30) this.checkPOIs();
    if (this.weather.changed) { this.announceWeather(this.weather.changed); this.weather.changed = null; }
    this.vehicles.step(dt, cmd || {});
    this.player.step(dt, cmd || {});
    this.campfires.step(dt);
    this.weapons.step(dt, cmd || {});
    this.scent.update(dt, this.wind, this.weapons.blowers, this.weather.scentWash());
    this.animals.step(dt);
    this.dog.step(dt);
    this.buddies.step(dt);
    this.fx.step(dt);
    if (((this.time * 60) | 0) % 60 === 0) this.sounds.expire(this.time);
    if (this.waveT > 0) this.waveT -= dt;
    if (this.danceT > 0) { this.danceT -= dt; if (this.player.speed > 0.8) this.danceT = 0; }
  }

  /** Walking into an outpost discovers it (fast travel) and counts for visit jobs. */
  checkPOIs() {
    const p = this.player.pos;
    const wf = this.waterfall && this.waterfall.base;
    if (wf && !this.profile.discovered.includes('falls') && Math.hypot(p.x - wf.x, p.z - wf.z) < 70) {
      this.profile.discover('falls');
      this.ui.toast('Discovered Whispering Falls!', 'big', 2.4);
      this.ui.feed('Whispering Falls is on your map. Animals come here to drink.', 'good');
      this.jobs.onEvent('visit', { poi: 'falls' });
    }
    for (const poi of POIS) {
      if (Math.hypot(p.x - poi.x, p.z - poi.z) > poi.r + 6) continue;
      if (!this.profile.discovered.includes(poi.id)) {
        this.profile.discover(poi.id);
        this.ui.toast(`Discovered ${poi.name}!`, 'big', 2.4);
        this.ui.feed(`${poi.name} added to your map. Fast travel there any time.`, 'good');
      }
      if (this._lastPoi !== poi.id) { this._lastPoi = poi.id; this.jobs.onEvent('visit', { poi: poi.id }); }
      return;
    }
    this._lastPoi = null;
  }

  /** Queue a trophy photo: next frame poses you beside the animal, snaps it into the album. */
  trophySelfie(a, h, done) {
    if (this.selfie) this.selfie.done();
    this.selfie = { a, h, done };
  }

  doSelfie() {
    const sf = this.selfie; this.selfie = null;
    const a = sf.a, hm = this.hunterModel, T = this.terrain;
    try {
      const yaw = a.facingYaw();
      // camera off the animal's flank, hunter crouched behind its shoulder, everyone facing the lens
      const sx = Math.cos(yaw), sz = -Math.sin(yaw);
      const len = a.species.body.len * a.identity.scale;
      const cx = a.pos.x + sx * (2.2 + len * 1.0), cz = a.pos.z + sz * (2.2 + len * 1.0);
      const cam = this.selfieCam || (this.selfieCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 600));
      cam.position.set(cx, Math.max(T.heightAt(cx, cz) + 1.1, a.pos.y + 1.0), cz);
      const hx = a.pos.x - sx * 0.9 + Math.sin(yaw) * len * 0.35, hz = a.pos.z - sz * 0.9 + Math.cos(yaw) * len * 0.35;
      hm.setVisible(true);
      hm.group.rotation.order = 'XYZ';
      hm.group.position.set(hx, T.heightAt(hx, hz), hz);
      hm.group.rotation.set(0, Math.atan2(cx - hx, cz - hz), 0);
      hm.animate(0.3, { speed: 0, stance: 'stand', pitch: 0, wave: true, showRifle: false });
      cam.lookAt(a.pos.x, a.pos.y + 0.6, a.pos.z);
      a.syncRig && a.syncRig();
      const r = this.renderer;
      r.info.reset(); r.clear();
      r.render(this.scene, cam);
      const c = document.createElement('canvas'); c.width = 256; c.height = 144;
      const src = r.domElement, sw = src.width, sh = src.height, ar = 16 / 9;
      const cw = Math.min(sw, sh * ar), ch = cw / ar;
      c.getContext('2d').drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, 256, 144);
      const img = c.toDataURL('image/jpeg', 0.75);
      const tierStars = { Platinum: 5, Gold: 4, Silver: 3, Bronze: 2 }[sf.h.score.tier] || 1;
      this.profile.addPhoto({ img, sp: sf.h.species.id, name: sf.h.species.displayName, nickname: sf.h.animal.nickname, stars: tierStars, action: `${sf.h.score.tier} trophy`, dist: 0, trophy: true, date: `Day ${Math.floor(this.time / this.daySeconds) + 1}` });
    } catch (e) { console.warn('trophy photo failed', e); }
    sf.done();
  }

  /** Called right after the main scene render when a photo was taken this frame. */
  capturePhoto() {
    const ph = this.pendingPhoto;
    this.pendingPhoto = null;
    const res = ph.res;
    if (!res) { this.ui.feed('Lovely photo of some scenery. (No animals in frame.)', 'info'); return; }
    let img = null;
    try {
      const c = document.createElement('canvas'); c.width = 256; c.height = 144;
      const src = this.renderer.domElement;
      const sw = src.width, sh = src.height, ar = 16 / 9;
      const cw = Math.min(sw, sh * ar), ch = cw / ar;
      c.getContext('2d').drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, 256, 144);
      img = c.toDataURL('image/jpeg', 0.72);
    } catch { img = null; }
    const pr = this.profile;
    const isNew = !pr.snapped.includes(res.sp);
    let pay = res.stars >= 4 ? res.stars * 4 : 0;
    if (isNew) { pr.snapped.push(res.sp); pay += 40; }
    if (res.charging && res.danger >= 2) pay += 50;
    pr.cash += pay;
    pr.addPhoto({ img, sp: res.sp, name: res.name, nickname: res.nickname, stars: res.stars, action: res.action, dist: res.dist, rare: res.rare, date: `Day ${Math.floor(this.time / this.daySeconds) + 1}` });
    const stars = '★'.repeat(res.stars) + '☆'.repeat(5 - res.stars);
    this.ui.toast(`${stars}  ${res.name}, ${res.action}, ${res.dist.toFixed(0)} m${pay ? `  +$${pay}` : ''}`, 'hit', 2.6);
    if (isNew) this.ui.feed(`New in your field journal: ${res.name}!`, 'good');
    if (res.charging && res.danger >= 2) this.ui.feed('Incredible action shot. Also: RUN.', 'warn');
    if (pay) this.audio.play('cash');
    this.jobs.onEvent('photo', { sp: res.sp, stars: res.stars, dist: res.dist, charging: res.charging });
  }

  announceWeather(kind) {
    if (this.state !== 'play') return;
    const msg = {
      rain: 'It\'s starting to rain. Tracks and blood will wash out — follow them fast. Animals hear less.',
      fog: 'Fog is rolling in. Nobody can see very far, including the bears.',
      cloudy: 'Clouds are gathering.',
      clear: 'The sky is clearing up.',
    }[kind];
    if (msg) this.ui.feed(msg, kind === 'rain' || kind === 'fog' ? 'warn' : 'info');
  }

  interact() {
    const p = this.player;
    if (p.downed) { if (this.downedInfo && this.downedInfo.party) this.callRangers(); return; }
    // a friend is down right here: haul them up
    for (const r of this.coop.peers.values()) {
      if (r.presence && r.presence.dn && r.target && Math.hypot(r.target.x - p.pos.x, r.target.z - p.pos.z) < 2.6) {
        this.coop.sendTo(r.peer, 'revive', { n: this.profile.name });
        this.ui.feed(`You haul ${r.name} back onto their feet. Teamwork!`, 'good');
        this.audio.play('boing', p.pos); this.waveT = 1;
        return;
      }
    }
    if (p.vehicle) { p.vehicle.exit(); this.ui.feed('You hop off. The quad ticks as it cools.', 'info'); return; }
    if (this.campfires.roast) { this.campfires.eat(); return; }
    // Harvest a downed animal in reach
    const a = this.animals.nearestDowned(p.pos, 3.2);
    if (a) { this.animals.harvest(a); return; }
    const item = this.weapons.nearestPickup(p.pos, 2.5);
    if (item) { this.weapons.pickup(item); return; }
    if (this.campfires.startRoast()) return;
    // the first-aid crate by a camp tent patches you up
    const kit = this.nearestKit(p.pos);
    if (kit && (p.hp < 99 || p.bleed > 0)) {
      if (this.time - kit.usedT < 90) { this.ui.feed('The first-aid crate is empty. The rangers restock it every few minutes.', 'warn'); return; }
      kit.usedT = this.time; p.hp = 100; p.bleed = 0;
      this.audio.play('levelup', p.pos); this.say('yay');
      this.ui.feed('First-aid crate: plasters, a lolly, good as new.', 'good');
      return;
    }
    if (kit) { this.openMenu('rest'); return; }
    const quad = !p.tumble && this.vehicles.nearest(p.pos, 2.6);
    if (quad) { this.weapons.aiming = false; if (this.weapons.binoculars) this.weapons.toggleBinoculars(); quad.enter(p); return; }
    for (const tw of this.structures.towers) {
      if (Math.hypot(p.pos.x - tw.x, p.pos.z - (tw.z + 1.5)) < 2.2 && !p.onTower) {
        p.pos.x = tw.x; p.pos.z = tw.z; p.pos.y = tw.top + 0.05; p.vel.y = 0;
        this.ui.feed('Up the tower. Great view, zero cover from bears.', 'info');
        return;
      }
    }
    const poi = POIS.find(q => Math.hypot(p.pos.x - q.x, p.pos.z - q.z) < q.r + 4);
    if (poi) {
      this.profile.discover(poi.id);
      this.openMenu('shop');
    }
  }

  useCall() {
    const call = this.profile.bestCall();
    if (!call) { this.ui.feed('You have no animal call. Try the lodge.', 'warn'); return; }
    if (this.callCooldown && this.time < this.callCooldown) return;
    this.callCooldown = this.time + 4;
    const p = this.player.pos;
    this.sounds.emit('call', p.x, p.y + 1.3, p.z, 420, this.time, 'player');
    this.animals.onCall(call, p);
    this.audio.play('call_' + call, p);
    this.ui.feed(`You used the ${this.profile.callName(call)}.`, 'info');
  }

  useScentKiller() {
    const p = this.player;
    if (!this.profile.useGear('scent_spray')) { this.ui.feed('No Scent Killer left. The lodge sells it.', 'warn'); return; }
    const wasStinky = p.stinky > 0;
    p.stinky = 0; p.scentMult = 0.3; p.scentTimer = 300;
    this.audio.play('spray', p.pos);
    this.fx.burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 10, color: 0xe8f4ff, speed: 1.5, up: 1, kind: 'smoke', size: 0.3 });
    this.ui.feed(wasStinky ? 'Scent Killer vs skunk: Scent Killer wins. Barely.' : 'Spritz. You smell of nothing for five minutes.', 'good');
  }

  drinkCola() {
    const p = this.player;
    if (!this.profile.useGear('energy_drink')) { this.ui.feed('No Moss Cola left.', 'warn'); return; }
    p.stamina = 100; p.jitter = 20;
    this.audio.play('cash', p.pos); this.say('yay');
    this.ui.feed('Glug. Full stamina! Your hands are… a little shaky.', 'good');
  }

  bandage() {
    const p = this.player;
    if (p.bleed <= 0) { this.ui.feed('You are not bleeding. Nice.', 'info'); return; }
    if (!this.profile.useGear('bandage')) { this.ui.feed('No bandages left!', 'warn'); return; }
    p.bandaging = 1.6;
    this.ui.feed('Bandaging…', 'info');
  }

  // ---------------------------------------------------------------- camera & render
  titleCam(dt) {
    const lodge = POIS[0];
    // a low, cinematic shot from the lodge across the reserve toward the peaks,
    // panning slowly; your trekker stands in the foreground
    this.titleAngle = (this.titleAngle || 0) + dt * 0.05;
    const sp = lodge.spawn || { x: lodge.x, z: lodge.z, yaw: 0 };
    const base = Math.atan2(-sp.x, -sp.z) + Math.sin(this.titleAngle) * 0.35;
    const x = sp.x + Math.sin(base) * 5, z = sp.z + Math.cos(base) * 5;
    const y = this.terrain.heightAt(x, z) + 2.3;
    this.camera.position.set(x, y, z);
    const tx = x + Math.sin(base) * 160, tz = z + Math.cos(base) * 160;
    this.camera.lookAt(tx, Math.max(y + 4, this.terrain.heightAt(tx, tz) + 12), tz);
    this.hour = this.hour < 7 ? 7.5 : this.hour;
  }

  updateCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    const w = this.weapons;
    const eye = p.eyePos();
    let targetFov = this.fov;
    if (w.aimZoom > 1) targetFov = this.fov / w.aimZoom;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 14);
    cam.updateProjectionMatrix();

    const third = this.thirdPerson || p.tumble || p.downed || this.danceT > 0;
    this.hunterModel.setVisible(!!third);
    if (p.vehicle && this.thirdPerson) {
      // chase cam: sits behind the quad, swings with it, mouse can look around
      const v = p.vehicle;
      const yaw = v.yaw + Math.PI;
      const back = 6 + v.speed() * 0.12;
      const cx = v.pos.x + Math.sin(yaw) * back, cz = v.pos.z + Math.cos(yaw) * back;
      let cy = v.pos.y + 2.4 - p.pitch * 3;
      cy = Math.max(cy, this.terrain.heightAt(cx, cz) + 0.6);
      cam.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 6));
      cam.lookAt(v.pos.x, v.pos.y + 1.1, v.pos.z);
    } else if (p.vehicle) {
      // first person on the quad: look around freely, the machine pitches and rolls under you
      const v = p.vehicle;
      cam.position.set(eye.x, eye.y, eye.z);
      cam.rotation.set(p.pitch + v.pitch * 0.6, p.yaw, -v.roll * 0.6);
    } else if (third) {
      // Over the right shoulder while exploring; pulled back and centred when tumbling or down.
      const wide = p.tumble || p.downed;
      const back = wide ? 5.5 : 3.1;
      const sh = wide ? 0 : 0.62;
      const yaw = p.yaw;
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const cx = eye.x + Math.sin(yaw) * back * Math.cos(p.pitch * 0.5) + rx * sh;
      const cz = eye.z + Math.cos(yaw) * back * Math.cos(p.pitch * 0.5) + rz * sh;
      let cy = eye.y + 0.45 - Math.sin(p.pitch * 0.5) * back;
      cy = Math.max(cy, this.terrain.heightAt(cx, cz) + 0.4);
      const want = new THREE.Vector3(cx, cy, cz);
      if (!this._wasThird || cam.position.distanceTo(want) > 12) cam.position.copy(want);
      else cam.position.lerp(want, Math.min(1, dt * 10));
      if (wide) cam.lookAt(eye.x, eye.y + 0.3, eye.z);
      else { const f = p.forward(); cam.lookAt(eye.x + f.x * 25 + rx * sh, eye.y + f.y * 25 + 0.2, eye.z + f.z * 25 + rz * sh); }
    } else {
      cam.position.set(eye.x, eye.y, eye.z);
      const sway = w.swayOffset();
      cam.rotation.set(p.pitch + sway.y, p.yaw + sway.x, 0);
      // head bob
      if (p.grounded && p.speed > 0.5) {
        this.bobT = (this.bobT || 0) + dt * p.speed * 2.2;
        cam.position.y += Math.sin(this.bobT * 2) * 0.025 * Math.min(1, p.speed / 3);
      }
    }
    this._wasThird = !!third && !p.vehicle;
    if (this.fx.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.fx.shake * 0.2;
      cam.position.y += (Math.random() - 0.5) * this.fx.shake * 0.2;
    }
  }

  updateHunterModel(dt) {
    const p = this.player, hm = this.hunterModel;
    hm.group.position.set(p.pos.x, p.pos.y, p.pos.z);
    if (p.vehicle) {
      const v = p.vehicle;
      hm.group.position.y = p.pos.y - 0.36;
      hm.group.rotation.order = 'YXZ';
      hm.group.rotation.set(-v.pitch, v.yaw, v.roll);
      hm.animate(dt, { speed: 0, stance: 'stand', pitch: p.pitch, seated: true, lean: v.steer, showRifle: false });
      return;
    }
    hm.group.rotation.order = 'XYZ';
    if (p.downed) {
      hm.group.rotation.set(-Math.PI / 2, p.yaw + Math.PI, 0);
      hm.group.position.y = p.pos.y + 0.32;
    } else if (p.tumble) {
      hm.group.rotation.set(p.tumble.rot.x, p.tumble.rot.y, p.tumble.rot.z);
    } else {
      hm.group.rotation.set(0, p.yaw + Math.PI, 0);
    }
    if (this.pointT > 0) this.pointT -= dt;
    hm.animate(dt, { point: this.pointT > 0, dance: this.danceT > 0, flail: !!p.tumble, speed: p.tumble ? 3 : p.speed, stance: p.stance, pitch: p.pitch, dead: p.downed, wave: this.waveT > 0, aiming: this.weapons.aiming, showRifle: this.weapons.current && this.weapons.current.type !== 'thrown' });
  }

  render(dt) {
    if (!this.ready) return;
    const center = this.state === 'title' ? this.camera.position : this.player.pos;
    vegUniforms.uTime.value = this.visualTime;
    const wv = this.wind.vec();
    vegUniforms.uWind.value.set(wv.x * this.wind.speed * 0.25, wv.z * this.wind.speed * 0.25);
    vegUniforms.uGust.value = this.wind.gust;
    this.sky.update(this.hour, center, dt, { x: wv.x * this.wind.speed, z: wv.z * this.wind.speed }, this.weather);
    this.water.update(this.visualTime, this.sky.light);
    this.structures.update(this.hour, this.camera.position);
    this.waterfall.update(dt);

    if (this.state !== 'title') {
      this.updateCamera(dt);
      this.updateHunterModel(dt);
    } else this.posePreview(dt);
    this.weatherFx.update(dt, center); // after the camera moved: rain is camera-relative
    this._cullT = (this._cullT || 0) - dt;
    const cp = this.camera.position;
    const jumped = !this._lastCull || Math.hypot(cp.x - this._lastCull.x, cp.z - this._lastCull.z) > 30;
    if (this._cullT <= 0 || jumped) {
      this._cullT = 0.25;
      this._lastCull = { x: cp.x, z: cp.z };
      this.vegetation.cull(cp, this.scene.fog.far);
    }
    this.animals.render(dt);
    this.vehicles.render(dt);
    this.dog.render(dt);
    this.buddies.render(dt);
    this.blinds.render(this.camera.position);
    this.campfires.render(dt);
    this.fx.render(dt);
    this.weapons.render(dt);
    this.coop.render(dt);
    if (this.state !== 'title') this.social.render(dt);
    if (this.state === 'play' || this.state === 'paused') this.ui.updateHUD(dt);

    if (this.selfie) this.doSelfie();
    const r = this.renderer;
    r.info.reset();
    const post = this.post.enabled;
    if (post) this.post.begin(); else { r.setRenderTarget(null); r.clear(); }
    r.render(this.scene, this.camera);
    if (this.state !== 'title' && !this.thirdPerson && !this.player.tumble && !this.player.vehicle && !this.player.downed && !(this.danceT > 0) && this.weapons.viewmodelVisible()) {
      r.clearDepth();
      r.render(this.viewScene, this.viewCamera);
    }
    if (post) {
      const h = this.hour, night = h >= 20 || h < 5 ? 1 : h >= 18.5 ? (h - 18.5) / 1.5 : h < 6.3 ? (6.3 - h) / 1.3 : 0;
      this.post.end(Math.max(0, Math.min(1, night)));
    }
    if (this.pendingPhoto) this.capturePhoto();
  }

  snapshot() { return { profile: this.profile.toJSON() }; }

  // ---------------------------------------------------------------- debug API (tests)
  debugApi() {
    const game = this;
    return {
      get ready() { return !!game.ready; },
      game,
      debug: {
        startGame(opts = {}) { game.startPlaying(opts); },
        stepFrames(n = 1) {
          for (let i = 0; i < n; i++) { game.advance(1 / 60); game.audio.update(1 / 60); game.input.endFrame(); }
          game.render(1 / 60);
          return game.time;
        },
        renderOnce() { game.render(1 / 60); },
        /** Put the player `dist` m from the nearest animal of `species` (any if null), looking at its chest. */
        approach(species = null, dist = 25, side = 1) {
          const list = game.animals.list.filter(a => !a.harvested && (!species || a.species.id === species));
          if (!list.length) return null;
          const p = game.player;
          list.sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z));
          // broadside: stand off the animal's flank, preferring a clear line of fire
          const T = game.terrain;
          const clear = (a, px, pz) => {
            const ey = T.heightAt(px, pz) + 1.36, ty = a.pos.y + a.species.body.leg + a.species.body.h * 0.5;
            if (game.vegetation.segmentBlocked(px, ey, pz, a.pos.x, ty, a.pos.z) >= 0) return false;
            for (let i = 1; i < 16; i++) { const t = i / 16; const x = px + (a.pos.x - px) * t, z = pz + (a.pos.z - pz) * t; if (ey + (ty - ey) * t < T.heightAt(x, z) + 0.2) return false; }
            return true;
          };
          let a = list[0], px, pz;
          search: for (const c of list.slice(0, 12)) for (const sd of [side, -side]) {
            const yaw = c.facingYaw(), fx = Math.sin(yaw), fz = Math.cos(yaw);
            const x = c.pos.x + fz * dist * sd, z = c.pos.z - fx * dist * sd;
            if (px === undefined) { a = c; px = x; pz = z; }
            if (T.waterDepth(x, z) < 0.3 && clear(c, x, z)) { a = c; px = x; pz = z; break search; }
          }
          p.spawnAt(px, pz, 0);
          game.debugApi().debug.aimAtAnimal(a, 'lung');
          a.alertness = 0; a.memory.hasThreat = false;
          return { id: a.id, species: a.species.id, x: a.pos.x, z: a.pos.z };
        },
        aimAtAnimal(a, region = 'lung') {
          if (typeof a === 'string') a = game.animals.list.find(x => x.id === a);
          if (!a) return false;
          a.syncRig();
          const vol = a.volumes.find(v => v.region === region) || a.volumes[0];
          a.rig.root.updateMatrixWorld(true); // root may have moved since the last render
          const wp = new THREE.Vector3(vol.c[0], vol.c[1], vol.c[2]).applyMatrix4(a.rig.body.matrixWorld);
          const e = game.player.eyePos();
          const dx = wp.x - e.x, dy = wp.y - e.y, dz = wp.z - e.z;
          game.player.yaw = Math.atan2(-dx, -dz);
          game.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
          return true;
        },
        freeze(on = true) { game.animals.list.forEach(a => { a.frozen = on; }); },
        fire() { game.render(1 / 60); game.weapons.fire(1); },
        animals() { return game.animals.list.map(a => ({ id: a.id, sp: a.species.id, state: a.state, goal: a.goal, life: a.creature.life, blood: Math.round(a.creature.bloodVolumeMl), wounds: a.creature.wounds.length, d: +Math.hypot(a.pos.x - game.player.pos.x, a.pos.z - game.player.pos.z).toFixed(1) })).sort((x, y) => x.d - y.d).slice(0, 8); },
        harvestNearest() { const a = game.animals.nearestDowned(game.player.pos, 1e9); if (!a) return null; game.player.spawnAt(a.pos.x + 2, a.pos.z + 2, 0); game.animals.harvest(a); return a.id; },
        openMenu(n) { game.openMenu(n); },
        third(on = true) { game.thirdPerson = on; },
        selectWeapon(id) { if (!game.profile.owned.includes(id)) { game.profile.owned.push(id); game.profile.ammo[id] = 20; game.weapons.onInventoryChanged(); } game.weapons.select(id); },
        lookAt(yaw, pitch) { game.player.yaw = yaw; game.player.pitch = pitch; },
        teleport(x, z, yaw = game.player.yaw) { game.player.spawnAt(x, z, yaw); },
        setHour(h) { game.hour = h; },
        setWeather(k, instant = true) { game.weather.set(k, instant); },
        /** How strongly animal `a` would see hunter view-entry `h` right now (moving slowly). */
        seenBy(a, h) {
          const cover = h.cover !== undefined ? h.cover : h.onTower ? 0.2 : game.terrain.coverAt(h.x, h.z);
          return visualDetection(a.species, a.pos.x, a.pos.z, a.facing, h.x, h.z, 0.8, h.stance, cover, false, game.light, game.weather.visibilityMult());
        },
        press(code) { game.input.pressed.add(code); game.input.down.add(code); },
        release(code) { game.input.down.delete(code); },
        report() {
          return {
            state: game.state, time: +game.time.toFixed(2), hour: +game.hour.toFixed(2),
            player: { x: +game.player.pos.x.toFixed(1), y: +game.player.pos.y.toFixed(1), z: +game.player.pos.z.toFixed(1), hp: +game.player.hp.toFixed(1), stance: game.player.stance },
            animals: game.animals.list.length,
            vegetation: game.vegetation.instanceCount,
            clues: game.evidence.clues.length,
            drawCalls: game.renderer.info.render.calls,
            triangles: game.renderer.info.render.triangles,
          };
        },
        perf() {
          const ft = game.frameTimes;
          const avg = ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length);
          return { avgFrameMs: +(avg * 1000).toFixed(1), vegBuildMs: +game.vegetation.buildTime.toFixed(0) };
        },
      },
    };
  }
}
