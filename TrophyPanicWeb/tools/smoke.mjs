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
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, hasTouch: scriptName === 'touch' });
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
  async campfire() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 21; g.weather.set('clear', true); g.profile.settings.buddies = 2; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, I = g.input, p = g.player;
      I.down.add('KeyW');
      for (let i = 0; i < 60 * 4; i++) { g.advance(1 / 60); I.endFrame(); }
      I.down.delete('KeyW');
      for (let i = 0; i < 30; i++) g.advance(1 / 60);
      I.pressed.add('KeyL'); g.advance(1 / 60); I.endFrame();
      const f = g.campfires.mine;
      for (let i = 0; i < 60 * 5; i++) g.advance(1 / 60);
      const sitting = g.buddies.list.map(b => !!b.sitting);
      // roast: wait for golden, then pull it out
      p.hp = 60;
      I.pressed.add('KeyE'); g.advance(1 / 60); I.endFrame();
      const roasting = !!g.campfires.roast;
      let n = 0; while (g.campfires.roast && g.campfires.roast.toast < 0.63 && n++ < 600) g.advance(1 / 60);
      const toast = g.campfires.roast && g.campfires.roast.toast;
      I.pressed.add('KeyE'); g.advance(1 / 60); I.endFrame();
      return { lit: !!f, sitting, roasting, toast, smores: g.profile.stats.smores || 0, hp: Math.round(p.hp), sugar: p.sugar > 0, lures: g.animals.lures.length };
    });
    console.log('  campfire', JSON.stringify(r));
    if (!r.lit || !r.roasting || r.smores < 1) errors.push('campfire failed: ' + JSON.stringify(r));
    // a second roast, left too long: it catches fire
    await page.evaluate(() => { const g = window.__tp.game, I = g.input; I.pressed.add('KeyE'); g.advance(1 / 60); I.endFrame(); let n = 0; while (g.campfires.roast && !g.campfires.roast.burning && n++ < 900) g.advance(1 / 60); g.advance(0.3); });
    await page.evaluate(() => window.__tp.debug.renderOnce());
    await shot('100_roast_fire');
    await page.evaluate(() => { const g = window.__tp.game, I = g.input; I.pressed.add('KeyE'); g.advance(1 / 60); I.endFrame(); });
    // third-person: the camp
    await page.evaluate(() => {
      const g = window.__tp.game, p = g.player, f = g.campfires.mine, ry = f.model.group.rotation.y;
      p.pos.x = f.x + Math.sin(ry) * 4.2; p.pos.z = f.z + Math.cos(ry) * 4.2; p.pos.y = g.terrain.heightAt(p.pos.x, p.pos.z);
      p.yaw = Math.atan2(-(f.x - p.pos.x), -(f.z - p.pos.z)); p.pitch = -0.28; g.weapons.select('camera');
      for (let i = 0; i < 90; i++) g.advance(1 / 60);
    });
    for (let i = 0; i < 3; i++) await step(3);
    await shot('100_campfire');
    // wolves pace around the firelight but don't come in
    const w = await page.evaluate(() => {
      const g = window.__tp.game, M = g.animals, f = g.campfires.mine, p = g.player;
      for (const a of M.list) a.dispose(); M.list = []; M.groups = [];
      let tries = 0; while (!M.list.some(a => a.species.id === 'wolf') && tries++ < 400) { for (const a of M.list) a.dispose(); M.list = []; M.groups = []; M.spawnGroup(p.pos); }
      const wolves = M.list.filter(a => a.species.id === 'wolf');
      wolves.forEach((a, i) => { a.pos.x = f.x + 45 + i * 3; a.pos.z = f.z; a.pos.y = g.terrain.heightAt(a.pos.x, a.pos.z); });
      let minD = 1e9, hp0 = p.hp; const goals = new Set();
      for (let i = 0; i < 60 * 30; i++) { g.advance(1 / 60); for (const a of wolves) { minD = Math.min(minD, Math.hypot(a.pos.x - f.x, a.pos.z - f.z)); goals.add(a.goal); } }
      return { n: wolves.length, minD: +minD.toFixed(1), goals: [...goals], hurt: +(hp0 - p.hp).toFixed(1) };
    });
    console.log('  wolves', JSON.stringify(w));
    if (w.n && w.minD < 12) errors.push('wolves walked into the campfire: ' + JSON.stringify(w));
    // a bear smells the marshmallows
    const b = await page.evaluate(() => {
      const g = window.__tp.game, M = g.animals, f = g.campfires.mine, p = g.player, I = g.input;
      for (const a of M.list) a.dispose(); M.list = []; M.groups = [];
      let tries = 0; while (!M.list.some(a => a.species.id === 'black_bear') && tries++ < 400) { for (const a of M.list) a.dispose(); M.list = []; M.groups = []; M.spawnGroup(p.pos); }
      const bear = M.list.find(a => a.species.id === 'black_bear');
      for (const a of M.list) if (a !== bear) { a.dispose(); } M.list = [bear];
      bear.pos.x = f.x - 70; bear.pos.z = f.z; bear.pos.y = g.terrain.heightAt(bear.pos.x, bear.pos.z);
      // step back from the fire so the bear isn't spooked by you
      p.pos.x = f.x + 32; p.pos.z = f.z + 32; p.pos.y = g.terrain.heightAt(p.pos.x, p.pos.z);
      g.animals.addLure(f.bag.x, f.bag.z, { kind: 'marsh', dur: 90, quiet: true, fire: f });
      let minD = 1e9; const goals = new Set();
      const trace = []; let last = '';
      for (let i = 0; i < 60 * 80; i++) {
        g.advance(1 / 60); minD = Math.min(minD, Math.hypot(bear.pos.x - f.bag.x, bear.pos.z - f.bag.z)); goals.add(bear.goal);
        const k = bear.goal + '/' + bear.state;
        if (k !== last) { last = k; trace.push(`${(i / 60).toFixed(1)}s ${k} al=${bear.alertness.toFixed(0)} d=${Math.hypot(bear.pos.x - f.bag.x, bear.pos.z - f.bag.z).toFixed(0)} st=${bear.stimuli.map(s => s.kind + ':' + (+s.s).toFixed(2)).join(',')} cu=${bear.curiousAbout ? bear.curiousAbout.cat + '@' + (g.time - bear.curiousAbout.t).toFixed(1) : '-'} shot=${(g.time - bear.memory.shotT).toFixed(0)}`); }
      }
      return { minD: +minD.toFixed(1), goals: [...goals], snacks: f.snacks, trace: trace.slice(-3) };
    });
    console.log('  bear', JSON.stringify(b));
    await page.evaluate(() => { const g = window.__tp.game, f = g.campfires.mine, p = g.player; p.pos.x = f.x + 7; p.pos.z = f.z + 7; p.yaw = Math.atan2(7, 7); p.pitch = -0.15; g.thirdPerson = false; });
    for (let i = 0; i < 3; i++) await step(2);
    await shot('100_bear_camp');
  },
  async touch() {
    // phones/tablets: stick moves, right-side drag looks, FIRE fires
    await page.evaluate(() => window.__tp.debug.startGame({}));
    await step(30);
    const r = await page.evaluate(async () => {
      const g = window.__tp.game, c = g.canvas;
      const T = (id, x, y) => new Touch({ identifier: id, target: c, clientX: x, clientY: y });
      const fire = (type, el, list) => el.dispatchEvent(new TouchEvent(type, { changedTouches: list, touches: list, bubbles: true, cancelable: true }));
      const p0 = { x: g.player.pos.x, z: g.player.pos.z }, yaw0 = g.player.yaw;
      fire('touchstart', c, [T(1, 150, 400)]);
      fire('touchmove', c, [T(1, 150, 320)]);
      fire('touchstart', c, [T(2, 700, 300)]);
      fire('touchmove', c, [T(2, 760, 300)]);
      window.__tp.debug.stepFrames(60);
      const moved = Math.hypot(g.player.pos.x - p0.x, g.player.pos.z - p0.z);
      const turned = Math.abs(g.player.yaw - yaw0);
      fire('touchend', c, [T(1, 150, 320)]);
      fire('touchend', c, [T(2, 760, 300)]);
      const stuck = ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(k => g.input.down.has(k));
      const btn = document.querySelector('.t-btn.b-fire');
      const ammo0 = g.player.loadout ? JSON.stringify(g.player.loadout) : '';
      fire('touchstart', btn, [new Touch({ identifier: 3, target: btn, clientX: 900, clientY: 450 })]);
      window.__tp.debug.stepFrames(3);
      fire('touchend', btn, [new Touch({ identifier: 3, target: btn, clientX: 900, clientY: 450 })]);
      window.__tp.debug.stepFrames(20);
      return { enabled: g.touch.enabled, moved, turned, stuck, shots: g.stats ? g.stats.shots : null, body: document.body.className };
    });
    console.log('  touch', JSON.stringify(r));
    if (!r.enabled || r.moved < 1 || r.turned < 0.05 || r.stuck) errors.push('touch controls failed: ' + JSON.stringify(r));
    await page.evaluate(() => window.__tp.debug.renderOnce());
    await shot('touch');
  },
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
    // if a bush ate the bullet, try another deer (world variety makes a single scripted shot flaky)
    for (let attempt = 0; attempt < 3; attempt++) {
      await step(3);
      const hit = await page.evaluate(() => window.__tp.game.animals.list.some(a => a.firstHitTime >= 0));
      if (hit) break;
      const again = await page.evaluate(() => { const g = window.__tp.game; const t = g.animals.list.filter(a => a.species.id === 'deer' && !(a.triedShot)); t.forEach(a => { if (Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) < 70) a.triedShot = true; }); g.player.spawnAt(g.player.pos.x + 30, g.player.pos.z - 20, 0); return window.__tp.debug.approach('deer', 55); });
      console.log('  retry', JSON.stringify(again));
      await step(2);
      await page.evaluate((id) => { window.__tp.debug.aimAtAnimal(id, 'lung'); window.__tp.debug.fire(); }, again.id);
    }
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
    console.log('  album', JSON.stringify(await page.evaluate(() => window.__tp.game.profile.photos.map(p => ({ trophy: !!p.trophy, kb: p.img ? Math.round(p.img.length / 1024) : 0, cap: p.action })))));
    await page.evaluate(() => { const g = window.__tp.game; g.closeMenu(); g.openMenu('trophies'); });
    await step(1);
    await shot('34_album');
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
    if (args.includes('--hour')) await page.evaluate((h) => { window.__tp_hour = h; }, args[args.indexOf('--hour') + 1]);
    if (args.includes('--rest')) await page.evaluate(() => { window.__tp_rest = true; });
    if (args.includes('--charge')) await page.evaluate(() => { window.__tp_charge = true; });
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
        if (window.__tp_charge) { a.goal = 'Charge'; a.state = 'Aggressive'; }
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
  async lineup() {
    const hr = args.includes('--hour') ? Number(args[args.indexOf('--hour') + 1]) : 17.6;
    await page.evaluate((hr) => { const g = window.__tp.game; g.hour = hr; g.weather.set('clear', true); }, hr);
    await page.evaluate(() => window.__tp.debug.startGame({}));
    await page.evaluate(() => {
      const g = window.__tp.game, p = g.player;
      g.animals.populateAround = () => {}; for (const a of g.animals.list) a.dispose(); g.animals.list = [];
      const mk = window.__tp.buildHunter;
      const f = p.forward(); const l = Math.hypot(f.x, f.z); const fx = f.x / l, fz = f.z / l;
      const rx = -fz, rz = fx;
      const looks = [{ jacket: 0x5f6e34, skin: 0 }, { jacket: 0x5f6e34, skin: 3 }, { jacket: 0x5f6e34, skin: 4, hat: 'beanie' }, { jacket: 0xff6b2c, skin: 5, hat: 'trapper' }, { jacket: 0x4fb4f0, skin: 2, hat: 'bucket' }];
      window.__lineup = looks.map((lk, i) => {
        const h = mk(lk); g.scene.add(h.group);
        const off = (i - 2) * 1.1, d = 3.2 + Math.abs(i - 2) * 0.3;
        const x = p.pos.x + fx * d + rx * off, z = p.pos.z + fz * d + rz * off;
        h.group.position.set(x, g.terrain.heightAt(x, z), z);
        h.group.rotation.y = Math.atan2(-fx, -fz) + (i - 2) * 0.25;
        h.mood = [{}, { aiming: true }, { flail: false, scared: true }, { wave: true }, {}][i];
        return h;
      });
      p.pitch = -0.12;
      g.weapons.select('camera');
    });
    for (let i = 0; i < 6; i++) await page.evaluate(() => { const g = window.__tp.game; window.__lineup.forEach(h => h.animate(1 / 60, { speed: 0, stance: 'stand', pitch: 0, showRifle: !!h.mood.aiming, ...h.mood })); window.__tp.debug.stepFrames(1); });
    await shot('19_lineup');
  },
  async revive() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, p = g.player;
      // fake party: Bob stands right next to us
      g.coop.room = { presence: async () => {}, onPeers() {}, leave: async () => {} };
      g.coop.myPeer = 'me'; g.coop.joinedAt = 0; g.coop.code = 'test';
      const pres = { v: 1, n: 'Bob', c: 0x4fb4f0, h: 0, sk: 3, since: 5, p: [p.pos.x + 1.5, p.pos.y, p.pos.z, 0, 0], s: 's', sp: 0, w: 'rifle_243', ev: [] };
      g.coop.onPeers({ peers: [{ peer: 'me', sameTab: true, presence: null }, { peer: 'bob', presence: pres }], left: [] });
      p.hurt({ blunt: 400, knock: { x: 6, y: 4, z: 0 }, source: 'maul' });
      const downed = p.downed, party = g.downedInfo && g.downedInfo.party;
      for (let i = 0; i < 60 * 5; i++) g.advance(1 / 60);
      const stillWaiting = g.state === 'play' && p.downed;
      // Bob hauls us up
      g.coop.handleEvent(g.coop.peers.get('bob'), 'revive', { n: 'Bob' });
      const up = !p.downed && p.hp === 35;
      // now Bob is down and we help him
      pres.dn = 1; pres.ev = []; pres.p = [p.pos.x + 1.2, p.pos.y, p.pos.z, 0, 0];
      g.coop.onPeers({ peers: [{ peer: 'me', sameTab: true, presence: null }, { peer: 'bob', presence: pres }], left: [] });
      g.coop.render(1 / 60);
      g.interact();
      const sent = g.coop.events.some(e => e[1] === 'revive' && e[2].to === 'bob');
      // solo: rangers come after a short beat
      g.coop.drop();
      p.invuln = 0;
      p.hurt({ blunt: 400, source: 'stomp' });
      for (let i = 0; i < 60 * 3.2; i++) g.advance(1 / 60);
      return { downed, party, stillWaiting, up, sent, soloMenu: g.state };
    });
    console.log('  revive', JSON.stringify(r));
  },
  async falls() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = Number(17.4); g.weather.set('clear', true); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    await page.evaluate(() => {
      const g = window.__tp.game, W = g.waterfall, F = { x: W.base.x, z: W.base.z };
      // stand downstream on the bank looking back up at the falls
      const sx = W.base.x - g.waterfall.sheet.geometry.attributes.position.getX(0) + W.base.x;
      const dx = W.base.x - (W.base.x + 1), dz = 0;
      const R = g.terrain;
      let best = null;
      for (let a = 0; a < 6.28; a += 0.2) for (const d of [30, 38, 46]) {
        const x = F.x + Math.cos(a) * d, z = F.z + Math.sin(a) * d;
        if (R.waterDepth(x, z) > 0.05 || R.heightAt(x, z) > 14) continue;
        const score = -Math.abs(R.heightAt(x, z) - 6);
        if (!best || score > best.s) best = { x, z, s: score };
      }
      g.player.spawnAt(best.x, best.z, 0);
      const ex = W.base.x - best.x, ez = W.base.z - best.z;
      g.player.yaw = Math.atan2(-ex, -ez); g.player.pitch = 0.18;
    });
    for (let i = 0; i < 6; i++) await step(4);
    await shot('99_waterfall');
  },
  async spray() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; g.weather.set('clear', true); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, p = g.player;
      let tries = 0;
      while (!g.animals.list.some(a => a.species.id === 'grizzly') && tries++ < 200) g.animals.spawnGroup(p.pos);
      const info = window.__tp.debug.approach('grizzly', 5);
      const a = g.animals.list.find(x => x.id === info.id);
      a.state = 'Aggressive'; a.goal = 'Charge';
      window.__tp.debug.selectWeapon('bear_spray');
      window.__tp.debug.renderOnce();
      g.weapons.spray();
      const sprayed = a.sprayedUntil > g.time, dazed = a.daze > 0;
      let minD = 1e9; const states = new Set();
      const p0 = { x: p.pos.x, z: p.pos.z };
      for (let i = 0; i < 60 * 8; i++) { g.advance(1 / 60); states.add(a.state + '/' + a.goal); minD = Math.min(minD, Math.hypot(a.pos.x - p0.x, a.pos.z - p0.z)); }
      return { sprayed, dazed, states: [...states], endDist: +Math.hypot(a.pos.x - p0.x, a.pos.z - p0.z).toFixed(1), hp: +p.hp.toFixed(1), cans: g.weapons.state.bear_spray.mag + '+' + g.profile.ammo.bear_spray };
    });
    console.log('  spray', JSON.stringify(r));
  },
  async legsup() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; g.weather.set('clear', true); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    await page.evaluate(() => {
      const g = window.__tp.game;
      let tries = 0;
      while (!g.animals.list.some(a => a.species.id === 'deer') && tries++ < 80) g.animals.spawnGroup(g.player.pos);
      const info = window.__tp.debug.approach('deer', 7);
      const a = g.animals.list.find(x => x.id === info.id);
      a.creature.life = 'Down'; a.onIncapacitated ? a.onIncapacitated() : null;
      if (a.death) a.death.legsUp = true;
      for (let i = 0; i < 120; i++) a.stepDeath(1 / 60);
      window.__tp.debug.freeze(true);
      for (const o of g.animals.list) if (o !== a) { o.dispose(); o.harvested = true; }
      g.animals.list = [a];
      window.__tp.debug.aimAtAnimal(a, 'heart'); g.player.pitch -= 0.15;
    });
    for (let i = 0; i < 3; i++) await step(5);
    await shot('99_legsup');
  },
  async rest() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 14; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, p = g.player, tent = g.structures.tents[0];
      p.spawnAt(tent.x + Math.sin(tent.rot) * 2.2, tent.z + Math.cos(tent.rot) * 2.2, 0);
      g.interact();
      return { menu: g.state, open: !document.getElementById('rest').hidden };
    });
    await step(1);
    await shot('99_rest');
    const r2 = await page.evaluate(() => { const g = window.__tp.game; const t0 = g.time; g.restUntil(5.3); return { hour: +g.hour.toFixed(2), period: g.period, state: g.state, advanced: Math.round(g.time - t0), animals: g.animals.list.length }; });
    console.log('  rest', JSON.stringify(r), JSON.stringify(r2));
  },
  async skunk() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 20; g.weather.set('clear', true); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, p = g.player, M = g.animals;
      let tries = 0;
      while (!M.list.some(a => a.species.id === 'skunk') && tries++ < 300) M.spawnGroup(p.pos);
      const sk = M.list.find(a => a.species.id === 'skunk');
      if (!sk) return { none: true };
      p.spawnAt(sk.pos.x + 3, sk.pos.z + 1, 0);
      for (let i = 0; i < 60; i++) g.advance(1 / 60);
      const stinky = p.stinky > 0, mult = p.scentMult;
      g.useScentKiller();
      return { stinky, mult, after: p.scentMult, stinkyAfter: p.stinky };
    });
    console.log('  skunk', JSON.stringify(r));
    await step(2);
    await shot('99_skunk');
  },
  async soak() {
    await page.evaluate(() => { const g = window.__tp.game; g.profile.gear.dog = 1; g.profile.gear.blind = 1; for (const id of ['bear_spray', 'honey', 'rifle_308', 'bow_recurve', 'shotgun_12', 'blower']) { if (!g.profile.owned.includes(id)) { g.profile.owned.push(id); g.profile.ammo[id] = 30; } } g.weapons.onInventoryChanged(); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const log = [];
    for (let round = 0; round < 10; round++) {
      const r = await page.evaluate((round) => {
        const g = window.__tp.game, I = g.input, p = g.player;
        if (g.state !== 'play') { if (g.state === 'menu') g.closeMenu(); if (g.player.downed || g.state !== 'play') g.respawn(); }
        const keys = ['KeyW', 'KeyA', 'KeyD', 'ShiftLeft'];
        const acts = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'KeyQ', 'KeyB', 'KeyE', 'KeyV', 'KeyX', 'KeyJ', 'KeyK', 'KeyP', 'KeyG', 'KeyC', 'KeyZ', 'KeyR', 'KeyN', 'KeyY', 'KeyF', 'Space'];
        let errs = 0;
        for (let i = 0; i < 60 * 25; i++) {
          if (i % 90 === 0) { I.down.clear(); I.down.add('KeyW'); if ((i / 90 + round) % 3 === 0) I.down.add('ShiftLeft'); if ((i / 90) % 4 === 1) I.down.add('KeyA'); }
          if (i % 37 === 0) { const k = acts[(i / 37 + round * 7) % acts.length | 0]; I.pressed.add(k); I.down.add(k); }
          if (i % 53 === 0) { I.mouse.leftPressed = true; I.mouse.left = true; } else if (i % 53 === 5) I.mouse.left = false;
          if (i % 120 === 60) I.mouse.right = !I.mouse.right;
          I.mouse.dx = Math.sin(i * 0.01 + round) * 6; I.mouse.dy = Math.cos(i * 0.013) * 1.5;
          g.advance(1 / 60);
          if (i % 150 === 0) g.render(1 / 60);
          I.endFrame();
          if (g.state === 'menu') g.closeMenu();
        }
        if (round === 5) { const v = g.vehicles.nearest(p.pos, 1e9); p.spawnAt(v.pos.x + 1, v.pos.z, 0); g.interact(); }
        if (round === 8) { const t = g.structures.tents[1]; p.spawnAt(t.x + Math.sin(t.rot) * 2.2, t.z + Math.cos(t.rot) * 2.2, 0); g.interact(); if (g.state === 'menu') g.restUntil(21); }
        return { round, state: g.state, hour: +g.hour.toFixed(1), hp: +p.hp.toFixed(0), animals: g.animals.list.length, props: g.weapons.props.length, particles: g.fx.particles.length, clues: g.evidence.clues.length, weapon: g.weapons.currentId, vehicle: !!p.vehicle };
      }, round);
      log.push(r);
    }
    console.log('  soak', JSON.stringify(log.map(r => [r.round, r.state, r.hour, r.hp, r.animals, r.props, r.particles, r.weapon, r.vehicle].join('/'))));
    await step(1);
    await shot('99_soak');
  },
  async signs() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 17.5; g.weather.set('clear', true); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    await page.evaluate(() => {
      const g = window.__tp.game, gs = g.structures.group.children.filter(o => o.isGroup), s = gs[gs.length - 1];
      const x = s.position.x + 3.2, z = s.position.z + 3.2;
      g.player.spawnAt(x, z, 0);
      const dx = s.position.x - x, dz = s.position.z - z;
      g.player.yaw = Math.atan2(-dx, -dz); g.player.pitch = 0.12;
    });
    for (let i = 0; i < 3; i++) await step(3);
    await shot('99_signs');
  },
  async fetch() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; g.profile.gear.dog = 1; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, p = g.player, w = g.weapons;
      g.animals.populateAround = () => {}; for (const a of g.animals.list) a.dispose(); g.animals.list = [];
      for (let i = 0; i < 30; i++) g.advance(1 / 60);
      window.__tp.debug.selectWeapon('boot');
      const before = g.profile.ammo.boot + w.state.boot.mag;
      p.pitch = 0.3; g.render(1 / 60); w.throwProp(1);
      const modes = new Set();
      for (let i = 0; i < 60 * 20; i++) { g.advance(1 / 60); modes.add(g.dog.mode); }
      const q = w.props[0]; return { modes: [...modes], before, after: g.profile.ammo.boot + w.state.boot.mag, propsLeft: w.props.length, prop: q && { kind: q.kind, resting: q.resting, d: +Math.hypot(q.x - g.dog.pos.x, q.z - g.dog.pos.z).toFixed(1), vy: +q.vy.toFixed(2), y: +q.y.toFixed(1) }, dogActive: g.dog.active };
    });
    console.log('  fetch', JSON.stringify(r));
  },
  async legend() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 17.6; g.weather.set('clear', true); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, M = g.animals;
      let tries = 0, L = null;
      while (!L && tries++ < 3000) { M.spawnGroup(g.player.pos); L = M.list.find(a => a.identity.legendary); if (!L && M.list.length > 300) { for (const a of M.list) a.dispose(); M.list = []; M.groups = []; } }
      if (!L) return { none: true, tries };
      for (const a of M.list) if (a !== L) { a.rig.root.visible = false; a.frozen = true; }
      window.__tp.debug.freeze(true);
      const k = L.identity.scale, len = L.species.body.len * k;
      const f = L.facing + 0.7, d = 3 + len * 1.6;
      g.player.spawnAt(L.pos.x + Math.cos(f) * d, L.pos.z + Math.sin(f) * d, 0);
      window.__tp.debug.aimAtAnimal(L, 'brain'); g.player.pitch -= 0.05; g.weapons.select('camera');
      return { sp: L.species.id, name: L.identity.nickname, scale: +k.toFixed(2), rumor: !!M.rumor, tries };
    });
    console.log('  legend', JSON.stringify(r));
    for (let i = 0; i < 4; i++) await page.evaluate(() => { const g = window.__tp.game; for (const a of g.animals.list) if (!a.identity.legendary) a.rig.root.visible = false; window.__tp.debug.stepFrames(3); });
    await shot('99_legend');
  },
  async buddies() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 7.4; g.weather.set('clear', true); g.profile.settings.buddies = 2; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, I = g.input;
      I.down.add('KeyW');
      for (let i = 0; i < 60 * 6; i++) { g.advance(1 / 60); I.endFrame(); }
      I.down.delete('KeyW');
      for (let i = 0; i < 60 * 3; i++) g.advance(1 / 60);
      const p = g.player.pos;
      return { n: g.buddies.list.length, dists: g.buddies.list.map(b => +Math.hypot(b.pos.x - p.x, b.pos.z - p.z).toFixed(1)), seen: g.buddies.list.map(b => b.seen.size) };
    });
    console.log('  buddies', JSON.stringify(r));
    await page.evaluate(() => { const g = window.__tp.game; g.thirdPerson = true; g.player.pitch = -0.25; g.player.yaw += Math.PI; });
    for (let i = 0; i < 4; i++) await step(3);
    await shot('99_buddies');
  },
  async turkey() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, p = g.player, M = g.animals;
      let tries = 0, tom = null;
      while (!tom && tries++ < 400) { M.spawnGroup(p.pos); tom = M.list.find(a => a.species.id === 'turkey' && a.identity.sex === 'Male'); }
      tom.identity.temperament = 'Ornery';
      p.spawnAt(tom.pos.x + 5, tom.pos.z, 0);
      const hp0 = p.hp; const goals = new Set();
      let minHp = 100;
      for (let i = 0; i < 60 * 12; i++) { g.advance(1 / 60); goals.add(tom.goal); minHp = Math.min(minHp, p.hp); }
      return { goals: [...goals], worstDmg: +(hp0 - minHp).toFixed(1), downed: p.downed };
    });
    console.log('  turkey', JSON.stringify(r));
  },
  async honey() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 10; g.weather.set('clear', true); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, p = g.player, M = g.animals;
      M.populateAround = () => {};
      for (const a of M.list) a.dispose(); M.list = []; M.groups = [];
      let tries = 0;
      while (!M.list.some(a => a.species.id === 'black_bear') && tries++ < 300) { for (const a of M.list) a.dispose(); M.list = []; M.groups = []; M.spawnGroup(p.pos); }
      const bear = M.list.find(a => a.species.id === 'black_bear');
      p.spawnAt(bear.pos.x + 120, bear.pos.z + 120, 0); // far away, quiet
      const lx = bear.pos.x + 40, lz = bear.pos.z + 10;
      M.addLure(lx, lz);
      let t = 0, d = 0;
      for (; t < 60 * 70; t++) { g.advance(1 / 60); d = Math.hypot(bear.pos.x - lx, bear.pos.z - lz); if (d < 3.6 && bear.goal === 'Graze') break; }
      // first aid
      const tent = g.structures.tents[0];
      p.spawnAt(tent.x + Math.sin(tent.rot) * 2.2, tent.z + Math.cos(tent.rot) * 2.2, 0);
      p.hp = 40; p.bleed = 1;
      g.interact();
      return { reached: d < 3.6, seconds: +(t / 60).toFixed(1), goal: bear.goal, healed: p.hp === 100 && p.bleed === 0, tents: g.structures.tents.length };
    });
    console.log('  honey', JSON.stringify(r));
  },
  async goofy() {
    await page.evaluate(() => { const g = window.__tp.game; g.hour = 17.4; g.weather.set('clear', true); });
    await page.evaluate(() => window.__tp.debug.startGame({}));
    const r = await page.evaluate(() => {
      const g = window.__tp.game, p = g.player;
      p.hurt({ blunt: 30, knock: { x: 7, y: 5, z: 2 }, source: 'maul' });
      const off = g.hatOff, flying = g.weapons.props.some(x => x.kind === 'hat');
      for (let i = 0; i < 60 * 4; i++) g.advance(1 / 60);
      const hat = g.weapons.props.find(x => x.kind === 'hat');
      const rest = hat && hat.resting;
      p.tumble = null; p.spawnAt(hat.x + 0.5, hat.z, 0);
      const near = g.weapons.nearestPickup(p.pos, 2.5);
      g.interact();
      return { off, flying, rest, near: near && near.label, back: !g.hatOff && g.hunterModel.hat.visible };
    });
    console.log('  goofy', JSON.stringify(r));
    await page.evaluate(() => { const g = window.__tp.game; g.input.pressed.add('KeyJ'); });
    for (let i = 0; i < 5; i++) await step(4);
    await shot('99_dance');
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
    await step(2);
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
