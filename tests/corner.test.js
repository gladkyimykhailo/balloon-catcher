import test from 'node:test';
import assert from 'node:assert/strict';
import { cornerPenalty } from '../src/shared/corner.js';
import { createWorld, addHand, step, restart } from '../src/shared/physics.js';
import { WORLD, CEIL_Y } from '../src/shared/constants.js';

function fixture() {
  const w = { balloon: { pts: [{ x: 5, y: 13 }, { x: 100, y: 13 }, { x: 100, y: 110 }, { x: 5, y: 110 }] } };
  const h = { id: 'h0', x: 130, y: 110, r: 54, active: true, out: false };
  return { w, h };
}

test('five seconds grace, then one heart each second', () => {
  const { w, h } = fixture();
  for (let i = 0; i < 299; i++) assert.equal(cornerPenalty(w, 1 / 60, [h]), null);
  assert.equal(cornerPenalty(w, 1 / 60, [h]).damage, 1);
  for (let i = 0; i < 59; i++) assert.equal(cornerPenalty(w, 1 / 60, [h]), null);
  assert.equal(cornerPenalty(w, 1 / 60, [h]).damage, 1);
});

test('only a corner with a present active hand counts', () => {
  const { w, h } = fixture();
  assert.equal(cornerPenalty(w, 10, []), null);
  assert.equal(cornerPenalty(w, 10, [{ ...h, out: true }]), null);
  assert.equal(cornerPenalty(w, 10, [{ ...h, active: false }]), null);
  for (const p of w.balloon.pts) p.x += WORLD.w / 2;
  assert.equal(cornerPenalty(w, 10, [{ ...h, x: h.x + WORLD.w / 2 }]), null);
});

test('release resets grace; one missed contact frame does not', () => {
  const { w, h } = fixture();
  cornerPenalty(w, 4.9, [h]);
  cornerPenalty(w, 0.01, []);
  assert.equal(cornerPenalty(w, 0.1, [h]).damage, 1);
  cornerPenalty(w, 0.31, []);
  assert.equal(cornerPenalty(w, 4.9, [h]), null);
});

test('switching holder does not reset a corner; opposite corner does', () => {
  const { w, h } = fixture();
  cornerPenalty(w, 4.9, [h]);
  const other = { ...h, id: 'h1' };
  assert.equal(cornerPenalty(w, 0.1, [other]).holder, other);
  for (const p of w.balloon.pts) p.x = WORLD.w - p.x;
  assert.equal(cornerPenalty(w, 0.1, [{ ...other, x: WORLD.w - other.x }]), null);
});

function pinnedWorld(mode) {
  const w = createWorld(mode);
  addHand(w, 'h0', 0);
  const h = w.hands[0];
  h.slow = 1; // Existing contact, not a fresh scored pass that makes a team hand intangible.
  Object.assign(h, { x: 100, y: 115, px: 100, py: 115, tx: 100, ty: 115 });
  w.balloon.pts.forEach((p, i, pts) => {
    const a = i / pts.length * Math.PI * 2;
    Object.assign(p, { x: 48 + Math.cos(a) * 42, y: CEIL_Y + 48 + Math.sin(a) * 42, vx: 0, vy: 0 });
  });
  w.cornerHold = { key: 'lefttop', elapsed: 4.99, next: 5, away: 0 };
  return w;
}

test('physics applies damage without respawning and stops on last heart', () => {
  const w = pinnedWorld('normal');
  const lives = w.lives;
  step(w, 1 / 60);
  assert.equal(w.lives, lives - 1);
  assert.equal(w.state, 'playing');
  assert.ok(w.events.some(e => e.type === 'corner'));
  const last = pinnedWorld('normal');
  last.lives = 1;
  step(last, 1 / 60);
  assert.equal(last.state, 'over');
  restart(last);
  assert.equal(last.cornerHold, null);
});

test('team penalty belongs to the holder; paused games do not count', () => {
  const w = pinnedWorld('team');
  addHand(w, 'h1', 1);
  const otherLives = w.hands[1].lives;
  const lives = w.hands[0].lives;
  w.paused = true;
  step(w, 1 / 60);
  assert.equal(w.cornerHold.elapsed, 4.99);
  w.paused = false;
  step(w, 1 / 60);
  assert.equal(w.hands[0].lives, lives - 1);
  assert.equal(w.hands[1].lives, otherLives);
});
