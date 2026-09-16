import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addHand, step, restart, removeHand } from '../src/shared/physics.js';
import { FOOTBALL as F, setFootballInput } from '../src/shared/football.js';

function match() {
  const w = createWorld('football');
  addHand(w, 'p0', 0); addHand(w, 'p1', 1);
  restart(w);
  return w;
}

test('football pickup enables a directed shot, without repeat kicks or instant recapture', () => {
  const w = match(), h = w.hands[0];
  assert.equal(w.football.owner, h.id);
  setFootballInput(w, h.id, { x: h.x, y: h.y, aimX: h.x, aimY: 0, kick: true });
  step(w, 1 / 120);
  assert.equal(w.football.owner, null);
  assert.ok(w.football.ball.vy < -700);
  assert.ok(Math.abs(w.football.ball.vx) < 0.001);
  assert.equal(w.events.filter(e => e.type === 'footballKick').length, 1);
  step(w, 1 / 120);
  assert.equal(w.events.length, 0);
  assert.ok(h.pickup > 0);
});

test('an opponent can tackle after protection; teammates cannot steal possession', () => {
  const w = match(), m = w.football;
  const friend = addHand(w, 'p2', 2), opponent = w.hands[1];
  friend.x = friend.tx = 602; friend.y = friend.ty = 420;
  step(w, 1 / 120);
  assert.equal(m.owner, 'p0');
  opponent.x = opponent.tx = 602; opponent.y = opponent.ty = 420;
  m.protect = 0;
  step(w, 1 / 120);
  assert.equal(m.owner, 'p1');
  removeHand(w, 'p1');
  step(w, 1 / 120);
  assert.notEqual(m.owner, 'p1');
});

test('only the goal opening scores; goal pause, match end and restart work', () => {
  const w = createWorld('football'), m = w.football;
  Object.assign(m.ball, { x: F.right + F.radius - 2, y: 200, vx: 800, vy: 0 });
  step(w, 1 / 60);
  assert.deepEqual(m.score, [0, 0]);
  assert.equal(m.notice, 'Удар від воріт');
  step(w, 0.9);
  for (let i = 0; i < 5; i++) {
    Object.assign(m.ball, { x: F.right + F.radius - 2, y: 420, vx: 800, vy: 0 });
    step(w, 1 / 60);
    assert.equal(m.score[0], i + 1);
    if (i < 4) {
      assert.equal(w.state, 'respawn');
      step(w, 1.51);
      assert.equal(w.state, 'playing');
    }
  }
  assert.equal(m.winner, 0);
  assert.equal(w.state, 'over');
  step(w, 2);
  assert.equal(m.score[0], 5);
  restart(w);
  assert.deepEqual(w.football.score, [0, 0]);
  assert.equal(w.football.winner, null);
});

test('both goals award the attacking team and crossing the touchline awards a throw-in', () => {
  const w = createWorld('football');
  Object.assign(w.football.ball, { x: F.left - F.radius + 2, y: 420, vx: -800, vy: 0 });
  step(w, 1 / 60);
  assert.deepEqual(w.football.score, [0, 1]);
  restart(w);
  Object.assign(w.football.ball, { x: 600, y: F.top - F.radius + 2, vx: 0, vy: -800 });
  step(w, 1 / 60);
  assert.ok(w.football.ball.y >= F.top + F.radius);
  assert.equal(w.football.notice, 'Аут');
  assert.equal(w.football.lastTouch, 1);
});

test('invalid input cannot corrupt football and paused games cannot move or shoot', () => {
  const w = match(), h = w.hands[0];
  const before = [h.tx, h.ty, h.aimX, h.aimY];
  setFootballInput(w, h.id, { x: NaN, y: Infinity, aimX: '100', aimY: {} });
  assert.deepEqual([h.tx, h.ty, h.aimX, h.aimY], before);
  setFootballInput(w, 'p1', { kick: true });
  assert.equal(w.hands[1].kick, false);
  w.paused = true;
  const state = structuredClone(w.football);
  setFootballInput(w, h.id, { x: 1000, y: 300, kick: true });
  step(w, 2);
  assert.deepEqual(w.football, state);
  assert.equal(h.kick, false);
});

test('bots on both teams shoot and complete a match on every difficulty', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const w = createWorld('football');
    for (let side = 0; side < 8; side++) {
      const h = addHand(w, 'bot' + side, side);
      h.bot = true; h.botDifficulty = difficulty;
    }
    restart(w);
    const shots = [0, 0];
    for (let i = 0; i < 60 * 300 && w.state !== 'over'; i++) {
      step(w, 1 / 60);
      for (const e of w.events) if (e.type === 'footballKick') shots[e.player % 2]++;
    }
    assert.ok(shots.every(n => n > 0), difficulty);
    assert.equal(w.state, 'over', difficulty);
    assert.ok(w.football.score.every(n => n > 0), difficulty);
  }
});

test('football difficulty changes match strength against the same medium team', () => {
  const results = [];
  for (const difficulty of ['easy', 'medium', 'hard']) {
    let difference = 0;
    for (let scenario = 0; scenario < 8; scenario++) {
      const w = createWorld('football');
      for (let side = 0; side < 8; side++) {
        const h = addHand(w, 'bot' + side, side);
        h.bot = true;
        h.botDifficulty = side % 2 ? difficulty : 'medium';
      }
      restart(w);
      // Alternate kickoffs and shooting phases to avoid testing one opening.
      w.football.serve = scenario % 2;
      w.state = 'respawn'; w.timer = 0;
      step(w, 1 / 60);
      w.time = scenario * 1.37;
      for (let frame = 0; frame < 60 * 300 && w.state !== 'over'; frame++) step(w, 1 / 60);
      difference += w.football.score[1] - w.football.score[0];
    }
    results.push(difference);
  }
  assert.ok(results[0] < results[1] && results[1] < results[2], `Goal differences: ${results}`);
  assert.ok(results[0] < 0 && results[2] > 0, `Goal differences: ${results}`);
});

test('easy attackers give more time to react and miss more often than hard attackers', () => {
  const results = {};
  for (const difficulty of ['easy', 'medium', 'hard']) {
    let time = 0, onTarget = 0;
    for (let scenario = 0; scenario < 40; scenario++) {
      const w = createWorld('football'), h = addHand(w, 'bot', 0);
      h.bot = true; h.botDifficulty = difficulty;
      h.x = h.tx = 850; h.y = h.ty = 420;
      w.football.owner = h.id;
      w.time = scenario * 0.37;
      let shot = false;
      for (let frame = 0; frame < 240; frame++) {
        step(w, 1 / 120);
        if (w.events.some(e => e.type === 'footballKick')) {
          time += frame / 120;
          const b = w.football.ball;
          const y = b.y + b.vy * (F.right - F.radius - b.x) / b.vx;
          if (y > F.goalTop + F.radius && y < F.goalBottom - F.radius) onTarget++;
          shot = true;
          break;
        }
      }
      assert.ok(shot, `${difficulty} still needs to shoot`);
      restart(w);
      assert.equal(h.botDifficulty, difficulty);
    }
    results[difficulty] = { time, onTarget };
  }
  assert.ok(results.easy.time > results.medium.time && results.medium.time > results.hard.time);
  assert.ok(results.easy.onTarget < results.medium.onTarget && results.medium.onTarget < results.hard.onTarget,
    JSON.stringify(results));
});
