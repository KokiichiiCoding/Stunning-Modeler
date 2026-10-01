// Touch controls for phones and tablets: a left-thumb move stick, drag
// anywhere on the right to look, and a cluster of chunky buttons. They feed
// the same Input object the keyboard and mouse do, so the game itself never
// knows the difference.

const BTN = [
  // id, label, key (or special), position class
  ['fire', 'FIRE', 'mouseLeft', 'b-fire'],
  ['aim', 'AIM', 'mouseRightToggle', 'b-aim'],
  ['use', 'E', 'KeyE', 'b-use'],
  ['jump', '⤒', 'Space', 'b-jump'],
  ['crouch', 'C', 'KeyC', 'b-crouch'],
  ['prone', 'Z', 'KeyZ', 'b-prone'],
  ['reload', 'R', 'KeyR', 'b-reload'],
  ['binos', 'B', 'KeyB', 'b-binos'],
  ['sense', 'Q', 'KeyQ', 'b-sense'],
  ['cycle', '⟳', 'wheel', 'b-cycle'],
  ['ping', 'X', 'KeyX', 'b-ping'],
  ['pause', 'II', 'Escape', 'b-pause'],
];

export function isTouchDevice() {
  try { return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; } catch { return false; }
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.I = game.input;
    this.enabled = isTouchDevice();
    if (!this.enabled) return;
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `<div class="t-stick"><i></i></div>` + BTN.map(([id, label, , cls]) => `<button class="t-btn ${cls}" data-t="${id}" aria-label="${id}">${label}</button>`).join('');
    document.getElementById('hud').appendChild(root);
    this.root = root;
    this.stick = root.querySelector('.t-stick');
    this.knob = this.stick.querySelector('i');
    this.moveId = null; this.lookId = null; this.lookLast = null;
    const canvas = game.canvas;
    canvas.addEventListener('touchstart', (e) => this.onStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.onEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this.onEnd(e), { passive: false });
    for (const b of root.querySelectorAll('.t-btn')) {
      const def = BTN.find(x => x[0] === b.dataset.t);
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.press(def[2], true); b.classList.add('on'); }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); this.press(def[2], false); b.classList.remove('on'); }, { passive: false });
    }
    document.body.classList.add('is-touch');
  }

  press(key, down) {
    const I = this.I, g = this.game;
    if (key === 'mouseLeft') { I.mouse.left = down; if (down) I.mouse.leftPressed = true; return; }
    if (key === 'mouseRightToggle') { if (down) I.mouse.right = !I.mouse.right; return; }
    if (key === 'wheel') { if (down) I.mouse.wheel += 1; return; }
    if (key === 'Escape') { if (down && g.state === 'play') g.pause(); return; }
    if (down) { if (!I.down.has(key)) I.pressed.add(key); I.down.add(key); } else I.down.delete(key);
  }

  onStart(e) {
    if (this.game.state !== 'play') return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.42 && this.moveId === null) {
        this.moveId = t.identifier; this.origin = { x: t.clientX, y: t.clientY };
        this.stick.style.left = `${t.clientX - 60}px`; this.stick.style.top = `${t.clientY - 60}px`;
        this.stick.classList.add('on');
      } else if (this.lookId === null) { this.lookId = t.identifier; this.lookLast = { x: t.clientX, y: t.clientY }; }
    }
  }

  onMove(e) {
    e.preventDefault();
    const I = this.I;
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        const dx = t.clientX - this.origin.x, dy = t.clientY - this.origin.y;
        const l = Math.min(55, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
        this.knob.style.transform = `translate(${Math.cos(a) * l}px, ${Math.sin(a) * l}px)`;
        const set = (k, on) => { if (on) { if (!I.down.has(k)) I.pressed.add(k); I.down.add(k); } else I.down.delete(k); };
        set('KeyW', dy < -14); set('KeyS', dy > 14); set('KeyA', dx < -14); set('KeyD', dx > 14);
        set('ShiftLeft', Math.hypot(dx, dy) > 70 && dy < 0); // push the stick hard to sprint
      } else if (t.identifier === this.lookId) {
        I.mouse.dx += (t.clientX - this.lookLast.x) * 1.6; I.mouse.dy += (t.clientY - this.lookLast.y) * 1.6;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  onEnd(e) {
    const I = this.I;
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        this.moveId = null; this.stick.classList.remove('on'); this.knob.style.transform = '';
        this.stick.style.left = ''; this.stick.style.top = ''; // float back to its resting spot
        for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) I.down.delete(k);
      } else if (t.identifier === this.lookId) { this.lookId = null; }
    }
  }
}
