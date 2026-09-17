import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, MAX_ARCADE_LEVEL, arcadeUnlockedLevel } from '../src/shared/arcade-levels.js';
import { createArcade } from '../src/shared/arcade.js';
import { drawArcade } from '../src/client/arcade-view.js';
import { createAchievements } from '../src/client/achievements.js';

test('twenty campaign levels preserve old unlocks and open six for completed fifth-level saves', () => {
  assert.equal(MAX_ARCADE_LEVEL, 20); assert.equal(LEVELS.length, 20);
  assert.equal(arcadeUnlockedLevel(5, true), 6); assert.equal(arcadeUnlockedLevel(5, false), 5);
  assert.equal(arcadeUnlockedLevel(8, true), 8); assert.equal(arcadeUnlockedLevel('bad'), 1);
  assert.equal(arcadeUnlockedLevel(999), 20); assert.equal(arcadeUnlockedLevel(-4), 1);
  assert.equal(arcadeUnlockedLevel(2.5), 2);
});

test('higher arcade levels retain bounded physics and render valid palettes', () => {
  const c = new Proxy({}, { get: (_, name) => name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...args) => {
    for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), String(name));
  }, set: () => true });
  for (const kind of ['fighter','pong','bricks','snake','maze','memory','sokoban','mines','lights','merge','flood','sequence']) {
    for (let level = 6; level <= 20; level++) { const s = createArcade(kind, level); assert.equal(s.level, level); assert.equal(s.difficulty, 5); drawArcade(c, s); }
  }
  assert.notDeepEqual(createArcade('sokoban', 5).board, createArcade('sokoban', 10).board);
  assert.ok(createArcade('snake', 10).speed > createArcade('snake', 5).speed);
});

test('wins above level five grant normal rewards without re-paying legacy trophies', () => {
  let saved; const paid = [], storage = { getItem: () => saved, setItem: (_, v) => { saved = v; } };
  const tracker = createAchievements(storage, a => paid.push(a.id));
  tracker.arcadeFinish({ kind: 'fighter', level: 5, won: true }); const count = paid.length;
  tracker.arcadeFinish({ kind: 'fighter', level: 10, won: true }); assert.equal(paid.length, count);
  assert.equal(tracker.entries().find(a => a.id === 'arcade-fighter-ten').progress, 2);
  createAchievements(storage, () => assert.fail('Duplicate reward')).claimRewards();
});
