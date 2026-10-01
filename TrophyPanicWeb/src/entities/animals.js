// Open-world wildlife: need zones, population streaming around the hunter,
// perception + alertness ladder (ported from Behavior.cpp), species
// behaviours including dangerous game, ballistic hit resolution against
// anatomy volumes, cartoon deaths, and harvesting.

import { THREE } from '../three.js';
import { SPECIES, SPECIES_IDS } from '../sim/species.js';
import { generateAnimal } from '../sim/generator.js';
import { instantiateCreature, applyImpact, applyBluntImpulse, stepPhysiology, totalBleedRate, findPart, Life, Mobility } from '../sim/creature.js';
import { computeTrophyScore } from '../sim/scoring.js';
import { AMMO, WEAPONS, equivalentDistanceForEnergy } from '../sim/arsenal.js';
import { visualDetection, SoundLog, SignEmitter } from '../sim/worldsim.js';
import { Rng, hash01 } from '../core/rng.js';
import { buildAnimalRig, buildHitVolumes } from './animalModels.js';
import { Biome, BIOME_NAMES, WATER_LEVEL, HALF, LAKE, POIS } from '../world/terrainData.js';
import { FEAR_R } from './campfire.js';
import { buildHat } from './hunter.js';
import { G, paint, merge, xf, toonMat } from '../render/toon.js';

// a little bindle sack full of somebody else's stuff
let _lootGeo = null;
const LOOT_GEO = () => _lootGeo || (_lootGeo = merge([
  paint(xf(G.sphere(0.09, 8, 6), [0, 0, 0], [0, 0, 0], [1, 0.85, 1]), 0xd9c79a, { bottom: 0xb8a272 }),
  paint(xf(G.cone(0.05, 0.08, 6), [0, 0.09, 0]), 0xd9c79a),
  paint(xf(G.torus(0.03, 0.008, 4, 8), [0, 0.065, 0], [Math.PI / 2, 0, 0]), 0xc0392b),
  paint(xf(G.box(0.05, 0.05, 0.005), [0, 0, 0.088]), 0xffd34a),
]));


const ACTIVE_RADIUS = 330;
const DESPAWN_RADIUS = 420;
const TARGET_GROUPS = 12;
// Need-zone schedule: every zone serves one need during one daily window.
const PERIOD_HOURS = { dawn: [5, 8.5], day: [8.5, 17.5], dusk: [17.5, 21], night: [21, 29] };
export const NEED_LABEL = { feed: 'Feeding', drink: 'Drinking', rest: 'Resting' };
export function inWindow(hour, z) {
  const h = ((hour % 24) + 24) % 24;
  return z.from <= z.to ? h >= z.from && h < z.to : h >= z.from || h < z.to;
}
const PERCEIVE = 0.1, DECIDE = 0.2;

const VOICES = { deer: 'deer', elk: 'elk', boar: 'boar', black_bear: 'growl', grizzly: 'roar', moose: 'moose', wolf: 'howl', cougar: 'cougar', turkey: 'gobble', rabbit: 'rabbit' , fox: 'yip', bison: 'moose' };

// Spawn weight per species (dangerous game rarer, but present).
const SPAWN_WEIGHT = { deer: 22, elk: 11, boar: 12, turkey: 12, rabbit: 12, black_bear: 8, wolf: 7, moose: 6, cougar: 5, grizzly: 5, fox: 9, bison: 6, skunk: 6, raccoon: 7 };

const _v = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4();

function biomeKey(b) { return BIOME_NAMES[b]; }

// ======================================================================
export class Animal {
  constructor(mgr, sp, seed, x, z, zone, group) {
    this.mgr = mgr; this.game = mgr.game;
    this.species = sp;
    this.identity = generateAnimal(sp, seed);
    this.creature = instantiateCreature(sp, this.identity.bodyMassKg / ((sp.bodyMassKg[0] + sp.bodyMassKg[1]) / 2));
    this.rng = new Rng(seed * 2654435761 + 1);
    this.pos = { x, y: this.game.terrain.heightAt(x, z), z };
    this.vel = { x: 0, z: 0 };
    this.facing = this.rng.range(0, Math.PI * 2);
    this.zone = zone; this.group = group;
    this.alertness = this.identity.alertnessBaseline01 * 15;
    this.state = 'Calm'; this.goal = 'Wander';
    this.stamina = this.identity.maxStaminaS;
    this.speed = 0;
    this.target = null;
    this.memory = { hasThreat: false, x: 0, z: 0, t: -1e9, shotT: -1e9, charges: 0, bluffed: 0 };
    this.stimuli = [];
    this.perceiveAcc = this.rng.range(0, PERCEIVE);
    this.decideAcc = this.rng.range(0, DECIDE);
    this.lastSound = this.game.time;
    this.signs = new SignEmitter(sp, seed);
    this.radius = sp.body.w * 0.55 * this.identity.scale + 0.15;
    this.alive = true;           // Active
    this.downed = false;         // Down or Dead (harvestable)
    this.harvested = false;
    this.shots = [];             // shot log for scoring
    this.firstHitPos = null;
    this.firstHitTime = -1;
    this.downTime = -1;
    this.attackCd = 0;
    this.daze = 0;
    this.grazeT = 0;
    this.headLook = 0;
    this.voiceCd = this.rng.range(8, 40);
    this.seenByPlayer = false;
    this.rig = buildAnimalRig(sp, this.identity);
    this.volumes = buildHitVolumes(sp, this.identity);
    this.game.scene.add(this.rig.root);
    this.phase = this.rng.range(0, 6);
    this.death = null;
    this.push = { x: 0, z: 0 };
  }

  get id() { return this.identity.individualId; }
  get isDangerous() { return this.species.danger >= 2; }

  dispose() {
    this.game.scene.remove(this.rig.root);
    if (this.poppedTrophy) this.game.scene.remove(this.poppedTrophy.mesh);
  }

  headWorld() {
    const h = this.rig.head;
    h.updateWorldMatrix(true, false);
    return _v.setFromMatrixPosition(h.matrixWorld).clone();
  }

  // ------------------------------------------------------------------ senses
  perceive(view) {
    const g = this.game, sp = this.species, p = g.player;
    this.stimuli.length = 0;
    const a0 = this.alertness;
    const cu0 = this.curiousAbout;
    const sweet = cu0 && cu0.cat === 'honey' && g.time - cu0.t < 40 && (sp.id.includes('bear') || sp.id === 'grizzly');
    const light = g.light ?? 1;                       // simulation-owned (time of day + cloud)
    const vis = g.weather ? g.weather.visibilityMult() : 1;
    const earMult = g.weather ? g.weather.hearingMult() : 1;
    const hunters = view.hunters;
    for (const h of hunters) {
      // nose full of something sweet: only notices hunters once it's close
      if (sweet && Math.hypot(h.x - this.pos.x, h.z - this.pos.z) > Math.max(12, sp.behavior.defensiveRadius || 0)) continue;
      const cover = h.cover !== undefined ? h.cover : h.onTower ? 0.2 : g.terrain.coverAt(h.x, h.z);
      let seen = visualDetection(sp, this.pos.x, this.pos.z, this.facing, h.x, h.z, h.speed, h.stance, cover, this.state !== 'Calm', light, vis);
      if (seen > 0.05) {
        // A tree trunk between us blocks the look.
        const blocked = g.vegetation.segmentBlocked(this.pos.x, this.pos.y + 1, this.pos.z, h.x, h.y + 1, h.z) >= 0;
        if (blocked) seen *= 0.15;
      }
      if (seen > 0.05) {
        this.stimuli.push({ kind: 'see', x: h.x, z: h.z, s: seen, who: h.id });
        this.alertness += seen * 45;
        this.setThreat(h.x, h.z, h.id);
        if (h.id === 'player' && !this.seenByPlayer) { /* noted in manager */ }
      }
    }
    for (const e of g.sounds.since(this.lastSound)) {
      if (e.tag === this.id) continue;
      const loud = SoundLog.perceived(e, this.pos.x, this.pos.y + 1, this.pos.z) * sp.senses.hearing * (e.category === 'gunshot' ? 1 : earMult);
      if (loud < 0.02) continue;
      let s = Math.min(1, Math.max(0.05, loud / 2));
      if (e.category === 'gunshot') {
        this.alertness += sp.id === 'grizzly' ? 30 : 80;
        this.memory.shotT = e.time; s = 1;
        this.setThreat(e.x, e.z, e.tag);
      } else if (e.category === 'squeak' || e.category === 'call') {
        // Novel noises make curious animals curious rather than scared.
        this.curiousAbout = { x: e.x, z: e.z, t: g.time, cat: e.category };
        this.alertness += s * 12;
      } else if (e.category === 'carcass' || e.category === 'prey' || e.category === 'honey') {
        this.curiousAbout = { x: e.x, z: e.z, t: g.time, cat: e.category };
      } else {
        this.alertness += s * 30;
        this.setThreat(e.x, e.z, e.tag);
      }
      this.stimuli.push({ kind: 'hear', x: e.x, z: e.z, s });
    }
    this.lastSound = g.time;
    // Close quarters: breathing, rustling, the smell of a nervous hunter.
    // Any animal notices someone standing right next to it; territorial
    // giants notice anyone inside their patch.
    for (const h of hunters) {
      const d = Math.hypot(h.x - this.pos.x, h.z - this.pos.z);
      const close = sp.behavior.territorial ? Math.max(10, sp.behavior.territorial * 0.8) : 9;
      if (d < close && !h.downed) {
        const k = (1 - d / close) * (h.stance === 'prone' ? 0.5 : 1);
        this.alertness += k * 14;
        if (k > 0.3) this.setThreat(h.x, h.z, h.id);
        this.stimuli.push({ kind: 'near', s: k });
      }
    }
    // smell: the scent field is wind-advected; upwind animals find nothing
    const smelled = g.scent.sample(this.pos.x, this.pos.z, 'player');
    if (smelled >= sp.senses.smell) {
      const w = g.wind.vec();
      const s = Math.min(1, Math.max(0.1, smelled * 2));
      this.stimuli.push({ kind: 'smell', s });
      this.alertness += s * 35;
      this.setThreat(this.pos.x - w.x * 30, this.pos.z - w.z * 30, 'scent');
      this.smelledT = g.time;
    }
    // a bear on the trail of something sweet is single-minded about it
    if (this.goal === 'Sneak' && g.time - this.memory.shotT > 1) this.alertness = Math.min(this.alertness, a0);
    if (sweet && this.alertness > a0) {
      this.alertness = a0 + (this.alertness - a0) * 0.3;
    }
    this.alertness = Math.min(100, Math.max(0, this.alertness));
  }

  setThreat(x, z, who) {
    this.memory.hasThreat = true;
    this.memory.x = x; this.memory.z = z; this.memory.t = this.game.time; this.memory.who = who;
  }

