// Ranger jobs: optional, seeded side-objectives posted on the lodge and
// outpost boards. The reserve stays open-world — jobs just give you a
// reason to try the bow, bring a camera, or jump the quad off something.
// Jobs listen to plain gameplay events; nothing here touches the sim.

import { Rng } from '../core/rng.js';
import { SPECIES } from '../sim/species.js';
import { POIS } from '../world/terrainData.js';

const MAX_ACTIVE = 3;
const OFFERS = 4;

const short = (sp) => SPECIES[sp].displayName.split(' ').pop().toLowerCase();
const an = (w) => (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w;

function speciesFor(rng, level, pool = null) {
  const tiers = [['deer', 'turkey', 'rabbit', 'boar', 'fox', 'skunk', 'raccoon'], ['elk', 'black_bear'], ['moose', 'wolf', 'bison'], ['grizzly', 'cougar']];
  const open = tiers.slice(0, Math.min(4, 1 + Math.floor(Math.max(0, level - 1) / 2))).flat();
  const list = pool ? open.filter(s => pool.includes(s)) : open;
  return rng.pick(list.length ? list : open);
}

const TEMPLATES = [
  { w: 3, make: (r, L) => { const sp = speciesFor(r, L); return { type: 'harvest', sp, title: `Harvest ${an(short(sp))}`, desc: `Any clean harvest counts. The lodge needs ${short(sp)} for the season count.`, cash: Math.round(SPECIES[sp].value * 0.45 + 40), xp: 60 }; } },
  { w: 1.6, make: (r, L) => { const sp = speciesFor(r, L); return { type: 'harvest', sp, minScore: 75, title: `Gold-grade ${short(sp)}`, desc: `Harvest ${an(short(sp))} scoring 75+. Shot placement and recovery matter.`, cash: Math.round(SPECIES[sp].value * 0.8 + 80), xp: 120 }; } },
  { w: 1.3, make: (r, L) => { const sp = speciesFor(r, L, ['deer', 'turkey', 'rabbit', 'boar', 'elk']); return { type: 'harvest', sp, weapon: 'bow', title: `Bow-hunt ${an(short(sp))}`, desc: 'Quiet, close and traditional. Any bow.', cash: Math.round(SPECIES[sp].value * 0.7 + 90), xp: 110 }; } },
  { w: 1, make: () => ({ type: 'harvest', minDist: 150, title: 'Long-range harvest', desc: 'Harvest anything with a first shot from 150 m or more. Check the wind.', cash: 160, xp: 100 }) },
  { w: 1, make: () => ({ type: 'harvest', minRecovery: 80, title: 'Blood trailer', desc: 'Recover an animal that ran 80 m or more after the hit. Hunter sense (Q) helps.', cash: 140, xp: 90 }) },
  { w: 3, make: (r, L) => { const sp = speciesFor(r, L + 2); return { type: 'photo', sp, minStars: 3, title: `Photograph ${an(short(sp))}`, desc: 'Three stars or better: fill the frame, centre it, broadside is best.', cash: Math.round(SPECIES[sp].value * 0.25 + 50), xp: 50 }; } },
  { w: 1.2, make: (r, L) => { const sp = r.pick(L >= 5 ? ['grizzly', 'cougar', 'wolf', 'moose', 'black_bear', 'bison'] : ['black_bear', 'boar', 'moose', 'bison']); return { type: 'photo', sp, maxDist: 35, title: `Close-up: ${short(sp)}`, desc: `Photograph ${an(short(sp))} from within 35 m. Then leave. Quickly.`, cash: Math.round(SPECIES[sp].value * 0.4 + 120), xp: 120 }; } },
  { w: 0.7, make: (r, L) => { const sp = r.pick(L >= 5 ? ['grizzly', 'black_bear', 'cougar', 'wolf'] : ['black_bear', 'boar']); return { type: 'spray', sp, title: `Pepper ${an(short(sp))}`, desc: `Hit ${an(short(sp))} with bear spray (lodge, $120) and live to tell it.`, cash: 140, xp: 110 }; } },
  { w: 1, make: () => ({ type: 'air', minAir: 1.4, title: 'Quad bike stunt', desc: 'Get 1.4 seconds of air on a quad and land it. The rangers will pretend not to see.', cash: 90, xp: 60 }) },
  { w: 1, make: (r) => { const poi = r.pick(POIS.filter(p => p.kind !== 'lodge')); return { type: 'visit', poi: poi.id, title: `Check on ${poi.name}`, desc: `Walk (or drive) to ${poi.name} and restock its supply box.`, cash: 70, xp: 40 }; } },
  { w: 0.9, make: (r) => { const sp = r.pick(['turkey', 'rabbit', 'deer']); return { type: 'bonk', sp, title: `Boop ${an(short(sp))}`, desc: `Hit ${an(short(sp))} with a thrown boot or rubber chicken. For science.`, cash: 60, xp: 50 }; } },
  { w: 0.7, make: () => ({ type: 'recover', title: 'Raccoon justice', desc: 'Get something back from a Bandit Raccoon. Stand still near one (they love that), then bonk it when it runs.', cash: 70, xp: 60 }) },
  { w: 1.1, make: (r) => { const kg = r.pick([1, 2, 3]); return { type: 'fish', minKg: kg, title: `Catch a ${kg}+ kg fish`, desc: `Any fish ${kg} kg or heavier. The lake and the river both count. Boots do not.`, cash: 40 + kg * 25, xp: 30 + kg * 15 }; } },
  { w: 0.6, make: () => ({ type: 'fish', fish: 'pike', title: 'Catch a Grumpy Pike', desc: 'They lurk in the lake and bite harder at dusk. Mind the teeth.', cash: 120, xp: 90 }) },
  { w: 0.7, make: () => ({ type: 'zip', title: 'Zipline inspection', desc: 'Ride one of the reserve ziplines (orange dashes on the map). Checking the brakes is optional, because there are none.', cash: 60, xp: 40 }) },
  { w: 0.8, make: () => ({ type: 'marsh', title: 'Perfect marshmallow', desc: 'Light a campfire (L), roast a marshmallow (E) and pull it out golden. Not on fire. Golden.', cash: 50, xp: 40 }) },
  { w: 0.5, make: (r, L) => (L >= 4 ? { type: 'staredown', sp: 'cougar', title: 'Stare down a cougar', desc: 'When a cougar stalks you, face it and hold still. Do not run.', cash: 150, xp: 120 } : { type: 'playdead', sp: 'black_bear', title: 'Play dead', desc: 'Survive a bear by lying flat (Z) and holding still.', cash: 120, xp: 100 }) },
];

function describeProgress(j) { return j.need > 1 ? ` (${j.have}/${j.need})` : ''; }

export class Jobs {
  constructor(game) {
    this.game = game;
    const p = game.profile;
    if (!p.jobs || !Array.isArray(p.jobs.active)) p.jobs = { offers: [], active: [], done: 0, day: -1 };
  }

  get state() { return this.game.profile.jobs; }

  refreshOffers(force = false) {
    const g = this.game, S = this.state;
    const day = Math.floor(g.time / g.daySeconds);
    if (!force && S.day === day && S.offers.length) return;
    S.day = day;
    const rng = new Rng((g.sessionSeed ^ Math.imul(day + 1, 0x9e3779b1) ^ Math.imul(S.done + 7, 0x85ebca6b)) >>> 0);
    S.offers = [];
    const seen = new Set(S.active.map(j => j.title));
    let guard = 0;
    while (S.offers.length < OFFERS && guard++ < 40) {
      const t = rng.weighted(TEMPLATES.map(t => ({ w: t.w, v: t })));
      const j = t.make(rng, g.profile.level);
      if (seen.has(j.title)) continue;
      seen.add(j.title);
      j.need = j.need || 1; j.have = 0;
      j.id = `j${day}_${S.done}_${S.offers.length}_${rng.int(0, 1e6)}`;
      S.offers.push(j);
    }
  }

  accept(id) {
    const S = this.state;
    if (S.active.length >= MAX_ACTIVE) { this.game.ui.feed(`You can hold ${MAX_ACTIVE} jobs at once.`, 'warn'); return false; }
    const i = S.offers.findIndex(j => j.id === id);
    if (i < 0) return false;
    const [j] = S.offers.splice(i, 1);
    S.active.push(j);
    if (j.type === 'visit') this.game._lastPoi = null; // already standing there counts
    this.game.profile.save();
    this.game.ui.feed(`Job taken: ${j.title}.`, 'info');
    return true;
  }

  abandon(id) {
    const S = this.state;
    S.active = S.active.filter(j => j.id !== id);
    this.game.profile.save();
  }

  matches(j, type, ev) {
    if (j.type !== type) return false;
    if (j.sp && ev.sp !== j.sp) return false;
    switch (type) {
      case 'harvest':
        if (j.minScore && !(ev.overall >= j.minScore)) return false;
        if (j.weapon && ev.wtype !== j.weapon) return false;
        if (j.minDist && !(ev.dist >= j.minDist)) return false;
        if (j.minRecovery && !(ev.recovery >= j.minRecovery)) return false;
        return true;
      case 'photo':
        if (j.minStars && !(ev.stars >= j.minStars)) return false;
        if (j.maxDist && !(ev.dist <= j.maxDist)) return false;
        return true;
      case 'air': return ev.t >= j.minAir;
      case 'visit': return ev.poi === j.poi;
      case 'fish':
        if (ev.junk) return false;
        if (j.fish && ev.fish !== j.fish) return false;
        return !(j.minKg && !(ev.kg >= j.minKg));
      default: return true; // bonk / staredown / playdead matched on species above
    }
  }

  /** Feed a gameplay event to every active job. */
  onEvent(type, ev = {}) {
    const g = this.game, S = this.state;
    if (!S || !S.active.length) return;
    let changed = false;
    for (const j of S.active) {
      if (j.complete || !this.matches(j, type, ev)) continue;
      j.have++;
      changed = true;
      if (j.have >= j.need) {
        j.complete = true;
        const pr = g.profile, lvl = pr.level;
        pr.cash += j.cash; pr.xp += j.xp;
        S.done++;
        pr.stats.jobs = (pr.stats.jobs || 0) + 1;
        g.ui.toast(`Ranger job done: ${j.title}! +$${j.cash}`, 'big', 3);
        g.ui.feed(`Job complete: ${j.title} (+$${j.cash}, +${j.xp} XP)`, 'good');
        g.audio.play('cash');
        if (pr.level > lvl) { g.audio.play('levelup'); g.ui.feed(`Level up! You are now level ${pr.level}.`, 'good'); }
      }
    }
    if (changed) { S.active = S.active.filter(j => !j.complete); g.profile.save(); }
  }

  hudLines() { return this.state.active.map(j => j.title + describeProgress(j)); }
}
