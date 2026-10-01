// Online co-op through the artifact runtime's `room` capability (presence
// only — works for every participant, no admin topics needed).
//
// Authority: the earliest joiner of a party is the HOST and owns the
// wildlife simulation; it publishes a compact animal snapshot in its
// presence. Everyone publishes their hunter state plus a small ring of
// events (shots, harvest requests, hits on other hunters). Guests render
// the host's animals and forward their shots; the host re-simulates each
// shot against its own authoritative anatomy, so there is exactly one
// answer to "did that bullet reach the heart". Without a room the game is
// simply single-player.

import { THREE } from '../three.js';
import { buildHunter, JACKETS, HATS } from '../entities/hunter.js';
import { SPECIES, SPECIES_IDS } from '../sim/species.js';
import { Animal } from '../entities/animals.js';
import { WEAPONS, AMMO } from '../sim/arsenal.js';
import { Life } from '../sim/creature.js';
import { Rng } from '../core/rng.js';
import { buildDog } from '../entities/dog.js';
import { buildBlind } from '../entities/blind.js';

const SEND_HZ = 12;
const EV_RING = 10;

function nameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '800 34px "Baloo 2", "Trebuchet MS", sans-serif';
  const w = Math.min(248, g.measureText(text).width + 28);
  g.fillStyle = '#fff4de'; g.strokeStyle = '#2a1f2e'; g.lineWidth = 5;
  const x = (256 - w) / 2;
  g.beginPath(); g.roundRect ? g.roundRect(x, 8, w, 48, 16) : g.rect(x, 8, w, 48); g.fill(); g.stroke();
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.beginPath(); g.arc(x + 18, 32, 8, 0, 6.28); g.fill();
  g.fillStyle = '#2a1f2e'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128 + 6, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}

export class Coop {
  constructor(game) {
    this.game = game;
    this.room = null;        // named room (party) or lobby
    this.lobby = null;
    this.code = null;
    this.peers = new Map();  // peer label -> {presence, model, lastSeq, pos...}
    this.seq = 0;
    this.events = [];
    this.sendAcc = 0;
    this.joinedAt = 0;
    this.shadow = new Map(); // guest: animal key -> Animal (shadow, no AI)
    this.pendingJoin = null;
    this.rng = new Rng(game.sessionSeed ^ 0xc00b);
  }

  myId() { return 'player'; }
  inParty() { return !!this.room; }
  isHost() { return this.inParty() && this.hostPeer === this.myPeer; }
  isGuest() { return this.inParty() && !!this.hostPeer && this.hostPeer !== this.myPeer; }
  isHostOrSolo() { return !this.isGuest(); }

  async join(code) {
    const g = this.game;
    this.code = code;
    g.ui.feed(`Joining hunting party “${code}”…`, 'info');
    let room = null;
    try { room = window.claude && window.claude.use ? await window.claude.use('room') : null; } catch { room = null; }
    if (!room) { g.ui.feed('Online parties are not available in this view — hunting solo.', 'warn'); this.code = null; return; }
    this.lobby = room;
    try {
      this.room = await room.join('tp-' + code);
    } catch (e) {
      // Named rooms unavailable: share the lobby and filter by party code.
      this.room = room;
      this.filterCode = code;
    }
    this.joinedAt = Date.now();
    this.room.onPeers((change) => this.onPeers(change), (err) => { g.ui.feed('Lost the party connection (' + err.code + '). Hunting solo.', 'warn'); this.drop(); });
    this.sendPresence(true);
    g.ui.feed('Connected! Friends who join the same code appear here.', 'good');
  }

  leave() {
    if (this.room && this.room.leave && this.room !== this.lobby) this.room.leave().catch(() => {});
    this.drop();
  }

  drop() {
    for (const p of this.peers.values()) { if (p.model) this.game.scene.remove(p.model.group); if (p.tag) this.game.scene.remove(p.tag); if (p.dog) this.game.scene.remove(p.dog.root); if (p.blind) this.game.scene.remove(p.blind.mesh); }
    this.peers.clear();
    for (const a of this.shadow.values()) a.dispose();
    this.shadow.clear();
    this.room = null; this.code = null; this.hostPeer = null; this.myPeer = null;
    const chip = document.getElementById('party-chip'); if (chip) chip.hidden = true;
  }

