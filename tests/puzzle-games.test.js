import test from 'node:test';
import assert from 'node:assert/strict';
import { createArcade, arcadeAction, arcadeDirection, updateArcade } from '../src/shared/arcade.js';
import { boardGeometry } from '../src/shared/extra-games.js';
import { floodRegion, puzzleDirection, sequenceFlash } from '../src/shared/puzzle-games.js';
import { drawArcade } from '../src/client/arcade-view.js';
const seeded = (seed = 17) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const click = (s, i) => {
  const b = boardGeometry(s);
  arcadeAction(s, b.x + (i % s.n + 0.5) * b.size, b.y + (Math.floor(i / s.n) + 0.5) * b.size, seeded());
};
const tick = (s, duration) => { for (let i = 0; i < duration / 0.02; i++) updateArcade(s, 0.02); };

test('merge combines each tile once, spawns only after a move, and handles all directions', () => {
  const s = createArcade('merge'); s.board = [2,2,2,2,...Array(12).fill(0)];
  puzzleDirection(s, -1, 0, () => 0);
  assert.deepEqual(s.board.slice(0, 4), [4,4,2,0]); assert.equal(s.moves, 1);
  s.board = [2,0,0,0,...Array(12).fill(0)]; const before = [...s.board];
  puzzleDirection(s, -1, 0, () => 0); assert.deepEqual(s.board, before); assert.equal(s.moves, 1);
  for (const [dx, dy, a, b, destination] of [[-1,0,0,1,0],[1,0,0,1,3],[0,-1,0,4,0],[0,1,0,4,12]]) {
    const state = createArcade('merge'); state.board.fill(0); state.board[a] = state.board[b] = 32;
    arcadeDirection(state, dx, dy); assert.equal(state.won, true); assert.equal(state.board[destination], 64);
  }
});
test('merge detects a locked board but permits adjacent pairs and freezes after victory', () => {
  const s = createArcade('merge'); s.board = Array.from({length:16}, (_, i) => (i + Math.floor(i / 4)) % 2 ? 2 : 4);
  arcadeDirection(s, -1, 0); assert.equal(s.over, true); assert.equal(s.won, false);
  const win = createArcade('merge'); win.board.fill(0); win.board[0] = win.board[1] = 32;
  arcadeDirection(win, -1, 0); const snapshot = structuredClone(win);
  arcadeDirection(win, 1, 0); tick(win, 1); click(win, 0); assert.deepEqual(win, snapshot);
});
test('sequence ignores answers during playback and wins all twenty levels with exact input', () => {
  for (let level = 1; level <= 20; level++) {
    const s = createArcade('sequence', level, seeded());
    click(s, s.sequence[0]); assert.equal(s.answer, 0); assert.equal(s.score, 0);
    tick(s, 0.65 / s.speed); assert.equal(sequenceFlash(s), s.sequence[0]);
    while (!s.over) {
      tick(s, 10); assert.equal(s.phase, 'input');
      for (const value of [...s.sequence]) { s.cursor = value; updateArcade(s, 0.02, { action: true }, seeded()); }
    }
    assert.equal(s.won, true); assert.equal(s.score, level + 3);
  }
});
test('sequence retries the same pattern, loses a life per mistake, and ends after three', () => {
  const s = createArcade('sequence', 1, seeded()), pattern = [...s.sequence];
  for (let mistakes = 1; mistakes <= 3; mistakes++) {
    tick(s, 10); click(s, (s.sequence[0] + 1) % 4);
    assert.equal(s.lives, 3 - mistakes); assert.deepEqual(s.sequence, pattern);
  }
  assert.equal(s.over, true); assert.equal(s.won, false);
});
test('flood expands only connected regions, ignores the current color and outside clicks, and enforces the budget', () => {
  const s = createArcade('flood'); s.n = 3; s.board = [0,1,2,1,2,0,2,0,0]; s.target = 9; s.score = 1; s.moveLimit = 1;
  click(s, 0); arcadeAction(s, 0, 0); assert.equal(s.moves, 0);
  click(s, 1); assert.equal(s.score, 3); assert.equal(s.board[8], 0); assert.equal(s.over, true); assert.equal(s.won, false);
});
test('flood generated boards can be won within their move budgets, including constant random sources', () => {
  for (let level = 1; level <= 20; level++) for (const rng of [seeded(level), seeded(level + 30), () => 0, () => 0.999]) {
    const s = createArcade('flood', level, rng);
    while (!s.over) {
      let best = -1, bestSize = -1;
      for (let color = 0; color < s.colors; color++) {
        if (color === s.board[0]) continue;
        const trial = [...s.board]; for (const i of floodRegion(trial, s.n)) trial[i] = color;
        const size = floodRegion(trial, s.n).length;
        if (size > bestSize) { best = color; bestSize = size; }
      }
      click(s, s.board.indexOf(best));
    }
    assert.equal(s.won, true); assert.ok(s.moves <= s.moveLimit);
  }
});
test('new games render finite canvas geometry on every level and accept keyboard selection', () => {
  const c = new Proxy({}, { get: (_, name) => name === 'createLinearGradient' ? () => ({addColorStop(){}}) : (...args) => {
    for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), String(name));
  }, set: () => true });
  for (const kind of ['merge', 'sequence', 'flood']) for (let level = 1; level <= 20; level++) {
    const s = createArcade(kind, level, seeded()); drawArcade(c, s); drawArcade(c, s, 'Пауза');
    if (kind !== 'merge') { arcadeDirection(s, 1, 0); assert.equal(s.cursor, 1); arcadeDirection(s, 0, 1); assert.equal(s.cursor, s.n + 1); }
  }
});
