import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addHand, step, setHandTarget } from '../src/shared/physics.js';
import { storage, savedNumber, savedSet } from '../src/client/storage.js';

test('invalid targets and time steps cannot poison physics in any mode', () => {
  for (const mode of ['normal', 'hardcore', 'team', 'basketball']) {
    const w = createWorld(mode), h = addHand(w, 'p0', 0);
    const target = [h.tx, h.ty];
    for (const x of [undefined, null, {}, '100', NaN, Infinity]) setHandTarget(w, h.id, x, 10);
    assert.deepEqual([h.tx, h.ty], target);
    for (const dt of [0, -1, NaN, Infinity]) step(w, dt);
    step(w, 1 / 60);
    for (const p of [...w.balloon.pts, h]) {
      assert.ok([p.x, p.y, p.vx, p.vy].every(Number.isFinite));
    }
  }
});

test('storage tolerates invalid JSON, invalid balances and unavailable persistence', () => {
  storage.setItem('bad-json', '{');
  storage.setItem('bad-array', '{}');
  storage.setItem('bad-number', 'Infinity');
  storage.setItem('negative', '-10');
  assert.deepEqual([...savedSet('bad-json', ['red'])], ['red']);
  assert.deepEqual([...savedSet('bad-array', ['red'])], ['red']);
  assert.equal(savedNumber('bad-number'), 0);
  assert.equal(savedNumber('negative'), 0);
  storage.setItem('balance', 25);
  assert.equal(savedNumber('balance'), 25);
  storage.setItem('owned', '["blue",null,42]');
  assert.deepEqual([...savedSet('owned', ['red'])], ['red', 'blue']);
});