  onPeers(change) {
    const g = this.game;
    for (const p of change.peers) if (p.sameTab) this.myPeer = p.peer;
    const valid = change.peers.filter(p => p.presence && p.presence.v === 1 && (!this.filterCode || p.presence.pc === this.filterCode));
    // Host = earliest joiner (ties broken by peer label), me included.
    const cand = valid.map(p => ({ peer: p.peer, since: p.presence.since || 0 }));
    if (this.myPeer && !cand.find(c => c.peer === this.myPeer)) cand.push({ peer: this.myPeer, since: this.joinedAt });
    cand.sort((a, b) => a.since - b.since || (a.peer < b.peer ? -1 : 1));
    const newHost = cand.length ? cand[0].peer : this.myPeer;
    if (newHost !== this.hostPeer) {
      const wasGuest = this.isGuest();
      this.hostPeer = newHost;
      if (this.isHost() && wasGuest) this.promoteToHost();
      if (this.isGuest()) {
        // Hand wildlife to the host: our own animals leave the world.
        for (const a of g.animals.list) a.dispose();
        g.animals.list = []; g.animals.groups = [];
        g.ui.feed('The party host is running the wildlife now.', 'info');
      }
    }
    for (const p of change.left) {
      const r = this.peers.get(p.peer);
      if (r) { if (r.model) g.scene.remove(r.model.group); if (r.tag) g.scene.remove(r.tag); if (r.dog) g.scene.remove(r.dog.root); if (r.blind) g.scene.remove(r.blind.mesh); this.peers.delete(p.peer); g.ui.feed(`${r.name || 'A hunter'} left the party.`, 'info'); }
    }
    for (const p of valid) {
      if (p.sameTab) continue;
      let r = this.peers.get(p.peer);
      const pr = p.presence;
      if (!r) {
        r = { peer: p.peer, lastSeq: -1, name: String(pr.n || 'Hunter').slice(0, 14), color: pr.c | 0 || 0xff6b2c };
        const hat = HATS[pr.h | 0] || 'beanie';
        r.model = buildHunter({ jacket: r.color, hat, skin: Math.max(0, Math.min(5, pr.sk | 0)) });
        g.scene.add(r.model.group);
        r.tag = nameTag(r.name, r.color);
        g.scene.add(r.tag);
        r.pos = { x: 0, y: 0, z: 0 }; r.target = null;
        this.peers.set(p.peer, r);
        g.ui.feed(`${r.name} joined the hunt!`, 'good');
        g.audio.play('levelup');
        // Newcomers get an immediate state push.
        this.sendAcc = 1;
      }
      r.presence = pr;
      if (Array.isArray(pr.p)) r.target = { x: pr.p[0], y: pr.p[1], z: pr.p[2], yaw: pr.p[3], pitch: pr.p[4] };
      this.processEvents(r, pr.ev);
    }
    this.renderChip();
  }

  promoteToHost() {
    // Rebuild authoritative animals from the last snapshot we saw.
    const g = this.game;
    for (const a of this.shadow.values()) {
      a.game = g;
      g.animals.list.push(a);
    }
    this.shadow.clear();
    g.ui.feed('You are now the party host.', 'info');
  }

  renderChip() {
    const chip = document.getElementById('party-chip');
    if (!chip) return;
    if (!this.inParty()) { chip.hidden = true; return; }
    chip.hidden = false;
    const rows = [`<div class="pm"><span class="dot" style="background:#${this.game.profile.look().jacket.toString(16).padStart(6, '0')}"></span>${this.game.profile.name.replace(/[<>&]/g, '')} (you)${this.isHost() ? ' · host' : ''}</div>`];
    for (const r of this.peers.values()) rows.push(`<div class="pm"><span class="dot" style="background:#${r.color.toString(16).padStart(6, '0')}"></span>${r.name.replace(/[<>&"]/g, '')}${r.peer === this.hostPeer ? ' · host' : ''}</div>`);
    chip.innerHTML = `<div>Party “${(this.code || '').replace(/[<>&"]/g, '')}”</div>` + rows.join('');
  }

