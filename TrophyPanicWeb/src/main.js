// Boot: build the world behind a loading card, then hand control to Game.
import { Game } from './game/game.js';

function start(saved = {}) {
  const canvas = document.getElementById('game');
  const game = new Game(canvas, saved);
  window.__tp = game.debugApi();
  game.boot().catch((e) => {
    console.error(e);
    const msg = document.getElementById('load-msg');
    if (msg) msg.textContent = 'Something broke while growing the forest: ' + (e && e.message);
  });
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) {
    try { hot.snapshot(() => game.snapshot()); } catch { /* optional */ }
  }
}

const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start);
else start((hot && hot.data) || {});
