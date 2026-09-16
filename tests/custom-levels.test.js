import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomLevel, CUSTOM_MODES } from '../src/shared/custom-level.js';
import { customLevelStore } from '../src/client/custom-level-store.js';
import { createWorld, addHand, restart, step, maxLivesOf, useMedkit, balloonCenter } from '../src/shared/physics.js';
import { FLOOR_Y } from '../src/shared/constants.js';

function memory(initial = null) {
  let value = initial;
  return { getItem: () => value, setItem: (_, next) => { value = next; } };
}

test('custom levels can be saved, edited, reloaded and deleted without changing other levels', () => {
  const storage = memory(), store = customLevelStore(storage);
  const first = store.save({ name: 'Мій футбол', mode: 'football', target: 3, teamSize: 2 });
  const second = store.save({ name: 'Моя кулька', target: 10, lives: 7 });
  store.save({ ...first, target: 7 }, first.id);
  const reloaded = customLevelStore(storage);
  assert.equal(reloaded.list().length, 2);
  assert.equal(reloaded.list()[0].target, 7);
  const copy = reloaded.list(); copy[1].spawn.x = 0;
  assert.equal(reloaded.list()[1].spawn.x, 600);
  reloaded.remove(first.id);
  assert.deepEqual(customLevelStore(storage).list().map(v => v.id), [second.id]);
});

test('invalid saved data and custom parameters use bounded safe defaults', () => {
  assert.deepEqual(customLevelStore(memory('{broken')).list(), []);
  assert.deepEqual(customLevelStore(memory('[null,42,{}]')).list(), []);
  const c = normalizeCustomLevel({ mode: '__proto__', target: Infinity, lives: -10, pace: 99, spawn: { x: NaN, y: 9000 }, name: '  ' });
  assert.equal(c.mode, 'normal'); assert.equal(c.target, 25);
  assert.equal(c.lives, 1); assert.equal(c.pace, 1.5);
  assert.deepEqual(c.spawn, { x: 600, y: 550 });
  assert.equal(c.name, 'Мій рівень');
  assert.equal(normalizeCustomLevel({ mode: 'team', players: 1 }).players, 2);
});

test('every custom mode preserves its target, spawn and lives through restart', () => {
  for (const mode of Object.keys(CUSTOM_MODES)) {
    const w = createWorld(mode, { target: 8, lives: 6, spawn: { x: 300, y: 200 }, pace: 0.7 });
    const h = addHand(w, 'h0', 0);
    for (let run = 0; run < 2; run++) {
      assert.equal(maxLivesOf(w, h), 6);
      assert.equal(h.lives, 6);
      assert.equal(w.lives, 6);
      assert.equal(w.custom.target, 8);
      if (w.football || w.basketball) {
        const m = w.football ?? w.basketball;
        assert.equal(m.target, 8);
        assert.equal(m.ball.x, 300); assert.equal(m.ball.y, 200);
      } else {
        const c = balloonCenter(w.balloon);
        assert.ok(Math.abs(c.x - 300) < 1e-8 && Math.abs(c.y - 200) < 1e-8);
      }
      w.lives = h.lives = 0;
      restart(w);
      assert.equal(w.customWon, false);
    }
  }
});

test('custom balloon levels finish on a real hit in classic, hardcore and team', () => {
  for (const mode of ['normal', 'hardcore', 'team']) {
    const w = createWorld(mode, { target: 1, hazards: false }), h = addHand(w, 'h0', 0);
    h.x = h.tx = 600; h.y = h.ty = 320;
    step(w, 1 / 60);
    assert.equal(w.score, 1);
    assert.ok(w.events.some(e => e.type === 'hit'));
    assert.equal(w.state, 'over'); assert.equal(w.customWon, true);
    restart(w);
    assert.equal(w.score, 0); assert.equal(w.state, 'playing'); assert.equal(w.customWon, false);
  }
});

test('custom sports matches use the chosen winning score', () => {
  for (const mode of ['football', 'hoops', 'basketball']) {
    const w = createWorld(mode, { target: mode === 'hoops' ? 2 : 1 });
    const b = (w.football ?? w.basketball).ball;
    if (mode === 'football') Object.assign(b, { x: 1150, y: 420, vx: 800, vy: 0 });
    else if (mode === 'hoops') Object.assign(b, { x: 1050, y: 329, vx: 0, vy: 300 });
    else Object.assign(b, { x: 900, y: FLOOR_Y - 33, vx: 0, vy: 300 });
    step(w, 1 / 60);
    assert.equal(w.state, 'over', mode);
    assert.equal((w.football ?? w.basketball).winner, 0);
  }
});

test('custom lives also set the healing cap and disabled hazards never spawn', () => {
  for (const mode of ['normal', 'hardcore', 'team']) {
    const w = createWorld(mode, { lives: 7, hazards: false }), h = addHand(w, 'h0', 0);
    w.lives = h.lives = 6;
    assert.equal(useMedkit(w, h.id).healed, true);
    assert.equal(mode === 'team' ? h.lives : w.lives, 7);
    assert.equal(useMedkit(w, h.id), null);
    w.gullTimer = w.spikeTimer = w.stoneTimer = w.hogTimer = w.skunkTimer = w.trapTimer = -1;
    step(w, 1 / 60);
    assert.equal(w.gull, null);
    assert.equal(w.spikes.length + w.stones.length + w.traps.length + w.hogs.length + w.skunks.length, 0);
  }
});

test('custom pace changes simulation time without altering standard modes', () => {
  for (const mode of Object.keys(CUSTOM_MODES)) {
    const slow = createWorld(mode, { pace: 0.5 }), normal = createWorld(mode);
    step(slow, 0.1); step(normal, 0.1);
    assert.ok(Math.abs(slow.time - 0.05) < 1e-8, mode);
    assert.ok(Math.abs(normal.time - 0.1) < 1e-8, mode);
    assert.equal(normal.custom, null);
  }
});