  // ------------------------------------------------------------------ events
  broadcastEvent(type, data) {
    if (!this.inParty()) return;
    this.seq++;
    this.events.push([this.seq, type, data]);
    if (this.events.length > EV_RING) this.events.shift();
    this.sendAcc = 1; // push soon
  }

  sendTo(peer, type, data) { this.broadcastEvent(type, { ...data, to: peer }); }

  processEvents(r, ev) {
    if (!Array.isArray(ev)) return;
    const g = this.game;
    for (const e of ev) {
      if (!Array.isArray(e) || typeof e[0] !== 'number' || e[0] <= r.lastSeq) continue;
      r.lastSeq = e[0];
      const type = e[1], d = e[2] || {};
      if (d.to && d.to !== this.myPeer) continue;
      try { this.handleEvent(r, type, d); } catch (err) { console.warn('coop event', type, err); }
    }
  }

  handleEvent(r, type, d) {
    const g = this.game;
    const num = (v, lo = -1e4, hi = 1e4) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);
    switch (type) {
      case 'shot': {
        const w = WEAPONS[d.w];
        if (!w) return;
        const pos = { x: num(d.x), y: num(d.y), z: num(d.z) };
        g.audio.play(w.type === 'shotgun' ? 'shotgun' : w.type === 'bow' ? 'bow' : 'rifle', pos);
        if (w.type !== 'bow') { g.sounds.emit('gunshot', pos.x, pos.y, pos.z, w.loudness, g.time, r.peer); g.fx.flushBirds(pos.x, pos.z); }
        const dir = new THREE.Vector3(num(d.dx, -1, 1), num(d.dy, -1, 1), num(d.dz, -1, 1)).normalize();
        const ammoId = AMMO[d.a] ? d.a : w.ammo;
        // Host simulates the guest's projectile against the real anatomy.
        const pellets = w.pellets ? w.pellets[ammoId] : 1;
        for (let i = 0; i < pellets; i++) {
          const dd = dir.clone();
          if (pellets > 1) { const s = w.pelletSpread[ammoId]; dd.x += this.rng.range(-s, s); dd.y += this.rng.range(-s, s); dd.z += this.rng.range(-s, s); dd.normalize(); }
          g.weapons.spawnProjectile({ origin: new THREE.Vector3(pos.x, pos.y, pos.z), dir: dd, ammoId, weaponId: w.id, klass: w.klassByAmmo ? w.klassByAmmo[ammoId] : w.klass, speed: AMMO[ammoId].muzzleVelocityMps, owner: r.peer, remote: true, tracer: i === 0 && w.type !== 'bow', arrow: w.type === 'bow' });
        }
        break;
      }
      case 'throw': {
        if (d.k !== 'boot' && d.k !== 'chicken') return;
        g.weapons.spawnRemoteProp(d.k, num(d.x), num(d.y), num(d.z), num(d.vx, -40, 40), num(d.vy, -40, 40), num(d.vz, -40, 40));
        break;
      }
      case 'report': g.ui.toast(String(d.msg || '').slice(0, 80), 'hit'); break;
      case 'hurt': {
        g.player.hurt({ blunt: num(d.b, 0, 80), cut: num(d.c, 0, 80), knock: { x: num(d.kx, -30, 30), y: num(d.ky, 0, 30), z: num(d.kz, -30, 30) }, source: String(d.src || 'something').slice(0, 20) });
        break;
      }
      case 'bonk': {
        g.player.hurt({ blunt: num(d.b, 0, 40), cut: num(d.c, 0, 30), knock: { x: num(d.kx, -20, 20), y: num(d.ky, 0, 20), z: num(d.kz, -20, 20) }, source: 'friendly fire' });
        g.ui.toast(`${r.name} got you with a ${String(d.what || 'thing').slice(0, 24)}!`, 'big');
        break;
      }
      case 'blown': {
        const p = g.player;
        p.vel.x += num(d.fx, -20, 20); p.vel.z += num(d.fz, -20, 20);
        if (Math.hypot(d.fx, d.fz) > 3 || p.slide > 3) p.startTumble(num(d.fx, -20, 20) * 0.6, 2, num(d.fz, -20, 20) * 0.6);
        break;
      }
      case 'wave': r.waveT = 2.2; break;
      case 'dance': r.danceT = 4; break;
      case 'sprayed': {
        const p = g.player;
        g.ui.toast(`${String(d.n || r.name).slice(0, 14)} got you with bear spray! *cough*`, 'big');
        g.audio.play('sneeze', p.pos);
        g.fx.dazed({ headWorld: () => ({ x: p.pos.x, y: p.pos.y + 0.6, z: p.pos.z }) }, 2);
        p.startTumble((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2);
        break;
      }
      case 'chat': g.social.receive(r, d.t); break;
      case 'ping': g.social.receivePing(r, d); break;
      case 'downed': g.ui.feed(`${r.name} is DOWN (${String(d.by || '').slice(0, 20)})! Run over and press E to pull them up.`, 'warn'); if (r.target) g.social.addPing(r.target.x, r.target.y, r.target.z, 'Help me up!', r.color, r.name); break;
      case 'revive': g.revive(String(d.n || r.name).slice(0, 14)); break;
      case 'revived': g.ui.feed(`${r.name} is back on their feet.`, 'good'); break;
      case 'harvest': g.ui.feed(`${r.name} harvested a ${SPECIES[d.sp] ? SPECIES[d.sp].displayName : 'critter'}!`, 'good'); this.removeShadowById(d.id); break;
      case 'harvestreq': {
        if (!this.isHost()) return;
        const a = g.animals.list.find(x => x.id === d.id && x.downed && !x.harvested);
        if (!a) return;
        const h = g.animals.computeHarvest(a, r.peer);
        g.animals.removeAnimal(a);
        this.sendTo(r.peer, 'harvested', { id: a.id, h: this.packHarvest(h) });
        g.ui.feed(`${r.name} harvested a ${a.species.displayName}!`, 'good');
        break;
      }
      case 'harvested': {
        this.removeShadowById(d.id);
        const h = this.unpackHarvest(d.h);
        if (!h) return;
        const pr = g.profile;
        pr.cash += h.cash; pr.xp += h.xp;
        pr.addTrophy({ nickname: h.animal.nickname, speciesName: h.species.displayName, speciesId: h.species.id, sex: h.animal.sex, mass: h.animal.bodyMassKg, tier: h.score.tier, overall: h.score.overall, weapon: h.weapon || '?', distance: h.distance || 0, date: 'Party hunt', x: g.player.pos.x, z: g.player.pos.z });
        g.audio.play('cash');
        g.jobs.onEvent('harvest', { sp: h.species.id, overall: h.score.overall, tier: h.score.tier, wtype: null, dist: h.distance || 0, recovery: 0 });
        g.openMenu('harvest');
        g.ui.showHarvest(h);
        break;
      }
    }
  }

