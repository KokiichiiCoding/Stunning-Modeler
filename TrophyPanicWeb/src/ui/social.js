// Friendslop glue: text chat with speech bubbles, and pings ("DEER!") that
// everyone in the party sees as markers. Works solo too (pings become
// personal waypoints). Text only ever reaches the page via textContent or a
// canvas, never as HTML.

import { THREE } from '../three.js';

const $ = (id) => document.getElementById(id);
const PING_LIFE = 14;
const BUBBLE_LIFE = 6;

function bubbleSprite(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.font = '700 34px Nunito, "Trebuchet MS", sans-serif';
  // wrap to two lines
  const words = text.split(/\s+/); const lines = [''];
  for (const w of words) {
    const t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w;
    if (g.measureText(t).width > 440 && lines[lines.length - 1]) { if (lines.length === 2) { lines[1] += '…'; break; } lines.push(w); } else lines[lines.length - 1] = t;
  }
  const w = Math.min(480, Math.max(...lines.map(l => g.measureText(l).width)) + 44);
  const h = 30 + lines.length * 40;
  const x = (512 - w) / 2, y = 4;
  g.fillStyle = '#ffffff'; g.strokeStyle = '#2a1f2e'; g.lineWidth = 6;
  g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 22) : g.rect(x, y, w, h);
  g.moveTo(236, y + h); g.lineTo(256, y + h + 26); g.lineTo(276, y + h);
  g.fill(); g.stroke();
  g.fillStyle = '#ffffff'; g.fillRect(238, y + h - 6, 36, 8);
  g.fillStyle = '#2a1f2e'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, 256, y + 34 + i * 40));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.6, 0.81, 1);
  s.renderOrder = 11;
  return s;
}

