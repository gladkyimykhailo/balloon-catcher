// Керування долонями.
//
//  • миша / перший дотик  -> Гравець 1
//  • другий дотик          -> Гравець 2 (планшет: двоє дітей за одним екраном)
//  • WASD                  -> Гравець 1
//  • стрілки               -> Гравець 2
//
// Клавіатурна долоня має розгін та інерцію, інакше нею неможливо "вдарити":
// імпульс у фізиці залежить саме від швидкості долоні.

import { WORLD, HAND } from '../shared/constants.js';

export class Input {
  constructor(renderer, opts = {}) {
    this.r = renderer;
    this.slots = opts.slots ?? 2;      // скільки локальних долонь обслуговуємо
    this.pointers = new Map();         // pointerId -> slot
    this.targets = [
      { x: WORLD.w * 0.35, y: WORLD.h - 170, kx: 0, ky: 0, used: false },
      { x: WORLD.w * 0.65, y: WORLD.h - 170, kx: 0, ky: 0, used: false },
    ];
    this.keys = new Set();
    this._bind();
  }

  _bind() {
    const el = this.r.app.canvas;
    el.style.touchAction = 'none';

    const claim = (id) => {
      if (this.pointers.has(id)) return this.pointers.get(id);
      for (let s = 0; s < this.slots; s++) {
        if (![...this.pointers.values()].includes(s)) { this.pointers.set(id, s); return s; }
      }
      return null;
    };

    const move = (e) => {
      const slot = this.pointers.get(e.pointerId);
      if (slot == null) return;
      const p = this.r.toWorld(e.clientX, e.clientY);
      this.targets[slot].x = p.x;
      this.targets[slot].y = p.y;
      this.targets[slot].used = true;
      e.preventDefault();
    };

    el.addEventListener('pointerdown', (e) => { claim(e.pointerId); move(e); el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      // Мишу ведемо навіть без затиснутої кнопки — так грати дітям простіше.
      if (e.pointerType === 'mouse' && !this.pointers.has(e.pointerId)) claim(e.pointerId);
      move(e);
    });
    const drop = (e) => { this.pointers.delete(e.pointerId); };
    el.addEventListener('pointerup', drop);
    el.addEventListener('pointercancel', drop);
    el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') drop(e); });

    // Слухач живе весь час, і в меню теж — тож поки гравець пише в полі коду
    // кімнати, клавіші належать полю, а не долоні.
    const typing = (e) => {
      const t = e.target;
      return t instanceof HTMLElement &&
        (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    };

    window.addEventListener('keydown', (e) => {
      if (e.repeat || typing(e)) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { if (!typing(e)) this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.pointers.clear(); });
  }

  update(dt) {
    const axes = [
      { l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS' },
      { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown' },
    ];
    for (let s = 0; s < this.slots; s++) {
      const t = this.targets[s];
      const a = axes[s];
      const dx = (this.keys.has(a.r) ? 1 : 0) - (this.keys.has(a.l) ? 1 : 0);
      const dy = (this.keys.has(a.d) ? 1 : 0) - (this.keys.has(a.u) ? 1 : 0);
      if (dx || dy) {
        const k = 1 - Math.pow(0.0001, dt * HAND.keyAccel * 0.1);
        const len = Math.hypot(dx, dy) || 1;
        t.kx += ((dx / len) * HAND.keySpeed - t.kx) * k;
        t.ky += ((dy / len) * HAND.keySpeed - t.ky) * k;
        t.used = true;
      } else {
        const damp = Math.pow(0.001, dt);
        t.kx *= damp;
        t.ky *= damp;
      }
      t.x = clamp(t.x + t.kx * dt, 0, WORLD.w);
      t.y = clamp(t.y + t.ky * dt, 0, WORLD.h);
    }
  }

  /** Скидає захоплені вказівники — викликати при зміні режиму гри. */
  reset(slots) {
    if (slots) this.slots = slots;
    this.pointers.clear();
    this.keys.clear();
    for (const t of this.targets) { t.kx = 0; t.ky = 0; }
  }

  target(slot) { return this.targets[slot]; }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
