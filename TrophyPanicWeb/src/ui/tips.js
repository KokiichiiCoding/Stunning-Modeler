// Ranger tips: short, contextual, once-per-profile hints that appear when
// the situation first comes up (not a wall of text on the title screen).

const $ = (id) => document.getElementById(id);

const TIPS = [
  { id: 'wind', when: (g) => g.time > 6, text: 'Animals smell you downwind. The wind arrow (top) shows where your scent drifts — keep it blowing away from them.' },
  { id: 'clue', when: (g) => !!g.fx.focusClue, text: 'That\'s sign! Press Q for hunter sense to light up tracks and blood around you. Fresh prints point where it went.' },
  { id: 'spot', when: (g) => g.animals.sightings.length > 0, text: 'Spotted something? B for binoculars: it names the animal, its range and a trophy estimate.' },
  { id: 'quad', when: (g) => !g.player.vehicle && !!g.vehicles.nearest(g.player.pos, 7), text: 'Quad bikes are fast and LOUD. Great for getting around, terrible for sneaking. Don\'t side-hill steep slopes.' },
  { id: 'danger', when: (g) => g.animals.list.some(a => a.alive && a.species.danger >= 2 && Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) < 90), text: 'Something dangerous is close. Cougar? Face it, don\'t run. Bear charging? Go prone (Z) and play dead. Or just leave.' },
  { id: 'hit', when: (g) => g.animals.list.some(a => a.firstHitTime >= 0 && !a.downed && a.alive), text: 'It ran? Hits leave blood. Follow the drops (Q helps) — or let a tracking dog (lodge) do the sniffing. Don\'t wait for rain.' },
  { id: 'harvest', when: (g) => !!g.animals.nearestDowned(g.player.pos, 40), text: 'It\'s down. Walk up and press E to harvest: the score rewards clean shots, trophy condition and a quick recovery.' },
  { id: 'rain', when: (g) => g.weather.rain > 0.5, text: 'Rain washes tracks and blood away fast, but it also covers your footsteps. Good time to stalk, bad time to wound.' },
  { id: 'fog', when: (g) => g.weather.fog > 0.6, text: 'Fog: nobody sees far. Get close, stay quiet, and keep your ears on.' },
  { id: 'night', when: (g) => g.period === 'night', text: 'Night: F toggles your flashlight. Predators get bolder in the dark.' },
  { id: 'zones', when: (g) => g.time > 240, text: 'Animals keep schedules: feeding, drinking and resting zones at set hours. Press Q inside one to log it on your map (M).' },
  { id: 'jobs', when: (g) => g.time > 150 && g.profile.jobs && !g.profile.jobs.active.length, text: 'The lodge and outpost boxes post Ranger jobs (E at a supply box → Ranger jobs). Optional, and they pay.' },
  { id: 'camera', when: (g) => g.time > 420 && !g.profile.photos.length, text: 'Your Snappy Camera is in the slots. Right click to frame, click to snap. New species pay, and the album keeps your best shots.' },
  { id: 'party', when: (g) => g.time > 600 && !g.coop.inParty(), text: 'Hunting is sillier with friends: share this page, type the same party code, and ping (X) what you see.' },
];

export class Tips {
  constructor(game) {
    this.game = game;
    this.acc = 0;
    this.cool = 4;
    this.showT = 0;
    this.el = $('tip-card');
    this.txt = $('tip-text');
  }

  get seen() { const p = this.game.profile; if (!Array.isArray(p.tips)) p.tips = []; return p.tips; }

  step(dt) {
    const g = this.game;
    if (this.showT > 0) { this.showT -= dt; if (this.showT <= 0) this.el.classList.remove('on'); }
    if (g.state !== 'play' || g.profile.settings.tips === false) return;
    this.cool -= dt;
    this.acc += dt;
    if (this.acc < 0.5 || this.cool > 0) return;
    this.acc = 0;
    const seen = this.seen;
    for (const t of TIPS) {
      if (seen.includes(t.id)) continue;
      let ok = false;
      try { ok = t.when(g); } catch { ok = false; }
      if (!ok) continue;
      seen.push(t.id);
      g.profile.save();
      this.show(t.text);
      break;
    }
  }

  show(text) {
    this.txt.textContent = text;
    this.el.classList.add('on');
    this.showT = Math.min(11, 4 + text.length / 22);
    this.cool = this.showT + 14;
    this.game.audio.play('sense');
  }
}
