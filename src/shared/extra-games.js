import { PUZZLE_GAMES, initPuzzle, puzzleDirection, puzzleAction, updatePuzzle, puzzleStatus } from './puzzle-games.js';
// Independent game rules. Coordinates use the arcade's 900 × 550 canvas.
export const EXTRA_GAMES = {
  ...PUZZLE_GAMES,
  fighter: { name: '🥋 Тіньовий двобій', help: 'Переможи бота у двох раундах. ← → / A D — рух, пробіл / ↑ / W — стрибок, утримуй Shift / ↓ / S — блок. J — кулак, K — нога, L — енергетична атака (40 енергії). Кулак або нога у падінні після стрибка — крит ×1,5 зі зірочками; блок скасовує бонус. Попередження над ботом підказує наступний удар — блокуй або відстрибуй. Є кнопки для дотику.' },
  sokoban: { name: '📦 Сокобан', help: 'Стрілками або WASD штовхай ящики на золоті місця. Тягнути ящики не можна. Z або «Скасувати» повертає хід.' },
  mines: { name: '💣 Сапер', help: 'Відкрий усі безпечні клітинки. Число показує міни поруч. F або «Прапорець» перемикає режим прапорців; також працює права кнопка миші. Перше відкриття безпечне.' },
  sliding: { name: '🔢 П’ятнашки', help: 'Розташуй числа від 1 до 15, порожню клітинку — внизу праворуч. Натискай плитку поряд із порожнім місцем або рухай порожнє місце стрілками.' },
  connect: { name: '🔴 Чотири в ряд', help: 'Ти граєш золотими фішками проти бота. Обери стовпчик і збери чотири фішки по горизонталі, вертикалі або діагоналі. ← → і пробіл також працюють.' },
  lights: { name: '💡 Згаси світло', help: 'Натискання перемикає клітинку та чотирьох сусідів. Згаси все поле. Стрілки обирають клітинку, пробіл перемикає.' },
  stack: { name: '🏗️ Вежа', help: 'Клік, пробіл або «Поставити» — постав блок на попередній. Частина поза опорою відрізається. Побудуй вежу до цілі; промах завершує гру.' },
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const end = (s, won) => { s.over = true; s.won = won; };
const sample = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));
export function boardGeometry(s) {
  const cols = s.kind === 'connect' ? 7 : s.n;
  const rows = s.kind === 'connect' ? 6 : s.n;
  const size = s.kind === 'sequence' ? 180 : Math.min(68, 420 / rows);
  return { cols, rows, size, x: (900 - cols * size) / 2, y: 75 };
}
export function boardCell(s, x, y) {
  const b = boardGeometry(s), col = Math.floor((x - b.x) / b.size), row = Math.floor((y - b.y) / b.size);
  return col >= 0 && col < b.cols && row >= 0 && row < b.rows ? row * b.cols + col : -1;
}
function toggleLight(s, i) {
  const x = i % s.n, y = Math.floor(i / s.n);
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < s.n && ny >= 0 && ny < s.n) s.board[ny * s.n + nx] ^= 1;
  }
}
const WAREHOUSES = [
  ['#######', '#     #', '# .   #', '# $   #', '# @   #', '#     #', '#######'],
  ['#######', '#     #', '# . . #', '# $ $ #', '#  @  #', '#     #', '#######'],
  ['#######', '#  .  #', '#  $  #', '#. $ .#', '# $@  #', '#     #', '#######'],
  ['#######', '# . . #', '# $ $ #', '#  #  #', '# $@$ #', '# . . #', '#######'],
  ['########', '# .  . #', '# $  $ #', '#  ##  #', '#      #', '# $ @$ #', '# .  . #', '########'],
];
export function initExtra(s, rng) {
  s.moves = 0; s.cursor = 0; s.inputDelay = 0;
  if (Object.hasOwn(PUZZLE_GAMES, s.kind)) { initPuzzle(s, rng); return; }
  if (s.kind === 'fighter') {
    s.round = 1; s.roundWins = [0, 0]; s.target = 2; s.roundPause = 0; s.message = 'БІЙ!';
    resetFighters(s); return;
  }
  if (s.kind === 'stack') {
    s.target = 7 + s.level * 2; s.tower = [{ x: 300, w: 300 }]; s.block = { x: 40, w: 300, dir: 1 }; return;
  }
  if (s.kind === 'sokoban') {
    const original = WAREHOUSES[(s.level - 1) % WAREHOUSES.length];
    const map = s.level > 5 ? original[0].split('').map((_, x) => original.map(row => row[x]).reverse().join('')) : original;
    s.n = map.length; s.board = map.join('').split(''); s.boxes = []; s.goals = []; s.history = [];
    s.board.forEach((cell, i) => { if (cell === '$') s.boxes.push(i); if (cell === '.') s.goals.push(i); if (cell === '@') s.player = i; });
    s.target = s.goals.length; return;
  }
  if (s.kind === 'lights') {
    s.n = s.level < 3 ? 4 : 5; s.board = Array(s.n ** 2).fill(0);
    for (let i = 0; i < 4 + s.level * 3; i++) toggleLight(s, sample(rng, s.board.length));
    if (s.board.every(v => !v)) toggleLight(s, 0);
    s.target = s.board.length; s.score = s.board.filter(v => !v).length; return;
  }
  if (s.kind === 'sliding') {
    s.n = 4; s.board = Array.from({ length: 16 }, (_, i) => (i + 1) % 16); let empty = 15, previous = -1;
    for (let step = 0; step < 8 + s.level * 10; step++) {
      const options = neighbors(empty, 4).filter(i => i !== previous), next = options[sample(rng, options.length)];
      [s.board[empty], s.board[next]] = [s.board[next], s.board[empty]]; previous = empty; empty = next;
    }
    if (s.board.every((v, i) => v === (i + 1) % 16)) [s.board[14], s.board[15]] = [s.board[15], s.board[14]];
    s.target = 15; s.score = s.board.filter((v, i) => v !== 0 && v === i + 1).length; return;
  }
  if (s.kind === 'mines') {
    s.n = 6 + Math.floor(s.level / 2); s.mineCount = 4 + s.level * 2; s.board = Array(s.n ** 2).fill(0);
    s.revealed = Array(s.n ** 2).fill(false); s.flags = Array(s.n ** 2).fill(false); s.armed = false; s.flagMode = false;
    s.target = s.n ** 2 - s.mineCount; return;
  }
  if (s.kind === 'connect') { s.board = Array(42).fill(0); s.turn = 1; s.botDelay = 0; s.target = 4; s.winning = []; }
}
function neighbors(i, n, diagonal = false) {
  const result = [], x = i % n, y = Math.floor(i / n);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || (!diagonal && Math.abs(dx) + Math.abs(dy) !== 1)) continue;
    if (x + dx >= 0 && x + dx < n && y + dy >= 0 && y + dy < n) result.push((y + dy) * n + x + dx);
  }
  return result;
}
function resetFighters(s) {
  s.fighters = [260, 640].map(x => ({ x, y: 430, vy: 0, hp: 100, energy: 40, cooldown: 0, pose: '', poseTime: 0, block: false, stun: 0 }));
  s.projectiles = []; s.roundTime = 60; s.botThink = 0.8; s.combo = 0; s.lastHit = -10;
  s.impacts = []; s.botAttack = false;
  s.botStyle = ['Штурмовик', 'Вартовий', 'Маг'][Math.floor((s.level - 1) / 5) % 3];
}
function hitFighter(s, target, damage, direction, critical = false) {
  const f = s.fighters[target];
  critical = critical && !f.block;
  if (critical) damage = Math.round(damage * 1.5);
  const dealt = f.block ? Math.ceil(damage * 0.2) : damage;
  f.hp = Math.max(0, f.hp - dealt);
  s.impacts.push({ x: f.x, y: f.y - 65, damage: dealt, blocked: f.block, critical, life: critical ? 0.7 : 0.45 });
  if (target === 1) s.botAttack = false;
  f.stun = f.block ? 0.06 : 0.18; f.x = clamp(f.x + direction * (f.block ? 5 : 16), 55, 845);
  if (!target) s.combo = 0;
  else if (!f.block) { s.combo = s.time - s.lastHit < 1.2 ? s.combo + 1 : 1; s.lastHit = s.time; }
}
export function fighterAttack(s, who, type) {
  if (s.over || s.roundPause > 0 || ![0, 1].includes(who) || !['punch', 'kick', 'special'].includes(type)) return;
  const f = s.fighters[who], other = s.fighters[1 - who];
  if (f.cooldown > 0 || f.stun > 0 || f.block) return;
  const direction = Math.sign(other.x - f.x) || (who ? -1 : 1);
  if (type === 'special') {
    if (f.energy < 40) return;
    f.energy -= 40; f.cooldown = 0.7;
    s.projectiles.push({ x: f.x + direction * 38, y: f.y - 50, vx: direction * 470, owner: who });
  } else {
    const kick = type === 'kick'; f.cooldown = kick ? 0.58 : 0.32;
    if (Math.abs(f.x - other.x) < (kick ? 115 : 85) && Math.abs(f.y - other.y) < 65) {
      hitFighter(s, 1 - who, kick ? 15 : 9, direction, f.y < 430 && f.vy > 0); f.energy = Math.min(100, f.energy + 8);
    }
  }
  f.pose = type; f.poseTime = 0.2;
}
export function extraCommand(s, command) {
  if (s.over) return;
  if (s.kind === 'fighter') fighterAttack(s, 0, command);
  if (s.kind === 'mines' && command === 'flag') s.flagMode = !s.flagMode;
  if (s.kind === 'sokoban' && command === 'undo' && s.history.length) {
    const prev = s.history.pop(); s.player = prev.player; s.boxes = prev.boxes; s.moves = prev.moves;
    s.score = s.boxes.filter(i => s.goals.includes(i)).length;
  }
}
export function extraDirection(s, dx, dy) {
  if (s.over || (!dx && !dy)) return;
  dx = Math.sign(dx); dy = dx ? 0 : Math.sign(dy);
  if (Object.hasOwn(PUZZLE_GAMES, s.kind)) { puzzleDirection(s, dx, dy); return; }
  if (s.kind === 'sokoban') {
    const next = s.player + dx + dy * s.n, box = s.boxes.indexOf(next), beyond = next + dx + dy * s.n;
    if (s.board[next] === '#' || s.board[next] === undefined || (box >= 0 && (s.board[beyond] === '#' || s.boxes.includes(beyond)))) return;
    s.history.push({ player: s.player, boxes: [...s.boxes], moves: s.moves });
    if (box >= 0) s.boxes[box] = beyond;
    s.player = next; s.moves++; s.score = s.boxes.filter(i => s.goals.includes(i)).length;
    if (s.score === s.target) end(s, true);
  } else if (s.kind === 'sliding') {
    const empty = s.board.indexOf(0), next = empty + dx + dy * 4;
    if (neighbors(empty, 4).includes(next)) slide(s, next);
  } else if (s.kind === 'connect') s.cursor = clamp(s.cursor + dx, 0, 6);
  else if (['lights', 'mines'].includes(s.kind)) {
    const x = clamp(s.cursor % s.n + dx, 0, s.n - 1), y = clamp(Math.floor(s.cursor / s.n) + dy, 0, s.n - 1);
    s.cursor = y * s.n + x;
  }
}
function slide(s, i) {
  const empty = s.board.indexOf(0);
  if (!neighbors(empty, 4).includes(i)) return;
  [s.board[i], s.board[empty]] = [s.board[empty], s.board[i]]; s.moves++;
  s.score = s.board.filter((v, i) => v !== 0 && v === i + 1).length;
  if (s.score === 15) end(s, true);
}
function revealMine(s, i, rng) {
  if (s.flags[i] || s.revealed[i]) return;
  if (!s.armed) {
    const safe = new Set([i, ...neighbors(i, s.n, true)]), choices = s.board.map((_, j) => j).filter(j => !safe.has(j));
    for (let m = 0; m < s.mineCount; m++) { const at = sample(rng, choices.length); s.board[choices.splice(at, 1)[0]] = -1; }
    s.board.forEach((v, j) => { if (v !== -1) s.board[j] = neighbors(j, s.n, true).filter(k => s.board[k] === -1).length; });
    s.armed = true;
  }
  if (s.board[i] === -1) { s.revealed[i] = true; end(s, false); return; }
  const queue = [i];
  while (queue.length) {
    const at = queue.pop(); if (s.revealed[at] || s.flags[at]) continue;
    s.revealed[at] = true; s.score++;
    if (s.board[at] === 0) queue.push(...neighbors(at, s.n, true).filter(j => !s.revealed[j]));
  }
  if (s.score === s.target) end(s, true);
}
export function connectLine(board, player) {
  for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
    const line = Array.from({ length: 4 }, (_, k) => [x + dx * k, y + dy * k]);
    if (line.every(([cx, cy]) => cx >= 0 && cx < 7 && cy >= 0 && cy < 6 && board[cy * 7 + cx] === player)) return line.map(([cx, cy]) => cy * 7 + cx);
  }
  return [];
}
function dropIndex(board, col) { for (let row = 5; row >= 0; row--) if (!board[row * 7 + col]) return row * 7 + col; return -1; }
function drop(s, col, player) {
  const i = dropIndex(s.board, col); if (i < 0) return;
  s.board[i] = player; s.moves++; s.winning = connectLine(s.board, player);
  if (s.winning.length) { s.score = player === 1 ? 4 : 0; end(s, player === 1); }
  else if (s.board.every(Boolean)) { s.draw = true; end(s, false); }
  else { s.turn = 3 - player; s.botDelay = 0.5; }
}
export function extraAction(s, x, y, rng) {
  if (s.over) return;
  if (s.kind === 'fighter') { fighterAttack(s, 0, 'punch'); return; }
  if (s.kind === 'stack') {
    const top = s.tower.at(-1), left = Math.max(top.x, s.block.x), right = Math.min(top.x + top.w, s.block.x + s.block.w);
    if (right - left < 5) { end(s, false); return; }
    s.tower.push({ x: left, w: right - left }); s.score++;
    if (s.score >= s.target) { end(s, true); return; }
    s.block = { x: s.score % 2 ? 850 - (right - left) : 50, w: right - left, dir: s.score % 2 ? -1 : 1 }; return;
  }
  const i = Number.isFinite(x) && Number.isFinite(y) ? boardCell(s, x, y) : s.cursor;
  if (i < 0) return;
  if (Object.hasOwn(PUZZLE_GAMES, s.kind)) { puzzleAction(s, i, rng); return; }
  if (s.kind === 'lights') { s.cursor = i; toggleLight(s, i); s.moves++; s.score = s.board.filter(v => !v).length; if (s.score === s.target) end(s, true); }
  if (s.kind === 'sliding') slide(s, i);
  if (s.kind === 'mines') { s.cursor = i; if (s.flagMode) { if (!s.revealed[i]) s.flags[i] = !s.flags[i]; } else revealMine(s, i, rng); }
  if (s.kind === 'connect' && s.turn === 1) { s.cursor = i % 7; drop(s, s.cursor, 1); }
}
export function updateExtra(s, dt, input, rng) {
  if (s.kind === 'fighter') { updateFighter(s, dt, input, rng); return; }
  if (input.action) extraAction(s, undefined, undefined, rng);
  if (s.over) return;
  if (Object.hasOwn(PUZZLE_GAMES, s.kind)) { updatePuzzle(s, dt); return; }
  if (s.kind === 'stack') {
    s.block.x += s.block.dir * (160 + s.level * 28 + s.score * 5) * dt;
    if (s.block.x < 45 || s.block.x + s.block.w > 855) { s.block.x = clamp(s.block.x, 45, 855 - s.block.w); s.block.dir *= -1; }
  }
  if (s.kind === 'connect' && s.turn === 2) {
    s.botDelay -= dt; if (s.botDelay > 0) return;
    const cols = [3, 2, 4, 1, 5, 0, 6].filter(col => dropIndex(s.board, col) >= 0);
    let choice;
    for (const player of [2, 1]) {
      choice = cols.find(col => { const board = [...s.board]; board[dropIndex(board, col)] = player; return connectLine(board, player).length; });
      if (choice !== undefined) break;
    }
    if (choice === undefined) choice = s.level >= 3 ? cols[0] : cols[sample(rng, cols.length)];
    if (choice !== undefined) drop(s, choice, 2);
  }
}
function updateFighter(s, dt, input, rng) {
  s.impacts = s.impacts.filter(hit => (hit.life -= dt) > 0);
  if (s.roundPause > 0) { s.roundPause -= dt; if (s.roundPause <= 0) { s.round++; resetFighters(s); s.message = 'БІЙ!'; } return; }
  const [human, bot] = s.fighters;
  for (const f of s.fighters) {
    f.cooldown = Math.max(0, f.cooldown - dt); f.stun = Math.max(0, f.stun - dt); f.poseTime = Math.max(0, f.poseTime - dt);
    f.energy = Math.min(100, f.energy + dt * 7); f.vy += 1500 * dt; f.y = Math.min(430, f.y + f.vy * dt); if (f.y === 430) f.vy = 0;
  }
  const controls = s.multiplayer ? [input.players?.[0] || {}, input.players?.[1] || {}] : [input];
  controls.forEach((control, i) => {
    const f = s.fighters[i];
    f.block = (control.block ?? control.dy > 0) && f.y === 430 && f.stun <= 0;
  });
  controls.forEach((control, i) => {
    const f = s.fighters[i];
    if (f.stun > 0) return;
    f.x = clamp(f.x + (control.dx || 0) * (f.block ? 65 : 255) * dt, 55, 845);
    if ((control.jump ?? control.dy < 0) && !f.block && f.y === 430) f.vy = -600;
    if (control.action || control.punch) fighterAttack(s, i, 'punch');
    if (control.kick) fighterAttack(s, i, 'kick');
    if (control.special) fighterAttack(s, i, 'special');
  });
  if (!s.multiplayer) {
  const difficulty = Math.min(7, (s.difficulty ?? Math.min(s.level, 5)) + Math.max(0, s.level - 5) / 12.5);
  const distance = Math.abs(bot.x - human.x), direction = Math.sign(human.x - bot.x) || -1;
  const mage = s.botStyle === 'Маг', guard = s.botStyle === 'Вартовий';
  s.botThink -= dt;
  if (s.botAttack) {
    s.botAttack.remaining -= dt;
    if (s.botAttack.remaining <= 0) {
      const type = s.botAttack.type; s.botAttack = false; fighterAttack(s, 1, type);
    }
  } else if (s.botThink <= 0) {
    s.botThink = 0.65 - difficulty * 0.065 + rng() * 0.3;
    const incoming = s.projectiles.some(p => p.owner === 0 && Math.abs(p.x - bot.x) < 240 && (bot.x - p.x) * p.vx > 0);
    bot.block = bot.y === 430 && bot.stun <= 0 && (distance < 145 || incoming) && rng() < (guard ? 0.35 : 0.15) + difficulty * 0.04;
    const type = distance > 160 ? 'special' : rng() < 0.5 ? 'kick' : 'punch';
    if (!bot.block && bot.stun <= 0 && bot.cooldown <= 0 && (type !== 'special' || bot.energy >= 40)) {
      s.botAttack = { type, remaining: Math.max(0.22, 0.48 - difficulty * 0.03) };
    }
    if (!bot.block && bot.stun <= 0 && difficulty >= 3 && rng() < (incoming ? 0.65 : 0.18) && bot.y === 430) bot.vy = -570;
  }
  if (!bot.block && bot.stun <= 0 && !s.botAttack) {
    const move = mage && bot.energy >= 30 && distance < 220 ? -1 : distance > (mage && bot.energy >= 30 ? 290 : 80) ? 1 : 0;
    bot.x = clamp(bot.x + direction * move * (100 + difficulty * 18) * dt, 55, 845);
  }
  }
  if (Math.abs(human.x - bot.x) < 52 && Math.abs(human.y - bot.y) < 60) {
    const push = (52 - Math.abs(human.x - bot.x)) / 2, sign = Math.sign(bot.x - human.x) || 1;
    human.x = clamp(human.x - sign * push, 55, 845); bot.x = clamp(bot.x + sign * push, 55, 845);
  }
  for (const p of s.projectiles) {
    p.x += p.vx * dt; const target = s.fighters[1 - p.owner];
    if (Math.abs(p.x - target.x) < 32 && Math.abs(p.y - (target.y - 50)) < 48) { hitFighter(s, 1 - p.owner, 22, Math.sign(p.vx)); p.dead = true; }
  }
  s.projectiles = s.projectiles.filter(p => !p.dead && p.x > 0 && p.x < 900);
  s.roundTime = Math.max(0, s.roundTime - dt);
  if (human.hp <= 0 || bot.hp <= 0 || s.roundTime === 0) {
    if (human.hp === bot.hp) { s.message = 'НІЧИЯ — ЩЕ РАУНД'; s.roundPause = 1.8; return; }
    const winner = human.hp > bot.hp ? 0 : 1;
    s.roundWins[winner]++; s.score = s.roundWins[0]; s.message = s.multiplayer ? `РАУНД: ГРАВЕЦЬ ${winner + 1}` : winner === 0 ? 'РАУНД ЗА ТОБОЮ!' : 'РАУНД ЗА СУПЕРНИКОМ';
    if (s.roundWins[winner] === 2) { s.winner = winner; end(s, winner === 0); } else s.roundPause = 1.8;
  }
}
export function extraStatus(s) {
  if (Object.hasOwn(PUZZLE_GAMES, s.kind)) return puzzleStatus(s);
  if (s.kind === 'fighter') return `Раунд ${s.round} · Перемоги ${s.roundWins[0]} : ${s.roundWins[1]} · ${Math.ceil(s.roundTime)} с · Енергія ${Math.floor(s.fighters[0].energy)}`;
  if (s.kind === 'mines') return `Безпечні клітинки ${s.score}/${s.target} · Прапорці ${s.flags.filter(Boolean).length}/${s.mineCount} · ${s.flagMode ? '🚩 Режим прапорців' : 'Режим відкриття'}`;
  if (s.kind === 'connect') return s.draw ? 'Нічия — зіграй ще раз' : s.over ? (s.won ? 'Чотири в ряд!' : 'Бот зібрав чотири в ряд') : s.turn === 1 ? 'Твій хід — золоті фішки' : 'Бот обирає хід…';
  if (s.kind === 'stack') return `Поверхи ${s.score}/${s.target} · Ширина ${Math.round(s.block.w)}`;
  return `Ходів: ${s.moves} · ${s.kind === 'lights' ? 'Згашено' : s.kind === 'sokoban' ? 'Ящики на місцях' : 'Плитки на місцях'}: ${s.score}/${s.target}`;
}
