import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, restart } from '../src/shared/physics.js';
import { teamLadderAt } from '../src/shared/constants.js';

function spawnAt(level, random = 0.9, mode = 'team') {
  const w = createWorld(mode);
  w.level = level;
  w.trapTimer = w.gullTimer = w.hogTimer = w.stoneTimer = 0;
  const original = Math.random;
  Math.random = () => random;
  try { step(w, 1 / 60); } finally { Math.random = original; }
  return w;
}

test('team starts without hazards and unlocks web before tar', () => {
  const first = spawnAt(1);
  assert.equal(first.traps.length + first.hogs.length + first.stones.length + first.spikes.length, 0);
  assert.equal(first.gull, null);
  assert.deepEqual(spawnAt(2).traps.map(t => t.type), ['web']);
  assert.deepEqual(spawnAt(3).traps.map(t => t.type), ['tar']);
  assert.equal(spawnAt(3).gull, null);
});

test('later levels unlock hogs and paired traps; biome restrictions still apply', () => {
  assert.equal(spawnAt(4).hogs.length, 0);
  assert.equal(spawnAt(4).gull, null); // Night biome.
  assert.equal(spawnAt(5).hogs.length, 1);
  assert.equal(spawnAt(5, 0.1).traps.length, 1);
  const sixth = spawnAt(6, 0.1);
  assert.deepEqual(sixth.traps.map(t => t.type), ['web', 'tar']);
  assert.ok(sixth.gull);
  assert.equal(sixth.stones.length + sixth.spikes.length, 0);
});

test('difficulty increases after unlocks and is capped; restart is calm', () => {
  assert.equal(teamLadderAt(6).gapMul, 1);
  assert.ok(teamLadderAt(9).gapMul < 1);
  assert.equal(teamLadderAt(12).gapMul, teamLadderAt(100).gapMul);
  const w = spawnAt(6, 0.1);
  restart(w);
  step(w, 1 / 60);
  assert.equal(w.level, 1);
  assert.equal(w.traps.length + w.hogs.length, 0);
  assert.equal(w.gull, null);
});

test('classic and hardcore retain their initial hazard rules', () => {
  const normal = spawnAt(1, 0.1, 'normal');
  assert.equal(normal.gull, null);
  assert.equal(normal.hogs.length + normal.traps.length + normal.stones.length, 0);
  const hard = spawnAt(1, 0.1, 'hardcore');
  assert.ok(hard.gull);
  assert.equal(hard.hogs.length, 1);
  assert.equal(hard.stones.length, 1);
  assert.equal(hard.traps.length, 0);
});
