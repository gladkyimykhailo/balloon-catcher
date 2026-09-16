import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addHand, step, restart, setSkin, setGlove, setHandTarget } from '../src/shared/physics.js';
import { HOOPS, BASKETBALL as B } from '../src/shared/basketball.js';
import { WORLD, CEIL_Y, FLOOR_Y } from '../src/shared/constants.js';

function basket(w, side) {
  Object.assign(w.basketball.ball, { x: side ? HOOPS.right : HOOPS.left, y: HOOPS.y - 1, vx: 0, vy: 300 });
  step(w, 1 / 120);
}

test('all four basketball corners teleport the ball to the centre without scoring', () => {
  for (const right of [false, true]) for (const bottom of [false, true]) {
    const w = createWorld('hoops'), b = w.basketball.ball;
    const hand = addHand(w, 'p', 0);
    hand.touching = true; hand.cooldown = 0.18;
    w.basketball.lastShot = 0;
    Object.assign(b, {
      x: right ? WORLD.w - B.radius - 1 : B.radius + 1,
      y: bottom ? FLOOR_Y - B.radius - 1 : CEIL_Y + B.radius + 1,
      vx: right ? 300 : -300, vy: bottom ? 300 : -300,
    });
    step(w, 1 / 120);
    assert.equal(b.x, WORLD.w / 2);
    assert.equal(b.y, (CEIL_Y + FLOOR_Y) / 2);
    assert.equal(b.vx, 0); assert.equal(b.vy, 0);
    assert.equal(w.basketball.lastShot, null);
    assert.equal(hand.touching, false);
    assert.equal(hand.cooldown, 0);
    assert.deepEqual(w.basketball.score, [0, 0]);
    assert.equal(w.state, 'playing');
    step(w, 1 / 120);
    assert.ok(b.y > (CEIL_Y + FLOOR_Y) / 2);
  }
});

test('a side wall alone bounces normally and volleyball corners still award points', () => {
  const w = createWorld('hoops'), b = w.basketball.ball;
  Object.assign(b, { x: B.radius + 1, y: 500, vx: -300, vy: 0 });
  step(w, 1 / 120);
  assert.equal(b.x, B.radius);
  assert.ok(b.vx > 0);
  const volley = createWorld('basketball');
  Object.assign(volley.basketball.ball, { x: B.radius, y: FLOOR_Y - B.radius, vx: -100, vy: 100 });
  step(volley, 1 / 120);
  assert.deepEqual(volley.basketball.score, [0, 1]);
});

test('basketball awards two points for downward baskets, first to ten wins', () => {
  for (const side of [0, 1]) {
    const w = createWorld('hoops');
    for (let i = 0; i < 5; i++) {
      basket(w, side);
      assert.equal(w.basketball.score[1 - side], (i + 1) * 2);
      if (i < 4) step(w, B.pause + 0.01);
    }
    assert.equal(w.state, 'over');
    assert.equal(w.basketball.winner, 1 - side);
    restart(w);
    assert.equal(w.basketball.kind, 'hoops');
    assert.equal(w.basketball.target, 10);
    assert.deepEqual(w.basketball.score, [0, 0]);
  }
});

test('upward shots and floor bounces do not score', () => {
  const w = createWorld('hoops'), b = w.basketball.ball;
  Object.assign(b, { x: HOOPS.right, y: HOOPS.y + 1, vx: 0, vy: -300 });
  step(w, 1 / 120);
  assert.deepEqual(w.basketball.score, [0, 0]);
  Object.assign(b, { x: 900, y: FLOOR_Y - B.radius - 1, vx: 0, vy: 300 });
  step(w, 1 / 120);
  assert.ok(b.vy < 0);
  assert.equal(w.state, 'playing');
  assert.deepEqual(w.basketball.score, [0, 0]);
});

test('basketball players and ball can cross the centre below volleyball net height', () => {
  const w = createWorld('hoops'), h = addHand(w, 'p', 0);
  setHandTarget(w, 'p', 900, 600);
  step(w, 0.7);
  assert.ok(h.x > 600);
  Object.assign(w.basketball.ball, { x: 550, y: 450, vx: 500, vy: 0 });
  step(w, 0.2);
  assert.ok(w.basketball.ball.x > 600);
});

test('normal hand contact launches a shot that scores in the opponent basket', () => {
  for (const player of [0, 1]) {
    const w = createWorld('hoops'), h = addHand(w, 'p', player);
    Object.assign(w.basketball.ball, { x: h.x, y: h.y - h.r - B.radius + 1, vx: 0, vy: 200 });
    step(w, 1 / 120);
    assert.ok(w.events.some(e => e.type === 'basketHit'));
    for (let i = 0; i < 360 && w.state === 'playing'; i++) step(w, 1 / 120);
    assert.equal(w.basketball.score[player], 2);
  }
});

