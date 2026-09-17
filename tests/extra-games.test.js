import test from 'node:test';
import assert from 'node:assert/strict';
import { createArcade, updateArcade, arcadeAction, arcadeDirection } from '../src/shared/arcade.js';
import { EXTRA_GAMES, boardGeometry, extraCommand, fighterAttack, connectLine } from '../src/shared/extra-games.js';
const seeded = (seed = 41) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const click = (s, i) => { const b = boardGeometry(s); arcadeAction(s, b.x + (i % b.cols + 0.5) * b.size, b.y + (Math.floor(i / b.cols) + 0.5) * b.size, seeded()); };
const tick = (s, seconds, input = {}) => { for (let i = 0; i < Math.ceil(seconds / .02); i++) updateArcade(s, .02, input, seeded(i + 1)); };

test('ten independent mechanics initialize and remain finite on all levels', () => {
  assert.equal(Object.keys(EXTRA_GAMES).length, 10);
  for (const kind of Object.keys(EXTRA_GAMES)) for (let level = 1; level <= 20; level++) {
    const s = createArcade(kind, level, seeded()); tick(s, 3);
    assert.equal(s.kind, kind);
    assert.doesNotMatch(JSON.stringify(s), /null/);
    for (const value of Object.values(s)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
});

test('fighter respects range, cooldowns, blocking and energy cost', () => {
  const s = createArcade('fighter'); const [a, b] = s.fighters;
  fighterAttack(s, 0, 'punch'); assert.equal(b.hp, 100);
  a.cooldown = 0; b.x = a.x + 60; fighterAttack(s, 0, 'punch'); assert.equal(b.hp, 91);
  fighterAttack(s, 0, 'punch'); assert.equal(b.hp, 91);
  a.cooldown = 0; b.block = true; fighterAttack(s, 0, 'kick'); assert.equal(b.hp, 88);
  a.cooldown = 0; a.energy = 39; fighterAttack(s, 0, 'special'); assert.equal(s.projectiles.length, 0);
  a.energy = 40; fighterAttack(s, 0, 'special'); assert.equal(a.energy, 0); assert.equal(s.projectiles.length, 1);
});

test('fighter projectiles can hit, be blocked and be jumped over', () => {
  for (const [block, jump, expected] of [[false, false, 78], [true, false, 95], [false, true, 100]]) {
    const s = createArcade('fighter'); const [human, bot] = s.fighters;
    human.x = 400; human.block = block; if (jump) { human.y = 300; human.vy = -50; }
    s.botThink = 10; bot.cooldown = 10;
    s.projectiles = [{ x: 408, y: 380, vx: -470, owner: 1 }];
    updateArcade(s, .01, { dy: block ? 1 : 0 }); assert.equal(human.hp, expected);
  }
});

test('fighter requires two round victories, resets health, and freezes on match end', () => {
  for (const winner of [0, 1]) {
    const s = createArcade('fighter'); s.fighters[1 - winner].hp = 0; updateArcade(s, .01);
    assert.equal(s.roundWins[winner], 1); assert.equal(s.over, false);
    tick(s, 1.9); assert.equal(s.round, 2); assert.equal(s.fighters[0].hp, 100);
    s.fighters[1 - winner].hp = 0; updateArcade(s, .01);
    assert.equal(s.over, true); assert.equal(s.won, winner === 0);
    const frozen = structuredClone(s); tick(s, 1, { action: true }); extraCommand(s, 'kick'); assert.deepEqual(s, frozen);
  }
});

test('every Sokoban board has a solution using legal pushes; undo restores state', () => {
  for (let level = 1; level <= 20; level++) {
    const s = createArcade('sokoban', level), encode = (p, boxes) => `${p}:${[...boxes].sort((a,b)=>a-b)}`;
    const queue = [{ p: s.player, boxes: s.boxes, path: [] }], visited = new Set([encode(s.player, s.boxes)]); let solution;
    for (let head = 0; head < queue.length && head < 200000; head++) {
      const node = queue[head];
      if (node.boxes.every(i => s.goals.includes(i))) { solution = node.path; break; }
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const next = node.p + dx + dy * s.n, beyond = next + dx + dy * s.n, at = node.boxes.indexOf(next);
        if (s.board[next] === '#' || s.board[next] === undefined || at >= 0 && (s.board[beyond] === '#' || node.boxes.includes(beyond))) continue;
        const boxes = [...node.boxes]; if (at >= 0) boxes[at] = beyond;
        const key = encode(next, boxes); if (visited.has(key)) continue;
        visited.add(key); queue.push({ p: next, boxes, path: [...node.path, [dx, dy]] });
      }
    }
    assert.ok(solution, `level ${level} is solvable`);
    if (solution.length > 1) {
      const player = s.player, boxes = [...s.boxes]; arcadeDirection(s, ...solution[0]); extraCommand(s, 'undo');
      assert.equal(s.player, player); assert.deepEqual(s.boxes, boxes); assert.equal(s.moves, 0);
    }
    for (const dir of solution) arcadeDirection(s, ...dir);
    assert.equal(s.won, true);
  }
});

test('mines first reveal is safe, flags protect cells, all safe cells win, mines lose', () => {
  for (let level = 1; level <= 20; level++) {
    const s = createArcade('mines', level, seeded());
    extraCommand(s, 'flag'); click(s, 0); extraCommand(s, 'flag'); click(s, 0); assert.equal(s.armed, false);
    extraCommand(s, 'flag'); click(s, 0); extraCommand(s, 'flag'); click(s, 0);
    assert.equal(s.board[0], 0); assert.equal(s.over, false); assert.equal(s.board.filter(v => v === -1).length, s.mineCount);
    const lose = structuredClone(s); click(lose, lose.board.indexOf(-1)); assert.equal(lose.over, true); assert.equal(lose.won, false);
    s.board.forEach((v, i) => { if (v !== -1 && !s.revealed[i]) click(s, i); }); assert.equal(s.won, true);
  }
});

test('sliding puzzles are solvable and reject nonadjacent moves', () => {
  for (let level = 1; level <= 20; level++) for (let seed = 1; seed <= 10; seed++) {
    const s = createArcade('sliding', level, seeded(seed)), tiles = s.board.filter(Boolean);
    let inversions = 0; tiles.forEach((a, i) => tiles.slice(i + 1).forEach(b => { if (a > b) inversions++; }));
    const rowFromBottom = 4 - Math.floor(s.board.indexOf(0) / 4);
    assert.equal((inversions + rowFromBottom) % 2, 1);
  }
  const s = createArcade('sliding'); s.board = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,0,15];
  click(s, 0); assert.equal(s.moves, 0); click(s, 15); assert.equal(s.won, true);
});

