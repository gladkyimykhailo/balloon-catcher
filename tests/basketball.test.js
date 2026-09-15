import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addHand, setHandTarget, step, restart, setGlove } from '../src/shared/physics.js';
import { BASKETBALL as B, basketballHand } from '../src/shared/basketball.js';
import { WORLD, FLOOR_Y } from '../src/shared/constants.js';

const world = () => createWorld('basketball');
function floor(w, side) {
  Object.assign(w.basketball.ball, { x: side ? 900 : 300, y: FLOOR_Y - B.radius - 1, vx: 0, vy: 300 });
  step(w, 1 / 60);
}

test('basketball has a smaller round ball, no hazards and fair equipment', () => {
  const w = world();
  const h = addHand(w, 'h0', 0, 3, 4);
  setGlove(w, 'h0', 3);
  assert.equal(h.r, B.handRadius);
  assert.equal(h.glove, 0);
  assert.equal(w.medkits, 0);
  assert.equal(w.balloon.pts.length, 26);
  for (const p of w.balloon.pts) assert.ok(Math.abs(Math.hypot(p.x - 300, p.y - 240) - B.radius) < 1e-8);
  for (let i = 0; i < 1200 && w.state !== 'over'; i++) step(w, 1 / 60);
  assert.equal(w.spikes.length + w.stones.length + w.hogs.length + w.traps.length, 0);
});

test('each floor awards exactly one point to the opposite side', () => {
  for (const side of [0, 1]) {
    const w = world();
    floor(w, side);
    assert.equal(w.basketball.score[1 - side], 1);
    assert.equal(w.basketball.score[side], 0);
    assert.equal(w.state, 'respawn');
    assert.equal(w.events.filter(e => e.type === 'basketPoint').length, 1);
    step(w, 0.1);
    assert.equal(w.basketball.score[1 - side], 1);
    assert.equal(w.events.length, 0);
  }
});

test('touching the floor beats a simultaneous attempted save', () => {
  const w = world();
  const h = addHand(w, 'h0', 0);
  h.x = h.tx = 300; h.y = h.ty = FLOOR_Y - h.r;
  floor(w, 0);
  assert.deepEqual(w.basketball.score, [0, 1]);
});

test('loser serves next, first to five wins, restart clears match', () => {
  const w = world();
  for (let i = 0; i < B.target; i++) {
    floor(w, 1);
    if (i < B.target - 1) {
      step(w, B.pause + 0.01);
      assert.equal(w.state, 'playing');
      assert.equal(w.basketball.serve, 1);
      assert.equal(w.basketball.ball.x, 900);
    }
  }
  assert.equal(w.state, 'over');
  assert.equal(w.basketball.winner, 0);
  const old = structuredClone(w.basketball);
  step(w, 1);
  assert.deepEqual(w.basketball, old);
  restart(w);
  assert.deepEqual(w.basketball.score, [0, 0]);
  assert.equal(w.basketball.winner, null);
  assert.equal(w.state, 'playing');
});

test('net blocks both directions below top and allows a clear shot above it', () => {
  for (const side of [0, 1]) {
    const w = world();
    const b = w.basketball.ball;
    Object.assign(b, { x: side ? 650 : 550, y: 500, vx: side ? -500 : 500, vy: 0 });
    step(w, 0.1);
    assert.ok(side ? b.x >= 640 && b.vx > 0 : b.x <= 560 && b.vx < 0);
  }
  const w = world(), b = w.basketball.ball;
  Object.assign(b, { x: 550, y: 250, vx: 500, vy: 0 });
  step(w, 0.2);
  assert.ok(b.x > 600);
  assert.deepEqual(w.basketball.score, [0, 0]);
});

test('ball bounces off top of net', () => {
  const w = world(), b = w.basketball.ball;
  Object.assign(b, { x: 600, y: B.netTop - B.radius - 2, vx: 0, vy: 300 });
  step(w, 1 / 120);
  assert.ok(b.y <= B.netTop - B.radius);
  assert.ok(b.vy < 0);
});

test('players cannot cross the net, including malicious/invalid targets', () => {
  const w = world();
  const left = addHand(w, 'h0', 0), right = addHand(w, 'h1', 1);
  setHandTarget(w, 'h0', 1200, 0);
  setHandTarget(w, 'h1', 0, 0);
  step(w, 0.4);
  assert.ok(left.x + left.r <= 600 - B.netHalf);
  assert.ok(right.x - right.r >= 600 + B.netHalf);
  const bad = basketballHand(left.x, left.y, NaN, Infinity, 1 / 60, 0);
  assert.ok(Number.isFinite(bad.x) && Number.isFinite(bad.y));
});

test('bot hits through normal collision and stays on its side', (t) => {
  t.mock.method(Math, 'random', () => 0.74);
  const w = world(), bot = addHand(w, 'bot', 1);
  bot.bot = true;
  Object.assign(w.basketball.ball, { x: 900, y: 250, vx: 0, vy: 100 });
  let hits = 0;
  for (let i = 0; i < 240 && w.state === 'playing'; i++) {
    step(w, 1 / 60);
    hits += w.events.filter(e => e.type === 'basketHit' && e.player === 1).length;
    assert.ok(bot.x - bot.r >= B.netX + B.netHalf);
    assert.ok(Math.hypot(bot.vx, bot.vy) <= B.botSpeed + 1e-6);
  }
  assert.ok(hits > 0);
});

test('bot misses at the 75% boundary without retrying, and resets on serve', (t) => {
  const random = t.mock.method(Math, 'random', () => 0.75);
  const w = world(), bot = addHand(w, 'bot', 1);
  bot.bot = true;
  Object.assign(w.basketball.ball, { x: 900, y: 250, vx: 0, vy: 100 });
  const before = random.mock.callCount();
  let hits = 0;
  for (let i = 0; i < 240 && w.state === 'playing'; i++) {
    step(w, 1 / 60);
    hits += w.events.filter(e => e.type === 'basketHit').length;
  }
  assert.equal(hits, 0);
  assert.equal(random.mock.callCount() - before, 1);
  assert.deepEqual(w.basketball.score, [1, 0]);
  step(w, B.pause + 0.01);
  assert.equal(bot.botMiss, false);
  restart(w);
  assert.equal(bot.botMiss, false);
});

test('paused room freezes score, ball and bot until opponent returns', () => {
  const w = world();
  addHand(w, 'bot', 1).bot = true;
  w.paused = true;
  const before = structuredClone(w.basketball);
  step(w, 10);
  assert.deepEqual(w.basketball, before);
});


test('all eight player slots stay on their team half and hit toward opponents', () => {
  for (let player = 0; player < 8; player++) {
    const w = world(), h = addHand(w, 'p' + player, player);
    const left = player % 2 === 0;
    assert.ok(left ? h.x < B.netX : h.x > B.netX);
    Object.assign(w.basketball.ball, { x: h.x, y: h.y - h.r - B.radius + 2, vx: 0, vy: 100 });
    step(w, 1 / 120);
    assert.ok(w.events.some(e => e.type === 'basketHit' && e.player === player));
    assert.ok(left ? w.basketball.ball.vx > 0 : w.basketball.ball.vx < 0);
    setHandTarget(w, h.id, left ? WORLD.w : 0, 400);
    step(w, 0.5);
    assert.ok(left ? h.x + h.r <= B.netX - B.netHalf : h.x - h.r >= B.netX + B.netHalf);
    restart(w);
    assert.ok(left ? h.x < B.netX : h.x > B.netX);
  }
});
