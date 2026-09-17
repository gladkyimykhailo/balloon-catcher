export const PUZZLE_GAMES = {
  merge: { name: '🔶 Злиття чисел', help: 'Стрілки, WASD або екранні напрямки зсувають усі плитки. Однакові числа зливаються. Збери цільову плитку; якщо ходів не залишиться — спробуй ще!' },
  sequence: { name: '🎶 Кольорова пам’ять', help: 'Запам’ятай спалахи й повтори послідовність кліками або дотиками. Стрілки обирають плитку, пробіл або «Дія» підтверджує. Кожен раунд додає один спалах. Помилка коштує життя.' },
  flood: { name: '🎨 Заливка кольорів', help: 'Зафарбуй усе поле, починаючи з верхнього лівого кута. Обирай колір будь-якої клітинки дотиком або стрілками й пробілом. Сусіди такого кольору приєднаються. Кількість ходів обмежена!' },
};
const pick = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));
const finish = (s, won) => { s.over = true; s.won = won; };

function spawnTile(s, rng) {
  const free = s.board.map((v, i) => v ? -1 : i).filter(i => i >= 0);
  if (free.length) s.board[free[pick(rng, free.length)]] = rng() < 0.9 ? 2 : 4;
}
export function floodRegion(board, n) {
  const seen = new Set([0]), queue = [0];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % n, y = Math.floor(i / n);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * n + nx;
      if (nx >= 0 && nx < n && ny >= 0 && ny < n && !seen.has(j) && board[j] === board[0]) { seen.add(j); queue.push(j); }
    }
  }
  return queue;
}
function floodColor(board, n, color) {
  for (const i of floodRegion(board, n)) board[i] = color;
}
export function initPuzzle(s, rng) {
  if (s.kind === 'merge') {
    s.n = 4; s.board = Array(16).fill(0); s.target = 2 ** (Math.min(s.level, 7) + 5);
    spawnTile(s, rng); spawnTile(s, rng); s.score = Math.max(...s.board);
  } else if (s.kind === 'sequence') {
    s.n = 2; s.board = [0, 1, 2, 3]; s.sequence = [pick(rng, 4)];
    s.target = s.level + 3; s.phase = 'show'; s.phaseTime = 0; s.answer = 0;
  } else {
    s.n = 5 + s.level; s.colors = s.level < 3 ? 4 : 5;
    s.board = Array.from({ length: s.n ** 2 }, () => pick(rng, s.colors));
    if (s.board.every(v => v === s.board[0])) s.board[s.board.length - 1] = (s.board[0] + 1) % s.colors;
    s.target = s.board.length; s.score = floodRegion(s.board, s.n).length;
    // A concrete greedy solution provides a reachable move budget for every board.
    const trial = [...s.board]; let steps = 0;
    while (floodRegion(trial, s.n).length < trial.length) {
      let bestColor = -1, bestSize = -1;
      for (let color = 0; color < s.colors; color++) {
        if (color === trial[0]) continue;
        const next = [...trial]; floodColor(next, s.n, color);
        const size = floodRegion(next, s.n).length;
        if (size > bestSize) { bestSize = size; bestColor = color; }
      }
      floodColor(trial, s.n, bestColor); steps++;
    }
    s.moveLimit = steps + Math.max(1, 6 - s.level);
  }
}
export function puzzleDirection(s, dx, dy, rng = Math.random) {
  if (s.kind !== 'merge') {
    const x = Math.max(0, Math.min(s.n - 1, s.cursor % s.n + dx));
    const y = Math.max(0, Math.min(s.n - 1, Math.floor(s.cursor / s.n) + dy));
    s.cursor = y * s.n + x; return;
  }
  const before = [...s.board];
  for (let line = 0; line < 4; line++) {
    const indices = Array.from({ length: 4 }, (_, k) => dy ? (dy > 0 ? 3 - k : k) * 4 + line : line * 4 + (dx > 0 ? 3 - k : k));
    const values = indices.map(i => s.board[i]).filter(Boolean), merged = [];
    for (let k = 0; k < values.length; k++) {
      if (values[k] === values[k + 1]) { merged.push(values[k] * 2); k++; }
      else merged.push(values[k]);
    }
    indices.forEach((i, k) => { s.board[i] = merged[k] || 0; });
  }
  const changed = s.board.some((v, i) => v !== before[i]);
  if (changed) { s.moves++; s.score = Math.max(...s.board); }
  if (s.score >= s.target) { finish(s, true); return; }
  if (changed) spawnTile(s, rng);
  const available = s.board.some((v, i) => !v || i % 4 < 3 && v === s.board[i + 1] || i < 12 && v === s.board[i + 4]);
  if (!available) finish(s, false);
}
export function puzzleAction(s, i, rng) {
  if (s.kind === 'merge' || i < 0 || i >= s.board.length) return;
  s.cursor = i;
  if (s.kind === 'flood') {
    const color = s.board[i]; if (color === s.board[0]) return;
    floodColor(s.board, s.n, color); s.moves++; s.score = floodRegion(s.board, s.n).length;
    if (s.score === s.target) finish(s, true);
    else if (s.moves >= s.moveLimit) finish(s, false);
  } else if (s.phase === 'input') {
    s.flash = i; s.flashTime = 0.18;
    if (i !== s.sequence[s.answer]) {
      s.lives--; s.answer = 0; s.phaseTime = 0; s.phase = 'retry';
      if (!s.lives) finish(s, false);
    } else if (++s.answer === s.sequence.length) {
      s.score++; s.answer = 0;
      if (s.score === s.target) { finish(s, true); return; }
      s.sequence.push(pick(rng, 4)); s.phase = 'next'; s.phaseTime = 0;
    }
  }
}
export function updatePuzzle(s, dt) {
  if (s.kind !== 'sequence') return;
  s.flashTime = Math.max(0, (s.flashTime || 0) - dt);
  s.phaseTime += dt;
  if (['next', 'retry'].includes(s.phase) && s.phaseTime >= 0.9) { s.phase = 'show'; s.phaseTime = 0; }
  if (s.phase === 'show' && s.phaseTime >= 0.6 + s.sequence.length * sequenceBeat(s)) { s.phase = 'input'; s.phaseTime = 0; }
}
export const sequenceBeat = s => Math.max(0.3, 0.85 - s.level * 0.055);
export function sequenceFlash(s) {
  if (s.phase !== 'show') return s.flashTime > 0 ? s.flash : -1;
  const time = s.phaseTime - 0.6, beat = sequenceBeat(s);
  return time >= 0 && time % beat < beat * 0.65 ? (s.sequence[Math.floor(time / beat)] ?? -1) : -1;
}
export function puzzleStatus(s) {
  if (s.kind === 'merge') return `Найбільша плитка: ${s.score} / ${s.target} · Ходів: ${s.moves}`;
  if (s.kind === 'flood') return `Зафарбовано: ${s.score}/${s.target} · Залишилось ходів: ${s.moveLimit - s.moves}`;
  const prompt = { show: 'Запам’ятовуй спалахи', input: `Твоя черга: ${s.answer}/${s.sequence.length}`, retry: 'Помилка! Подивись ще раз', next: 'Правильно! Додаємо спалах' }[s.phase];
  return `Раунди: ${s.score}/${s.target} · ♥ ${s.lives} · ${prompt}`;
}