  threatDist() {
    return this.memory.hasThreat ? Math.hypot(this.memory.x - this.pos.x, this.memory.z - this.pos.z) : 1e9;
  }

  // ------------------------------------------------------------------ decisions
  decide(view) {
    const g = this.game, sp = this.species, B = sp.behavior, c = this.creature;
    if (c.life !== Life.Active || c.mobility === Mobility.Immobile) { this.state = 'Down'; this.goal = 'None'; this.target = null; return; }
    if (this.daze > 0) { this.goal = 'Dazed'; this.target = null; return; }
    // Raccoons: anyone standing still is a backpack with legs.
    if (sp.id === 'raccoon' && this.alive && c.wounds.length === 0) {
      const P = g.player, d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      if (this.loot) { this.alertness = Math.max(this.alertness, B.fear + 10); this.setThreat(P.pos.x, P.pos.z, 'player'); }
      else if (d < 45 && P.speed < 1.6 && !P.vehicle && !P.downed && !P.swimming && !P.onTower && g.time > (this.stealCd || 0) && this.alertness < B.fear && !g.coop.isGuest()) {
        if (d < 1.6) { this.mgr.raccoonSteal(this); return; }
        this.state = 'Curious'; this.goal = 'Sneak'; this.target = { x: P.pos.x, z: P.pos.z };
        return;
      } else if (this.goal === 'Sneak') { this.goal = 'Watch'; this.target = null; }
    }
    // Skunks don't run. They turn around.
    if (sp.id === 'skunk' && this.alive) {
      const h0 = view.nearest(this.pos);
      if (h0 && Math.hypot(h0.x - this.pos.x, h0.z - this.pos.z) < 5 && g.time > (this.sprayCd || 0)) {
        this.sprayCd = g.time + 25;
        this.state = 'Defensive'; this.goal = 'Watch'; this.target = null;
        this.setFacingYaw(Math.atan2(this.pos.x - h0.x, this.pos.z - h0.z));
        this.mgr.skunkSpray(this, h0);
        return;
      }
    }

    const wounded = c.wounds.length > 0;
    const td = this.threatDist();
    const nearestHunter = view.nearest(this.pos);
    const hd = nearestHunter ? Math.hypot(nearestHunter.x - this.pos.x, nearestHunter.z - this.pos.z) : 1e9;
    const fresh = g.time - this.memory.t < 25;

    const flee = () => {
      this.state = 'Fleeing'; this.goal = 'Flee';
      let ax = this.pos.x - this.memory.x, az = this.pos.z - this.memory.z;
      const l = Math.hypot(ax, az) || 1;
      ax /= l; az /= l;
      const j = this.rng.range(-0.5, 0.5);
      const cx = ax * Math.cos(j) - az * Math.sin(j), cz = ax * Math.sin(j) + az * Math.cos(j);
      const dist = sp.id === 'elk' ? 180 : 110;
      this.target = this.safeTarget(this.pos.x + cx * dist, this.pos.z + cz * dist);
      if (B.zigzag) this.zig = 1;
    };
    // Bear-sprayed: nothing on its mind but getting away and rubbing its face.
    if (g.time < (this.sprayedUntil || 0)) { this.alertness = 100; flee(); return; }
    const charge = (who) => {
      if (g.time < (this.retreatUntil || 0)) { flee(); return; }
      const h0 = who || nearestHunter;
      // Playing dead works on bears: a still, prone hunter is not a threat.
      if (sp.id.includes('bear') || sp.id === 'grizzly') {
        if (h0 && h0.stance === 'prone' && h0.speed < 0.25 && !wounded && this.memory.charges > 0) {
          this.alertness = 30; this.state = 'Curious'; this.goal = 'Watch'; this.target = null;
          if (!this.playedDeadNotice) { this.playedDeadNotice = true; this.mgr.announce(this, 'playdead'); }
          return;
        }
      }
      if (this.state !== 'Aggressive') {
        this.attacksLeft = ({ boar: 2, moose: 2, black_bear: 2, grizzly: 2, wolf: 1, cougar: 2 })[sp.id] || 2;
        this.memory.charges++;
        g.audio.play(VOICES[sp.id] === 'howl' ? 'growl' : VOICES[sp.id] === 'gobble' ? 'gobble' : sp.id === 'boar' ? 'squeal' : VOICES[sp.id], this.pos);
        this.mgr.announce(this, 'charge');
      }
      this.state = 'Aggressive'; this.goal = 'Charge';
      const h = who || nearestHunter;
      this.target = h ? { x: h.x, z: h.z } : { x: this.memory.x, z: this.memory.z };
      this.chaseId = h ? h.id : null;
    };

    // ---- campfires: wolves, cougars and foxes won't step into the firelight;
    // they pace around the edge of it instead (eyes in the dark)
    if ((B.predator || sp.id === 'fox') && !sp.id.includes('bear') && sp.id !== 'grizzly' && g.campfires) {
      const f = g.campfires.near(this.pos.x, this.pos.z, FEAR_R);
      if (f) {
        const ang = Math.atan2(this.pos.z - f.z, this.pos.x - f.x) + 0.5;
        this.state = 'Stalking'; this.goal = 'Circle';
        this.target = { x: f.x + Math.cos(ang) * (FEAR_R + 4), z: f.z + Math.sin(ang) * (FEAR_R + 4) };
        return;
      }
    }

    // ---- predators hunting the hunter -----------------------------------
    if (B.predator && !wounded && nearestHunter) {
      const bold = g.period === 'night' || g.period === 'dusk' || nearestHunter.bleeding > 0 || this.identity.temperament === 'Ornery' || this.called;
      if (B.stalker) {
        // Cougar: shadow the hunter from behind, pounce when they look away.
        if ((bold || this.called) && hd < 90 && this.alertness < 90) {
          const hFwd = nearestHunter.fwd;
          const toMeX = (this.pos.x - nearestHunter.x) / Math.max(1, hd), toMeZ = (this.pos.z - nearestHunter.z) / Math.max(1, hd);
          const watched = hFwd.x * toMeX + hFwd.z * toMeZ > 0.85 && hd < 45;
          if (watched && this.state === 'Stalking' && this.rng.chance(0.25)) { this.alertness += 25; flee(); this.mgr.announce(this, 'staredown'); return; }
          if (hd < 11 && !watched) { charge(nearestHunter); return; }
          this.state = 'Stalking'; this.goal = 'Stalk';
          const behindX = nearestHunter.x - hFwd.x * 14, behindZ = nearestHunter.z - hFwd.z * 14;
          this.target = hd > 20 ? { x: behindX, z: behindZ } : { x: nearestHunter.x, z: nearestHunter.z };
          return;
        }
      } else {
        // Wolves: pack circles and closes when bold; scatter from gunfire.
        const packBold = bold && g.time - this.memory.shotT > 20;
        if (packBold && hd < 110) {
          if (this.state === 'Stalking' && hd < 30) this.rushT = (this.rushT || this.rng.range(4, 9)) - DECIDE;
          if (hd < 7 || (this.state === 'Aggressive' && hd < 20) || (this.rushT !== undefined && this.rushT <= 0)) { this.rushT = undefined; charge(nearestHunter); return; }
          this.state = 'Stalking'; this.goal = 'Circle';
          const ang = Math.atan2(this.pos.z - nearestHunter.z, this.pos.x - nearestHunter.x) + 0.35;
          const r = Math.max(9, hd - 3);
          this.target = { x: nearestHunter.x + Math.cos(ang) * r, z: nearestHunter.z + Math.sin(ang) * r };
          return;
        }
      }
    }

    if (wounded) {
      const lost = 1 - c.bloodVolumeMl / c.maxBloodVolumeMl;
      if (B.wounded === 'flee_circle_charge' && td < B.defensiveRadius && fresh) { charge(); return; }
      if (B.wounded === 'defensive' && hd < B.defensiveRadius * 1.5) { charge(nearestHunter); return; }
      const exhausted = this.stamina <= 1;
      if (lost > 0.22 || c.consciousness < 55 || exhausted) {
        this.state = 'Alert'; this.goal = 'Bed'; this.target = null;
        if (hd < 15) flee();
        return;
      }
      flee();
      return;
    }

    // ---- dangerous game: territorial / defensive ---------------------------
    // In a group only the leader (or a cornered animal) stands its ground;
    // the rest of the sounder/herd scatters.
    const mayConfront = !this.group || this.group.leader === this || hd < 6;
    // Bold or ornery tom turkeys take it personally when you get close: ankle pecks.
    if (sp.id === 'turkey' && this.identity.sex === 'Male' && (this.identity.temperament === 'Ornery' || this.identity.temperament === 'Bold')
        && nearestHunter && hd < 9 && !wounded && g.time > (this.peckCd || 0)) {
      this.peckCd = g.time + 45;
      charge(nearestHunter); return;
    }
    if (B.territorial && hd < B.territorial && this.alertness > 20 && nearestHunter && mayConfront) { charge(nearestHunter); return; }
    if (this.alertness >= B.aggression && hd < B.defensiveRadius && nearestHunter && mayConfront) {
      // Black bears bluff first: a charge that stops short, a huff, then a real one.
      if (sp.id === 'black_bear' && this.memory.bluffed < 1 && this.identity.temperament !== 'Ornery') {
        this.memory.bluffed++; this.bluffUntil = g.time + 2.5; charge(nearestHunter); this.bluff = true; return;
      }
      charge(nearestHunter); return;
    }

    // a bear that smells something sweet shrugs off mild suspicion (not gunshots)
    const sweetTooth = (sp.id.includes('bear') || sp.id === 'grizzly') && this.curiousAbout && this.curiousAbout.cat === 'honey' && g.time - this.curiousAbout.t < 40 && g.time - this.memory.shotT > 30;
    const fear = B.fear + (sweetTooth ? 35 : 0);
    if (this.alertness >= fear) {
      if (B.defensiveRadius > 0 && hd < B.defensiveRadius && (this.identity.temperament === 'Bold' || this.identity.temperament === 'Ornery')) {
        this.state = 'Defensive'; this.goal = 'Watch'; this.target = null; this.lookAt(this.memory.x, this.memory.z); return;
      }
      flee(); return;
    }
    if (this.alertness >= fear * 0.66 && !sweetTooth) {
      this.state = 'Suspicious'; this.goal = 'Watch'; this.target = null;
      if (this.memory.hasThreat) this.lookAt(this.memory.x, this.memory.z);
      return;
    }
    // a honey lure nearby: sweet-toothed animals settle in for a long snack
    const sweet = sp.id.includes('bear') || sp.id === 'grizzly' || sp.id === 'boar';
    if (sweet) {
      const lure = this.mgr.lures.find(l => g.time < l.until && Math.hypot(l.x - this.pos.x, l.z - this.pos.z) < 3.5);
      if (lure) { this.state = 'Calm'; this.goal = 'Graze'; this.target = null; this.grazeT = 3; if (!lure.found) { lure.found = true; this.mgr.announce(this, lure.kind === 'marsh' ? 'marsh' : 'honey', lure); } return; }
    }
    // curiosity: calls, squeaks, carcasses, honey
    if (this.curiousAbout && g.time - this.curiousAbout.t < 40) {
      const cu = this.curiousAbout;
      const wants = cu.cat === 'squeak' ? B.curiosity > 0.4 : cu.cat === 'call' ? this.respondsToCall : cu.cat === 'carcass' ? (sp.id.includes('bear') || B.predator) : cu.cat === 'honey' ? sweet : false;
      if (wants && Math.hypot(cu.x - this.pos.x, cu.z - this.pos.z) > 6) {
        this.state = 'Curious'; this.goal = 'Investigate';
        this.target = cu.cat === 'honey' ? { x: cu.x, z: cu.z } : { x: cu.x + this.rng.range(-4, 4), z: cu.z + this.rng.range(-4, 4) };
        return;
      }
    }
    if (this.alertness >= fear * 0.33 && !sweetTooth) {
      this.state = 'Curious'; this.goal = 'Watch'; this.target = null;
      if (this.memory.hasThreat) this.lookAt(this.memory.x, this.memory.z);
      return;
    }

    // ---- calm routine: graze / drink / bed around the need zone ------------
    this.state = 'Calm';
    const leader = this.group && this.group.leader !== this && this.group.leader.alive ? this.group.leader : null;
    if (leader) {
      this.goal = leader.goal === 'Graze' ? 'Graze' : 'Follow';
      const off = this.groupOffset || (this.groupOffset = { x: this.rng.range(-7, 7), z: this.rng.range(-7, 7) });
      const tx = leader.pos.x + off.x, tz = leader.pos.z + off.z;
      this.target = Math.hypot(tx - this.pos.x, tz - this.pos.z) > 3 ? { x: tx, z: tz } : null;
      if (!this.target && leader.goal === 'Rest') this.goal = 'Rest';
      else if (!this.target) this.grazeT = 1;
      return;
    }
    const z0 = this.zone;
    if (this.travelling) {
      const d = Math.hypot(z0.x - this.pos.x, z0.z - this.pos.z);
      if (d > z0.r * 0.8) { this.goal = 'Travel'; if (!this.target) this.target = this.safeTarget(z0.x, z0.z); return; }
      this.travelling = false; this.target = null;
    }
    if (z0.need === 'rest' && inWindow(this.game.hour, z0)) {
      // bedded down: mostly still, the odd shuffle
      this.goal = 'Rest';
      if (!this.target && this.rng.chance(0.01)) { const a = this.rng.range(0, 6.28), d = this.rng.range(2, z0.r * 0.5); this.target = this.safeTarget(z0.x + Math.cos(a) * d, z0.z + Math.sin(a) * d); this.goal = 'Graze'; }
      return;
    }
    if (!this.target || this.rng.chance(0.03)) {
      const z = this.zone;
      const r = this.rng.chance(z.need === 'drink' && inWindow(this.game.hour, z) ? 0.5 : 0.15) ? 'drink' : 'graze';
      if (r === 'drink' && z.water) { this.goal = 'Drink'; this.target = { x: z.water.x + this.rng.range(-3, 3), z: z.water.z + this.rng.range(-3, 3) }; }
      else {
        this.goal = 'Graze';
        const a = this.rng.range(0, 6.28), d = this.rng.range(4, z.r);
        this.target = this.safeTarget(z.x + Math.cos(a) * d, z.z + Math.sin(a) * d);
      }
    }
  }

