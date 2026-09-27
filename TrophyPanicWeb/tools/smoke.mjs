// Headless browser smoke test: loads dist/dev.html in Chromium (WebGL via
// SwiftShader), serves the three.js CDN URL from node_modules, drives a
// short scripted session, fails on any page error, and writes screenshots
// to shots/. Usage: node tools/smoke.mjs [--script name] [--frames N]

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'shots');
mkdirSync(shots, { recursive: true });
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js';

const args = process.argv.slice(2);
const scriptName = args.includes('--script') ? args[args.indexOf('--script') + 1] : 'basic';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => { window.__TP_TEST = true; });
const errors = [];
const logs = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}\n${e.stack || ''}`));
page.on('console', m => {
  const t = `[${m.type()}] ${m.text()}`;
  logs.push(t);
  if (m.type() === 'error') errors.push(t);
});
await page.route(THREE_CDN, route => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: readFileSync(join(root, 'node_modules', 'three', 'build', 'three.min.js')),
}));
await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.route('https://fonts.gstatic.com/**', r => r.abort());

await page.goto('file://' + join(root, 'dist', 'dev.html'));
await page.waitForFunction(() => window.__tp && window.__tp.ready, null, { timeout: 120000 });
console.log('  booted');
await page.evaluate(() => window.__tp.debug.renderOnce());

const t0 = Date.now();
const shot = async (name) => {
  await page.screenshot({ path: join(shots, `${name}.png`), timeout: 120000 });
  console.log(`  shot: shots/${name}.png  (+${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};
const wait = ms => page.waitForTimeout(ms);
const step = async (n) => page.evaluate(k => window.__tp.debug.stepFrames(k), n);

const scripts = {
  async danger() {
    await page.evaluate(() => window.__tp.debug.startGame({}));
    for (const [sp, dist, hour] of [['grizzly', 22, 10], ['moose', 14, 10], ['black_bear', 18, 10], ['wolf', 45, 20.5], ['cougar', 40, 21], ['boar', 12, 10]]) {
      const r = await page.evaluate(({ sp, dist, hour }) => {
        const g = window.__tp.game;
        g.hour = hour;
        // clear the reserve and spawn just this species nearby
        for (const a of g.animals.list) a.dispose();
        g.animals.list = []; g.animals.groups = [];
        g.player.spawnAt(-60, 200, 0);
        let tries = 0;
        while (!g.animals.list.some(a => a.species.id === sp) && tries++ < 200) {
          for (const a of g.animals.list) a.dispose();
          g.animals.list = []; g.animals.groups = [];
          g.animals.spawnGroup(g.player.pos);
        }
        const info = window.__tp.debug.approach(sp, dist);
        g.player.hp = 100; g.player.bleed = 0;
        return info;
      }, { sp, dist, hour });
      if (!r) { console.log('  no', sp); continue; }
      const log = await page.evaluate(() => {
        const g = window.__tp.game;
        const states = new Set();
        let tumbles = 0, minD = 1e9;
        const a0 = g.animals.list.find(a => a.species.id === window.__tp._sp) || null;
        for (let i = 0; i < 60 * 20; i++) {
          g.advance(1 / 60);
          for (const a of g.animals.list) { states.add(a.species.id + ':' + a.state); minD = Math.min(minD, Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z)); }
          if (g.player.tumble) tumbles++;
          if (g.player.downed) break;
        }
        return { hp: +g.player.hp.toFixed(1), downed: g.player.downed, tumbled: tumbles > 0, minDist: +minD.toFixed(1), state: g.state, t: +g.time.toFixed(1), states: [...states].join(',') };
      });
      console.log(`  ${sp}: ${JSON.stringify(log)}`);
      await page.evaluate(() => { const g = window.__tp.game; g.player.spawnAt(g.player.pos.x, g.player.pos.z, g.player.yaw); g.state = 'play'; g.ui.hideScreens(); g.ui.showHUD(); });
      await step(1);
      await shot('50_' + sp);
    }
  },
  async gallery() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 9.5; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    await step(5);
    await shot('10_spawn_day');
    for (const sp of ['deer', 'boar', 'black_bear', 'elk', 'wolf', 'moose', 'grizzly', 'cougar', 'turkey', 'rabbit']) {
      // make sure one exists: spawn groups until the species appears
      const info = await page.evaluate((sp) => {
        const g = window.__tp.game;
        let tries = 0;
        while (!g.animals.list.some(a => a.species.id === sp) && tries++ < 80) g.animals.spawnGroup(g.player.pos);
        window.__tp.debug.freeze(true);
        return window.__tp.debug.approach(sp, sp === 'rabbit' || sp === 'turkey' ? 5 : 10);
      }, sp);
      if (!info) { console.log('  no', sp); continue; }
      await step(2);
      await shot('20_' + sp);
    }
  },
  async hunt() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 9.5; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const info = await page.evaluate(() => {
      const g = window.__tp.game;
      let tries = 0;
      while (!g.animals.list.some(a => a.species.id === 'deer') && tries++ < 80) g.animals.spawnGroup(g.player.pos);
      window.__tp.debug.freeze(true);
      return window.__tp.debug.approach('deer', 60);
    });
    console.log('  target', JSON.stringify(info));
    await step(2);
    await page.evaluate(() => window.__tp.debug.selectWeapon('rifle_308'));
    await page.evaluate((id) => window.__tp.debug.aimAtAnimal(id, 'lung'), info.id);
    await page.evaluate(() => window.__tp.debug.fire());
    await step(3);
    await shot('30_shot');
    await step(20);
    await shot('31_after');
    console.log('  animals', JSON.stringify(await page.evaluate(() => window.__tp.debug.animals().slice(0, 3))));
    for (let i = 0; i < 8; i++) await step(240);
    console.log('  animals', JSON.stringify(await page.evaluate(() => window.__tp.debug.animals().slice(0, 3))));
    await page.evaluate(() => window.__tp.debug.third(true));
    await step(2);
    await shot('32_third_person');
    await page.evaluate(() => window.__tp.debug.third(false));
    const hv = await page.evaluate(() => window.__tp.debug.harvestNearest());
    console.log('  harvested', hv);
    await step(2);
    await shot('33_harvest');
  },
  async menus() {
    await page.evaluate(() => window.__tp.debug.startGame({}));
    await step(2);
    await page.evaluate(() => window.__tp.debug.openMenu('map'));
    await step(1);
    await shot('40_map');
    await page.evaluate(() => { window.__tp.game.closeMenu(); window.__tp.debug.openMenu('shop'); });
    await step(1);
    await shot('41_shop');
    await page.evaluate(() => { window.__tp.game.closeMenu(); window.__tp.game.hour = 22.5; });
    await step(2);
    await shot('42_night');
    await page.evaluate(() => { window.__tp.game.hour = 19.0; });
    await step(2);
    await shot('43_sunset');
  },
  async portraits() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; g.weather.set('clear', true); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    if (args.includes('--rest')) await page.evaluate(() => { window.__tp_rest = true; });
    const list = (args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : ['deer', 'grizzly', 'wolf', 'moose', 'turkey', 'rabbit', 'boar', 'cougar']);
    for (const sp of list) {
      const ok = await page.evaluate((sp) => {
        const g = window.__tp.game;
        let tries = 0;
        while (!g.animals.list.some(a => a.species.id === sp) && tries++ < 80) g.animals.spawnGroup(g.player.pos);
        window.__tp.debug.freeze(true);
        const info = window.__tp.debug.approach(sp, 10);
        if (!info) return false;
        const a = g.animals.list.find(x => x.id === info.id);
        // hide everyone else so the portrait is clean
        for (const o of g.animals.list) o.rig.root.visible = o === a;
        const f = a.facing, d = 2.2 + a.species.body.len * a.identity.scale * 1.2;
        const ang = f + 0.65;
        g.player.spawnAt(a.pos.x + Math.cos(ang) * d, a.pos.z + Math.sin(ang) * d, 0);
        a.alertness = 60; a.state = sp === 'wolf' || sp === 'grizzly' ? 'Aggressive' : 'Suspicious';
        if (window.__tp_rest) { a.state = 'Calm'; a.goal = 'Rest'; a.speed = 0; for (const o of g.animals.list) { o.goal = 'Rest'; o.speed = 0; o.bed = 1; } }
        a.lookTarget = { x: g.player.pos.x, z: g.player.pos.z };
        window.__tp.debug.aimAtAnimal(a, 'brain');
        g.player.pitch -= 0.06;
        g.weapons.select('camera');
        return true;
      }, sp);
      if (!ok) { console.log('  no', sp); continue; }
      await step(20);
      await shot('25_face_' + sp);
    }
  },
  async zones() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 12; g.weather.set('clear', true); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, M = g.animals;
      const byNeed = {}; for (const z of M.zones) byNeed[z.need] = (byNeed[z.need] || 0) + 1;
      const inW = (z, h) => { h = ((h % 24) + 24) % 24; return z.from <= z.to ? h >= z.from && h < z.to : h >= z.from || h < z.to; };
      // a rest zone for deer, visited at rest time
      const rz = M.zones.find(z => z.species === 'deer' && z.need === 'rest');
      g.hour = (rz.from + 0.5) % 24;
      g.player.spawnAt(rz.x + rz.r + 12, rz.z, 0);
      M.senseZones(g.player.pos);
      // spawn a deer group right in the rest zone and let it settle
      for (const a of M.list) a.dispose(); M.list = []; M.groups = [];
      M.populateAround = () => {};
      let tries = 0;
      while (!M.list.some(a => a.species.id === 'deer') && tries++ < 200) M.spawnGroup(g.player.pos);
      const gp = M.groups.find(x => x.species === 'deer');
      for (const m of gp.members) { m.pos.x = rz.x + (m.pos.x - gp.zone.x) * 0.3; m.pos.z = rz.z + (m.pos.z - gp.zone.z) * 0.3; m.zone = rz; m.target = null; m.travelling = false; }
      gp.zone = rz;
      for (let i = 0; i < 60 * 12; i++) g.advance(1 / 60);
      const goals = gp.members.map(m => m.goal + ':' + m.state);
      // migration: jump to a feeding window for this group
      const fz = M.zones.find(z => z.species === 'deer' && z.need === 'feed' && !inW(rz, z.from + 0.2));
      g.hour = (fz.from + 0.2) % 24;
      M.migrate();
      const hDist = Math.round(Math.hypot(gp.zone.x - gp.leader.pos.x, gp.zone.z - gp.leader.pos.z));
      // pressure
      for (let i = 0; i < 6; i++) g.sounds.emit('gunshot', rz.x, 20, rz.z, 2.5e5, g.time + 0.01 * i, 'player');
      g.advance(1 / 60);
      return { zones: M.zones.length, byNeed, discovered: rz.discovered, restGoals: goals.slice(0, 4), pressure: +M.pressureAt(rz.x, rz.z).toFixed(1), migratedTo: gp.zone.need, hDist, travelling: gp.members.filter(m => m.travelling).length, look: window.__tp.debug.aimAtAnimal(gp.members[0], 'lung') };
    });
    console.log('  zones', JSON.stringify(r));
    await step(2);
    await shot('95_resting');
    await page.evaluate(() => window.__tp.game.openMenu('map'));
    await step(1);
    await shot('96_map_zones');
  },
  async dog() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; g.weather.set('clear', true); g.profile.gear.dog = 1; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    await step(2);
    const info = await page.evaluate(() => {
      const g = window.__tp.game;
      let tries = 0;
      while (!g.animals.list.some(a => a.species.id === 'deer') && tries++ < 80) g.animals.spawnGroup(g.player.pos);
      const info = window.__tp.debug.approach('deer', 50);
      window.__tp.debug.selectWeapon('rifle_308');
      g.dog.placed = false;
      window.__tp.debug.stepFrames(2);
      window.__tp.debug.aimAtAnimal(info.id, 'gut'); // a gut shot: it will run
      g.weapons.fire(1);
      return info;
    });
    console.log('  target', JSON.stringify(info));
    const log = await page.evaluate((id) => {
      const g = window.__tp.game, a = g.animals.list.find(x => x.id === id);
      const modes = new Set();
      for (let i = 0; i < 60 * 3; i++) g.advance(1 / 60);
      g.dog.command();
      // the hunter follows the dog
      for (let i = 0; i < 60 * 150; i++) {
        g.advance(1 / 60);
        modes.add(g.dog.mode);
        const d = g.dog;
        const dx = d.pos.x - g.player.pos.x, dz = d.pos.z - g.player.pos.z;
        if (Math.hypot(dx, dz) > 8) { g.player.pos.x += dx * 0.02; g.player.pos.z += dz * 0.02; g.player.pos.y = g.terrain.heightAt(g.player.pos.x, g.player.pos.z); }
        if (d.mode === 'found') break;
      }
      return { modes: [...modes], final: g.dog.mode, animalDown: a.downed, life: a.creature.life, wounds: a.creature.wounds.length, dogToAnimal: +Math.hypot(a.pos.x - g.dog.pos.x, a.pos.z - g.dog.pos.z).toFixed(1), t: +g.time.toFixed(0) };
    }, info.id);
    console.log('  dog', JSON.stringify(log));
    await page.evaluate(() => { const g = window.__tp.game; g.thirdPerson = true; });
    for (let i = 0; i < 3; i++) await step(5);
    await shot('97_dog');
  },
  async blind() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; g.weather.set('clear', true); g.profile.gear.blind = 1; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, p = g.player;
      let tries = 0;
      while (!g.animals.list.some(a => a.species.id === 'deer') && tries++ < 80) g.animals.spawnGroup(p.pos);
      const info = window.__tp.debug.approach('deer', 28);
      const a = g.animals.list.find(x => x.id === info.id);
      // visibility at 28 m, standing in the open, looked at by the deer
      const seen = () => { a.facing = Math.atan2(p.pos.z - a.pos.z, p.pos.x - a.pos.x); g.animals.view.refresh(); const h = g.animals.view.hunters[0]; return { cover: h.cover, vis: +window.__tp.debug.seenBy(a, h).toFixed(3) }; };
      const open = seen();
      g.blinds.toggle();
      const bm = g.blinds.mine;
      p.pos.x = bm.x; p.pos.z = bm.z; p.pos.y = g.terrain.heightAt(bm.x, bm.z);
      p.stance = 'crouch';
      const inBlind = seen();
      return { open, inBlind, placed: !!bm };
    });
    console.log('  blind', JSON.stringify(r));
    await step(2);
    await shot('98_blind_inside');
    await page.evaluate(() => { const g = window.__tp.game; g.player.pos.x += 4; g.player.pos.z += 3; g.player.yaw += 2.4; });
    for (let i = 0; i < 2; i++) await step(3);
    await shot('98_blind');
  },
  async jobs() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; g.profile.cash = 300; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    await step(2);
    await page.evaluate(() => { const g = window.__tp.game; g.openMenu('shop'); document.querySelector('[data-tab=jobs]').click(); });
    await step(1);
    await shot('90_jobs_board');
    const took = await page.evaluate(() => { const g = window.__tp.game; const o = g.profile.jobs.offers.map(j => j.title); g.jobs.accept(g.profile.jobs.offers[0].id); g.closeMenu(); return o; });
    console.log('  offers', JSON.stringify(took));
    const r = await page.evaluate(() => {
      const g = window.__tp.game;
      g.weather.set('clear', true);
      g.profile.jobs.active.push({ type: 'photo', sp: 'deer', minStars: 1, need: 1, have: 0, title: 'Photograph a deer', cash: 50, xp: 10, id: 'test-photo' });
      let tries = 0;
      while (!g.animals.list.some(a => a.species.id === 'deer') && tries++ < 80) g.animals.spawnGroup(g.player.pos);
      window.__tp.debug.freeze(true);
      window.__tp.debug.approach('deer', 18);
      window.__tp.debug.selectWeapon('camera');
      g.input.mouse.right = true;
      return { cash0: g.profile.cash };
    });
    for (let i = 0; i < 3; i++) await step(10);
    await shot('91_viewfinder');
    const after = await page.evaluate(() => {
      const g = window.__tp.game;
      window.__tp.debug.aimAtAnimal(g.animals.list.filter(a => a.species.id === 'deer').sort((a, b) => Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) - Math.hypot(b.pos.x - g.player.pos.x, b.pos.z - g.player.pos.z))[0], 'lung');
      window.__tp.debug.renderOnce();
      g.weapons.snap();
      window.__tp.debug.renderOnce();
      g.input.mouse.right = false;
      const ph = g.profile.photos[0];
      return { photos: g.profile.photos.length, stars: ph && ph.stars, sp: ph && ph.sp, imgKB: ph && ph.img ? Math.round(ph.img.length / 1024) : 0, jobsLeft: g.profile.jobs.active.map(j => j.title), cash: g.profile.cash, done: g.profile.jobs.done };
    });
    console.log('  photo', JSON.stringify(after), 'cash0', r.cash0);
    await page.evaluate(() => window.__tp.game.openMenu('trophies'));
    await step(1);
    await shot('92_album');
  },
  async social() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game;
      let tries = 0;
      while (!g.animals.list.some(a => a.species.id === 'deer') && tries++ < 80) g.animals.spawnGroup(g.player.pos);
      window.__tp.debug.freeze(true);
      const info = window.__tp.debug.approach('deer', 30);
      window.__tp.debug.stepFrames(1);
      g.social.ping();
      g.social.send('shh, deer at 30 metres');
      // fake a party member riding the lodge quad next to us
      g.coop.room = { presence: async () => {}, onPeers() {}, leave: async () => {} };
      g.coop.myPeer = 'me'; g.coop.joinedAt = 0; g.coop.code = 'test';
      const p = g.player.pos, q = g.vehicles.list[0];
      const pres = { v: 1, n: 'Bob', c: 0x4fb4f0, h: 2, since: 5, p: [p.x + 3, p.y + 1, p.z + 3, 0, 0], s: 's', sp: 0, w: 'rifle_243',
        vh: [0, p.x + 3, p.y + 0.5, p.z - 4, 1.2, 0.1, -0.1, 0.3, 6],
        ev: [[1, 'chat', { t: 'wait for me!! the quad is FAST' }], [2, 'ping', { x: p.x + 20, y: p.y, z: p.z + 10, l: 'Over here' }]] };
      g.coop.onPeers({ peers: [{ peer: 'me', sameTab: true, presence: null }, { peer: 'bob', presence: pres }], left: [] });
      window.__tp.debug.third(true);
      return { target: info && info.species, pings: g.social.pings.map(x => x.label), bubbles: g.social.bubbles.length, host: g.coop.isHost(), quadRemote: !!q.remoteT };
    });
    console.log('  social', JSON.stringify(r));
    for (let i = 0; i < 3; i++) await step(10);
    await shot('80_social');
    const after = await page.evaluate(() => { const g = window.__tp.game; return { canRideBobs: g.vehicles.nearest(g.vehicles.list[0].pos, 3) === g.vehicles.list[0] }; });
    console.log('  after', JSON.stringify(after));
  },
  async weather() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    for (const [k, h] of [['rain', 11], ['fog', 7], ['cloudy', 15], ['rain', 21.5]]) {
      const r = await page.evaluate(({ k, h }) => {
        const g = window.__tp.game; g.hour = h; window.__tp.debug.setWeather(k);
        g.weatherFx.wet = k === 'rain' ? 1 : 0;
        return { kind: g.weather.kind, light: +g.weather.light(h).toFixed(2), vis: +g.weather.visibilityMult().toFixed(2), ear: +g.weather.hearingMult().toFixed(2) };
      }, { k, h });
      await step(8);
      const fog = await page.evaluate(() => { const f = window.__tp.game.scene.fog; return [Math.round(f.near), Math.round(f.far)]; });
      console.log('  ' + k + '@' + h, JSON.stringify(r), 'fog', fog);
      await shot(`70_${k}_${h}`);
    }
    // washing: a fresh print should fade much faster under a minute of downpour
    const wash = await page.evaluate(() => {
      const g = window.__tp.game, E = g.evidence;
      const c = { kind: 'Footprint', x: 0, y: 0, z: 0, time: g.time, base: 0.8, species: 'deer' };
      E.add(c);
      const before = E.readability(c, g.time, 'soil');
      for (let i = 0; i < 60 * 60; i++) { g.weather.step(1 / 60, 11); g.evidence.rainAccum = g.weather.rainAccum; }
      return { before: +before.toFixed(2), afterRainMin: +E.readability(c, g.time, 'soil').toFixed(2) };
    });
    console.log('  wash', JSON.stringify(wash));
  },
  async atv() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    await step(2);
    // 1) mount the lodge quad and floor it
    const mount = await page.evaluate(() => {
      const g = window.__tp.game;
      const v = g.vehicles.nearest(g.player.pos, 1e9);
      g.player.spawnAt(v.pos.x + 1.2, v.pos.z, 0);
      g.interact();
      return { riding: !!g.player.vehicle, id: v.id, x: +v.pos.x.toFixed(1), z: +v.pos.z.toFixed(1) };
    });
    console.log('  mount', JSON.stringify(mount));
    await page.evaluate(() => window.__tp.debug.press('KeyW'));
    const drive = await page.evaluate(() => {
      const g = window.__tp.game, v = g.player.vehicle;
      let maxSp = 0, air = 0, heard = 0;
      const x0 = v.pos.x, z0 = v.pos.z;
      for (let i = 0; i < 60 * 6; i++) {
        g.advance(1 / 60); g.input.endFrame();
        maxSp = Math.max(maxSp, v.speed());
        if (v.airborne) air++;
      }
      heard = g.sounds.events.filter(e => e.category === 'engine').length;
      return { maxKmh: +(maxSp * 3.6).toFixed(0), dist: +Math.hypot(v.pos.x - x0, v.pos.z - z0).toFixed(1), airFrames: air, crashed: v.crashed, riding: !!g.player.vehicle, engineEvents: heard, hp: +g.player.hp.toFixed(1) };
    });
    console.log('  drive', JSON.stringify(drive));
    await step(1);
    await shot('60_atv_fp');
    await page.evaluate(() => window.__tp.debug.third(true));
    for (let i = 0; i < 4; i++) await step(15);
    await shot('61_atv_chase');
    await page.evaluate(() => window.__tp.debug.release('KeyW'));
    // 2) side-hill a steep slope at speed: it should roll and throw the rider
    const roll = await page.evaluate(() => {
      const g = window.__tp.game, T = g.terrain;
      if (!g.player.vehicle) { const v = g.vehicles.nearest(g.player.pos, 1e9); v.crashed = false; v.enter(g.player); }
      const v = g.player.vehicle;
      let best = null;
      for (let x = -480; x < 480 && !best; x += 6) for (let z = -480; z < 480; z += 6) {
        const n = T.normalAt(x, z);
        if (n.y < 0.66 && n.y > 0.5 && !T.isWater(x, z)) { best = { x, z, n }; break; }
      }
      if (!best) return { found: false };
      // face across the slope (perpendicular to the downhill direction)
      v.pos.x = best.x; v.pos.z = best.z; v.pos.y = T.heightAt(best.x, best.z) + 0.5;
      v.yaw = Math.atan2(best.n.z, -best.n.x);
      v.vel = { x: Math.sin(v.yaw) * 9, y: 0, z: Math.cos(v.yaw) * 9 };
      let crashedAt = -1;
      for (let i = 0; i < 60 * 3; i++) { g.advance(1 / 60); if (v.crashed && crashedAt < 0) crashedAt = i; }
      return { found: true, slopeNy: +best.n.y.toFixed(2), crashed: v.crashed, crashedAt, riding: !!g.player.vehicle, tumbling: !!g.player.tumble, hp: +g.player.hp.toFixed(1) };
    });
    console.log('  rollover', JSON.stringify(roll));
    await step(20);
    await shot('62_atv_crash');
    // 3) bonk a deer
    const bonk = await page.evaluate(() => {
      const g = window.__tp.game;
      g.player.tumble = null; g.player.hp = 100;
      let tries = 0;
      while (!g.animals.list.some(a => a.species.id === 'deer') && tries++ < 80) g.animals.spawnGroup(g.player.pos);
      window.__tp.debug.freeze(true);
      const a = g.animals.list.find(x => x.species.id === 'deer');
      // use the lodge quad on its flat parking spot
      const v = g.vehicles.list[0];
      if (v.driver) v.exit(true);
      v.crashed = false; v.pitch = v.roll = 0; v.spin = { p: 0, r: 0, y: 0 }; v.airborne = false;
      v.pos.x = v.home.x; v.pos.z = v.home.z; v.pos.y = g.terrain.heightAt(v.pos.x, v.pos.z) + 0.5; v.yaw = v.home.yaw;
      g.player.spawnAt(v.pos.x, v.pos.z, 0);
      // park the deer 9 m straight ahead so no tree gets there first
      a.pos.x = v.pos.x + Math.sin(v.yaw) * 9; a.pos.z = v.pos.z + Math.cos(v.yaw) * 9;
      a.pos.y = g.terrain.heightAt(a.pos.x, a.pos.z);
      v.vel = { x: Math.sin(v.yaw) * 7, y: 0, z: Math.cos(v.yaw) * 7 };
      if (v.driver !== g.player) v.enter(g.player);
      window.__tp.debug.press('KeyW');
      const hp0 = a.creature.bodyParts ? a.creature.bodyParts.length : 0;
      for (let i = 0; i < 60 * 4 && !a.lastBonk; i++) { g.advance(1 / 60); }
      window.__tp.debug.release('KeyW');
      return { bonked: !!a.lastBonk, crashed: v.crashed && v.lastCrash, vid: v.id, speed: +v.speed().toFixed(1), life: a.creature.life, mobility: a.creature.mobility, wounds: a.creature.wounds.length, dVeh: +Math.hypot(a.pos.x - v.pos.x, a.pos.z - v.pos.z).toFixed(1) };
    });
    console.log('  bonk', JSON.stringify(bonk));
    await step(2);
    await shot('63_atv_bonk');
  },
  async slapstick() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; g.weather.set('clear', true); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, p = g.player, V = g.vegetation;
      // find a big tree with open ground on one side and sprint straight at it
      let tree = null;
      for (let x = -400; x < 400 && !tree; x += 9) for (let z = -400; z < 400; z += 9) {
        const o = V.query(x, z, 4, []).find(o => !o.soft && o.h > 5 && o.r > 0.25);
        if (o && g.terrain.normalAt(o.x, o.z).y > 0.95 && g.terrain.waterDepth(o.x, o.z) < 0.1) { tree = o; break; }
      }
      p.spawnAt(tree.x + 7, tree.z, Math.PI / 2); // yaw pi/2 looks toward -x
      const I = g.input;
      I.down.add('KeyW'); I.down.add('ShiftLeft');
      let bonk = false;
      for (let i = 0; i < 120 && !bonk; i++) { g.advance(1 / 60); I.endFrame(); if (p.tumble) bonk = true; }
      I.down.delete('KeyW'); I.down.delete('ShiftLeft');
      // gunshot near trees: birds
      g.fx.flushBirds(tree.x, tree.z);
      return { tree: [Math.round(tree.x), Math.round(tree.z)], bonk, stars: g.fx.stars.length, birds: g.fx.birds.length };
    });
    console.log('  slapstick', JSON.stringify(r));
    await page.evaluate(() => { window.__tp.debug.third(true); });
    for (let i = 0; i < 4; i++) await step(3);
    await shot('99_bonk_birds');
  },
  async tips() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; g.profile.tips = []; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const shown = await page.evaluate(() => {
      const g = window.__tp.game; const out = [];
      for (let i = 0; i < 60 * 40; i++) { g.advance(1 / 60); const t = g.tips.txt.textContent.slice(0, 40); if (g.tips.showT > 0 && out[out.length - 1] !== t) out.push(t); }
      return { seen: g.profile.tips, shown: out };
    });
    console.log('  tips', JSON.stringify(shown));
    await page.evaluate(() => { const g = window.__tp.game; g.tips.cool = 0; g.tips.show('Animals smell you downwind. The wind arrow (top) shows where your scent drifts — keep it blowing away from them.'); });
    await step(2);
    await shot('99_tip');
  },
  async basic() {
    await shot('00_title');
    if (args.includes('--low')) await page.evaluate(() => { const g = window.__tp.game; g.profile.settings.quality = 'low'; g.applySettings(); });
    if (args.includes('--noanimals')) await page.evaluate(() => { window.__tp.game.animals.populateAround = () => {}; });
    await page.evaluate(() => window.__tp.debug.startGame({ seed: 7 }));
    await step(30);
    await shot('01_spawn');
    await page.evaluate(() => window.__tp.debug.lookAt(0.6, -0.05));
    await step(10);
    await shot('02_look');
    const report = await page.evaluate(() => window.__tp.debug.report());
    console.log('  report:', JSON.stringify(report));
  },
};

try {
  await (scripts[scriptName] || scripts.basic)();
} catch (e) {
  errors.push('script: ' + e.message);
}
const perf = await page.evaluate(() => window.__tp && window.__tp.debug && window.__tp.debug.perf && window.__tp.debug.perf()).catch(() => null);
if (perf) console.log('  perf:', JSON.stringify(perf));
await browser.close();

const interesting = logs.filter(l => !l.includes('deprecated') && !l.includes('GPU stall') && !l.includes('GL Driver'));
if (interesting.length) console.log('console:\n  ' + interesting.slice(-25).join('\n  '));
if (errors.length) {
  console.error('SMOKE FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('SMOKE OK');
