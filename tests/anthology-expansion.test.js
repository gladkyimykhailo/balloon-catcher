import test from 'node:test';
import assert from 'node:assert/strict';
import { ANTHOLOGY_GAMES, selectCatalog } from '../src/shared/anthology/catalog.js';
import { EXPANSION_MECHANICS } from '../src/shared/anthology/expansion-catalog.js';
import { createArcade, arcadeAction, updateArcade } from '../src/shared/arcade.js';
import { isLeapYear, timeLabel } from '../src/shared/anthology/expansion-puzzles.js';
import { motorGeometry } from '../src/shared/anthology/engine.js';
import { createAchievements } from '../src/client/achievements.js';
const gameId = (m, r = 0) => `discovery-${m}-${r}-expedition`;
const make = (m, r = 0, seed = 0.41) => createArcade(gameId(m, r), 3, () => seed);
const answer = s => s.stage.choices[s.stage.answer];

test('both collections retain 500 entries with stable IDs', () => {
  const first = selectCatalog(ANTHOLOGY_GAMES, { collection: 'first' }), second = selectCatalog(ANTHOLOGY_GAMES, { collection: 'second' });
  assert.equal(first.length, 500); assert.equal(second.length, 500);
  assert.equal(EXPANSION_MECHANICS.length, 20);
  assert.equal(new Set([...first, ...second].map(([id]) => id)).size, 1000);
  assert.ok(first.every(([, g]) => !EXPANSION_MECHANICS.some(m => m.id === g.mechanic)));
  assert.ok(second.every(([, g]) => EXPANSION_MECHANICS.some(m => m.id === g.mechanic)));
  assert.equal(ANTHOLOGY_GAMES['discovery-orbit-0-overtime'], undefined);
  assert.equal(ANTHOLOGY_GAMES['discovery-arithmetic-0-expedition'].name, '🧮 Крамниця сум · Експедиція');
});

test('new numeric and visual puzzles have mathematically correct, unambiguous answers across seeds', () => {
  for (const seed of [0, 0.17, 0.48, 0.99]) for (let r = 0; r < 5; r++) {
    let s = make('geometry', r, seed), v = s.stage, [a, b, c] = v.sides;
    assert.equal(+answer(s), [a * b, 2 * (a + b), a + b + c, a * a, a * b * c][r]);
    s = make('coordinates', r, seed); const [x, y] = s.stage.point;
    assert.equal(+answer(s), [x, y, x + y, 4 - x, 8 - x - y][r]);
    s = make('sets', r, seed); const A = new Set(s.stage.setA), B = new Set(s.stage.setB), both = [...A].filter(v => B.has(v)), union = new Set([...A, ...B]);
    assert.equal(+answer(s), [both.length, union.size, [...A].filter(v => !B.has(v)).length, union.size - both.length, 9 - union.size][r]);
    s = make('logic-gates', r, seed); v = s.stage;
    const left = v.bitsA.toString(2).padStart(4, '0'), right = v.bitsB.toString(2).padStart(4, '0');
    const output = [...left].map((bit, i) => { const a = bit === '1', b = right[i] === '1'; return Number([a && b, a || b, a !== b, !(a && b), !(a || b)][r]); }).join('');
    assert.equal(answer(s), output);
    s = make('market', r, seed); v = s.stage.market;
    assert.equal(+answer(s), [v.price * v.count, v.paid - v.total, v.price / 2, v.price * 2, v.total / v.count][r]);
    s = make('domino', r, seed); const [l, h] = s.stage.pips;
    assert.equal(+answer(s), [l + h, Math.abs(l - h), l * h, 12 - l - h, Math.max(l, h)][r]);
    s = make('heights', r, seed); const heights = [...s.stage.heights].sort((a, b) => a - b);
    assert.equal(+answer(s), [heights[3], heights[0], heights.reduce((sum, n) => sum + n, 0), heights[3] - heights[0], heights[2]][r]);
    s = make('routes', r, seed); const [ab, bd, ac, cd] = s.stage.roads;
    assert.equal(+answer(s), [Math.min(ab + bd, ac + cd), Math.max(ab + bd, ac + cd), ab + bd, Math.abs(ab + bd - ac - cd), ac + cd][r]);
  }
});

test('calendar handles leap centuries and timetable handles midnight correctly', () => {
  for (const [year, leap] of [[1900, false], [2000, true], [2024, true], [2025, false], [2100, false], [2400, true]]) assert.equal(isLeapYear(year), leap);
  assert.equal(timeLabel(1505), '01:05'); assert.equal(timeLabel(-5), '23:55');
  for (let i = 0; i < 40; i++) for (let r = 0; r < 5; r++) {
    const s = make('timetable', r, i / 40), { departure, duration, transfer } = s.stage.trip;
    const expected = r === 1 ? departure : departure + duration + (r === 3 ? transfer : 0);
    const d = new Date(Date.UTC(2000, 0, 1, 0, expected));
    assert.equal(answer(s), r === 2 ? String(duration) : d.toISOString().slice(11, 16));
    if (r === 4) assert.ok(departure + duration > 1440);
  }
});

test('grid and digit memory hide previews and score the actual remembered data', () => {
  for (const m of ['memory-grid', 'memory-digits']) for (let r = 0; r < 5; r++) {
    const s = make(m, r), stage = s.stage;
    s.cursor = stage.answer; arcadeAction(s); assert.equal(s.attempts, 0);
    assert.deepEqual(stage.lines, []); // HTML question text must not reveal the hidden pattern.
    let expected;
    if (m === 'memory-grid') {
      const total = stage.cells.filter(Boolean).length, corners = [0, 2, 6, 8].filter(i => stage.cells[i]).length;
      expected = [stage.point[0], stage.point[1], total, corners, stage.cells.slice(3, 6).filter(Boolean).length][r];
    } else {
      const d = stage.digits; expected = [d.reduce((s, n) => s + n, 0), Math.max(...d), Math.min(...d), Number([...d].reverse().join('')), d[0] + d[3]][r];
    }
    assert.equal(+answer(s), expected);
    while (s.stage.age < s.stage.preview) updateArcade(s, 0.04);
    arcadeAction(s); assert.equal(s.successes, 1);
  }
});

test('each new reflex rule has both a valid window and a real miss, using the same rendered geometry', () => {
  for (const m of ['pulse', 'pendulum', 'crossing', 'aperture']) for (let rule = 0; rule < 5; rule++) {
    const s = make(m, rule); let hit, miss;
    for (let i = 0; i <= 500; i++) { s.stage.age = i / 100; const g = motorGeometry(s); if (g.active) hit ??= s.stage.age; else miss ??= s.stage.age; }
    assert.notEqual(hit, undefined, `${m}/${rule} can be hit`); assert.notEqual(miss, undefined, `${m}/${rule} can be missed`);
    s.stage.age = miss; arcadeAction(s); assert.equal(s.lives, 2);
    const win = make(m, rule); win.stage.age = hit; arcadeAction(win); assert.equal(win.successes, 1);
  }
});

test('new achievements are independent and survive reload without duplicate rewards', () => {
  let saved; const earned = [], storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const tracker = createAchievements(storage, a => earned.push(a.id));
  for (const m of ['geometry', 'aperture']) { tracker.arcadeFinish({ kind: gameId(m), level: 1, won: true }); tracker.arcadeFinish({ kind: gameId(m), level: 5, won: true }); }
  assert.equal(earned.length, 4);
  assert.equal(tracker.entries().find(a => a.id === `arcade-${gameId('geometry', 1)}-first`).progress, 0);
  createAchievements(storage, () => assert.fail('Duplicate reward')).claimRewards();
});
