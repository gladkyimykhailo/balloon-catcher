import { boardGeometry } from '../shared/extra-games.js';
import { sequenceFlash } from '../shared/puzzle-games.js';

const COLORS = ['#eb7597', '#69b6f3', '#ecc564', '#73ce9e', '#b593eb'];
const SYMBOLS = ['●', '◆', '★', '▲', '✚'];
export function drawPuzzle(c, s) {
  const text = (value, x, y, size = 24, color = '#edf5ff') => {
    c.fillStyle = color; c.font = `bold ${size}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(value, x, y);
  };
  const title = s.kind === 'merge' ? `ЗБЕРИ ПЛИТКУ ${s.target}` : s.kind === 'flood' ? 'ОДНЕ ПОЛЕ — ОДИН КОЛІР' : s.phase === 'input' ? 'ТЕПЕР ПОВТОРИ' : s.phase === 'retry' ? 'СПРОБУЙ ЩЕ РАЗ' : s.phase === 'next' ? 'ПРАВИЛЬНО!' : 'ЗАПАМ’ЯТОВУЙ';
  text(title, 450, 35, 26, '#ffe2a6');
  const b = boardGeometry(s), flash = s.kind === 'sequence' ? sequenceFlash(s) : -1;
  s.board.forEach((value, i) => {
    const x = b.x + i % s.n * b.size, y = b.y + Math.floor(i / s.n) * b.size;
    let color = COLORS[value];
    if (s.kind === 'merge') color = value ? `hsl(${40 + Math.log2(value) * 17} 55% 65%)` : '#20324e';
    c.globalAlpha = s.kind === 'sequence' && flash !== i ? 0.55 : 1;
    c.fillStyle = color; c.beginPath(); c.roundRect(x + 3, y + 3, b.size - 6, b.size - 6, 8); c.fill(); c.globalAlpha = 1;
    text(s.kind === 'merge' ? value || '' : SYMBOLS[value], x + b.size / 2, y + b.size / 2, s.kind === 'flood' ? 19 : 27, '#15253a');
    if (flash === i || s.kind !== 'merge' && s.cursor === i) {
      c.strokeStyle = flash === i ? '#ffffff' : '#baf3ff'; c.lineWidth = flash === i ? 6 : 3;
      c.strokeRect(x + 3, y + 3, b.size - 6, b.size - 6);
    }
    if (s.kind === 'flood' && i === 0) text('⚑', x + 10, y + 11, 15, '#fff');
  });
  const hint = s.kind === 'merge' ? '← ↑ ↓ →   Зсувай та об’єднуй однакові числа' : s.kind === 'sequence' ? '●  ◆  ★  ▲   Дивись, запам’ятовуй, повторюй' : `Початок: ⚑   ·   Ходів залишилось: ${s.moveLimit - s.moves}`;
  text(hint, 450, 520, 19);
}