test('lights puzzles generated from legal moves are solvable using binary elimination', () => {
  for (let level = 1; level <= 20; level++) {
    const s = createArcade('lights', level, seeded()), n = s.board.length;
    const rows = Array.from({length:n}, (_, i) => Array.from({length:n + 1}, (_, j) => j === n ? s.board[i] : Number(i === j || Math.abs(i % s.n - j % s.n) + Math.abs(Math.floor(i / s.n) - Math.floor(j / s.n)) === 1)));
    const pivots = []; let row = 0;
    for (let col = 0; col < n; col++) {
      const found = rows.findIndex((r, i) => i >= row && r[col]); if (found < 0) continue;
      [rows[row], rows[found]] = [rows[found], rows[row]];
      for (let i = 0; i < n; i++) if (i !== row && rows[i][col]) for (let j = col; j <= n; j++) rows[i][j] ^= rows[row][j];
      pivots.push(col); row++;
    }
    for (let i = 0; i < row; i++) if (rows[i][n]) click(s, pivots[i]);
    assert.equal(s.won, true, `lights level ${level}`);
  }
});

test('connect four detects diagonals and bot takes winning and blocking moves', () => {
  const board = Array(42).fill(0); [35,29,23,17].forEach(i => board[i] = 1); assert.equal(connectLine(board,1).length, 4);
  for (const player of [1,2]) {
    const s = createArcade('connect'); s.board[35] = s.board[36] = s.board[37] = player; s.turn = 2; s.botDelay = 0;
    updateArcade(s, .02); assert.equal(s.board[38], 2); assert.equal(s.over, player === 2);
  }
  const s = createArcade('connect'); s.board[35] = s.board[36] = s.board[37] = 1; click(s, 3); assert.equal(s.won, true);
});

test('stack trims overhang, loses on a miss, and wins at target height', () => {
  const s = createArcade('stack'); s.block.x = 350; arcadeAction(s); assert.equal(s.tower.at(-1).w, 250);
  s.block.x = 0; arcadeAction(s); assert.equal(s.over, true); assert.equal(s.won, false);
  for (let level = 1; level <= 20; level++) {
    const win = createArcade('stack', level);
    while (!win.over) { win.block.x = win.tower.at(-1).x; arcadeAction(win); }
    assert.equal(win.won, true); assert.equal(win.score, win.target);
  }
});

test('fighter jump and held block work independently of movement and release cleanly', () => {
  const s = createArcade('fighter'), human = s.fighters[0]; s.botThink = 10;
  updateArcade(s, .02, { jump: true });
  assert.ok(human.vy < 0);
  updateArcade(s, .02, { block: true });
  assert.ok(human.y < 430); assert.equal(human.block, false);
  tick(s, 1); assert.equal(human.y, 430);
  const x = human.x;
  updateArcade(s, .02, { block: true, jump: true, dx: 1 });
  assert.equal(human.block, true); assert.equal(human.vy, 0);
  assert.ok(human.x > x);
  updateArcade(s, .02, { block: false, jump: false });
  assert.equal(human.block, false);
  updateArcade(s, .02, { jump: true });
  assert.ok(human.vy < 0);
});
