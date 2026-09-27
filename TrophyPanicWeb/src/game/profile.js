// Per-viewer save: wallet, XP, owned equipment, ammo, trophies, settings,
// and the hunter's look. Browser storage only (it can be missing), so every
// access is guarded and the game works without it.

import { WEAPONS, GEAR, WEAPON_ORDER } from '../sim/arsenal.js';
import { JACKETS } from '../entities/hunter.js';

const KEY = 'trophyPanic.profile.v1';

const DEFAULTS = () => ({
  name: 'Pip',
  jacket: 'blaze',
  hat: 'beanie',
  skin: 0,
  cash: 300,
  xp: 0,
  owned: ['rifle_243', 'boot', 'chicken'],
  ammo: {},        // weapon id -> reserve rounds
  gear: { bandage: 3, grunt_call: 1, binoculars: 1, scent_spray: 1, energy_drink: 1 },
  shells: '12ga_bird',
  trophies: [],
  discovered: ['lodge'],
  stats: { harvests: 0, shots: 0, downs: 0, bestScore: 0, distance: 0 },
  settings: { sens: 1, volume: 0.7, fov: 72, quality: 'auto', reports: true, gore: 'full' },
});

export class Profile {
  constructor(saved) {
    let data = null;
    if (saved) data = saved;
    else {
      try { const raw = localStorage.getItem(KEY); if (raw) data = JSON.parse(raw); } catch { data = null; }
    }
    const d = DEFAULTS();
    Object.assign(this, d, data || {});
    this.settings = { ...d.settings, ...(data && data.settings) };
    this.stats = { ...d.stats, ...(data && data.stats) };
    this.gear = { ...(data && data.gear ? data.gear : d.gear) };
    for (const id of this.owned) if (this.ammo[id] === undefined) this.ammo[id] = WEAPONS[id] ? WEAPONS[id].reserve : 0;
  }

  get level() { return 1 + Math.floor(Math.sqrt(this.xp / 120)); }
  xpForNext() { const l = this.level; return 120 * l * l; }

  look() {
    const j = JACKETS.find(x => x.id === this.jacket) || JACKETS[0];
    return { jacket: j.hex, hat: this.hat, skin: this.skin };
  }

  toJSON() {
    const { name, jacket, hat, skin, cash, xp, owned, ammo, gear, shells, trophies, discovered, stats, settings } = this;
    return { name, jacket, hat, skin, cash, xp, owned, ammo, gear, shells, trophies, discovered, stats, settings };
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.toJSON())); } catch { /* storage unavailable */ }
  }

  ownedWeapons() { return WEAPON_ORDER.filter(id => this.owned.includes(id)); }

  buyWeapon(id) {
    const w = WEAPONS[id];
    if (!w || this.owned.includes(id) || this.cash < w.price) return false;
    this.cash -= w.price;
    this.owned.push(id);
    this.ammo[id] = w.reserve;
    this.save();
    return true;
  }

  ammoPrice(id) {
    const w = WEAPONS[id];
    if (!w) return 0;
    if (w.type === 'thrown') return 10;
    if (w.type === 'blower') return 0;
    return w.klass >= 4 ? 45 : w.klass === 3 ? 30 : w.type === 'bow' ? 35 : 18;
  }
  buyAmmo(id) {
    const p = this.ammoPrice(id);
    const w = WEAPONS[id];
    if (!w || !this.owned.includes(id) || this.cash < p) return false;
    this.cash -= p;
    this.ammo[id] = (this.ammo[id] || 0) + (w.type === 'thrown' ? 1 : w.magazine * 2);
    this.save();
    return true;
  }

  buyGear(id) {
    const g = GEAR[id];
    if (!g || this.cash < g.price) return false;
    if (!g.stack && this.gear[id]) return false;
    this.cash -= g.price;
    this.gear[id] = (this.gear[id] || 0) + 1;
    this.save();
    return true;
  }
  useGear(id) {
    if (!this.gear[id]) return false;
    if (GEAR[id] && GEAR[id].stack) this.gear[id]--;
    this.save();
    return true;
  }

  bestCall() {
    // T uses whichever call you most recently bought/selected.
    const calls = ['predator_call', 'bugle_call', 'gobble_call', 'grunt_call'].filter(c => this.gear[c]);
    if (this.selectedCall && this.gear[this.selectedCall]) return GEAR[this.selectedCall].call;
    return calls.length ? GEAR[calls[calls.length - 1]].call : null;
  }
  callName(kind) {
    const g = Object.values(GEAR).find(x => x.call === kind);
    return g ? g.name : 'call';
  }

  discover(poiId) { if (!this.discovered.includes(poiId)) { this.discovered.push(poiId); this.save(); } }

  addTrophy(t) {
    this.trophies.unshift(t);
    if (this.trophies.length > 60) this.trophies.length = 60;
    this.stats.harvests++;
    this.stats.bestScore = Math.max(this.stats.bestScore, t.overall);
    this.save();
  }
}