  packHarvest(h) {
    const s = h.score;
    return {
      sp: h.species.id, seed: h.animal.seed, sc: [s.biologicalQuality, s.shotQuality, s.trophyIntegrity, s.recoveryQuality, s.overall].map(v => +v.toFixed(1)), tier: s.tier,
      why: [h.shotWhy, h.integrityWhy, h.recoveryWhy].map(x => String(x).slice(0, 90)),
      lines: h.lines.slice(0, 5).map(x => String(x).slice(0, 90)), wounds: h.wounds.slice(0, 4).map(x => String(x).slice(0, 70)), cash: h.cash, xp: h.xp,
    };
  }

  unpackHarvest(p) {
    const sp = SPECIES[p && p.sp];
    if (!sp) return null;
    const a = new Animal(this.game.animals, sp, p.seed >>> 0, 0, 0, { x: 0, z: 0, r: 1 }, null);
    a.dispose();
    const [b, sq, ti, rq, ov] = (p.sc || []).map(Number);
    return {
      species: sp, animal: a.identity,
      score: { biologicalQuality: b || 0, shotQuality: sq || 0, trophyIntegrity: ti || 0, recoveryQuality: rq || 0, overall: ov || 0, tier: ['Platinum', 'Gold', 'Silver', 'Bronze', 'Field Dressed Only'].includes(p.tier) ? p.tier : 'Bronze' },
      shotWhy: (p.why || [])[0] || '', integrityWhy: (p.why || [])[1] || '', recoveryWhy: (p.why || [])[2] || '',
      lines: (p.lines || []).map(String), wounds: (p.wounds || []).map(String), cash: Math.max(0, Math.min(5000, p.cash | 0)), xp: Math.max(0, Math.min(3000, p.xp | 0)),
    };
  }

