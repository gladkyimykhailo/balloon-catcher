import { boardGeometry } from '../shared/extra-games.js';
import { PUZZLE_GAMES } from '../shared/puzzle-games.js';
import { drawPuzzle } from './puzzle-games-view.js';

export function drawExtra(c, s) {
  if (Object.hasOwn(PUZZLE_GAMES, s.kind)) { drawPuzzle(c, s); return; }
  const rect = (x, y, w, h, color, r = 8) => { c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
  const circle = (x, y, r, color) => { c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  const text = (value, x, y, size = 24, color = '#edf5ff') => { c.fillStyle = color; c.font = `bold ${size}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(value, x, y); };
  if (s.kind === 'fighter') {
    const sky = c.createLinearGradient(0, 0, 0, 550); sky.addColorStop(0, '#160e29'); sky.addColorStop(1, '#692742'); c.fillStyle = sky; c.fillRect(0, 0, 900, 550);
    circle(450, 180, 80, '#efb795'); circle(477, 157, 77, '#23122e');
    for (const x of [50, 175, 675, 800]) { rect(x, 215, 45, 220, '#181529'); rect(x - 12, 200, 69, 18, '#3b2949'); }
    c.fillStyle = '#151525'; c.beginPath(); c.moveTo(100, 250); c.lineTo(450, 155); c.lineTo(800, 250); c.fill();
    rect(0, 430, 900, 120, '#252139', 0); rect(0, 430, 900, 5, '#c29069', 0);
    for (let i = 0; i < 10; i++) { c.strokeStyle = '#544057'; c.beginPath(); c.moveTo(450 + (i - 5) * 75, 435); c.lineTo(450 + (i - 5) * 130, 550); c.stroke(); }
    text(s.multiplayer ? 'ГРАВЕЦЬ 1 · ІСКРА' : 'ІСКРА', 180, 24, 18, '#83e9ff'); text(s.multiplayer ? 'ГРАВЕЦЬ 2 · ВОРОН' : 'ВОРОН', 720, 24, 18, '#ff969d');
    s.fighters.forEach((f, i) => {
      const x = i ? 545 : 45, color = i ? '#fb7284' : '#5dd7ed';
      rect(x, 42, 310, 21, '#151525'); rect(x, 42, Math.max(0, f.hp) * 3.1, 21, color);
      rect(x, 69, 310, 7, '#151525'); rect(x, 69, f.energy * 3.1, 7, '#e7bb5f');
      for (let j = 0; j < 2; j++) circle(x + 12 + j * 24, 92, 7, s.roundWins[i] > j ? '#ffd675' : '#625164');
      const face = Math.sign(s.fighters[1 - i].x - f.x) || 1, attacking = f.poseTime > 0;
      c.save(); c.translate(f.x, f.y); c.scale(face, 1);
      c.globalAlpha = 0.3; c.fillStyle = '#000'; c.beginPath(); c.ellipse(0, 5 + (430 - f.y), 40, 9, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      const limb = (ax, ay, bx, by, width, shade) => { c.strokeStyle = shade; c.lineWidth = width; c.lineCap = 'round'; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); };
      limb(-9, -37, -24, -3, 14, '#161a30'); limb(9, -37, attacking && f.pose === 'kick' ? 78 : 23, attacking && f.pose === 'kick' ? -42 : -3, 14, color);
      rect(-22, -85, 44, 51, f.stun > 0 ? '#ffffff' : color, 12); rect(-22, -43, 44, 8, '#e7bb5f', 2);
      circle(0, -105, 20, '#f6cfaf'); rect(-20, -119, 40, 13, '#222239', 5); rect(-2, -100, 23, 13, color, 3);
      limb(-12, -75, f.block ? 25 : -24, f.block ? -111 : -51, 12, color);
      limb(15, -76, f.block ? 31 : attacking && f.pose !== 'kick' ? 74 : 32, f.block ? -100 : -71, 13, '#f6cfaf');
      if (f.block) { c.strokeStyle = '#99e8ff'; c.lineWidth = 4; c.beginPath(); c.arc(10, -67, 53, -1.1, 1.1); c.stroke(); }
      c.restore();
    });
    for (const p of s.projectiles) { circle(p.x, p.y, 24, '#ffc85f35'); circle(p.x, p.y, 14, p.owner ? '#ff728c' : '#79e9ff'); circle(p.x, p.y, 7, '#fff6c9'); }
    text(Math.ceil(s.roundTime), 450, 54, 36, '#ffe2a6'); text(`РАУНД ${s.round}`, 450, 94, 16);
    if (s.combo > 1 && s.time - s.lastHit < 1.2) text(`${s.combo} УДАРИ ПІДРЯД`, 160, 145, 22, '#ffe2a6');
    if (s.roundPause > 0 || s.time < 1) text(s.message, 450, 270, 34, '#ffe2a6');
    text(s.multiplayer ? 'ДВА ГРАВЦІ · ПЕРЕМОГА У ДВОХ РАУНДАХ' : 'ПРОБІЛ / ↑ · СТРИБОК    SHIFT / ↓ · БЛОК    J · КУЛАК    K · НОГА    L · ЕНЕРГІЯ', 450, 503, 15, '#d7bfd9'); return;
  }
  if (s.kind === 'stack') {
    text(`ПОВЕРХ ${s.score} / ${s.target}`, 450, 35, 25, '#ffe2a6');
    const visible = s.tower.slice(-10);
    visible.forEach((b, i) => rect(b.x, 485 - i * 34, b.w, 31, `hsl(${175 + (s.tower.length - visible.length + i) * 13} 65% 63%)`, 4));
    rect(s.block.x, 485 - visible.length * 34, s.block.w, 31, '#ffcf70', 4);
    text('Постав блок точно над опорою', 450, 530, 19); return;
  }
  const b = boardGeometry(s);
  text(s.kind === 'connect' ? 'ЗБЕРИ ЧОТИРИ В РЯД' : s.kind === 'sokoban' ? 'КОЖЕН ЯЩИК — НА ЗОЛОТЕ МІСЦЕ' : s.kind === 'lights' ? 'ЗГАСИ ВСІ КЛІТИНКИ' : s.kind === 'mines' ? (s.flagMode ? '🚩 ПОЗНАЧАЙ МІНИ' : 'ВІДКРИВАЙ БЕЗПЕЧНІ КЛІТИНКИ') : 'РОЗТАШУЙ ЧИСЛА ВІД 1 ДО 15', 450, 35, 23, '#ffe2a6');
  for (let i = 0; i < b.cols * b.rows; i++) {
    const x = b.x + i % b.cols * b.size, y = b.y + Math.floor(i / b.cols) * b.size, size = b.size, cx = x + size / 2, cy = y + size / 2;
    rect(x + 2, y + 2, size - 4, size - 4, '#20324e', 7);
    if (s.kind === 'sokoban') {
      if (s.board[i] === '#') { rect(x + 2, y + 2, size - 4, size - 4, '#62758e'); rect(x + 8, y + 10, size - 16, 4, '#8193aa', 1); }
      if (s.goals.includes(i)) circle(cx, cy, size * 0.25, '#e9b857');
      if (s.boxes.includes(i)) { rect(x + 9, y + 9, size - 18, size - 18, s.goals.includes(i) ? '#77d8a3' : '#c89466', 4); text('×', cx, cy, 30, '#604b3a'); }
      if (s.player === i) { circle(cx, cy, size * 0.27, '#80dfff'); circle(cx - 5, cy - 3, 3, '#15213c'); circle(cx + 5, cy - 3, 3, '#15213c'); }
    }
    if (s.kind === 'sliding' && s.board[i]) { rect(x + 4, y + 4, size - 8, size - 8, s.board[i] === i + 1 ? '#65bda0' : '#557fc5'); text(s.board[i], cx, cy, 28); }
    if (s.kind === 'lights') { rect(x + 5, y + 5, size - 10, size - 10, s.board[i] ? '#f6cf69' : '#182638'); if (s.board[i]) circle(cx, cy, 9, '#fff6cf'); }
    if (s.kind === 'mines') {
      if (s.revealed[i] || s.over && s.board[i] === -1) { rect(x + 3, y + 3, size - 6, size - 6, s.board[i] === -1 ? '#a83c59' : '#d2dce5'); if (s.board[i]) text(s.board[i] === -1 ? '✹' : s.board[i], cx, cy, 25, ['#23466b', '#2266ba', '#26854c', '#c44259'][Math.max(0, s.board[i]) % 4]); }
      else if (s.flags[i]) text('⚑', cx, cy, 32, '#ffcd71');
    }
    if (s.kind === 'connect') { circle(cx, cy, size * 0.38, s.board[i] === 1 ? '#ffcf70' : s.board[i] === 2 ? '#fb7284' : '#101b30'); if (s.winning.includes(i)) { c.strokeStyle = '#fff'; c.lineWidth = 4; c.stroke(); } }
    if (['mines', 'lights'].includes(s.kind) && s.cursor === i) { c.strokeStyle = '#8bddff'; c.lineWidth = 3; c.strokeRect(x + 3, y + 3, size - 6, size - 6); }
  }
  if (s.kind === 'connect') text('▼', b.x + (s.cursor + 0.5) * b.size, 60, 19, '#ffcf70');
}
