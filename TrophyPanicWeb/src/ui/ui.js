// DOM user interface. Reads game state, never writes simulation facts.

import { WEAPONS, GEAR, AMMO } from '../sim/arsenal.js';
import { FISH } from '../player/fishing.js';
import { SPECIES } from '../sim/species.js';
import { JACKETS, HATS, SKINS } from '../entities/hunter.js';
import { POIS, GRID, HALF, WORLD_SIZE, TRAIL_POLYS, LAKE } from '../world/terrainData.js';
import { BIOME_COLORS } from '../world/terrainMesh.js';
import { WEATHER_ICON, WEATHER_LABEL } from '../sim/weather.js';
import { inWindow } from '../entities/animals.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['title', 'pause', 'controls', 'settings', 'harvest', 'shop', 'trophies', 'map', 'downed', 'rest'];

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

export class UI {
  constructor(game) {
    this.game = game;
    this.feedItems = [];
    this.lastHp = 100;
    this.shopTab = 'weapons';
    this._c = {};
    this.wire();
  }

  loading(frac, msg) {
    $('load-bar').style.width = Math.round(frac * 100) + '%';
    if (msg) $('load-msg').textContent = msg;
  }

  // ------------------------------------------------------------------ wiring
  wire() {
    const g = this.game;
    $('btn-play').onclick = () => { this.saveLook(); g.startPlaying(); };
    $('btn-party').onclick = () => {
      const code = ($('party-code').value || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '-').slice(0, 40);
      if (!code) { $('party-hint').textContent = 'Type a party code first — your friends type the same one.'; return; }
      this.saveLook(); g.startPlaying({ party: code });
    };
    $('btn-lodge').onclick = () => g.openMenu('shop');
    $('btn-lodge2').onclick = () => g.openMenu('shop');
    $('btn-trophies').onclick = () => g.openMenu('trophies');
    $('btn-controls').onclick = () => g.openMenu('controls');
    $('btn-controls2').onclick = () => g.openMenu('controls');
    $('btn-settings').onclick = () => g.openMenu('settings');
    $('btn-map2').onclick = () => g.openMenu('map');
    $('btn-resume').onclick = () => g.resume();
    $('btn-quit').onclick = () => g.quitToTitle();
    $('btn-respawn').onclick = () => g.respawn();
    $('btn-harvest-ok').onclick = () => g.closeMenu();
    document.querySelectorAll('.close-screen').forEach(b => { b.onclick = () => g.closeMenu(); });
    document.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => { this.shopTab = t.dataset.tab; document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t)); this.renderShop(); };
    });
    $('game').addEventListener('click', () => { if (g.state === 'play' && !g.input.locked) g.input.requestLock(); });
    $('map-canvas').addEventListener('click', (e) => this.mapClick(e));
    document.querySelectorAll('[data-rest]').forEach(b => { b.onclick = () => g.restUntil(Number(b.dataset.rest)); });

    const bindSetting = (id, key, parse = Number) => {
      const el = $(id);
      el.addEventListener('input', () => {
        g.profile.settings[key] = el.type === 'checkbox' ? el.checked : parse(el.value);
        g.profile.save();
        g.applySettings();
      });
    };
    bindSetting('set-sens', 'sens'); bindSetting('set-vol', 'volume'); bindSetting('set-fov', 'fov');
    bindSetting('set-quality', 'quality', String); bindSetting('set-reports', 'reports'); bindSetting('set-gore', 'gore', String); bindSetting('set-tips', 'tips'); bindSetting('set-post', 'post');
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && g.state === 'menu') g.closeMenu();
      else if (e.code === 'Escape' && g.state === 'paused') g.resume();
      else if (e.code === 'KeyM' && g.state === 'menu' && !$('map').hidden) g.closeMenu();
    });
  }

  saveLook() {
    const p = this.game.profile;
    p.name = ($('hunter-name').value || 'Pip').trim().slice(0, 14) || 'Pip';
    p.save();
    this.game.rebuildHunter && this.game.rebuildHunter();
  }

  // ------------------------------------------------------------------ screens
  hideScreens() { for (const s of SCREENS) $(s).hidden = true; }
  showHUD() { $('hud').hidden = false; $('loading').hidden = true; }
  hideHUD() { $('hud').hidden = true; }

  showTitle() {
    this.hideScreens(); this.hideHUD();
    $('loading').hidden = true;
    $('title').hidden = false;
    const p = this.game.profile;
    $('hunter-name').value = p.name;
    const sw = $('jacket-swatches'); sw.innerHTML = '';
    for (const j of JACKETS) {
      const b = document.createElement('button');
      b.className = 'swatch' + (p.jacket === j.id ? ' on' : '');
      b.style.background = hex(j.hex);
      b.title = j.name; b.setAttribute('aria-label', j.name);
      b.onclick = () => { p.jacket = j.id; p.save(); this.game.rebuildHunter(); this.showTitle(); };
      sw.appendChild(b);
    }
    const sk = $('skin-swatches'); sk.innerHTML = '';
    SKINS.forEach((k, i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + ((p.skin | 0) === i ? ' on' : '');
      b.style.background = hex(k.hex);
      b.title = k.name; b.setAttribute('aria-label', 'Skin ' + k.name);
      b.onclick = () => { p.skin = i; p.save(); this.game.rebuildHunter(); this.showTitle(); };
      sk.appendChild(b);
    });
    const bc = $('buddy-choices'); bc.innerHTML = '';
    [['Just me', 0], ['+1 buddy', 1], ['+2 buddies', 2]].forEach(([label, n]) => {
      const b = document.createElement('button');
      b.className = 'chip' + ((p.settings.buddies | 0) === n ? ' on' : '');
      b.textContent = label;
      b.onclick = () => { p.settings.buddies = n; p.save(); this.showTitle(); };
      bc.appendChild(b);
    });
    const hc = $('hat-choices'); hc.innerHTML = '';
    for (const h of HATS) {
      const b = document.createElement('button');
      b.className = 'chip' + (p.hat === h ? ' on' : '');
      b.textContent = h;
      b.onclick = () => { p.hat = h; p.save(); this.game.rebuildHunter(); this.showTitle(); };
      hc.appendChild(b);
    }
    $('profile-line').textContent = `${money(p.cash)} · Level ${p.level} · ${p.stats.harvests} harvests · best score ${p.stats.bestScore.toFixed(0)}`;
  }

  showPause() { this.hideScreens(); $('pause').hidden = false; }

  openScreen(name) {
    this.hideScreens();
    $(name).hidden = false;
    if (name === 'shop') this.renderShop();
    if (name === 'trophies') this.renderTrophies();
    if (name === 'map') this.renderMap();
    if (name === 'settings') {
      const s = this.game.profile.settings;
      $('set-sens').value = s.sens; $('set-vol').value = s.volume; $('set-fov').value = s.fov;
      $('set-quality').value = s.quality; $('set-reports').checked = !!s.reports; $('set-gore').value = s.gore; $('set-tips').checked = s.tips !== false; $('set-post').checked = s.post !== false;
    }
  }

  showDowned(source, bill) {
    this.hideScreens();
    $('downed').hidden = false;
    const titles = { 'maul': 'You got mauled.', 'stomp': 'You got stomped.', 'bite': 'You got nibbled. A lot.', 'pounce': 'Pounced!', 'tusk gore': 'Boar\'d to death.', 'horn toss': 'Bison\'d. Airborne, briefly.', 'ankle pecks': 'Defeated by a turkey. Nobody needs to know.', 'a hard landing': 'Gravity wins again.', 'blood loss': 'You ran out of blood.' };
    $('downed-title').textContent = titles[source] || 'You got got.';
    $('downed-text').textContent = 'The rangers carried you back to the lodge. They were very nice about it.';
    $('downed-bill').textContent = bill > 0 ? `Medical bill: ${money(bill)}` : 'The rangers waived the bill. They felt bad.';
  }

  // ------------------------------------------------------------------ feed & toasts
  feed(text, kind = 'info') {
    // repeats ("wolf nearby" ×3) bump a counter instead of stacking
    const last = this.feedItems[this.feedItems.length - 1];
    if (last && last.text === text) { last.n = (last.n || 1) + 1; last.el.textContent = `${text} ×${last.n}`; last.t = 6; return; }
    const el = document.createElement('div');
    el.className = 'feed-item ' + kind;
    el.textContent = text;
    $('feed').appendChild(el);
    this.feedItems.push({ el, t: 6, text });
    while (this.feedItems.length > 6) { const f = this.feedItems.shift(); f.el.remove(); }
  }

  toast(text, kind = '', seconds = 2.2) {
    if (kind !== 'big' && !this.game.profile.settings.reports) return;
    // the same shout twice in a row (three wolves charging) is one toast
    for (const t of $('toast-stack').children) if (t.textContent === text) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    $('toast-stack').appendChild(el);
    setTimeout(() => el.remove(), seconds * 1000);
    const stack = $('toast-stack');
    while (stack.children.length > 3) stack.firstChild.remove();
  }

  // ------------------------------------------------------------------ HUD
  // Cached DOM writes: the HUD updates every frame, but only touches the DOM when a value changes.
  txt(id, v) { const k = id + '.t'; v = String(v); if (this._c[k] !== v) { this._c[k] = v; $(id).textContent = v; } }
  sty(id, prop, v) { const k = id + '.' + prop; v = String(v); if (this._c[k] !== v) { this._c[k] = v; $(id).style[prop] = v; } }
  hid(id, v) { const k = id + '.h'; v = !!v; if (this._c[k] !== v) { this._c[k] = v; $(id).hidden = v; } }

  updateHUD(dt) {
    const g = this.game, p = g.player, w = g.weapons;
    for (const f of this.feedItems) { f.t -= dt; if (f.t < 1) f.el.style.opacity = Math.max(0, f.t).toFixed(2); }
    this.feedItems = this.feedItems.filter(f => { if (f.t <= 0) { f.el.remove(); return false; } return true; });

    // compass
    const deg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const strip = $('compass-strip');
    if (!strip.dataset.built) {
      const marks = [];
      for (let k = -1; k <= 1; k++) for (let a = 0; a < 360; a += 15) {
        const lbl = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[a] || '·';
        marks.push(`<span style="width:30px">${lbl}</span>`);
      }
      strip.innerHTML = marks.join('');
      strip.dataset.built = '1';
    }
    const px = (deg / 15) * 30 + 24 * 30; // center the middle copy
    if (!this.compassW || this.compassWAt !== window.innerWidth) { this.compassW = strip.parentElement.clientWidth; this.compassWAt = window.innerWidth; }
    this.sty('compass-strip', 'transform', `translateX(${(-px + this.compassW / 2 - 15).toFixed(1)}px)`);

    // wind indicator (bearing the wind blows TOWARD, relative to view)
    let wind = $('wind-ui');
    if (!wind) {
      wind = document.createElement('div'); wind.id = 'wind-ui'; wind.className = 'wind-ui';
      wind.innerHTML = '<span>Wind</span><i id="wind-arr">➤</i><span id="wind-spd"></span>';
      $('hud').appendChild(wind);
    }
    const wv = g.wind.vec();
    const windBearing = Math.atan2(wv.x, -wv.z); // 0 = toward north
    const rel = windBearing + p.yaw;
    this.sty('wind-arr', 'transform', `rotate(${(rel * 180 / Math.PI) - 90}deg)`);
    this.txt('wind-spd', `${g.wind.speed.toFixed(1)} m/s`);

    // clock
    const h = Math.floor(g.hour), m = Math.floor((g.hour - h) * 60);
    this.txt('clock-time', `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    const per = g.period || g.sky.period;
    const wk = g.weather.kind;
    this.txt('clock-period', `${per[0].toUpperCase() + per.slice(1)} · ${WEATHER_ICON[wk]} ${WEATHER_LABEL[wk]}`);

    // vitals
    this.sty('hp-bar', 'width', Math.max(0, p.hp) + '%');
    this.sty('bleed-bar', 'width', Math.min(100, p.bleed * 20) + '%');
    this.sty('st-bar', 'width', p.stamina + '%');
    this.sty('noise-bar', 'width', Math.round(p.noise * 100) + '%');
    this.sty('vis-bar', 'width', Math.round(p.visibility * 100) + '%');
    this.txt('stance-chip', p.vehicle ? 'Riding' : p.inBlind ? 'In blind' : p.swimming ? 'Swimming' : p.tumble ? 'Tumbling!' : p.onTower ? 'On tower' : { stand: 'Standing', crouch: 'Crouched', prone: 'Prone' }[p.stance]);
    if (p.hp < this.lastHp - 0.5) this.sty('damage-vignette', 'opacity', String(Math.min(1, (this.lastHp - p.hp) / 12 + 0.3)));
    else this.sty('damage-vignette', 'opacity', String(+Math.max(0, (parseFloat(this._c['damage-vignette.opacity']) || 0) - dt * 1.2, p.hp < 30 ? 0.35 : 0).toFixed(2)));
    this.lastHp = p.hp;
    this.sty('sense-vignette', 'opacity', g.fx.senseT > 0 ? '1' : '0');
    { const c0 = w.current; this.hid('blind-frame', !(p.inBlind && !g.thirdPerson && !w.binoculars && !(w.aiming && c0 && (c0.zoom >= 3 || c0.type === 'camera')))); }

    // weapon
    const cur = w.current;
    if (p.vehicle) {
      const v = p.vehicle;
      this.txt('weapon-name', v.airborne ? 'Quad bike · AIRBORNE' : 'Quad bike');
      this.txt('ammo-mag', Math.round(v.speed() * 3.6));
      this.txt('ammo-res', 'km/h');
      this.txt('ammo-type', '');
    } else if (cur) {
      this.txt('weapon-name', w.binoculars ? 'Binoculars' : cur.name);
      const st = w.state[cur.id];
      if (cur.type === 'blower') { this.txt('ammo-mag', '∞'); this.txt('ammo-res', ''); }
      else if (cur.type === 'camera') { this.txt('ammo-mag', g.profile.photos.length); this.txt('ammo-res', 'photos'); }
      else if (cur.type === 'rod') { this.txt('ammo-mag', g.profile.stats.fish || 0); this.txt('ammo-res', 'fish'); }
      else { this.txt('ammo-mag', st ? st.mag : 0); this.txt('ammo-res', g.profile.ammo[cur.id] ?? 0); }
      this.txt('ammo-type', cur.type === 'shotgun' ? AMMO[w.shellType()].name.replace(' pellet', '') : '');
    }
    const slots = $('slots');
    const owned = g.profile.ownedWeapons();
    const key = owned.join(',') + '|' + (cur && cur.id);
    if (slots.dataset.key !== key) {
      slots.innerHTML = owned.map((id, i) => `<span class="slot${cur && cur.id === id ? ' on' : ''}">${i + 1} ${esc(WEAPONS[id].short)}</span>`).join('');
      slots.dataset.key = key;
    }
    this.txt('cash', money(g.profile.cash));
    this.txt('level', 'Lv ' + g.profile.level);

    // aim overlays
    const camAim = w.aiming && cur && cur.type === 'camera' && !p.vehicle;
    const scoped = w.aiming && cur && cur.zoom >= 3 && !w.binoculars && !camAim;
    this.hid('scope', !scoped);
    this.hid('viewfinder', !camAim);
    if (camAim) {
      this.vfT = (this.vfT || 0) - dt;
      if (this.vfT <= 0) { this.vfT = 0.25; const r = w.rangeReadout(); this.txt('vf-read', r.text.split('\n').slice(0, 2).join(' · ') + '  ·  click to snap'); }
    }
    // ranger jobs
    const jl = g.jobs.hudLines();
    const jc = $('jobs-chip');
    jc.hidden = !jl.length;
    const jkey = jl.join('|');
    if (jc.dataset.key !== jkey) { jc.dataset.key = jkey; jc.innerHTML = '<b>Ranger jobs</b>' + jl.map(t => `<div>• ${esc(t)}</div>`).join(''); }
    this.hid('binos', !w.binoculars);
    this.hid('crosshair', scoped || w.binoculars || camAim);
    this.rangeT = (this.rangeT || 0) - dt;
    if ((scoped || w.binoculars) && this.rangeT <= 0) {
      this.rangeT = 0.15;
      const read = w.rangeReadout();
      if (scoped) this.txt('range-read', read.text);
      else this.txt('bino-read', read.text);
    }

    // prompt & clue card
    this.updateStatus(dt);
    this.updatePrompt();
    const clue = g.fx.focusClue;
    const card = $('clue-card');
    this.clueT = (this.clueT || 0) - dt;
    if (clue && !w.aiming) {
      this.hid('clue-card', false);
      if (this.clueT <= 0 || this._clue !== clue) { this.clueT = 0.5; this._clue = clue; const html = this.clueText(clue); if (this._c['clue.html'] !== html) { this._c['clue.html'] = html; card.innerHTML = html; } }
    } else this.hid('clue-card', true);
  }

  /** The terminal status panel: what kind of moment is this? */
  updateStatus(dt) {
    this.statusT = (this.statusT || 0) - dt;
    if (this.statusT > 0) return;
    this.statusT = 0.25;
    const g = this.game, p = g.player;
    const short = (sp) => sp.displayName.split(' ').pop().toUpperCase();
    const dir8 = (dx, dz) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((Math.atan2(dx, -dz) * 180 / Math.PI) % 360) + 360) % 360 / 45) % 8];
    // biggest threat nearby
    let threat = null, tLevel = 0;
    for (const a of g.animals.list) {
      if (!a.alive || a.downed || !(a.species.danger >= 2)) continue;
      const d = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z);
      if (d > 90) continue;
      const lvl = a.goal === 'Charge' || a.state === 'Aggressive' ? 3 : d < 35 || a.state === 'Stalking' ? 2 : 1;
      if (lvl > tLevel) { tLevel = lvl; threat = a; }
    }
    let state, detail, danger = false;
    const wounded = g.animals.list.find(a => a.firstHitTime >= 0 && !a.harvested && (a.alive || a.downed));
    if (p.downed) { const di = g.downedInfo; state = 'DOWNED'; detail = di && di.party ? `WAIT FOR A FRIEND ${Math.max(0, Math.ceil(di.wait - di.t))}S · E: RANGERS` : 'RANGERS EN ROUTE'; danger = true; }
    else if (threat && tLevel >= 2) { state = 'MOST DANGEROUS HUNT'; detail = `${short(threat.species)} THREAT: ${tLevel === 3 ? 'HIGH' : 'MEDIUM'}`; danger = true; }
    else if (p.tumble) { state = 'TUMBLING'; detail = 'TRY TO LAND ON SOMETHING SOFT'; }
    else if (p.zip) { state = 'ZIPLINING'; detail = `${Math.round(p.zip.v * 3.6)} KM/H · NO BRAKES`; }
    else if (g.fishing.state === 'fight') { state = 'FISH ON!'; detail = g.fishing.tension > 0.75 ? 'LINE IS ABOUT TO SNAP. LET GO!' : `REEL IT IN · ${Math.max(0, g.fishing.dist - 1.6).toFixed(0)}M`; danger = g.fishing.tension > 0.75; }
    else if (g.fishing.state === 'float' || g.fishing.state === 'bite') { state = 'FISHING'; detail = g.fishing.state === 'bite' ? 'BITE! CLICK!' : 'WATCH THE BOBBER'; }
    else if (g.campfires.roast) { state = 'ROASTING'; detail = g.campfires.roast.burning ? 'IT IS ON FIRE. PULL IT OUT!' : 'WAIT FOR GOLDEN…'; }
    else if (p.warm && g.period === 'night') { state = 'SURVIVE THE NIGHT'; detail = threat ? `${short(threat.species)} NEARBY` : 'WARM BY THE FIRE. WOLVES KEEP CLEAR.'; }
    else if (g.period === 'night') { state = 'SURVIVE THE NIGHT'; detail = threat ? `${short(threat.species)} NEARBY` : null; }
    else if (p.warm && !wounded) { state = 'CAMPING'; detail = p.sugar > 0 ? 'SUGAR RUSH!' : 'E: ROAST A MARSHMALLOW'; }
    else if (wounded && !wounded.downed) { state = 'TRACKING'; detail = `WOUNDED ${short(wounded.species)} · FOLLOW THE BLOOD`; }
    else if (wounded && wounded.downed) { state = 'RECOVERY'; detail = `${short(wounded.species)} DOWN ${dir8(wounded.pos.x - p.pos.x, wounded.pos.z - p.pos.z)} ${Math.round(Math.hypot(wounded.pos.x - p.pos.x, wounded.pos.z - p.pos.z))}M`; }
    else if (p.vehicle) state = 'RIDING';
    else if (p.inBlind) state = 'WAITING IN BLIND';
    else if (p.stance !== 'stand' || g.weapons.aiming) state = 'STALKING';
    else state = 'TRAVELING';
    if (!detail) {
      const job = g.profile.jobs && g.profile.jobs.active[0];
      const last = g.profile.trophies[0];
      const sight = g.animals.sightings[g.animals.sightings.length - 1];
      if (p.stinky > 0) detail = `YOU STINK (${Math.ceil(p.stinky)}S). STAY DOWNWIND.`;
      else if (threat) detail = `${short(threat.species)} NEARBY`;
      else if (job) detail = 'JOB: ' + job.title.toUpperCase();
      else if (last && last.tier !== 'Field Dressed Only') detail = `CLEAN HARVEST: ${last.speciesName.toUpperCase()} ${last.tier.toUpperCase()}`;
      else if (sight) detail = `SIGHTED: ${sight.label.toUpperCase()} ${dir8(sight.x - p.pos.x, sight.z - p.pos.z)} ${Math.round(Math.hypot(sight.x - p.pos.x, sight.z - p.pos.z))}M`;
      else detail = 'FIND SIGN. READ THE WIND.';
    }
    this.txt('sp-state', state); this.txt('sp-detail', detail);
    const el = $('sp-state'); if (this._c.spDanger !== danger) { this._c.spDanger = danger; el.classList.toggle('danger', danger); $('sp-detail').classList.toggle('danger', danger); }
    const h = Math.floor(g.hour), m = Math.floor((g.hour - h) * 60);
    this.txt('sp-clock', `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    // bottom bar
    const stance = g.campfires.roast ? 'ROASTING' : p.sugar > 0 && p.speed > 0.5 ? 'ZOOMING' : p.vehicle ? 'RIDING' : p.tumble ? 'TUMBLING' : p.swimming ? 'SWIMMING' : p.inBlind ? 'HIDDEN' : danger && p.stance === 'stand' ? 'DEFENSIVE' : { stand: 'STANDING', crouch: 'CROUCHING', prone: 'CRAWLING' }[p.stance];
    this.txt('sb-stance', stance);
    const wv = g.wind.vec();
    const from = ((Math.atan2(wv.x, -wv.z) * 180 / Math.PI + 180) % 360 + 360) % 360;
    this.txt('sb-wind', String(Math.round(from) % 360).padStart(3, '0'));
    this.txt('sb-wspd', `${Math.round(g.wind.speed)} M/S`);
    this.txt('sb-weather', `${(g.period || 'day').toUpperCase()} · ${WEATHER_LABEL[g.weather.kind].toUpperCase()}`);
    this.hid('sb-warn', !danger);
  }

  clueText(c) {
    const g = this.game;
    const age = g.time - c.time;
    const fresh = age < 60 ? 'very fresh' : age < 300 ? 'fresh' : age < 900 ? 'a while old' : 'old';
    const sp = SPECIES[c.species];
    const who = c.species === 'hunter' ? (c.who === 'player' ? 'Your own boot print' : 'A hunter\'s boot print') : sp ? sp.displayName : 'Unknown';
    if (c.kind === 'Footprint') {
      const dir = Math.atan2(c.dirX, -c.dirZ) * 180 / Math.PI;
      const heading = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((dir % 360) + 360) % 360 / 45) % 8];
      const gait = c.injured ? '<b>limping</b>' : c.gait ? c.gait.toLowerCase() + 'ing' : '';
      return `<b>${esc(who)}</b> track · ${gait} · heading ${heading} · ${fresh}`;
    }
    if (c.kind === 'BloodPool') return `<b>Blood pool</b> (${esc(who)}) · it rested here, badly hurt · ${fresh}`;
    if (c.kind.startsWith('Blood')) return `<b>Blood</b> (${esc(who)}) · ${c.heavy ? 'heavy, bright — a vital hit' : 'drops'} · ${fresh}`;
    return `<b>${esc(c.kind)}</b> · ${fresh}`;
  }

  updatePrompt() {
    const g = this.game, p = g.player;
    let text = null;
    const a = g.animals.nearestDowned(p.pos, 3.2);
    const quad = !p.vehicle && g.vehicles.nearest(p.pos, 2.6);
    let downFriend = null;
    for (const r of g.coop.peers.values()) if (r.presence && r.presence.dn && r.target && Math.hypot(r.target.x - p.pos.x, r.target.z - p.pos.z) < 2.6) downFriend = r;
    if (downFriend) text = `<kbd>E</kbd>Help ${esc(downFriend.name)} up`;
    else if (p.downed) text = g.downedInfo && g.downedInfo.party ? '<kbd>E</kbd>Give up and call the rangers' : null;
    else if (p.vehicle) text = g.time - p.vehicle.mountedAt > 6 ? null : '<kbd>E</kbd>Hop off · <kbd>Space</kbd>handbrake · <kbd>V</kbd>chase cam';
    else if (a) text = `<kbd>E</kbd>Harvest ${esc(a.species.displayName)}`;
    else if (g.weapons.nearestPickup(p.pos, 2.5)) text = `<kbd>E</kbd>Pick up ${esc(g.weapons.nearestPickup(p.pos, 2.5).label)}`;
    else if (g.campfires.roast) text = null;
    else if (p.zip) text = p.zip.v > 12 ? 'AAAAAAAAA · <kbd>E</kbd>let go' : '<kbd>E</kbd> / <kbd>Space</kbd>let go (not recommended)';
    else if (!p.vehicle && g.ziplines.nearStart(p.pos)) text = '<kbd>E</kbd>Ride the zipline';
    else if (g.weapons.current && g.weapons.current.type === 'rod' && !p.swimming) {
      const fs = g.fishing.state;
      text = fs === 'idle' ? (g.fishing.draw > 0 ? 'Let go to cast!' : '<kbd>Hold click</kbd>wind up a cast at the water')
        : fs === 'float' ? 'Wait for the bite… <kbd>Click</kbd>reel in' : fs === 'bite' ? '<kbd>CLICK!</kbd>Set the hook!'
        : fs === 'show' ? '<kbd>Click</kbd>FISH SLAP · <kbd>R</kbd>let it go' : null;
    }
    else if (g.campfires.canRoast()) text = '<kbd>E</kbd>Roast a marshmallow · <kbd>L</kbd>put the fire out';
    else if (g.nearestKit(p.pos)) text = p.hp < 99 || p.bleed > 0 ? '<kbd>E</kbd>Use first-aid crate' : '<kbd>E</kbd>Nap in the tent';
    else if (quad) text = quad.crashed ? '<kbd>E</kbd>Heave the quad back over' : '<kbd>E</kbd>Ride quad bike';
    else {
      for (const tw of g.structures.towers) if (Math.hypot(p.pos.x - tw.x, p.pos.z - (tw.z + 1.5)) < 2.2 && !p.onTower) text = '<kbd>E</kbd>Climb tower';
      const poi = POIS.find(q => Math.hypot(p.pos.x - q.x, p.pos.z - q.z) < q.r + 4);
      if (!text && poi) text = `<kbd>E</kbd>${poi.kind === 'lodge' ? 'Enter the lodge' : 'Use the ' + esc(poi.name) + ' supply box'}`;
    }
    if (p.tumble && p.tumble.t > 1.2) text = 'Press any key to get up';
    const el = $('prompt');
    if (text) { this.hid('prompt', false); if (this._c['prompt.html'] !== text) { this._c['prompt.html'] = text; el.innerHTML = text; } } else this.hid('prompt', true);
  }

  // ------------------------------------------------------------------ harvest card
  showHarvest(h) {
    this.hideScreens();
    $('harvest').hidden = false;
    $('hv-species').textContent = (h.animal.legendary ? '★ LEGENDARY · ' : '') + h.species.displayName + (h.animal.rareTrait ? ` · RARE ${h.animal.rareTraitName}` : '');
    $('hv-name').textContent = h.animal.nickname;
    $('hv-sub').textContent = `${h.animal.sex} · ${h.animal.ageClass} · ${h.animal.bodyMassKg.toFixed(0)} kg · ${h.animal.temperament}`;
    const tierClass = h.score.tier.split(' ')[0];
    const tb = $('hv-tier'); tb.className = 'tier-badge ' + tierClass; tb.textContent = h.score.tier === 'Field Dressed Only' ? 'Field Dressed' : h.score.tier;
    const rows = [
      ['Biological quality', h.score.biologicalQuality, `${h.species.trophy.label} ${Math.round(h.animal.trophySize01 * 100)}/100 · symmetry ${Math.round(h.animal.trophySymmetry01 * 100)}%`, '#62c3f2'],
      ['Shot quality', h.score.shotQuality, h.shotWhy, '#ff6b2c'],
      ['Trophy integrity', h.score.trophyIntegrity, h.integrityWhy, '#9a6bff'],
      ['Recovery quality', h.score.recoveryQuality, h.recoveryWhy, '#5bbf4a'],
    ];
    $('hv-scores').innerHTML = rows.map(([l, v, why, col]) => `
      <div class="score-row"><div class="lbl"><span>${l}</span><span>${v.toFixed(0)}</span></div>
      <div class="sbar"><i style="width:${Math.max(2, v)}%;background:${col}"></i></div><div class="why">${esc(why)}</div></div>`).join('') +
      `<div class="overall"><span>Overall</span><span>${h.score.overall.toFixed(1)}</span></div>`;
    $('hv-report').innerHTML = `<h4>Field report</h4><ul>${h.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      <h4>Wounds</h4><ul>${h.wounds.map(l => `<li>${esc(l)}</li>`).join('') || '<li>None — it simply gave up.</li>'}</ul>`;
    $('hv-pay').textContent = `+${money(h.cash)}  ·  +${h.xp} XP`;
  }

  // ------------------------------------------------------------------ shop
  renderShop() {
    const g = this.game, p = g.profile;
    $('shop-cash').textContent = money(p.cash);
    const list = $('shop-list');
    const items = [];
    if (this.shopTab === 'weapons') {
      for (const w of Object.values(WEAPONS)) {
        const owned = p.owned.includes(w.id);
        const klass = w.klass ? `Class ${w.klass}` : 'Gadget';
        items.push(`<div class="shop-item"><h4>${esc(w.name)}</h4><div class="meta">${klass} · ${esc(w.ammoLabel || AMMO[w.ammo].name)}</div><p>${esc(w.desc)}</p>
          <div class="buy-row">${owned ? '<span class="owned-tag">Owned</span>' : `<span class="price">${money(w.price)}</span>`}
          ${owned ? (w.type === 'blower' || w.type === 'camera' || w.type === 'rod' ? '' : `<button class="btn alt" data-ammo="${w.id}">Ammo ${money(p.ammoPrice(w.id))}</button>`) : `<button class="btn" data-buy="${w.id}" ${p.cash < w.price ? 'disabled' : ''}>Buy</button>`}</div></div>`);
      }
    } else if (this.shopTab === 'jobs') {
      g.jobs.refreshOffers();
      const S = g.profile.jobs;
      items.push(`<div class="shop-note">Optional jobs from the rangers. Hold up to 3. New ones get posted every in-game day.</div>`);
      for (const j of S.active) items.push(`<div class="shop-item job-item"><h4><span>${esc(j.title)}</span><span class="job-reward">$${j.cash}</span></h4><div class="meta">Active · +${j.xp} XP</div><p>${esc(j.desc)}</p>
        <div class="buy-row"><span class="owned-tag">In progress</span><button class="btn ghost" data-abandon="${esc(j.id)}">Abandon</button></div></div>`);
      for (const j of S.offers) items.push(`<div class="shop-item job-item"><h4><span>${esc(j.title)}</span><span class="job-reward">$${j.cash}</span></h4><div class="meta">Posted by the rangers · +${j.xp} XP</div><p>${esc(j.desc)}</p>
        <div class="buy-row"><span></span><button class="btn" data-accept="${esc(j.id)}" ${S.active.length >= 3 ? 'disabled' : ''}>Take job</button></div></div>`);
    } else {
      for (const gr of Object.values(GEAR)) {
        const have = p.gear[gr.id] || 0;
        const can = gr.stack || !have;
        items.push(`<div class="shop-item"><h4>${esc(gr.name)}</h4><div class="meta">${have ? (gr.stack ? `You have ${have}` : 'Owned') : 'Not owned'}</div><p>${esc(gr.desc)}</p>
          <div class="buy-row"><span class="price">${gr.price ? money(gr.price) : 'Free'}</span>
          ${can ? `<button class="btn" data-gear="${gr.id}" ${p.cash < gr.price ? 'disabled' : ''}>Buy</button>` : (gr.call ? `<button class="btn ghost" data-callsel="${gr.id}">${p.selectedCall === gr.id ? 'Selected' : 'Use on T'}</button>` : '<span class="owned-tag">Owned</span>')}</div></div>`);
      }
    }
    list.innerHTML = items.join('');
    list.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { if (p.buyWeapon(b.dataset.buy)) { g.audio.play('cash'); g.weapons.onInventoryChanged(); this.feed(`Bought the ${WEAPONS[b.dataset.buy].name}!`, 'good'); } this.renderShop(); });
    list.querySelectorAll('[data-ammo]').forEach(b => b.onclick = () => { if (p.buyAmmo(b.dataset.ammo)) g.audio.play('cash'); this.renderShop(); });
    list.querySelectorAll('[data-gear]').forEach(b => b.onclick = () => { if (p.buyGear(b.dataset.gear)) { g.audio.play('cash'); if (GEAR[b.dataset.gear].call) p.selectedCall = b.dataset.gear; if (b.dataset.gear === 'dog') { g.audio.play('woof'); this.feed('Biscuit joins the hunt! Press K to send her after something you hit, K again to call her back.', 'good'); } } this.renderShop(); });
    list.querySelectorAll('[data-accept]').forEach(b => b.onclick = () => { g.jobs.accept(b.dataset.accept); this.renderShop(); });
    list.querySelectorAll('[data-abandon]').forEach(b => b.onclick = () => { g.jobs.abandon(b.dataset.abandon); this.renderShop(); });
    list.querySelectorAll('[data-callsel]').forEach(b => b.onclick = () => { p.selectedCall = b.dataset.callsel; p.save(); this.renderShop(); });
  }

  renderTrophies() {
    const p = this.game.profile;
    this.renderAlbum();
    const fish = p.fish || {};
    $('fish-records').innerHTML = FISH.filter(f => !f.junk).map(f => `<div class="rec${fish[f.id] ? '' : ' none'}"><span>${esc(f.name)}${f.legendary ? ' ✦' : ''}</span><b>${fish[f.id] ? fish[f.id].toFixed(2) + ' kg' : '—'}</b></div>`).join('');
    const s = p.stats;
    const log = [
      ['Clean harvests', s.harvests || 0], ['Fish caught', s.fish || 0], ['Perfect marshmallows', s.smores || 0], ['Marshmallows cremated', s.charcoal || 0],
      ['Fish slaps delivered', s.slaps || 0], ['Loot rescued from raccoons', s.recovered || 0], ['Ranger jobs done', s.jobs || 0], ['Hairy Hiker photos', s.hiker || 0],
    ];
    $('ranger-log').innerHTML = log.map(([k, v]) => `<div class="rec${v ? '' : ' none'}"><span>${k}</span><b>${v}</b></div>`).join('');
    const list = $('trophy-list');
    if (!p.trophies.length) { list.innerHTML = '<div class="trophy-empty">Nothing on the wall yet. The wall is waiting.</div>'; return; }
    list.innerHTML = p.trophies.map(t => `<div class="trophy-item"><h4>${esc(t.nickname)}</h4>
      <div>${esc(t.speciesName)} · ${esc(t.sex)} · ${t.mass.toFixed(0)} kg</div>
      <div><b>${esc(t.tier)}</b> · ${t.overall.toFixed(1)} pts · ${esc(t.weapon)} at ${t.distance.toFixed(0)} m</div>
      <div>${esc(t.date)}</div></div>`).join('');
  }

  renderAlbum() {
    const p = this.game.profile, list = $('photo-list');
    list.textContent = '';
    if (!p.photos.length) { const d = document.createElement('div'); d.className = 'trophy-empty'; d.textContent = 'No photos yet. Pick the camera (it is in your slots) and aim with right click.'; list.appendChild(d); return; }
    for (const ph of p.photos) {
      const item = document.createElement('div'); item.className = 'photo-item';
      const img = document.createElement('img'); img.alt = `Photo of ${ph.name}`;
      if (typeof ph.img === 'string' && ph.img.startsWith('data:image/jpeg')) img.src = ph.img;
      const cap = document.createElement('div'); cap.className = 'cap';
      const st = document.createElement('span'); st.className = 'stars'; st.textContent = '★'.repeat(ph.stars) + '☆'.repeat(5 - ph.stars);
      cap.append(st, document.createElement('br'), ph.trophy ? `${ph.nickname} the ${ph.name} · ${ph.action}` : `${ph.nickname} the ${ph.name}, ${ph.action}, ${Math.round(ph.dist)} m`);
      item.append(img, cap);
      list.appendChild(item);
    }
  }

  photoFlash(bright) {
    const el = $('photo-flash');
    el.style.background = bright ? '#fff' : '#000';
    el.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('on')));
  }

  // ------------------------------------------------------------------ map
  buildMapImage() {
    if (this.mapImage) return this.mapImage;
    const T = this.game.terrain;
    const c = document.createElement('canvas');
    c.width = GRID; c.height = GRID;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(GRID, GRID);
    for (let i = 0; i < GRID * GRID; i++) {
      const b = T.biomes[i];
      const col = BIOME_COLORS[b] ?? 0xff00ff;
      const water = b === 6;
      const h = T.heights[i];
      const shade = water ? 1 : Math.min(1.15, 0.82 + h / 250);
      const [r, gg, bb] = water ? [79, 191, 216] : [(col >> 16) & 255, (col >> 8) & 255, col & 255];
      img.data[i * 4] = Math.min(255, r * shade); img.data[i * 4 + 1] = Math.min(255, gg * shade); img.data[i * 4 + 2] = Math.min(255, bb * shade); img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapImage = c;
    return c;
  }

  renderMap() {
    const g = this.game;
    const cv = $('map-canvas'), ctx = cv.getContext('2d');
    const S = cv.width;
    const toPx = (x, z) => [(x + HALF) / WORLD_SIZE * S, (z + HALF) / WORLD_SIZE * S];
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.buildMapImage(), 0, 0, S, S);
    // contour-ish grid
    ctx.strokeStyle = 'rgba(42,31,46,.12)'; ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(i * S / 8, 0); ctx.lineTo(i * S / 8, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * S / 8); ctx.lineTo(S, i * S / 8); ctx.stroke(); }
    // harvest markers
    for (const t of g.profile.trophies.slice(0, 30)) if (t.x !== undefined) {
      const [x, y] = toPx(t.x, t.z);
      ctx.fillStyle = '#e8384f'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.28); ctx.fill();
    }
    // hunting pressure (red haze where there's been a lot of shooting)
    for (const pz of g.animals.pressure || []) {
      if (pz.v < 1.5) continue;
      const [x, y] = toPx(pz.x, pz.z);
      const rr = 250 / WORLD_SIZE * S;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, rr);
      grd.addColorStop(0, `rgba(232,56,79,${Math.min(0.45, pz.v * 0.07)})`); grd.addColorStop(1, 'rgba(232,56,79,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.28); ctx.fill();
    }
    // discovered need zones: icon by need, label with species + time window
    const needCol = { feed: '#5bbf4a', drink: '#4fb4f0', rest: '#9a6bff' };
    const hh = (h) => String(Math.floor(h)).padStart(2, '0');
    for (const z of g.animals.zones) {
      if (!z.discovered || !z.need) continue;
      const [x, y] = toPx(z.x, z.z);
      const active = inWindow(g.hour, z);
      ctx.fillStyle = needCol[z.need]; ctx.strokeStyle = '#2a1f2e'; ctx.lineWidth = active ? 3 : 2;
      ctx.beginPath();
      if (z.need === 'drink') { ctx.moveTo(x, y - 9); ctx.quadraticCurveTo(x + 8, y + 2, x, y + 7); ctx.quadraticCurveTo(x - 8, y + 2, x, y - 9); }
      else if (z.need === 'rest') { ctx.arc(x, y, 7, 0.6, 5.7); ctx.arc(x + 3, y - 1, 5, 5.2, 1.1, true); }
      else { ctx.ellipse(x, y, 4.5, 8, 0.6, 0, 6.28); }
      ctx.fill(); ctx.stroke();
      ctx.font = '800 9px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#2a1f2e';
      ctx.fillText(`${SPECIES[z.species].displayName.split(' ').pop()} ${hh(z.from)}–${hh(z.to)}`, x, y + 18);
    }
    // animal sightings (things you have seen recently)
    for (const s of g.animals.sightings.slice(-20)) {
      const [x, y] = toPx(s.x, s.z);
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.strokeStyle = '#2a1f2e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.28); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a1f2e'; ctx.font = '800 10px Nunito, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(s.label, x, y - 9);
    }
    // POIs
    this.mapTargets = [];
    for (const poi of POIS) {
      const [x, y] = toPx(poi.x, poi.z);
      const known = g.profile.discovered.includes(poi.id);
      ctx.fillStyle = poi.kind === 'lodge' ? '#ff6b2c' : known ? '#ffd23f' : '#ffffff';
      ctx.strokeStyle = '#2a1f2e'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 9, y - 9, 18, 18, 5) : ctx.rect(x - 9, y - 9, 18, 18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a1f2e'; ctx.font = '800 13px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(known ? poi.name : '???', x, y + 24);
      this.mapTargets.push({ poi, x, y, known });
    }
    for (const tw of g.structures.towers) { const [x, y] = toPx(tw.x, tw.z); ctx.fillStyle = '#6aa84f'; ctx.fillRect(x - 3, y - 3, 6, 6); }
    // ziplines: orange dashed runs with a dot at the top
    ctx.save(); ctx.strokeStyle = '#ff6b2c'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
    for (const l of g.ziplines.lines) { const [ax, ay] = toPx(l.a.x, l.a.z), [bx, by] = toPx(l.b.x, l.b.z); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.fillStyle = '#ff6b2c'; ctx.fillRect(ax - 3, ay - 3, 6, 6); }
    ctx.restore();
    // legendary rumour: a fuzzy golden circle
    const rm = g.animals.rumor;
    if (rm && g.animals.list.some(a => a.id === rm.id && !a.harvested)) {
      const [x, y] = toPx(rm.x, rm.z); const rr = rm.r / WORLD_SIZE * S;
      ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = '#d9a400'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(255,210,74,.18)';
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#2a1f2e'; ctx.font = '800 12px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`Legend: ${rm.name}?`, x, y - rr - 4);
    }
    // landmarks
    if (g.profile.discovered.includes('falls') && g.waterfall) {
      const [x, y] = toPx(g.waterfall.base.x, g.waterfall.base.z);
      ctx.fillStyle = '#62c3f2'; ctx.strokeStyle = '#2a1f2e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(x - 4, y - 9, 8, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 7, 1.5, 8); ctx.fillRect(x + 1, y - 6, 1.5, 7);
      ctx.fillStyle = '#2a1f2e'; ctx.font = '800 12px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Whispering Falls', x, y + 17);
    }
    // camp tents (first aid + naps): a little canvas triangle with a red cross
    for (const t of g.structures.tents || []) {
      const [x, y] = toPx(t.x, t.z);
      ctx.fillStyle = '#c9b48a'; ctx.strokeStyle = '#2a1f2e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x - 6, y + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8384f'; ctx.fillRect(x - 1, y - 1, 2, 5); ctx.fillRect(x - 2.5, y + 0.5, 5, 2);
    }
    // quad bikes where they're parked (or wherever you left them)
    for (const v of g.vehicles.list) {
      const [x, y] = toPx(v.pos.x, v.pos.z);
      ctx.fillStyle = v.crashed ? '#888' : '#ff6b2c'; ctx.strokeStyle = '#2a1f2e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 5, y - 3, 10, 6, 2) : ctx.rect(x - 5, y - 3, 10, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a1f2e'; ctx.beginPath(); ctx.arc(x - 4, y + 4, 2, 0, 6.28); ctx.arc(x + 4, y + 4, 2, 0, 6.28); ctx.fill();
    }
    // party members
    for (const m of g.coop.members()) {
      const [x, y] = toPx(m.x, m.z);
      ctx.fillStyle = hex(m.color); ctx.strokeStyle = '#2a1f2e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.28); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a1f2e'; ctx.fillText(m.name, x, y - 10);
    }
    // player arrow
    const p = g.player;
    const [px, py] = toPx(p.pos.x, p.pos.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-p.yaw);
    ctx.fillStyle = '#ff6b2c'; ctx.strokeStyle = '#2a1f2e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // compass rose
    ctx.fillStyle = '#2a1f2e'; ctx.font = '800 18px "Baloo 2", sans-serif'; ctx.fillText('N', S - 22, 26);
  }

  mapClick(e) {
    const g = this.game;
    if (!this.mapTargets || g.menuReturn !== 'play') return;
    const cv = $('map-canvas');
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * cv.width, y = (e.clientY - r.top) / r.height * cv.height;
    for (const t of this.mapTargets) {
      if (Math.hypot(t.x - x, t.y - y) < 16) {
        if (!t.known) { this.feed('You have not found that outpost yet. Walk there first.', 'warn'); return; }
        if (g.profile.cash < 25) { this.feed('Fast travel costs $25. You are broke.', 'warn'); return; }
        g.profile.cash -= 25; g.profile.save();
        g.player.spawnAt(t.poi.spawn.x, t.poi.spawn.z, t.poi.spawn.yaw);
        g.hour = (g.hour + 0.5) % 24;
        g.animals.populateAround(g.player.pos, true);
        g.closeMenu();
        this.feed(`Fast travelled to ${t.poi.name}.`, 'info');
        return;
      }
    }
  }
}