  requestHarvest(a) {
    this.sendTo(this.hostPeer, 'harvestreq', { id: a.key || a.id });
    this.game.ui.feed('Asking the host to tag it…', 'info');
  }

  removeShadowById(id) {
    for (const [k, a] of this.shadow) if (a.id === id || a.key === id) { a.dispose(); this.shadow.delete(k); }
  }

  // ------------------------------------------------------------------ hunters (for AI & bullets)
  remoteHunters() {
    const out = [];
    for (const r of this.peers.values()) {
      const pr = r.presence;
      if (!pr || !r.target) continue;
      const yaw = r.target.yaw || 0;
      out.push({ id: r.peer, x: r.target.x, y: r.target.y, z: r.target.z, speed: pr.sp || 0, stance: pr.s === 'c' ? 'crouch' : pr.s === 'p' ? 'prone' : 'stand', onTower: !!pr.tw, bleeding: pr.bl || 0, fwd: { x: -Math.sin(yaw), z: -Math.cos(yaw) }, downed: !!pr.dn });
    }
    return out;
  }

  members() {
    return [...this.peers.values()].filter(r => r.target).map(r => ({ x: r.target.x, z: r.target.z, color: r.color, name: r.name }));
  }

  hurtRemote(peer, hit) {
    if (!this.isHost()) return;
    this.sendTo(peer, 'hurt', { b: hit.blunt, c: hit.cut, kx: hit.knock.x, ky: hit.knock.y, kz: hit.knock.z, src: hit.source });
  }