  safeTarget(x, z) {
    const T = this.game.terrain;
    x = Math.max(-HALF + 30, Math.min(HALF - 30, x));
    z = Math.max(-HALF + 30, Math.min(HALF - 30, z));
    // Avoid lakes for everything but moose (who love a swim).
    if (this.species.id !== 'moose' && T.waterDepth(x, z) > 0.8) {
      const dx = x - LAKE.x, dz = z - LAKE.z; const l = Math.hypot(dx, dz) || 1;
      x = LAKE.x + dx / l * (LAKE.r + 40); z = LAKE.z + dz / l * (LAKE.r + 40);
    }
    return { x, z };
  }

  lookAt(x, z) { this.lookTarget = { x, z }; }

  maxSpeed() {
    const sp = this.species, c = this.creature, m = sp.movement;
    let intent = 0;
    switch (this.goal) {
      case 'Flee': intent = m.run; break;
      case 'Charge': intent = m.run * (this.bluff ? 0.8 : 1); break;
      case 'Stalk': intent = this.threatDist() < 25 ? m.walk * 0.9 : m.trot; break;
      case 'Circle': intent = m.trot; break;
      case 'Investigate': case 'Drink': intent = m.walk; break;
      case 'Sneak': intent = m.walk * 1.4; break;
      case 'Follow': intent = m.walk * 1.2; break;
      case 'Travel': intent = Math.max(m.walk, m.trot * 0.75); break; // game-time is compressed: commute at a trot
      case 'Graze': case 'Wander': intent = m.walk * 0.55; break;
      default: return 0;
    }
    let cap = intent;
    if (c.mobility === Mobility.Impaired) cap = Math.min(cap, m.trot);
    if (c.mobility === Mobility.Limping) cap = Math.min(cap, m.trot * 0.5);
    if (c.mobility === Mobility.Crawling) cap = Math.min(cap, m.walk * 0.35);
    cap *= 1 - Math.min(0.6, Math.max(0, c.oxygenPenalty / 80));
    if (this.stamina <= 0) cap = Math.min(cap, m.trot * 0.8);
    return cap;
  }