export class Social {
  constructor(game) {
    this.game = game;
    this.pings = [];
    this.bubbles = [];
    this.isOpen = false;
    this.box = $('chat-box');
    this.inputEl = $('chat-input');
    this.pingLayer = $('pings');
    this.inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = this.inputEl.value.trim(); if (t) this.send(t); this.close(true); e.preventDefault(); }
      else if (e.key === 'Escape') { this.close(false); e.preventDefault(); }
    });
  }

  // ---------------------------------------------------------------- chat
  open() {
    const g = this.game;
    if (this.isOpen || g.state !== 'play') return;
    this.isOpen = true;
    g._suppressPause = true;
    g.input.exitLock();
    g.input.down.clear();
    this.box.hidden = false;
    this.inputEl.value = '';
    setTimeout(() => this.inputEl.focus(), 0);
  }

  close(relock) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.box.hidden = true;
    this.inputEl.blur();
    if (relock && this.game.state === 'play') this.game.input.requestLock();
  }

  send(text) {
    const g = this.game;
    text = String(text).replace(/\s+/g, ' ').slice(0, 80);
    g.ui.feed(`${g.profile.name}: ${text}`, 'chat'); // (no bubble over your own head: it would block your camera)
    g.coop.broadcastEvent('chat', { t: text });
    if (!g.coop.inParty() && !this.soloHint) { this.soloHint = true; g.ui.feed('(Nobody hears you out here. Join a party code to hunt with friends.)', 'info'); }
  }

  receive(r, text) {
    text = String(text || '').replace(/\s+/g, ' ').slice(0, 80);
    if (!text) return;
    this.game.ui.feed(`${r.name}: ${text}`, 'chat');
    this.game.audio.play('click');
    this.bubble(r.peer, text);
  }

  bubble(who, text) {
    for (const b of this.bubbles) if (b.who === who) { this.game.scene.remove(b.sprite); b.dead = true; }
    this.bubbles = this.bubbles.filter(b => !b.dead);
    const sprite = bubbleSprite(text);
    this.game.scene.add(sprite);
    this.bubbles.push({ who, sprite, t: BUBBLE_LIFE });
  }

  // ---------------------------------------------------------------- pings
  /** Ping whatever is under the crosshair: an animal if one is close to the aim line, else the ground. */
  ping() {
    const g = this.game;
    if (this.pingCd && g.time < this.pingCd) return;
    this.pingCd = g.time + 0.6;
    const cam = g.camera;
    const o = cam.position.clone();
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bestAng = Infinity;
    for (const a of g.animals.list) {
      if (a.harvested) continue;
      const c = new THREE.Vector3(a.pos.x, a.pos.y + a.rig.H * 0.6, a.pos.z);
      const to = c.clone().sub(o);
      const dist = to.length();
      if (dist > 380 || dist < 0.5) continue;
      const ang = to.normalize().angleTo(d);
      const tol = Math.max(0.035, Math.atan((a.radius + 0.6) / dist));
      if (ang < tol && ang < bestAng) { bestAng = ang; best = { a, c }; }
    }
    let spot, label;
    if (best) {
      const a = best.a;
      const name = a.species.displayName.split(' ').pop();
      label = a.downed ? `Downed ${name.toLowerCase()} here` : a.species.danger >= 2 ? `${name}! Careful!` : `${name}!`;
      spot = best.c;
    } else {
      const p = o.clone();
      spot = null;
      for (let t = 0; t < 450; t += 1.5) {
        p.copy(o).addScaledVector(d, t);
        if (p.y < g.terrain.heightAt(p.x, p.z)) { spot = p.clone(); spot.y = g.terrain.heightAt(p.x, p.z); break; }
      }
      if (!spot) return;
      label = 'Over here';
    }
    const me = { name: g.profile.name, color: g.profile.look().jacket };
    this.addPing(spot.x, spot.y, spot.z, label, me.color, me.name);
    g.pointT = 1.6; g.say && g.say('huh');
    g.coop.broadcastEvent('ping', { x: +spot.x.toFixed(1), y: +spot.y.toFixed(1), z: +spot.z.toFixed(1), l: label });
    g.audio.play('sense');
  }

  addPing(x, y, z, label, color, who) {
    const el = document.createElement('div');
    el.className = 'ping';
    const pin = document.createElement('i');
    pin.style.background = '#' + (color >>> 0).toString(16).padStart(6, '0');
    const txt = document.createElement('span');
    el.append(pin, txt);
    this.pingLayer.appendChild(el);
    this.pings.push({ x, y, z, label: String(label).slice(0, 40), who: String(who).slice(0, 14), el, txt, t: PING_LIFE });
    if (this.pings.length > 8) { const p = this.pings.shift(); p.el.remove(); }
  }

  receivePing(r, d) {
    r.pointT = 1.6;
    const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(-2000, Math.min(2000, v)) : 0);
    this.addPing(num(d.x), num(d.y), num(d.z), String(d.l || 'Over here'), r.color, r.name);
    this.game.ui.feed(`${r.name} pinged: ${String(d.l || 'over here').slice(0, 40)}`, 'info');
    this.game.audio.play('sense');
  }

  // ---------------------------------------------------------------- per-frame
  render(dt) {
    const g = this.game;
    const cam = g.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const v = new THREE.Vector3();
    for (const p of this.pings) {
      p.t -= dt;
      v.set(p.x, p.y + 1.2, p.z).project(cam);
      const behind = v.z > 1;
      let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      if (behind) { sx = W - sx; sy = H - 40; }
      sx = Math.max(60, Math.min(W - 60, sx)); sy = Math.max(70, Math.min(H - 150, sy));
      const dist = Math.hypot(p.x - g.player.pos.x, p.z - g.player.pos.z);
      p.txt.textContent = `${p.who}: ${p.label} · ${dist.toFixed(0)} m`;
      p.el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px)`;
      p.el.style.opacity = String(Math.min(1, p.t / 2) * (behind ? 0.6 : 1));
    }
    this.pings = this.pings.filter(p => { if (p.t <= 0) { p.el.remove(); return false; } return true; });

    for (const b of this.bubbles) {
      b.t -= dt;
      let pos = null;
      const r = g.coop.peers.get(b.who);
      if (r && r.pos) pos = { x: r.pos.x, y: r.pos.y + 2.6, z: r.pos.z }; else b.t = 0;
      if (pos) b.sprite.position.set(pos.x, pos.y, pos.z);
      b.sprite.material.opacity = Math.min(1, b.t / 0.8);
    }
    this.bubbles = this.bubbles.filter(b => { if (b.t <= 0) { g.scene.remove(b.sprite); b.sprite.material.map.dispose(); b.sprite.material.dispose(); return false; } return true; });
  }

  clear() {
    for (const p of this.pings) p.el.remove();
    this.pings = [];
    for (const b of this.bubbles) this.game.scene.remove(b.sprite);
    this.bubbles = [];
  }
}