  resolveHunterHit(pr, ax, ay, az, bx, by, bz) {
    if (!this.inParty()) return null;
    let best = null;
    for (const r of this.peers.values()) {
      if (!r.target || r.peer === pr.owner) continue;
      // capsule-ish: test against a sphere at chest and one at the head
      for (const [oy, rad] of [[0.55, 0.42], [1.15, 0.34]]) {
        const cx = r.target.x, cy = r.target.y + oy, cz = r.target.z;
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const len2 = dx * dx + dy * dy + dz * dz;
        const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / len2));
        const px = ax + dx * t - cx, py = ay + dy * t - cy, pz = az + dz * t - cz;
        if (px * px + py * py + pz * pz < rad * rad && (!best || t < best.t)) best = { t, r };
      }
    }
    return best;
  }

  applyHunterHit(hh, pr) {
    if (pr.remote) return; // only the shooter's own client reports friendly fire
    const ammo = AMMO[pr.ammoId];
    const e = 0.5 * ammo.massKg * pr.speed * pr.speed;
    const dir = new THREE.Vector3(pr.vx, pr.vy, pr.vz).normalize();
    const blunt = ammo.kind === 'blunt_object' ? Math.min(20, e / 4) : Math.min(35, e / 60);
    const cut = ammo.kind === 'blunt_object' ? 0 : Math.min(25, e / 100);
    const k = ammo.kind === 'blunt_object' ? 6 : 9;
    this.sendTo(hh.r.peer, 'bonk', { b: blunt, c: cut, kx: dir.x * k, ky: 4, kz: dir.z * k, what: WEAPONS[pr.weaponId] ? WEAPONS[pr.weaponId].name : 'thing' });
    this.game.fx.burst(hh.r.target.x, hh.r.target.y + 1, hh.r.target.z, { count: 16, kind: 'confetti', speed: 3 });
    this.game.ui.toast(`You hit ${hh.r.name}! Oops.`, 'big');
  }

  blowAt(pos, dir, range, force, dt) {
    if (!this.inParty()) return;
    this.blowAcc = (this.blowAcc || 0) + dt;
    if (this.blowAcc < 0.25) return;
    const acc = this.blowAcc; this.blowAcc = 0;
    for (const r of this.peers.values()) {
      if (!r.target) continue;
      const dx = r.target.x - pos.x, dz = r.target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.1 || (dx * dir.x + dz * dir.z) / d < 0.8) continue;
      const f = force * (1 - d / range) * acc * 0.8;
      this.sendTo(r.peer, 'blown', { fx: dir.x * f, fz: dir.z * f });
    }
  }

  // ------------------------------------------------------------------ presence out
  sendPresence(force = false) {
    if (!this.room) return;
    const g = this.game, p = g.player;
    const r2 = (v) => Math.round(v * 100) / 100;
    const pres = {
      v: 1, n: g.profile.name.slice(0, 14), c: g.profile.look().jacket, h: Math.max(0, HATS.indexOf(g.profile.hat)), sk: g.profile.skin | 0, since: this.joinedAt,
      p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch)], s: p.stance[0], sp: r2(p.speed),
      tb: p.tumble ? 1 : 0, dn: p.downed ? 1 : 0, bl: r2(p.bleed), tw: p.onTower ? 1 : 0, wv: g.waveT > 0 ? 1 : 0, ho: g.hatOff ? 1 : 0,
      w: g.weapons.currentId, aim: g.weapons.aiming ? 1 : 0, ev: this.events,
    };
    const bm = g.blinds && g.blinds.mine;
    if (bm) pres.bl = [r2(bm.x), r2(bm.z), r2(bm.yaw)];
    const dg = g.dog;
    if (dg && dg.active) pres.dg = [r2(dg.pos.x), r2(dg.pos.y), r2(dg.pos.z), r2(dg.yaw), r2(dg.speed), dg.mode === 'sit' || dg.mode === 'found' ? 1 : 0];
    const v = p.vehicle;
    if (v) pres.vh = [g.vehicles.list.indexOf(v), r2(v.pos.x), r2(v.pos.y), r2(v.pos.z), r2(v.yaw), r2(v.pitch), r2(v.roll), r2(v.steer), r2(v.speed())];
    if (this.filterCode) pres.pc = this.filterCode;
    if (this.isHost()) {
      pres.hr = r2(g.hour); pres.wd = [r2(g.wind.dir), r2(g.wind.speed)]; pres.wx = g.weather.pack();
      pres.an = this.packAnimals();
    } else pres.an = null;
    let json = JSON.stringify(pres);
    while (json.length > 3900 && pres.an && pres.an.length) { pres.an.pop(); json = JSON.stringify(pres); }
    this.room.presence(pres).catch(() => {});
  }

  packAnimals() {
    const g = this.game;
    const centers = [g.player.pos, ...this.remoteHunters()];
    const near = g.animals.list.filter(a => !a.harvested && centers.some(c => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 260));
    near.sort((a, b) => Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) - Math.hypot(b.pos.x - g.player.pos.x, b.pos.z - g.player.pos.z));
    return near.slice(0, 26).map(a => {
      const flags = (a.downed ? 1 : 0) | (a.creature.life === Life.Dead ? 2 : 0) | (a.death && a.death.side > 0 ? 4 : 0) | (a.creature.wounds.length ? 8 : 0) | (a.state === 'Aggressive' ? 16 : 0) | (a.creature.mobility === 'Limping' ? 32 : 0);
      return [SPECIES_IDS.indexOf(a.species.id), a.identity.seed, Math.round(a.pos.x * 10), Math.round(a.pos.z * 10), Math.round(a.facingYaw() * 100), Math.round(a.speed * 10), flags, Math.round(a.grazeT > 0 ? 1 : 0)];
    });
  }

  // ------------------------------------------------------------------ guest-side wildlife
  stepGuestAnimals(dt) {
    const g = this.game;
    const host = this.peers.get(this.hostPeer);
    if (!host || !host.presence) return;
    const pr = host.presence;
    if (typeof pr.hr === 'number') g.hour += ((pr.hr - g.hour + 36) % 24 - 12) * Math.min(1, dt);
    if (Array.isArray(pr.wd)) { g.wind.dir = pr.wd[0]; g.wind.speed = pr.wd[1]; }
    if (Array.isArray(pr.wx)) g.weather.unpack(pr.wx, dt);
    if (!Array.isArray(pr.an)) return;
    const seen = new Set();
    for (const row of pr.an) {
      if (!Array.isArray(row) || row.length < 8) continue;
      const [si, seed, x10, z10, yaw100, sp10, flags, graze] = row;
      const sp = SPECIES[SPECIES_IDS[si]];
      if (!sp) continue;
      const key = `${sp.id}#${seed >>> 0}`;
      seen.add(key);
      let a = this.shadow.get(key);
      if (!a) {
        a = new Animal(g.animals, sp, seed >>> 0, x10 / 10, z10 / 10, { x: x10 / 10, z: z10 / 10, r: 20 }, null);
        a.key = key;
        this.shadow.set(key, a);
      }
      const tx = x10 / 10, tz = z10 / 10;
      a.pos.x += (tx - a.pos.x) * Math.min(1, dt * 8);
      a.pos.z += (tz - a.pos.z) * Math.min(1, dt * 8);
      if (Math.hypot(tx - a.pos.x, tz - a.pos.z) > 20) { a.pos.x = tx; a.pos.z = tz; }
      a.pos.y = g.terrain.heightAt(a.pos.x, a.pos.z);
      a.setFacingYaw(yaw100 / 100);
      a.speed = sp10 / 10;
      a.grazeT = graze ? 1 : 0;
      a.goal = flags & 16 ? 'Charge' : 'Wander';
      a.creature.mobility = flags & 32 ? 'Limping' : 'Full';
      if ((flags & 1) && !a.downed) {
        a.downed = true; a.alive = false; a.downTime = g.time;
        a.death = { t: 0, side: flags & 4 ? 1 : -1, spin: 0, vy: 1.5, y: 0, roll: 0 };
        a.rig.eyes.visible = false; a.rig.deadEyes.visible = true; a.rig.tongue.visible = true; a.rig.brows.visible = false; a.rig.snarl.visible = false;
        g.audio.play('boing', a.pos);
      }
      if (a.death) a.stepDeath(dt);
    }
    for (const [k, a] of this.shadow) if (!seen.has(k) && !a.downed) { a.dispose(); this.shadow.delete(k); }
    g.animals.list = [...this.shadow.values()];
  }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    if (!this.room) return;
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / SEND_HZ) { this.sendAcc = 0; this.sendPresence(); }
  }

  render(dt) {
    if (!this.room) return;
    const g = this.game;
    for (const r of this.peers.values()) {
      if (!r.target || !r.model) continue;
      const k = Math.min(1, dt * 10);
      const jump = Math.hypot(r.target.x - r.pos.x, r.target.z - r.pos.z) > 15;
      r.pos.x = jump ? r.target.x : r.pos.x + (r.target.x - r.pos.x) * k;
      r.pos.y = jump ? r.target.y : r.pos.y + (r.target.y - r.pos.y) * k;
      r.pos.z = jump ? r.target.z : r.pos.z + (r.target.z - r.pos.z) * k;
      const pr = r.presence;
      const m = r.model;
      m.group.position.set(r.pos.x, r.pos.y, r.pos.z);
      // their blind
      const bl = Array.isArray(pr.bl) ? pr.bl : null;
      if (bl && (!r.blind || r.blind.x !== bl[0] || r.blind.z !== bl[1])) {
        if (r.blind) g.scene.remove(r.blind.mesh);
        const mesh = buildBlind(); mesh.position.set(bl[0], g.terrain.heightAt(bl[0], bl[1]) - 0.05, bl[1]); mesh.rotation.y = bl[2] || 0;
        g.scene.add(mesh); r.blind = { x: bl[0], z: bl[1], mesh };
      } else if (!bl && r.blind) { g.scene.remove(r.blind.mesh); r.blind = null; }
      // their dog, if they brought one
      if (Array.isArray(pr.dg)) {
        if (!r.dog) { r.dog = buildDog(); g.scene.add(r.dog.root); r.dogPos = { x: pr.dg[0], y: pr.dg[1], z: pr.dg[2] }; r.dogPh = 0; }
        const k3 = Math.min(1, dt * 10), dp = r.dogPos;
        dp.x += (pr.dg[0] - dp.x) * k3; dp.y += (pr.dg[1] - dp.y) * k3; dp.z += (pr.dg[2] - dp.z) * k3;
        r.dog.root.visible = true;
        r.dog.root.position.set(dp.x, dp.y, dp.z); r.dog.root.rotation.set(0, pr.dg[3] || 0, 0);
        const sp2 = pr.dg[4] || 0; r.dogPh += dt * (3 + sp2 * 3.5);
        r.dog.legs.forEach((l, i) => { l.rotation.x = Math.sin(r.dogPh + (i === 0 || i === 3 ? 0 : Math.PI)) * Math.min(0.9, sp2 * 0.22); });
        r.dog.body.rotation.x = pr.dg[5] ? -0.45 : 0;
        r.dog.tail.rotation.y = Math.sin(g.visualTime * 8) * 0.6;
      } else if (r.dog) r.dog.root.visible = false;
      // Riding: pose our copy of that quad where they are and seat them on it.
      const vh = Array.isArray(pr.vh) ? pr.vh : null;
      const quad = vh && g.vehicles.list[vh[0] | 0];
      if (quad && quad.driver !== g.player) {
        quad.remoteT = g.time;
        const k2 = Math.min(1, dt * 10);
        quad.pos.x += (vh[1] - quad.pos.x) * k2; quad.pos.y += (vh[2] - quad.pos.y) * k2; quad.pos.z += (vh[3] - quad.pos.z) * k2;
        quad.yaw = vh[4]; quad.pitch = vh[5]; quad.roll = vh[6]; quad.steer = vh[7];
        quad.wheelSpin += (vh[8] || 0) * dt / 0.36;
        quad.crashed = false;
        const s = quad.seat();
        m.group.position.set(s.x, s.y - 0.36, s.z);
        m.group.rotation.order = 'YXZ';
        m.group.rotation.set(-quad.pitch, quad.yaw, quad.roll);
        m.animate(dt, { speed: 0, stance: 'stand', pitch: 0, seated: true, lean: quad.steer, showRifle: false });
        r.tag.position.set(s.x, s.y + 1.5, s.z);
        continue;
      }
      m.group.rotation.order = 'XYZ';
      if (pr.tb) { r.spin = (r.spin || 0) + dt * 9; m.group.rotation.set(r.spin, r.target.yaw, r.spin * 0.6); }
      else if (pr.dn) { m.group.rotation.set(-Math.PI / 2, (r.target.yaw || 0) + Math.PI, 0); m.group.position.y = r.pos.y + 0.32; }
      else { m.group.rotation.set(0, (r.target.yaw || 0) + Math.PI, 0); }
      if (r.waveT > 0) r.waveT -= dt;
      if (r.danceT > 0) r.danceT -= dt;
      if (r.model.hat) r.model.hat.visible = !pr.ho;
      m.animate(dt, { dance: r.danceT > 0, flail: !!pr.tb, speed: pr.sp || 0, stance: pr.s === 'c' ? 'crouch' : pr.s === 'p' ? 'prone' : 'stand', pitch: r.target.pitch || 0, dead: !!pr.dn, wave: r.waveT > 0 || !!pr.wv, aiming: !!pr.aim, showRifle: WEAPONS[pr.w] && WEAPONS[pr.w].type !== 'thrown' });
      r.tag.position.set(r.pos.x, r.pos.y + 2.05, r.pos.z);
    }
  }
}
