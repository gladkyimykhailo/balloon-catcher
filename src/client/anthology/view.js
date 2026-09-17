import { choiceRect, isMotor, motorGeometry } from '../../shared/anthology/engine.js';
import { PAINTS, PAINT_NAMES, SYMBOLS } from '../../shared/anthology/puzzles.js';
import { drawExpansion } from './expansion-view.js';

export function drawDiscovery(c, s) {
  const stage = s.stage, ready = stage.age >= stage.preview;
  const rect = (x, y, w, h, color, r = 12) => { c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
  const circle = (x, y, r, color) => { c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  const text = (value, x, y, size = 24, color = '#edf5ff', max = 820) => {
    c.fillStyle = color; c.font = `bold ${size}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(value), x, y, max);
  };
  const line = (x1, y1, x2, y2, color = '#9bdcff', width = 5) => { c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
  rect(28, 18, 844, 380, '#09172880', 24);
  text(stage.prompt, 450, 53, 23, '#ffe1a0');
  rect(50, 83, 800, 5, '#ffffff15', 2); rect(50, 83, 800 * Math.min(1, s.score / s.target), 5, '#86dfb9', 2);
  if (!ready) text('Дивись і запам’ятовуй…', 450, 120, 18, '#8dd8ff');
  if (stage.visual === 'text') (stage.lines || []).forEach((value, i) => text(value, 450, 220 + i * 58, i ? 23 : 40));
  drawExpansion(s, isMotor(s.mechanic) ? motorGeometry(s) : null, { c, rect, circle, text, line });
  if (stage.visual === 'clock') {
    circle(450, 248, 128, '#dae8f3'); circle(450, 248, 119, '#18324b');
    for (let hour = 1; hour <= 12; hour++) { const angle = hour * Math.PI / 6 - Math.PI / 2; text(hour, 450 + Math.cos(angle) * 100, 248 + Math.sin(angle) * 100, 18); }
    const minuteAngle = stage.minutes % 60 / 60 * Math.PI * 2 - Math.PI / 2, hourAngle = stage.minutes / 720 * Math.PI * 2 - Math.PI / 2;
    line(450, 248, 450 + Math.cos(hourAngle) * 63, 248 + Math.sin(hourAngle) * 63, '#ffd278', 8);
    line(450, 248, 450 + Math.cos(minuteAngle) * 90, 248 + Math.sin(minuteAngle) * 90, '#a9e5ff', 4); circle(450, 248, 7, '#fff');
  }
  if (stage.visual === 'balance') {
    line(450, 190, 450, 345, '#759ab8', 12); line(370, 350, 530, 350, '#759ab8', 12); line(225, 190, 675, 190, '#e6c37c', 8);
    for (const x of [270, 630]) { line(x, 190, x - 75, 290, '#b6cad8', 3); line(x, 190, x + 75, 290, '#b6cad8', 3); rect(x - 85, 290, 170, 15, '#88b0c8', 5); }
    text('◆'.repeat(stage.crystals), 270, 251, 36, '#b4a0fa', 150);
    if (stage.extra) text(`+ ${stage.extra}`, 270, 330, 23, '#ffd278');
    text(stage.weight, 630, 250, 46, '#ffd278'); text('◆ = ?', 450, 146, 25);
  }
  if (stage.visual === 'color') {
    if (stage.swatches) stage.swatches.forEach((color, i) => { rect(230 + i * 155, 195, 130, 115, PAINTS[color]); text(SYMBOLS[color], 295 + i * 155, 250, 36, '#162e45'); });
    else { rect(190, 175, 520, 150, PAINTS[stage.frame]); rect(201, 186, 498, 128, '#11233a'); text(PAINT_NAMES[stage.word], 450, 252, 47, PAINTS[stage.ink]); }
  }
  if (stage.visual === 'compass') {
    circle(450, 245, 112, '#244562'); circle(450, 245, 99, '#12273d');
    text(['↑', '→', '↓', '←'][stage.direction], 450, 245, 100, '#ffd67c');
    text('ПІВНІЧ', 450, 113, 14); text('ПІВДЕНЬ', 450, 377, 14); text('ЗАХІД', 302, 245, 14); text('СХІД', 598, 245, 14);
  }
  if (stage.visual === 'dots') stage.dots.forEach((dot, i) => {
    const x = 230 + i % 6 * 88, y = 162 + Math.floor(i / 6) * 77;
    text(SYMBOLS[dot.symbol], x, y, 43, PAINTS[dot.color]);
    // A tiny color letter keeps counting tasks playable without color discrimination.
    text(PAINT_NAMES[dot.color][0], x + 24, y + 23, 12, PAINTS[dot.color]);
  });
  if (stage.visual === 'recall') {
    stage.symbols.forEach((symbol, i) => { rect(165 + i * 117, 196, 103, 108, ready ? '#243650' : '#476a8d'); text(ready ? '?' : symbol, 216 + i * 117, 250, 43, '#ffdf94'); });
  }
  if (stage.visual === 'cups') {
    const positions = [0, 1, 2, 3], progress = Math.max(0, (stage.age - 0.9) / stage.swapBeat);
    const finished = Math.min(stage.swaps.length, Math.floor(progress));
    for (let i = 0; i < finished; i++) { const [a, b] = stage.swaps[i]; [positions[a], positions[b]] = [positions[b], positions[a]]; }
    positions.forEach((original, index) => {
      let location = index, lift = 0;
      if (finished < stage.swaps.length) {
        const [a, b] = stage.swaps[finished], fraction = (progress % 1), ease = fraction * fraction * (3 - 2 * fraction);
        if (index === a || index === b) { location += ((index === a ? b : a) - index) * ease; lift = Math.sin(fraction * Math.PI) * (index === a ? -45 : 45); }
      }
      const x = 225 + location * 150, y = 247 + lift;
      rect(x - 51, y - 50, 102, 100, '#c09362', 15); rect(x - 51, y - 15, 102, 9, '#78563d', 1);
      if (stage.age < 0.9 && original === stage.marked) text('★', x, y - 3, 42, '#fff0ae');
      if (ready) text(index + 1, x, 335, 24, '#ffe1a0');
    });
  }
  if (isMotor(s.mechanic)) {
    const g = motorGeometry(s);
    if (s.mechanic === 'reaction') {
      const color = { green: '#75dda4', red: '#e46b83', blue: '#7fc7ff', dark: '#18263b' }[g.phase];
      circle(450, 248, 100, '#30495f'); circle(450, 248, 83, color);
      text(g.phase === 'dark' ? 'ТЕМНО' : g.phase === 'blue' ? 'СИНІЙ' : g.phase === 'green' ? 'ЗЕЛЕНИЙ' : 'ЧЕКАЙ', 450, 248, 24, g.phase === 'dark' ? '#ddd' : '#152d43');
    }
    if (s.mechanic === 'orbit') {
      c.strokeStyle = '#476680'; c.lineWidth = 3; c.beginPath(); c.arc(450, 260, 150, 0, Math.PI * 2); c.stroke();
      circle(450, 260, 55, '#467fac'); circle(437, 240, 14, '#7bb2c9'); circle(465, 278, 22, '#689bb5');
      c.strokeStyle = '#ffd175'; c.lineWidth = 20; c.beginPath(); c.arc(450, 260, 150, g.targetAngle - g.window, g.targetAngle + g.window); c.stroke();
      circle(g.x, g.y, 15, '#edf6ff');
    }
    if (s.mechanic === 'rhythm' || s.mechanic === 'dial') {
      rect(120, 225, 660, 64, '#243e59'); rect(g.targetX - g.width / 2, 204, g.width, 106, s.mechanic === 'rhythm' ? '#fbdd8c' : '#82ddad');
      if (s.mechanic === 'rhythm') { circle(g.x, 257, 21, '#af9aff'); text('♪', g.x, 255, 30, '#14283c'); }
      else { for (let x = 140; x <= 760; x += 31) line(x, 239, x, 272, '#92b4c9', 2); line(g.x, 190, g.x, 323, '#ffffff', 6); text('▼', g.x, 180, 25, '#fff'); }
    }
    if (s.mechanic === 'catcher') {
      line(70, 475, 830, 475, '#648397', 3);
      circle(g.x, g.y - 30, 25, '#c1b4f2'); line(g.x - 20, g.y - 26, g.x, g.y, '#cedbed', 2); line(g.x + 20, g.y - 26, g.x, g.y, '#cedbed', 2);
      rect(g.x - 15, g.y - 6, 30, 23, '#ffd488', 4); rect(s.x - g.radius, 450, g.radius * 2, 26, '#80d8b1', 7);
      line(s.x - g.radius, 450, s.x - g.radius - 8, 427, '#80d8b1', 5); line(s.x + g.radius, 450, s.x + g.radius + 8, 427, '#80d8b1', 5);
    }
    if (s.mechanic === 'aim' || s.mechanic === 'tracker') {
      circle(g.x, g.y, g.radius + 10, '#ffda7418'); circle(g.x, g.y, g.radius, '#edcd76');
      text(s.mechanic === 'aim' ? '✿' : '✦', g.x, g.y, g.radius * 1.3, '#664f2e');
      c.strokeStyle = '#d9efff'; c.lineWidth = 2; c.beginPath(); c.arc(s.x, s.y, 23, 0, Math.PI * 2); c.stroke();
      line(s.x - 31, s.y, s.x + 31, s.y, '#d9efff', 2); line(s.x, s.y - 31, s.x, s.y + 31, '#d9efff', 2);
      if (s.mechanic === 'tracker') { c.strokeStyle = '#7af1ba'; c.lineWidth = 6; c.beginPath(); c.arc(s.x, s.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, stage.hold / (0.7 + s.level * 0.07))); c.stroke(); }
    }
    if (s.mechanic === 'sorting') {
      rect(75, 290, 750, 38, '#45617a', 5); for (let x = 95; x < 825; x += 45) circle(x, 310, 10, '#182a3c');
      rect(g.x - 44, 205, 88, 85, PAINTS[stage.color], 8);
      text(s.rule === 2 ? stage.number : s.rule >= 3 ? ['А', 'Б', 'В', 'Г'][stage.label] : SYMBOLS[stage.symbol], g.x, 246, 34, '#152c42');
      if (s.rule === 0) text(PAINT_NAMES[stage.color], g.x, 355, 17, PAINTS[stage.color], 160);
    }
  }
  if (stage.choices) stage.choices.forEach((label, i) => {
    const b = choiceRect(i); rect(b.x, b.y, b.w, b.h, !ready ? '#283448' : s.cursor === i ? '#4b7594' : '#294660');
    if (ready && s.cursor === i) { c.strokeStyle = '#a2e4ff'; c.lineWidth = 3; c.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4); }
    text(label, b.x + b.w / 2, b.y + b.h / 2, 24, ready ? '#f3f6ff' : '#667c96', b.w - 16);
  });
  if (s.between > 0) { rect(160, 166, 580, 148, '#102c45ee', 20); text(s.feedback, 450, 230, 28, '#ffe1a0'); text(`${s.score} / ${s.target}`, 450, 275, 22); }
  text(stage.choices ? '← →  обрати   ·   ПРОБІЛ підтвердити   ·   або дотик до відповіді' : s.mechanic === 'tracker' ? 'Стрілки або рух пальця / мишки' : 'ПРОБІЛ / ДІЯ   ·   або дотик до поля', 450, 526, 17, '#b3cddd');
}
