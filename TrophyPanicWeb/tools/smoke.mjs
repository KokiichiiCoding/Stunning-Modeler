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