  // ------------------------------------------------------------------ tick
  step(dt, view) {
    const g = this.game, T = g.terrain, c = this.creature;
    if (this.harvested) return;
    if (this.frozen && c.life === Life.Active && !c.wounds.length) return; // test hook

    if (this.alive) {
      this.perceiveAcc += dt;
      while (this.perceiveAcc >= PERCEIVE) {
        this.perceiveAcc -= PERCEIVE;
        if (c.life === Life.Active) this.perceive(view);
        if (!this.stimuli.length) this.alertness = Math.max(0, this.alertness - 3 * PERCEIVE);
      }
      this.decideAcc += dt;
      while (this.decideAcc >= DECIDE) { this.decideAcc -= DECIDE; this.decide(view); }
      if (this.chaseId && this.goal === 'Charge') {
        const h = view.byId(this.chaseId);
        if (h) this.target = { x: h.x, z: h.z };
      }
      if (this.bluff && g.time > this.bluffUntil) { this.bluff = false; this.goal = 'Watch'; this.state = 'Defensive'; this.target = null; this.alertness = Math.max(0, this.alertness - 30); g.audio.play('growl', this.pos); }
    }
    if (this.daze > 0) this.daze -= dt;
    if (this.loot && (!this.alive || this.downed || this.daze > 0 || c.wounds.length)) this.mgr.dropLoot(this);

    // movement
    let speed = 0;
    if (this.alive && this.target && c.life === Life.Active) {
      let dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const stop = this.goal === 'Charge' ? 0.9 : 1.2;
      if (dist > stop) {
        if (this.bluff && dist < 6) { this.bluffUntil = Math.min(this.bluffUntil, g.time); }
        const terrainCost = T.costAt(this.pos.x, this.pos.z);
        speed = this.maxSpeed() / Math.max(1, terrainCost * (this.species.id === 'moose' ? 0.45 : 0.7));
        dx /= dist; dz /= dist;
        if (this.zig && this.goal === 'Flee') { const zz = Math.sin(g.time * 5 + this.phase) * 0.9; const tx = dx, tz = dz; dx = tx - tz * zz; dz = tz + tx * zz; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
        // Steep uphill is slow; nobody sprints up a cliff forever.
        const ahead = T.heightAt(this.pos.x + dx * 2, this.pos.z + dz * 2) - T.heightAt(this.pos.x, this.pos.z);
        if (ahead > 1.2) speed *= Math.max(0.35, 1 - (ahead - 1.2) * 0.3);
        // turn smoothly
        const want = Math.atan2(dx, dz);
        let diff = want - this.facingYaw();
        while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
        const turnRate = this.goal === 'Charge' || this.goal === 'Flee' ? 6 : 3;
        const newYaw = this.facingYaw() + Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
        this.setFacingYaw(newYaw);
        const mx = Math.sin(newYaw), mz = Math.cos(newYaw);
        this.pos.x += mx * speed * dt; this.pos.z += mz * speed * dt;
      } else if (this.goal === 'Graze' || this.goal === 'Drink' || this.goal === 'Follow' || this.goal === 'Travel') {
        this.target = null; this.grazeT = this.rng.range(3, 9);
      }
    }
    // external pushes (leaf blower, hits)
    if (this.push.x || this.push.z) {
      this.pos.x += this.push.x * dt; this.pos.z += this.push.z * dt;
      this.push.x *= Math.pow(0.05, dt); this.push.z *= Math.pow(0.05, dt);
      if (Math.abs(this.push.x) + Math.abs(this.push.z) < 0.05) this.push.x = this.push.z = 0;
    }
    if (this.grazeT > 0) this.grazeT -= dt;
    this.collide();
    this.pos.y = T.heightAt(this.pos.x, this.pos.z);
    if (this.species.id === 'moose' || this.species.id.includes('bear')) this.pos.y = Math.max(this.pos.y, WATER_LEVEL - 1.1);
    this.speed = speed;

    if (speed > this.species.movement.trot) this.stamina = Math.max(0, this.stamina - dt);
    else if (speed < this.species.movement.walk) this.stamina = Math.min(this.identity.maxStaminaS, this.stamina + dt * 0.5);

    // physiology & evidence (the body is authoritative)
    const lifeBefore = c.life;
    stepPhysiology(c, dt);
    if (lifeBefore === Life.Active && c.life !== Life.Active) this.onIncapacitated();
    this.signs.update(g.evidence, c, this.pos.x, this.pos.y, this.pos.z, g.time, dt, speed > 0.05, this.id);
    if (totalBleedRate(c) > 0 && this.rng.chance(dt * 0.5)) g.scent.emit(this.pos.x, this.pos.z, 1 + totalBleedRate(c) / 25, 'blood', g.time);

    // attacks
    if (this.alive && this.goal === 'Charge' && !this.bluff) {
      this.attackCd -= dt;
      const atk = this.species.attack;
      if (atk && this.attackCd <= 0) {
        for (const h of view.hunters) {
          const d = Math.hypot(h.x - this.pos.x, h.z - this.pos.z);
          if (d < atk.reach * this.identity.scale + 0.4 && Math.abs(h.y - this.pos.y) < 2.5) {
            this.attackCd = atk.cooldown;
            const k = atk.knock * (0.8 + this.identity.scale * 0.3);
            const nx = (h.x - this.pos.x) / Math.max(0.1, d), nz = (h.z - this.pos.z) / Math.max(0.1, d);
            if (h.invulnerable) { this.attackCd = 0.4; break; }
            view.hitHunter(h, { blunt: atk.blunt * this.identity.scale, cut: atk.cut, knock: { x: nx * k, y: 3 + k * 0.3, z: nz * k }, source: atk.name });
            g.audio.play(this.species.id.includes('bear') || this.species.id === 'grizzly' ? 'growl' : 'thwack', this.pos);
            this.lungeT = 0.3;
            // Hit-and-run: once the attack budget is spent the animal breaks
            // off and will not re-engage for a while (unless shot again).
            this.attacksLeft = (this.attacksLeft || 1) - 1;
            const playingDead = h.stance === 'prone' && h.speed < 0.25 && (this.species.id.includes('bear') || this.species.id === 'grizzly');
            if (this.attacksLeft <= 0 || playingDead) {
              this.retreatUntil = g.time + (this.species.behavior.predator ? 12 : 25);
              this.alertness = 70; this.goal = 'Flee'; this.state = 'Fleeing'; this.chaseId = null;
              this.target = this.safeTarget(this.pos.x - nx * 45, this.pos.z - nz * 45);
            }
            break;
          }
        }
      }
    }

    // splashing through shallows (presentation)
    if (this.speed > 2.2) {
      const depth = WATER_LEVEL - g.terrain.heightAt(this.pos.x, this.pos.z);
      if (depth > 0.05) {
        this.splashAcc = (this.splashAcc || 0) + dt * this.speed;
        if (this.splashAcc > 1.4) {
          this.splashAcc = 0;
          const k = Math.min(2.5, this.identity.bodyMassKg / 120 + 0.5);
          g.fx.burst(this.pos.x, WATER_LEVEL + 0.1, this.pos.z, { count: Math.round(5 + k * 5), color: 0xd8f6ff, speed: 2 + k, up: 2.5 + k * 1.5, kind: 'water', size: 0.06 + k * 0.03 });
          if (k > 1) g.audio.play('splash', this.pos);
        }
      }
    }
    // voices
    if (this.alive) {
      this.voiceCd -= dt;
      if (this.voiceCd <= 0) {
        this.voiceCd = this.rng.range(20, 70);
        const dPlayer = Math.hypot(g.player.pos.x - this.pos.x, g.player.pos.z - this.pos.z);
        const vocal = this.species.id === 'elk' ? g.period !== 'day' : this.species.id === 'wolf' ? g.period === 'night' || g.period === 'dusk' : this.species.id === 'turkey' || this.species.id === 'deer' || (this.species.id === 'fox' && g.period === 'night');
        if (vocal && dPlayer < 450 && (!this.group || this.group.leader === this)) {
          g.audio.play(VOICES[this.species.id], this.pos);
          g.sounds.emit('animal', this.pos.x, this.pos.y + 1, this.pos.z, 300, g.time, this.id);
        }
      }
    }

    if (this.death) this.stepDeath(dt);
  }

  facingYaw() { return this._yaw ?? (this._yaw = Math.PI / 2 - this.facing); }
  setFacingYaw(y) { this._yaw = y; this.facing = Math.PI / 2 - y; }

  collide() {
    const g = this.game;
    for (const o of g.vegetation.query(this.pos.x, this.pos.z, 3, this._q || (this._q = []))) {
      if (o.soft) continue;
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const d = Math.hypot(dx, dz), min = o.r + this.radius;
      if (d < min && d > 1e-5) { this.pos.x += dx / d * (min - d); this.pos.z += dz / d * (min - d); }
    }
  }

  onIncapacitated() {
    const g = this.game;
    this.alive = false;
    this.downed = true;
    this.downTime = g.time;
    this.state = 'Down'; this.goal = 'None';
    const tumble = Math.min(1, this.speed / 8);
    this.death = { t: 0, side: this.rng.chance(0.5) ? 1 : -1, spin: tumble * 4, vy: 1 + tumble * 3, y: 0, roll: 0 };
    this.death.legsUp = this.rng.chance(0.35); // classic cartoon: flat on its back, legs in the air
    this.rig.eyes.visible = false; this.rig.deadEyes.visible = true; this.rig.tongue.visible = true; this.rig.brows.visible = false; this.rig.snarl.visible = false;
    g.audio.play(this.species.id === 'turkey' ? 'gobble' : this.species.id === 'boar' ? 'squeal' : 'boing', this.pos);
    g.sounds.emit('carcass', this.pos.x, this.pos.y + 0.5, this.pos.z, 200, g.time, this.id);
    g.scent.emit(this.pos.x, this.pos.z, 3, 'carcass', g.time);
    if (this.firstHitTime >= 0) {
      g.fx.ghost(this.pos.x, this.pos.y + this.species.body.leg + this.species.body.h, this.pos.z, this.species.look.coat, 0.6 + this.identity.scale * 0.4);
    }
    this.mgr.onDown(this);
  }

  stepDeath(dt) {
    const d = this.death;
    d.t += dt;
    // A comic topple: the body rolls onto its side with a small bounce.
    d.roll = Math.min(d.legsUp ? Math.PI : Math.PI / 2, d.roll + dt * (3 + d.spin));
    d.vy -= 12 * dt;
    d.y = Math.max(0, d.y + d.vy * dt);
    if (d.y === 0 && d.vy < 0) d.vy = Math.abs(d.vy) > 2 ? -d.vy * 0.3 : 0;
  }

  // ------------------------------------------------------------------ render
  syncRig() {
    const r = this.rig;
    r.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    r.root.rotation.set(0, this.facingYaw(), 0);
    if (this.death) {
      // Roll about the torso centre (not the ground point) and settle it at
      // lying-down height, so the body topples in place.
      const B = this.species.body;
      const c = B.leg + B.h / 2;
      const roll = this.death.roll;
      const k = Math.min(1, roll / (Math.PI / 2));
      const phi = this.death.side * roll;
      let yTarget = c + (B.w * 0.5 - c) * k + this.death.y;
      if (roll > Math.PI / 2) yTarget = B.w * 0.5 + (B.h * 0.52 - B.w * 0.5) * ((roll - Math.PI / 2) / (Math.PI / 2)) + this.death.y;
      r.body.rotation.z = phi;
      r.body.position.set(c * Math.sin(phi), yTarget - c * Math.cos(phi), 0);
    }
  }

  render(dt) {
    const r = this.rig;
    this.syncRig();
    const yaw = this.facingYaw();
    const sp = this.species, B = sp.body;
    if (this.death) {
      if (this.death.legsUp) {
        // stiff legs to the sky, with the odd comedic twitch
        const t = this.game.visualTime, tw = (t % 4.5) < 0.35 ? Math.sin(t * 40) * 0.25 : 0;
        r.legs.forEach((l, i) => { l.rotation.x = (i < 2 ? 0.12 : -0.12) + (i % 2 ? tw : -tw); l.rotation.z = 0; });
      } else r.legs.forEach((l, i) => { l.rotation.x = (i % 2 ? 0.5 : -0.5) * Math.min(1, this.death.roll / 1.57); });
      r.head.rotation.set(0.3, 0, this.death.side * 0.3);
      if (r.tail) r.tail.rotation.set(0, 0, 0);
      return;
    }
    // walk cycle
    const spd = this.speed;
    this.phase += dt * (1.5 + spd * 3.2 / Math.max(0.6, B.leg));
    const amp = Math.min(0.9, spd / (sp.movement.trot + 0.1) * 0.55 + (spd > 0.05 ? 0.15 : 0));
    const limp = this.creature.mobility === Mobility.Limping;
    r.legs.forEach((l, i) => {
      const ph = (i === 0 || i === 3) ? 0 : Math.PI;
      l.rotation.x = Math.sin(this.phase + ph) * amp;
      if (limp && i === 0) l.rotation.x = 0.5;
    });
    const bob = Math.abs(Math.sin(this.phase)) * amp * 0.06 * B.leg;
    const bedT = this.goal === 'Rest' && this.speed < 0.1 ? 1 : 0;
    this.bed = (this.bed || 0) + (bedT - (this.bed || 0)) * Math.min(1, dt * 1.5);
    if (this.bed > 0.01) r.legs.forEach((l, i) => { l.rotation.x = (i < 2 ? 1.45 : -1.45) * this.bed; }); // tucked under the belly
    r.body.position.y = bob + (this.lungeT > 0 ? 0.15 : 0) - this.bed * B.leg * 0.62;
    r.body.rotation.x = this.goal === 'Charge' ? 0.12 : this.lungeT > 0 ? -0.25 : 0;
    r.body.rotation.z = limp ? Math.sin(this.phase) * 0.1 : 0;
    if (this.lungeT > 0) this.lungeT -= dt;
    // head: graze down, alert up and toward the threat
    let hx = 0, hy = 0;
    if (this.grazeT > 0 && this.state === 'Calm') hx = 0.85 + Math.sin(this.phase * 0.7) * 0.1;
    else if (this.lookTarget && (this.state === 'Suspicious' || this.state === 'Curious' || this.state === 'Defensive')) {
      const want = Math.atan2(this.lookTarget.x - this.pos.x, this.lookTarget.z - this.pos.z) - yaw;
      let d = want; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      hy = Math.max(-1.1, Math.min(1.1, d)); hx = -0.2;
    }
    this.headLook += (hy - this.headLook) * Math.min(1, dt * 5);
    r.head.rotation.set(r.head.rotation.x + (hx - r.head.rotation.x) * Math.min(1, dt * 4), this.headLook, 0);
    if (this.daze > 0) r.head.rotation.z = Math.sin(this.game.visualTime * 8) * 0.3;
    else r.head.rotation.z = 0;
    if (r.tail) r.tail.rotation.y = Math.sin(this.game.visualTime * (this.state === 'Calm' ? 3 : 12) + this.phase) * 0.25;
    // Cartoon acting (render-only, no sim randomness): blinks, angry brows,
    // and a little squash-and-stretch bounce in the stride.
    const vt = this.game.visualTime + (this.identity.seed % 997) * 0.37;
    const period = 2.6 + (this.identity.seed % 5) * 0.55;
    const blink = (vt % period) < 0.11;
    r.eyes.scale.y = blink ? 0.12 : 1;
    r.brows.visible = this.goal === 'Charge' || this.state === 'Aggressive' || this.state === 'Stalking';
    r.snarl.visible = (this.goal === 'Charge' && !this.bluff) || (this.state === 'Aggressive' && this.species.danger >= 2) || this.lungeT > 0;
    if (this.identity.legendary) {
      this.sparkT = (this.sparkT || 0) - dt;
      if (this.sparkT <= 0) { this.sparkT = 0.25; const hp = this.rig.headPos; const k = this.identity.scale; this.game.fx.burst(this.pos.x, this.pos.y + (hp.y + 0.5) * k, this.pos.z, { count: 1, color: 0xffe066, speed: 0.6, up: 0.6, kind: 'ember', size: 0.07 }); }
    }
    const sq = Math.sin(this.phase * 2) * amp * 0.05;
    r.torso.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
  }

  // ------------------------------------------------------------------ ballistics
  /** Ray/segment test against hit volumes. Returns sorted hits [{t, region, local}] */
  raycastVolumes(ox, oy, oz, dx, dy, dz, maxT) {
    const r = this.rig.root;
    this.syncRig();
    r.updateMatrixWorld(true);
    // Transform ray into rig-local (unscaled) space via the body group.
    const body = this.rig.body;
    body.updateMatrixWorld(true);
    _m.copy(body.matrixWorld).invert();
    _o.set(ox, oy, oz).applyMatrix4(_m);
    _d.set(dx, dy, dz).transformDirection(_m);
    const scale = this.identity.scale;
    const hits = [];
    for (const vol of this.volumes) {
      const cx = vol.c[0], cy = vol.c[1], cz = vol.c[2], rad = vol.r;
      const lx = _o.x - cx, ly = _o.y - cy, lz = _o.z - cz;
      const b = lx * _d.x + ly * _d.y + lz * _d.z;
      const cc = lx * lx + ly * ly + lz * lz - rad * rad;
      const disc = b * b - cc;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      const t0 = -b - sq, t1 = -b + sq;
      const tl = t0 >= 0 ? t0 : (t1 >= 0 ? 0 : -1);
      if (tl < 0) continue;
      const tWorld = tl * scale;
      if (tWorld > maxT) continue;
      const ex = _o.x + _d.x * tl, ey = _o.y + _d.y * tl, ez = _o.z + _d.z * tl;
      hits.push({ t: tWorld, region: vol.region, local: { x: ex, y: ey, z: ez }, normalDot: Math.abs((ex - cx) * _d.x + (ey - cy) * _d.y + (ez - cz) * _d.z) / rad });
    }
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }
}

// ======================================================================
export class AnimalManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.groups = [];
    this.sightings = [];
    this.spawnCounter = 0;
    this.zones = this.buildZones();
    this.lures = [];
    const known = (game.profile && game.profile.zones) || [];
    for (const z of this.zones) if (known.includes(z.id)) z.discovered = true;
    this.popAcc = 0;
    this.view = this.makeView();
  }

  buildZones() {
    // Need zones: seeded places per species (feeding/bedding with nearest water).
    const T = this.game.terrain;
    const zones = [];
    for (const id of SPECIES_IDS) {
      const sp = SPECIES[id];
      const rng = new Rng(hash01(99, id.length, id.charCodeAt(0), 3) * 1e9 >>> 0);
      let made = 0, guard = 0;
      const want = 10;
      while (made < want && guard++ < 800) {
        const x = rng.range(-HALF + 50, HALF - 50), z = rng.range(-HALF + 50, HALF - 50);
        const b = biomeKey(T.biomeAt(x, z));
        const w = sp.habitat[b] || 0;
        if (w <= 0 || !rng.chance(w / 4)) continue;
        if (POIS.some(p => Math.hypot(p.x - x, p.z - z) < p.r + 60)) continue;
        const water = this.nearestWater(x, z);
        let need = ['feed', 'feed', 'feed', 'feed', 'drink', 'drink', 'drink', 'rest', 'rest', 'rest'][made];
        let zx = x, zz = z;
        if (need === 'drink') {
          if (!water) need = 'feed';
          else { const dx = x - water.x, dz = z - water.z, l = Math.hypot(dx, dz) || 1; zx = water.x + dx / l * 10; zz = water.z + dz / l * 10; }
        }
        // window: feeding in the species' active periods, drinking mid-day or dusk, resting when inactive
        const act = sp.activity;
        const inactive = ['dawn', 'day', 'dusk', 'night'].filter(p => !act.includes(p));
        const period = need === 'feed' ? rng.pick(act) : need === 'drink' ? rng.pick(act.includes('day') ? ['day', 'dusk'] : act) : rng.pick(inactive.length ? inactive : ['day']);
        const [p0, p1] = PERIOD_HOURS[period];
        const len = Math.min(p1 - p0, need === 'rest' ? 5 : 3.5);
        const from = rng.range(p0, p1 - len);
        zones.push({ species: id, x: zx, z: zz, r: 22 + rng.range(0, 18), water, discovered: false, need, from: from % 24, to: (from + len) % 24, id: `${id}:${made}` });
        made++;
      }
    }
    return zones;
  }

  nearestWater(x, z) {
    const T = this.game.terrain;
    let best = null, bd = 1e9;
    for (let a = 0; a < 16; a++) for (let d = 20; d <= 200; d += 20) {
      const px = x + Math.cos(a / 16 * 6.28) * d, pz = z + Math.sin(a / 16 * 6.28) * d;
      if (T.waterDepth(px, pz) > 0.2 && d < bd) { bd = d; best = { x: px, z: pz }; break; }
    }
    return best;
  }

  makeView() {
    const g = this.game, mgr = this;
    // Everything an animal may sense about hunters this tick (local + co-op).
    return {
      hunters: [],
      nearest(pos) {
        let best = null, bd = 1e9;
        for (const h of this.hunters) { const d = Math.hypot(h.x - pos.x, h.z - pos.z); if (d < bd && !h.downed) { bd = d; best = h; } }
        return best;
      },
      byId(id) { return this.hunters.find(h => h.id === id) || null; },
      hitHunter(h, hit) {
        if (h.id === 'player') g.player.hurt(hit);
        else g.coop.hurtRemote(h.id, hit);
      },
      refresh() {
        const p = g.player;
        const f = p.forward();
        this.hunters.length = 0;
        if (!p.downed && g.state !== 'title') this.hunters.push({ id: 'player', x: p.pos.x, y: p.pos.y, z: p.pos.z, speed: p.speed, stance: p.stance, onTower: !!p.onTower, bleeding: p.bleed, fwd: { x: f.x, z: f.z }, downed: p.downed, invulnerable: p.invuln > 0 });
        for (const r of g.coop.remoteHunters()) this.hunters.push(r);
        for (const h of this.hunters) h.cover = g.blinds && g.blinds.inside(h.x, h.z) ? 0.93 : undefined;
      },
    };
  }

  populateAround(pos, immediate = false) {
    if (this.game.coop.isGuest()) return; // hosts own the wildlife in co-op
    const want = TARGET_GROUPS;
    let groups = this.groups.filter(gp => gp.members.some(m => !m.harvested)).length;
    let tries = immediate ? 30 : 2;
    while (groups < want && tries-- > 0) {
      if (this.spawnGroup(pos)) groups++;
    }
  }

  spawnGroup(pos) {
    const g = this.game, T = g.terrain;
    const rng = new Rng((g.sessionSeed ^ (this.spawnCounter * 7919)) >>> 0);
    this.spawnCounter++;
    const period = g.sky ? g.period : 'day';
    // choose species weighted by spawn weight and time-of-day activity
    const items = SPECIES_IDS.map(id => ({ v: id, w: SPAWN_WEIGHT[id] * (SPECIES[id].activity.includes(period) ? 1 : 0.35) }));
    const id = rng.weighted(items);
    const sp = SPECIES[id];
    const zones = this.zones.filter(z => z.species === id).map(z => ({ z, d: Math.hypot(z.x - pos.x, z.z - pos.z) })).filter(o => o.d > 120 && o.d < ACTIVE_RADIUS);
    let zone;
    // Animals favour the zone that serves their current need, and avoid places that have been shot up.
    if (zones.length) zone = rng.weighted(zones.map(o => ({ v: o.z, w: (inWindow(g.hour, o.z) ? 3 : 1) / (1 + this.pressureAt(o.z.x, o.z.z)) })));
    else {
      // no zone in the ring: use a random suitable spot
      for (let i = 0; i < 20 && !zone; i++) {
        const a = rng.range(0, 6.28), d = rng.range(140, ACTIVE_RADIUS - 20);
        const x = pos.x + Math.cos(a) * d, z = pos.z + Math.sin(a) * d;
        if (!T.inBounds(x, z, 40)) continue;
        const b = biomeKey(T.biomeAt(x, z));
        if ((sp.habitat[b] || 0) > 0 && T.waterDepth(x, z) < 0.2) zone = { species: id, x, z, r: 25, water: this.nearestWater(x, z) };
      }
    }
    if (!zone) return false;
    const n = rng.int(sp.behavior.groupSize[0], sp.behavior.groupSize[1]);
    if (this.pressureAt(zone.x, zone.z) > 4 && rng.chance(0.7)) return false; // too much hunting pressure
    const group = { id: this.spawnCounter, species: id, members: [], leader: null, zone };
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, 6.28), d = rng.range(0, 10);
      const x = zone.x + Math.cos(a) * d, z = zone.z + Math.sin(a) * d;
      if (T.waterDepth(x, z) > 0.5 && id !== 'moose') continue;
      const seed = (rng.u32() ^ g.sessionSeed) >>> 0;
      const an = new Animal(this, sp, seed, x, z, zone, group);
      group.members.push(an);
      this.list.push(an);
    }
    if (!group.members.length) return false;
    // Herd leader: the biggest individual.
    group.leader = group.members.reduce((a, b) => (b.identity.bodyMassKg > a.identity.bodyMassKg ? b : a));
    this.groups.push(group);
    const legend = group.members.find(m => m.identity.legendary);
    if (legend && !g.coop.isGuest()) {
      // rangers only know roughly where: a fuzzy circle on the map
      this.rumor = { x: legend.pos.x + rng.range(-60, 60), z: legend.pos.z + rng.range(-60, 60), r: 110, name: legend.identity.nickname, sp: sp.displayName, t: g.time, id: legend.id };
      g.ui.feed(`RANGER RADIO: a legendary ${sp.displayName.split(' ').pop().toLowerCase()} — "${legend.identity.nickname}" — has been spotted. Check your map!`, 'good');
      g.audio.play('levelup');
    }
    return true;
  }

  step(dt) {
    const g = this.game;
    this.view.refresh();
    if (g.coop.isGuest()) { g.coop.stepGuestAnimals(dt); return; }
    for (const a of this.list) a.step(dt, this.view);
    for (const a of this.list) if (a.loot && Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) > 260) this.loseLoot(a);
    // herd communication: a fleeing herd member alarms its group
    this.alarmAcc = (this.alarmAcc || 0) + dt;
    if (this.alarmAcc > 0.2) {
      this.alarmAcc = 0;
      for (const gp of this.groups) {
        const fleeing = gp.members.find(m => m.alive && m.state === 'Fleeing' && m.memory.hasThreat);
        if (!fleeing || SPECIES[gp.species].behavior.grouping === 'solitary') continue;
        for (const m of gp.members) {
          if (m === fleeing || !m.alive || m.state === 'Fleeing') continue;
          if (Math.hypot(m.pos.x - fleeing.pos.x, m.pos.z - fleeing.pos.z) < 80) {
            m.alertness = Math.min(100, m.alertness + 50);
            m.setThreat(fleeing.memory.x, fleeing.memory.z, fleeing.memory.who);
          }
        }
      }
    }
    this.stepPressure(dt);
    this.stepLures(dt);
    // need-zone schedule: calm herds move to the zone that serves the hour
    this.needAcc = (this.needAcc || 0) + dt;
    if (this.needAcc > 10) { this.needAcc = 0; this.migrate(); }
    // population streaming
    this.popAcc += dt;
    if (this.popAcc > 1.5) {
      this.popAcc = 0;
      this.stream();
    }
    this.trackSightings();
  }

  migrate() {
    const h = this.game.hour;
    for (const gp of this.groups) {
      const L = gp.leader;
      if (!L || !L.alive || L.state !== 'Calm' || (gp.zone && gp.zone.need && inWindow(h, gp.zone))) continue;
      let best = null, bd = 520;
      for (const z of this.zones) {
        if (z.species !== gp.species || !inWindow(h, z)) continue;
        const d = Math.hypot(z.x - L.pos.x, z.z - L.pos.z);
        const p = this.pressureAt(z.x, z.z);
        if (d + p * 60 < bd) { bd = d + p * 60; best = z; }
      }
      if (!best || best === gp.zone) continue;
      gp.zone = best;
      for (const m of gp.members) { m.zone = best; if (m.alive && m.state === 'Calm') { m.target = null; m.travelling = true; } }
    }
  }

  /** Gunshots leave hunting pressure that fades over ~a day; animals avoid it. */
  /** A raccoon rummages through the player's pack and makes off with something. */
  raccoonSteal(a) {
    const g = this.game, pr = g.profile, P = g.player, rng = a.rng;
    const w = g.weapons.current;
    const opts = [];
    if (!g.hatOff) opts.push({ w: 3, v: { kind: 'hat', label: 'hat' } });
    if (pr.cash >= 5) opts.push({ w: 3, v: { kind: 'cash', amount: Math.min(pr.cash, rng.int(12, 45)), label: 'cash' } });
    for (const id of ['energy_drink', 'bandage', 'scent_spray']) if ((pr.gear[id] || 0) > 0) opts.push({ w: 1.2, v: { kind: 'gear', id, amount: 1, label: { energy_drink: 'Moss Cola', bandage: 'bandage', scent_spray: 'Scent Killer' }[id] } });
    if (w && (pr.ammo[w.id] || 0) >= 2 && w.type !== 'camera') opts.push({ w: 1.5, v: { kind: 'ammo', id: w.id, amount: Math.min(pr.ammo[w.id], rng.int(2, 5)), label: 'ammo' } });
    a.stealCd = g.time + 90;
    if (!opts.length) { g.ui.feed('A raccoon went through your pockets and found nothing. It looks disappointed in you.', 'info'); a.alertness = 60; return; }
    const loot = rng.weighted(opts);
    if (loot.kind === 'hat') {
      g.hatOff = true; g.hunterModel.hat.visible = false;
      const lk = pr.look();
      loot.mesh = new THREE.Mesh(buildHat(lk.hat, lk.jacket), g.hunterModel.hat.material);
      loot.mesh.scale.setScalar(0.52);
      loot.mesh.position.set(0, a.rig.H * 0.22, -a.rig.H * 0.02);
    } else {
      if (loot.kind === 'cash') pr.cash -= loot.amount;
      if (loot.kind === 'gear') pr.gear[loot.id] -= 1;
      if (loot.kind === 'ammo') pr.ammo[loot.id] -= loot.amount;
      loot.mesh = new THREE.Mesh(LOOT_GEO(), toonMat());
      loot.mesh.position.set(0, -a.rig.H * 0.2, a.rig.H * 0.78);
    }
    a.rig.head.add(loot.mesh);
    a.loot = loot; a.lootT = g.time;
    a.alertness = 100; a.setThreat(P.pos.x, P.pos.z, 'player');
    g.audio.play('flutter', a.pos); g.audio.play('yip', a.pos);
    const what = loot.kind === 'cash' ? `$${loot.amount}` : loot.kind === 'hat' ? 'YOUR HAT' : loot.kind === 'ammo' ? `${loot.amount} rounds` : `your ${loot.label}`;
    g.ui.toast(`A RACCOON STOLE ${what.toUpperCase()}!`, 'big', 2.2);
    g.ui.feed(`Bonk it with a boot or chase it down to get ${loot.kind === 'hat' ? 'your hat' : 'it'} back.`, 'warn');
    g.say('scared');
  }

  /** Bonked, shot or tackled: the loot goes flying, ready to pick back up. */
  dropLoot(a) {
    const g = this.game, loot = a.loot;
    if (!loot) return;
    a.loot = null;
    a.rig.head.remove(loot.mesh);
    const m = loot.kind === 'hat' ? loot.mesh : new THREE.Mesh(LOOT_GEO(), toonMat());
    m.scale.setScalar(1); m.rotation.set(0, 0, 0);
    g.scene.add(m);
    g.weapons.props.push({ kind: loot.kind === 'hat' ? 'hat' : 'loot', loot, mesh: m, x: a.pos.x, y: a.pos.y + 0.6, z: a.pos.z, vx: (a.rng.next() - 0.5) * 3, vy: 5, vz: (a.rng.next() - 0.5) * 3, spin: 10, resting: false, label: loot.kind === 'hat' ? 'your hat' : `stolen ${loot.label}`, age: 0, noHit: true });
    g.ui.toast('The raccoon dropped the loot!', 'hit', 1.6);
    g.jobs.onEvent('recover', {});
  }

  /** E on dropped loot: back in the pack. */
  returnLoot(loot) {
    const g = this.game, pr = g.profile;
    if (loot.kind === 'cash') pr.cash += loot.amount;
    if (loot.kind === 'gear') pr.gear[loot.id] = (pr.gear[loot.id] || 0) + 1;
    if (loot.kind === 'ammo') pr.ammo[loot.id] = (pr.ammo[loot.id] || 0) + loot.amount;
    g.audio.play('cash');
    g.ui.feed(loot.kind === 'cash' ? `Got your $${loot.amount} back. Slightly sticky.` : `Got your ${loot.label} back.`, 'good');
  }

  /** The raccoon got away. */
  loseLoot(a) {
    const g = this.game, loot = a.loot;
    a.loot = null;
    if (loot.mesh) a.rig.head.remove(loot.mesh);
    g.ui.feed(loot.kind === 'hat' ? 'The raccoon got away with your hat. It looks great on it. You dig a spare out of your pack.' : `The raccoon got away with your ${loot.kind === 'cash' ? '$' + loot.amount : loot.label}. Respect.`, 'warn');
    if (loot.kind === 'hat') g.restoreHat();
  }

  /** A skunk unloads on a hunter: green cloud, and they reek for two minutes. */
  skunkSpray(a, h) {
    const g = this.game;
    g.audio.play('spray', a.pos);
    for (let i = 0; i < 8; i++) g.fx.burst(a.pos.x + (h.x - a.pos.x) * i / 8, a.pos.y + 0.4, a.pos.z + (h.z - a.pos.z) * i / 8, { count: 2, color: i % 2 ? 0x9fd24a : 0xc6e86a, speed: 0.7, up: 0.8, kind: 'smoke', size: 0.4 + i * 0.05 });
    g.scent.emit(a.pos.x, a.pos.z, 6, 'skunk', g.time);
    if (h.id === 'player') g.player.skunked();
    else g.coop.sendTo(h.id, 'skunked', {});
  }

  /** Honey on the ground: a scent beacon that pulses for a minute. */
  addLure(x, z, { kind = 'honey', dur = 70, quiet = false, fire = null } = {}) {
    // a fresh roast just refreshes the campfire's bag
    const old = fire && this.lures.find(l => l.fire === fire);
    if (old) { old.until = Math.max(old.until, this.game.time + dur); return; }
    this.lures.push({ x, z, until: this.game.time + dur, pulse: 0, kind, fire });
    if (!quiet) this.game.ui.feed('Sticky. Every bear nearby can smell that now.', 'info');
  }

  stepLures(dt) {
    const g = this.game;
    for (const l of this.lures) {
      l.pulse -= dt;
      if (l.pulse <= 0 && g.time < l.until) { l.pulse = 8; g.sounds.emit('honey', l.x, g.terrain.heightAt(l.x, l.z) + 0.5, l.z, 2600, g.time, 'lure'); }
    }
    this.lures = this.lures.filter(l => g.time < l.until + 5);
  }

  stepPressure(dt) {
    const g = this.game;
    if (!this.pressure) { this.pressure = []; this.lastShotScan = 0; }
    for (const e of g.sounds.since(this.lastShotScan)) {
      if (e.category !== 'gunshot') continue;
      const near = this.pressure.find(p => Math.hypot(p.x - e.x, p.z - e.z) < 120);
      if (near) near.v += 1; else this.pressure.push({ x: e.x, z: e.z, v: 1 });
      const tot = this.pressureAt(e.x, e.z);
      if (tot > 4 && !(this.pressureWarnT > g.time)) { this.pressureWarnT = g.time + 120; g.ui.feed('Hunting pressure is building here. Animals will avoid this area for a while.', 'warn'); }
    }
    this.lastShotScan = g.time;
    const decay = Math.pow(0.5, dt / (g.daySeconds * 0.35));
    for (const p of this.pressure) p.v *= decay;
    this.pressure = this.pressure.filter(p => p.v > 0.1);
  }

  pressureAt(x, z) {
    let v = 0;
    for (const p of this.pressure || []) { const d = Math.hypot(p.x - x, p.z - z); if (d < 250) v += p.v * (1 - d / 250); }
    return v;
  }

  /** Hunter sense or a sighting inside a zone reveals it (and its schedule) on the map. */
  discoverZone(z, how) {
    if (z.discovered) return;
    z.discovered = true;
    const g = this.game;
    const fmt = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60) % 60).padStart(2, '0');
    g.ui.feed(`Need zone found (${how}): ${SPECIES[z.species].displayName} ${NEED_LABEL[z.need].toLowerCase()} ${fmt(z.from)}–${fmt(z.to)}. It's on your map.`, 'good');
    g.audio.play('sense');
    const ids = g.profile.zones || (g.profile.zones = []);
    if (!ids.includes(z.id)) { ids.push(z.id); g.profile.save(); }
  }

  senseZones(pos) {
    for (const z of this.zones) if (!z.discovered && Math.hypot(z.x - pos.x, z.z - pos.z) < z.r + 25) this.discoverZone(z, 'reading sign');
  }

  stream() {
    const g = this.game;
    const centers = [g.player.pos, ...g.coop.remoteHunters().map(h => ({ x: h.x, z: h.z }))];
    const keep = (a) => centers.some(c => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < DESPAWN_RADIUS);
    for (const a of this.list) {
      if (a.harvested) continue;
      const wounded = a.creature.wounds.length > 0;
      const oldCarcass = a.downed && g.time - a.downTime > 1200;
      if ((!keep(a) && !wounded) || oldCarcass) { if (a.loot) this.loseLoot(a); a.harvested = true; a.despawned = true; a.dispose(); }
    }
    this.list = this.list.filter(a => !a.harvested || a.keepRecord);
    this.groups = this.groups.filter(gp => gp.members.some(m => !m.harvested));
    this.populateAround(g.player.pos);
  }

  trackSightings() {
    const g = this.game, p = g.player;
    this.sightAcc = (this.sightAcc || 0) + 1;
    if (this.sightAcc % 30) return;
    const cam = g.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    for (const a of this.list) {
      if (a.harvested || a.seenByPlayer) continue;
      const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const zoom = g.weapons.aimZoom || 1;
      if (d > 60 * zoom + 40) continue;
      const dot = (dx * fwd.x + dz * fwd.z) / Math.max(1, d);
      if (dot < 0.85) continue;
      if (g.vegetation.segmentBlocked(p.pos.x, p.pos.y + 1.4, p.pos.z, a.pos.x, a.pos.y + 1, a.pos.z) >= 0) continue;
      a.seenByPlayer = true;
      if (a.group && a.group.zone && a.group.zone.need && Math.hypot(a.pos.x - a.group.zone.x, a.pos.z - a.group.zone.z) < a.group.zone.r + 15) this.discoverZone(a.group.zone, 'spotted');
      this.sightings.push({ x: a.pos.x, z: a.pos.z, label: a.species.displayName.split(' ').pop(), t: g.time });
      if (this.sightings.length > 40) this.sightings.shift();
      if (a.isDangerous && d < 160) g.ui.feed(`Careful: ${a.species.displayName} nearby!`, 'warn');
    }
  }

  render(dt) {
    const cam = this.game.camera.position;
    for (const a of this.list) {
      if (a.harvested) continue;
      const d = Math.hypot(a.pos.x - cam.x, a.pos.z - cam.z);
      a.rig.root.visible = d < this.game.scene.fog.far + 30;
      if (a.rig.root.visible) { a.rig.setDetail(d < 75); a.render(dt); }
    }
    for (const pt of this.poppedTrophies || []) {
      pt.t += dt; pt.vy -= 12 * dt;
      pt.mesh.position.x += pt.vx * dt; pt.mesh.position.y += pt.vy * dt; pt.mesh.position.z += pt.vz * dt;
      pt.mesh.rotation.x += pt.spin * dt; pt.mesh.rotation.z += pt.spin * 0.7 * dt;
      const gy = this.game.terrain.heightAt(pt.mesh.position.x, pt.mesh.position.z);
      if (pt.mesh.position.y < gy + 0.1) { pt.mesh.position.y = gy + 0.1; pt.vy = Math.abs(pt.vy) * 0.3; pt.vx *= 0.5; pt.vz *= 0.5; pt.spin *= 0.5; }
    }
  }

  // ------------------------------------------------------------------ hits
  /**
   * Resolve a projectile segment against all animals. Returns the first hit
   * {animal, t, report} or null. The anatomy simulation decides everything.
   */
  resolveProjectile(proj, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return null;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    let best = null;
    for (const a of this.list) {
      if (a.harvested) continue;
      const B = a.species.body, s = a.identity.scale;
      const cx = a.pos.x, cy = a.pos.y + (B.leg + B.h) * s * 0.6, cz = a.pos.z;
      const br = (B.len * 0.9 + B.neck + B.head + 0.6) * s;
      // quick bounding-sphere reject
      const lx = ax - cx, ly = ay - cy, lz = az - cz;
      const b = lx * ux + ly * uy + lz * uz;
      const c = lx * lx + ly * ly + lz * lz - br * br;
      if (c > 0 && b > 0) continue;
      if (b * b - c < 0) continue;
      const hits = a.raycastVolumes(ax, ay, az, ux, uy, uz, len);
      if (!hits.length) continue;
      if (!best || hits[0].t < best.t) best = { animal: a, t: hits[0].t, hits, dir: { x: ux, y: uy, z: uz } };
    }
    return best;
  }

  /** Apply a projectile hit along its path through the animal's anatomy. */
  applyHit(hit, proj) {
    const a = hit.animal, g = this.game, c = a.creature, sp = a.species;
    const ammo = AMMO[proj.ammoId];
    const weapon = WEAPONS[proj.weaponId];
    const dist = Math.max(1, proj.traveled);
    let energy = 0.5 * ammo.massKg * proj.speed * proj.speed * (proj.energyScale || 1);
    const report = { regions: [], parts: [], exit: false, energy, distance: dist, blunt: false, organs: [] };
    const seen = new Set();
    let first = true;
    const wasAlive = c.life === Life.Active;
    const impactPoint = { x: proj.x0 + hit.dir.x * hit.t, y: proj.y0 + hit.dir.y * hit.t, z: proj.z0 + hit.dir.z * hit.t };

    if (ammo.kind === 'blunt_object' || ammo.kind === 'air_impulse') {
      // Boots and rubber chickens: blunt impulse and psychology, no wounds.
      const region = hit.hits[0].region;
      const partId = (sp.regions[region] || [])[0];
      const shock = applyBluntImpulse(c, energy * 2.5, region.startsWith('leg') ? partId : null);
      report.blunt = true; report.regions.push(region);
      const small = a.identity.bodyMassKg < 15;
      if (region === 'brain' && small) { a.daze = 4; g.fx.dazed(a, 4); }
      else if (region === 'brain') { a.daze = 1.2; g.fx.dazed(a, 1.2); }
      a.alertness = Math.min(100, a.alertness + (sp.behavior.aggression < 999 && a.identity.temperament !== 'Timid' ? 40 : 70));
      a.setThreat(proj.ox, proj.oz, proj.owner);
      a.push.x += hit.dir.x * (small ? 5 : 1); a.push.z += hit.dir.z * (small ? 5 : 1);
      g.audio.play(proj.ammoId === 'rubber_chicken' ? 'squeak' : 'bonk', impactPoint);
      g.sounds.emit(proj.ammoId === 'rubber_chicken' ? 'squeak' : 'equipment', impactPoint.x, impactPoint.y, impactPoint.z, proj.ammoId === 'rubber_chicken' ? 900 : 150, g.time, proj.owner);
      report.shock = shock;
      return report;
    }

    for (const h of hit.hits) {
      if (energy <= 3) break;
      let region = h.region;
      if (region === 'lung') region = h.local.x > 0 ? 'lungL' : 'lungR';
      if (seen.has(region)) continue;
      seen.add(region);
      const parts = sp.regions[region] || [];
      for (const pid of parts) {
        const part = findPart(c, pid);
        if (!part) continue;
        // Past the first body part only internal (organ) layers remain.
        const savedLayers = part.layers;
        if (!first && part.layers.length) part.layers = part.layers.filter(l => l.isOrganLayer);
        const input = {
          distanceM: equivalentDistanceForEnergy(ammo, energy),
          incidenceAngleDeg: first ? Math.max(15, 90 - Math.acos(Math.min(1, h.normalDot)) * 180 / Math.PI * 0.6) : 90,
          tissueResistance: 1, denseBone: part.tissue === 'dense_bone', rng: a.rng,
        };
        const res = applyImpact(c, pid, ammo, input);
        part.layers = savedLayers;
        if (!res.validBodyPart) continue;
        report.regions.push(region);
        report.parts.push(pid);
        if (res.reachedOrgan) report.organs.push(part.tissue);
        if (first) { report.entryEnergy = res.impact.impactEnergyJ; report.stopLayers = res.layerLog; }
        first = false;
        energy = res.exitEnergyJ;
        if (res.wound.exitWound) report.exit = true;
        if (region === 'trophy' || (sp.regions.trophyAlso && (region === 'brain'))) {
          const also = sp.regions.trophyAlso;
          if (also) { const tp = findPart(c, also); if (tp) tp.boneIntegrity = Math.max(0, tp.boneIntegrity - res.impact.impactEnergyJ * 0.03); }
          if (region === 'trophy') this.popTrophy(a, hit.dir, res.impact.impactEnergyJ);
        }
        if (!res.wound.exitWound) { energy = 0; break; }
      }
    }
    report.exitEnergy = energy;
    // Pelts: every permanent cavity chews up the hide (overkill shows here).
    const pelt = c.bodyParts.find(p => p.trophyOrgan && sp.bodyParts.find(q => q.id === p.id && q.pelt));
    if (pelt) {
      const cav = c.wounds.reduce((s, w) => s + w.permanentCavityCm3, 0);
      pelt.organIntegrity = Math.max(0, 100 - cav / Math.max(0.5, a.identity.bodyMassKg) * 6);
    }

    // presentation of what the sim decided
    const vital = report.organs.some(o => o === 'heart' || o === 'lung' || o === 'brain' || o === 'major_vessel');
    g.fx.bloodHit(impactPoint.x, impactPoint.y, impactPoint.z, hit.dir, vital ? 1.4 : 0.6, a.identity.bodyMassKg < 15);
    if (report.exit) {
      const ex = impactPoint.x + hit.dir.x * sp.body.w * a.identity.scale, ez = impactPoint.z + hit.dir.z * sp.body.w * a.identity.scale;
      g.fx.bloodHit(ex, impactPoint.y, ez, hit.dir, 1.0, a.identity.bodyMassKg < 15);
    }
    if (sp.id === 'turkey') g.fx.feathers(impactPoint.x, impactPoint.y, impactPoint.z);
    g.audio.play('thwack', impactPoint);

    // behaviour reacts to the new injury
    a.alertness = 100;
    a.setThreat(proj.ox, proj.oz, proj.owner);
    a.memory.shotT = g.time;
    // a big round gives a comic shove
    const shove = Math.min(3, (report.entryEnergy || 0) / Math.max(20, a.identity.bodyMassKg * 12));
    a.push.x += hit.dir.x * shove; a.push.z += hit.dir.z * shove;
    if (a.firstHitTime < 0) { a.firstHitTime = g.time; a.firstHitPos = { x: a.pos.x, z: a.pos.z }; }
    a.shots.push({ time: g.time, distance: dist, weaponId: proj.weaponId, ammoId: proj.ammoId, regions: report.regions, parts: report.parts, organs: report.organs, exit: report.exit, energy: report.entryEnergy || 0, klass: proj.klass, owner: proj.owner });
    report.killedOutright = wasAlive && c.life !== Life.Active;
    if (wasAlive && c.life !== Life.Active) a.onIncapacitated();
    return report;
  }

  popTrophy(a, dir, energy) {
    if (!a.rig.trophyMesh || a.poppedTrophy || energy < 300) return;
    const tp = findPart(a.creature, a.species.trophy.organ);
    if (tp && tp.maxBoneIntegrity > 0 && tp.boneIntegrity > 0) return;
    const m = a.rig.trophyMesh;
    m.updateWorldMatrix(true, false);
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    m.matrixWorld.decompose(wp, wq, ws);
    a.rig.head.remove(m);
    m.position.copy(wp); m.quaternion.copy(wq); m.scale.copy(ws);
    this.game.scene.add(m);
    const pt = { mesh: m, vx: dir.x * 4, vy: 5, vz: dir.z * 4, spin: 9, t: 0 };
    a.poppedTrophy = pt;
    (this.poppedTrophies || (this.poppedTrophies = [])).push(pt);
    this.game.ui.toast('The trophy went flying!', 'hit');
  }

  onDown(a) {
    const g = this.game;
    if (a.firstHitTime >= 0) {
      const dt = g.time - a.firstHitTime;
      g.ui.toast(`${a.species.displayName} down! (${dt.toFixed(1)} s)`, 'big', 2.5);
    }
  }

  announce(a, what, lure = null) {
    const g = this.game;
    if (what === 'marsh') {
      const nm = a.species.displayName.split(' ').pop().toLowerCase();
      if (lure && lure.fire && g.campfires.mine === lure.fire) lure.fire.snacks = 0;
      const d = Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z);
      if (d < 120) { g.ui.toast(`A ${nm.toUpperCase()} IS EATING YOUR MARSHMALLOWS`, 'big', 2.4); g.say('scared'); }
      g.ui.feed(`The ${nm} found the marshmallow bag. Every last one. Rude.`, 'warn');
      return;
    }
    if (what === 'charge') {
      const d = Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z);
      if (d < 40 && !(this.lastYelp > g.time)) { this.lastYelp = g.time + 6; g.say('scared'); }
      if (d < 60) g.ui.toast(a.bluff ? `The ${a.species.displayName.split(' ').pop()} is bluff charging!` : `${a.species.displayName.toUpperCase()} IS CHARGING!`, 'big', 1.8);
    } else if (what === 'staredown') { g.ui.feed('You stared the cougar down. It slinks away.', 'good'); g.jobs.onEvent('staredown', { sp: a.species.id }); }
    else if (what === 'honey') { g.ui.feed(`A ${a.species.displayName.split(' ').pop().toLowerCase()} found the honey. Nom.`, 'info'); }
    else if (what === 'playdead') { g.ui.feed('You play dead. The bear sniffs you… and loses interest.', 'good'); g.jobs.onEvent('playdead', { sp: a.species.id }); }
  }

  onCall(kind, pos) {
    const g = this.game;
    const responders = { deer: ['deer'], elk: ['elk'], turkey: ['turkey'], predator: ['wolf', 'cougar', 'black_bear', 'grizzly', 'fox'] }[kind] || [];
    for (const a of this.list) {
      if (!a.alive || !responders.includes(a.species.id)) continue;
      const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z);
      if (d > 380) continue;
      a.respondsToCall = kind === 'predator' ? true : a.identity.sex === 'Male' || kind !== 'elk';
      a.curiousAbout = { x: pos.x, z: pos.z, t: g.time, cat: 'call' };
      if (kind === 'predator') a.called = true;
      if (kind === 'elk' && a.identity.sex === 'Male' && a.rng.chance(0.6)) setTimeout(() => g.audio.play('elk', a.pos), 1200 + a.rng.range(0, 1500));
    }
  }

  nearestDowned(pos, r) {
    let best = null, bd = r;
    for (const a of this.list) {
      if (!a.downed || a.harvested) continue;
      const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  // ------------------------------------------------------------------ harvest
  harvest(a) {
    const g = this.game;
    if (g.coop.isGuest()) { g.coop.requestHarvest(a); return; }
    const h = this.computeHarvest(a);
    this.finishHarvest(a, h);
    g.coop.broadcastEvent('harvest', { id: a.id, by: g.coop.myId(), sp: a.species.id });
  }

  computeHarvest(a, owner = 'player') {
    const g = this.game, sp = a.species, c = a.creature;
    const shots = a.shots;
    const tti = a.firstHitTime >= 0 && a.downTime >= 0 ? a.downTime - a.firstHitTime : -1;
    const recoveryDistance = a.firstHitPos ? Math.hypot(a.pos.x - a.firstHitPos.x, a.pos.z - a.firstHitPos.z) : 0;
    const score = computeTrophyScore(c, { biologicalQuality: a.identity.biologicalQuality, shotsFired: Math.max(1, shots.length), timeToIncapacitationS: tti, recoveryDistanceM: recoveryDistance, useDistance: true });
    // Weapon suitability: calibre outside the species' ethical class range.
    const [kmin, kmax] = sp.klass;
    const bad = shots.filter(s => s.klass && (s.klass < kmin || s.klass > kmax));
    let shotWhy = shots.length ? `${shots.length} shot${shots.length > 1 ? 's' : ''}, ${shots.filter(s => s.organs.length).length} reached organs` : 'no shots recorded';
    if (bad.length) {
      const under = bad.some(s => s.klass < kmin);
      score.shotQuality *= under ? 0.6 : 0.8;
      shotWhy += under ? ' · undersized calibre' : ' · oversized calibre';
    }
    const trophyPart = findPart(c, sp.trophy.organ);
    let integrityWhy = 'pristine';
    if (score.trophyIntegrity < 99) integrityWhy = sp.bodyParts.find(p => p.id === sp.trophy.organ && p.pelt) ? 'hide damaged by wound cavities' : `${sp.trophy.label} damaged`;
    if (a.poppedTrophy) integrityWhy = `${sp.trophy.label} shot clean off`;
    let recoveryWhy = tti < 0 ? 'found it without a clean kill timeline' : `down in ${tti.toFixed(1)} s, ${recoveryDistance.toFixed(0)} m from the hit`;
    score.overall = score.recovered || a.downed
      ? score.biologicalQuality * 0.2 + score.shotQuality * 0.3 + score.trophyIntegrity * 0.25 + score.recoveryQuality * 0.25 : 0;
    if (!score.recovered && a.downed) { score.recoveryQuality = 40; score.overall = score.biologicalQuality * 0.2 + score.shotQuality * 0.3 + score.trophyIntegrity * 0.25 + 10; }
    score.tier = score.overall >= 90 ? 'Platinum' : score.overall >= 75 ? 'Gold' : score.overall >= 50 ? 'Silver' : score.overall >= 25 ? 'Bronze' : 'Field Dressed Only';

    const lines = [];
    const firstShot = shots[0];
    if (firstShot) lines.push(`First shot: ${WEAPONS[firstShot.weaponId] ? WEAPONS[firstShot.weaponId].name : firstShot.weaponId} at ${firstShot.distance.toFixed(0)} m, ${firstShot.energy.toFixed(0)} J on impact.`);
    if (tti >= 0) lines.push(`Time to incapacitation: ${tti.toFixed(1)} s.`);
    lines.push(`Blood lost: ${((1 - c.bloodVolumeMl / c.maxBloodVolumeMl) * 100).toFixed(0)}% of ${(c.maxBloodVolumeMl / 1000).toFixed(1)} L.`);
    if (recoveryDistance > 1) lines.push(`Tracked ${recoveryDistance.toFixed(0)} m from where it was hit.`);
    if (a.identity.rareTrait) lines.push(`Rare ${a.identity.rareTraitName} coat!`);
    if (a.identity.legendary) lines.unshift(`LEGENDARY! You bagged ${a.identity.nickname}. The rangers will be talking about this for years.`);
    const wounds = c.wounds.map(w => {
      const part = findPart(c, w.bodyPartId);
      const nice = w.bodyPartId.replace(/_/g, ' ').replace('primary thorax', 'lung').replace('core pump cavity', 'heart').replace('gait column', 'leg').replace('wobble rump', 'gut');
      return `${nice}${w.exitWound ? ' — entry + exit' : ''} · ${w.bleedRateMlPerSec.toFixed(1)} ml/s${part && part.maxBoneIntegrity > 0 && part.boneIntegrity <= 0 ? ' · bone broken' : ''}`;
    });

    const valueMult = Math.pow(score.overall / 100, 1.2) * (0.7 + a.identity.biologicalQuality / 200) * (a.identity.rareTrait ? 2 : 1) * (a.identity.legendary ? 4 : 1);
    const cash = Math.round(sp.value * Math.max(0.1, valueMult));
    const xp = Math.round(sp.xp * (0.5 + score.overall / 100) * (a.identity.legendary ? 3 : 1));
    return { species: sp, animal: a.identity, score, shotWhy, integrityWhy, recoveryWhy, lines, wounds, cash, xp, owner, pos: { x: a.pos.x, z: a.pos.z } };
  }

  finishHarvest(a, h) {
    const g = this.game;
    const lvl = g.profile.level;
    g.profile.cash += h.cash;
    g.profile.xp += h.xp;
    const first = a.shots[0];
    g.profile.addTrophy({
      nickname: h.animal.nickname, speciesName: h.species.displayName, speciesId: h.species.id, sex: h.animal.sex, mass: h.animal.bodyMassKg,
      tier: h.score.tier, overall: h.score.overall, weapon: first ? (WEAPONS[first.weaponId] || {}).name || '?' : 'unknown',
      distance: first ? first.distance : 0, date: `Day ${Math.floor(g.time / g.daySeconds) + 1}, ${String(Math.floor(g.hour)).padStart(2, '0')}:00`, x: h.pos.x, z: h.pos.z,
    });
    g.audio.play('cash');
    if (g.profile.level > lvl) { g.audio.play('levelup'); g.ui.feed(`Level up! You are now level ${g.profile.level}.`, 'good'); }
    g.fx.burst(a.pos.x, a.pos.y + 0.5, a.pos.z, { count: 24, kind: 'confetti', speed: 4, up: 5, size: 0.06 });
    const w0 = first && WEAPONS[first.weaponId];
    const recovery = a.firstHitPos ? Math.hypot(a.pos.x - a.firstHitPos.x, a.pos.z - a.firstHitPos.z) : 0;
    // say cheese: a trophy photo with your trekker before the animal is tagged out
    g.trophySelfie(a, h, () => this.removeAnimal(a));
    g.jobs.onEvent('harvest', { sp: h.species.id, overall: h.score.overall, tier: h.score.tier, wtype: w0 ? w0.type : null, dist: first ? first.distance : 0, recovery });
    g.openMenu('harvest');
    g.ui.showHarvest(h);
    g.say('yay');
    if (a.identity.legendary) { g.ui.toast(`LEGENDARY HARVEST: ${a.identity.nickname}!`, 'big', 4); g.audio.play('levelup'); this.rumor = null; }
  }

  removeAnimal(a) {
    a.harvested = true;
    a.dispose();
    this.list = this.list.filter(x => x !== a);
  }
}
