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