test('skins and gloves apply in both sports and survive a restart', () => {
  for (const mode of ['basketball', 'hoops']) {
    const w = createWorld(mode), h = addHand(w, 'p', 0, 2);
    assert.equal(h.glove, 2);
    setGlove(w, 'p', 3);
    setSkin(w, 4);
    restart(w);
    assert.equal(w.skin, 4);
    assert.equal(h.glove, 3);
    assert.equal(h.r, B.handRadius);
  }
});

test('rim and backboard bounce the ball without awarding points', () => {
  const w = createWorld('hoops'), b = w.basketball.ball;
  Object.assign(b, { x: HOOPS.right - HOOPS.half, y: HOOPS.y - B.radius - 4, vx: 0, vy: 300 });
  step(w, 1 / 120);
  assert.ok(b.vy < 0);
  assert.deepEqual(w.basketball.score, [0, 0]);
  const board = HOOPS.right + HOOPS.half + 12;
  Object.assign(b, { x: board - B.radius - 6, y: HOOPS.y - 80, vx: 400, vy: 0 });
  step(w, 1 / 120);
  assert.ok(b.vx < 0);
});

test('both teams of bots repeatedly contest the ball throughout play', () => {
  const w = createWorld('hoops');
  for (let side = 0; side < 8; side++) addHand(w, 'bot' + side, side).bot = true;
  const hits = [0, 0];
  for (let i = 0; i < 1800 && w.state !== 'over'; i++) {
    step(w, 1 / 60);
    for (const event of w.events) if (event.type === 'basketHit') hits[event.player % 2]++;
  }
  assert.ok(hits[0] > 5);
  assert.ok(hits[1] > 5);
});

test('bots give friendly shots space while opponents keep chasing', () => {
  const w = createWorld('hoops');
  for (let side = 0; side < 8; side++) addHand(w, 'bot' + side, side).bot = true;
  w.basketball.lastShot = 0;
  Object.assign(w.basketball.ball, { x: 600, y: 250, vx: 200, vy: -100 });
  step(w, 1 / 120);
  for (const bot of w.hands) {
    if (bot.player % 2 === 0) {
      assert.equal(bot.tx, bot.x);
      assert.equal(bot.ty, FLOOR_Y - B.handRadius);
    } else {
      assert.ok(bot.tx > 550 && bot.tx < 660);
      assert.equal(bot.ty, 318);
    }
    assert.ok(Math.hypot(bot.vx, bot.vy) > 0);
    assert.ok(Math.hypot(bot.vx, bot.vy) <= B.botSpeed + 1e-6);
  }
});

test('bots let their own shots score without hitting them again on every difficulty', () => {
  for (const player of [0, 1]) for (const difficulty of ['easy', 'medium', 'hard']) {
    const w = createWorld('hoops'), bot = addHand(w, 'bot', player);
    bot.bot = true;
    bot.botDifficulty = difficulty;
    Object.assign(w.basketball.ball, { x: bot.x, y: bot.y - bot.r - B.radius + 1, vx: 0, vy: 200 });
    let hits = 0;
    for (let i = 0; i < 360 && w.state === 'playing'; i++) {
      step(w, 1 / 120);
      hits += w.events.filter(e => e.type === 'basketHit').length;
    }
    assert.equal(hits, 1, `${player}: ${difficulty}`);
    assert.equal(w.basketball.score[player], 2, `${player}: ${difficulty}`);
  }
});

test('a bot chases a missed friendly shot below the rim', () => {
  const w = createWorld('hoops'), bot = addHand(w, 'bot', 1);
  bot.bot = true;
  w.basketball.lastShot = 1;
  Object.assign(w.basketball.ball, { x: 600, y: HOOPS.y + 50, vx: 0, vy: 100 });
  let hit = false;
  for (let i = 0; i < 240 && !hit; i++) {
    step(w, 1 / 120);
    hit = w.events.some(e => e.type === 'basketHit');
  }
  assert.ok(hit);
});

test('a bot intercepts an already released shot instead of keeping away from it', () => {
  const w = createWorld('hoops'), bot = addHand(w, 'bot', 1);
  bot.bot = true;
  bot.x = bot.tx = 900; bot.y = bot.ty = 470;
  w.basketball.lastShot = 0;
  Object.assign(w.basketball.ball, { x: 900, y: 350, vx: 0, vy: 0 });
  let hit = false;
  for (let i = 0; i < 60 && !hit; i++) {
    step(w, 1 / 120);
    hit = w.events.some(e => e.type === 'basketHit' && e.player === 1);
  }
  assert.ok(hit);
});
