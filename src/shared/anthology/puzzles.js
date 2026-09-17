import { integer, shuffled, options, numbers } from './puzzle-options.js';
import { makeExpansionPuzzle } from './expansion-puzzles.js';
export { integer } from './puzzle-options.js';
export const PAINTS = ['#f67d9d', '#70bafa', '#f4d16a', '#7bd6a2'];
export const PAINT_NAMES = ['ЧЕРВОНИЙ', 'СИНІЙ', 'ЖОВТИЙ', 'ЗЕЛЕНИЙ'];
export const SYMBOLS = ['●', '◆', '★', '▲', '☀', '♥', '♣', '✚'];
const WORDS = ['ВЕСНА', 'КОСМОС', 'КНИГА', 'ЛИМОН', 'РАКЕТА', 'ХМАРА', 'ШКОЛА', 'МОРЕ', 'СОНЦЕ', 'КВІТКА', 'ЗІРКА', 'ПТАХ'];
const ALPHABET = [...'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ'];
const clockLabel = minutes => `${Math.floor(((minutes % 720) + 720) % 720 / 60) || 12}:${String(((minutes % 60) + 60) % 60).padStart(2, '0')}`;
function roman(n) {
  let result = '';
  for (const [value, label] of [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= value) { result += label; n -= value; }
  return result;
}

export function makePuzzle(s, rng) {
  const r = s.rule, level = s.level, m = s.mechanic;
  const stage = { age: 0, visual: 'text', prompt: '', lines: [], preview: 0 };
  const a = integer(rng, 2, 7 + level * 3), b = integer(rng, 2, 6 + level);
  if (m === 'arithmetic') {
    stage.prompt = 'Обчисли вираз';
    const values = [a + b, a + b - b, a * b, a, (a + b) * 2];
    stage.lines = [[`${a} + ${b} = ?`, `${a + b} − ${b} = ?`, `${a} × ${b} = ?`, `${a * b} ÷ ${b} = ?`, `(${a} + ${b}) × 2 = ?`][r]];
    return numbers(stage, values[r], rng);
  }
  if (m === 'fraction') {
    const denominator = [8, 10, 12, 16][integer(rng, 0, 3)];
    if (r < 2) {
      const numerators = shuffled(Array.from({ length: denominator - 1 }, (_, i) => i + 1), rng).slice(0, 4);
      stage.prompt = r ? 'Вибери найменшу частку' : 'Вибери найбільшу частку';
      const answer = (r ? Math.min : Math.max)(...numerators);
      stage.choices = numerators.map(n => `${n}/${denominator}`); stage.answer = numerators.indexOf(answer); return stage;
    }
    if (r === 2) { stage.prompt = 'Яка частка дорівнює половині?'; return options(stage, `${denominator / 2}/${denominator}`, ['1/3', '2/5', '3/8', '3/4'], rng); }
    if (r === 3) { stage.prompt = 'Знайди рівну частку'; stage.lines = [`${a}/${a + b} = ?`]; return options(stage, `${a * 2}/${(a + b) * 2}`, [`${a}/${a + b + 1}`, `${a + 1}/${a + b}`, `${a * 2 + 1}/${(a + b) * 2}`], rng); }
    const percent = [10, 20, 25, 50, 75][integer(rng, 0, 4)]; stage.prompt = 'Переведи у відсотки'; stage.lines = [`${percent}/100 = ? %`]; return numbers(stage, percent, rng);
  }
  if (m === 'clockwork') {
    stage.visual = 'clock'; stage.minutes = integer(rng, 0, 11) * 60 + (r === 0 ? 0 : r === 1 ? integer(rng, 0, 3) * 15 : integer(rng, 0, 11) * 5);
    const offset = r === 3 ? 60 : r === 4 ? -30 : 0;
    stage.prompt = r === 3 ? 'Котра година буде через годину?' : r === 4 ? 'Котра година була пів години тому?' : 'Котра година на годиннику?';
    return options(stage, clockLabel(stage.minutes + offset), [5, 15, 30, 60, 120, 180].map(d => clockLabel(stage.minutes + offset + d)), rng);
  }
  if (m === 'cipher') {
    if (r === 0) { stage.prompt = 'Двійковий запис → звичайне число'; stage.lines = [a.toString(2), 'Ваги розрядів: … 16, 8, 4, 2, 1']; return numbers(stage, a, rng); }
    if (r === 1) { stage.prompt = 'Римський запис → звичайне число'; stage.lines = [roman(a + b), 'I = 1   V = 5   X = 10   L = 50']; return numbers(stage, a + b, rng); }
    if (r === 2) {
      const i = integer(rng, 0, ALPHABET.length - 2); stage.prompt = 'Шифр: кожну літеру замінили наступною'; stage.lines = [`${ALPHABET[i + 1]} → ?`, ALPHABET.join('')];
      return options(stage, ALPHABET[i], ALPHABET, rng);
    }
    if (r === 3) { const n = integer(rng, 100, 999); stage.prompt = 'Прочитай цифри справа наліво'; stage.lines = [String(n).split('').reverse().join('')]; return numbers(stage, n, rng); }
    stage.prompt = 'Розкрий код фігур'; stage.lines = [`● = ${a}     ◆ = ${b}`, '● + ◆ + ● = ?']; return numbers(stage, a * 2 + b, rng);
  }
  if (m === 'balance') {
    const count = r === 0 ? 1 : r === 1 ? 2 : r === 2 ? 3 : r === 3 ? 1 : 2;
    const extra = r >= 3 ? b : 0; stage.visual = 'balance'; stage.weight = a * count + extra; stage.crystals = count; stage.extra = extra;
    stage.prompt = 'Скільки важить один кристал?'; return numbers(stage, a, rng);
  }
  if (m === 'sequence-lab') {
    const step = integer(rng, 2, 6), start = a;
    const sequences = [
      Array.from({ length: 5 }, (_, i) => start + i * step),
      Array.from({ length: 5 }, (_, i) => start + (4 - i) * step),
      Array.from({ length: 5 }, (_, i) => step * 2 ** i),
      Array.from({ length: 5 }, (_, i) => (i + step) ** 2),
      [start, start + 2, start + 7, start + 9, start + 14],
    ];
    stage.prompt = 'Яке число наступне?'; stage.lines = [sequences[r].slice(0, 4).join('   →   ') + '   →   ?']; return numbers(stage, sequences[r][4], rng);
  }
  if (m === 'color-lab') {
    const ink = integer(rng, 0, 3), word = (ink + integer(rng, 1, 3)) % 4;
    stage.visual = 'color'; stage.ink = ink; stage.word = word; stage.frame = (ink + 2) % 4;
    stage.prompt = ['Якого кольору чорнило?', 'Який колір НАЗВАНО словом?', 'Якого кольору тут немає?', 'Яка фарба утвориться?', 'Якого кольору рамка?'][r];
    let answer = r === 1 ? word : r === 4 ? stage.frame : ink;
    if (r === 2) { stage.swatches = [0, 1, 2, 3].filter(c => c !== ink); }
    if (r === 3) { stage.lines = ['СИНІЙ + ЖОВТИЙ = ?']; stage.visual = 'text'; answer = 3; }
    stage.choices = PAINT_NAMES; stage.answer = answer; return stage;
  }
  if (m === 'rotation') {
    const direction = integer(rng, 0, 3), turns = [1, -1, 2, 3, -2][r];
    stage.visual = 'compass'; stage.direction = direction;
    stage.prompt = ['Поверни праворуч на 90°', 'Поверни ліворуч на 90°', 'Поверни на 180°', '90° праворуч, потім ще 180°', 'Віддзеркаль стрілку: ліворуч ↔ праворуч'][r];
    stage.choices = ['УГОРУ ↑', 'ПРАВОРУЧ →', 'УНИЗ ↓', 'ЛІВОРУЧ ←']; stage.answer = r === 4 ? (4 - direction) % 4 : (direction + turns + 4) % 4; return stage;
  }
  if (m === 'wordsmith') {
    const word = WORDS[integer(rng, 0, WORDS.length - 1)];
    if (r === 0) {
      stage.prompt = 'Віднови слово'; stage.lines = [word.slice(1) + word[0]]; return options(stage, word, WORDS, rng);
    }
    if (r === 3) { stage.prompt = 'Скільки літер у слові?'; stage.lines = [word]; return numbers(stage, word.length, rng); }
    const index = r === 1 ? 0 : r === 2 ? word.length - 1 : integer(rng, 1, word.length - 2);
    stage.prompt = r === 4 ? 'Яка літера пропущена?' : r === 1 ? 'Вибери першу літеру' : 'Вибери останню літеру';
    stage.lines = [r === 4 ? word.slice(0, index) + '_' + word.slice(index + 1) : word]; return options(stage, word[index], ALPHABET, rng);
  }
  if (m === 'quantity') {
    const count = integer(rng, Math.min(18, 6 + level), Math.min(18, 10 + level * 2)); stage.visual = 'dots';
    stage.dots = Array.from({ length: count }, () => ({ symbol: integer(rng, 0, 3), color: integer(rng, 0, 3) }));
    const stars = stage.dots.filter(d => d.symbol === 2).length, red = stage.dots.filter(d => d.color === 0).length, triangles = stage.dots.filter(d => d.symbol === 3).length;
    stage.prompt = ['Скільки зірок ★?', 'Скільки червоних фігур?', 'Скільки трикутників ▲?', 'Скільки повних пар фігур?', 'Зірок ★ мінус трикутників ▲ = ?'][r];
    return numbers(stage, [stars, red, triangles, Math.floor(count / 2), stars - triangles][r], rng);
  }
  if (m === 'recall') {
    stage.visual = 'recall'; stage.preview = Math.max(1, 2.8 - level * 0.15); stage.symbols = shuffled(SYMBOLS, rng).slice(0, 5);
    const at = r === 0 ? 0 : r === 1 ? 4 : r === 2 ? 2 : 3;
    stage.prompt = r === 4 ? 'Якого символу НЕ БУЛО?' : r === 3 ? `Що було після ${stage.symbols[2]}?` : ['Який символ був першим?', 'Який символ був останнім?', 'Який символ був посередині?'][r];
    const answer = r === 4 ? SYMBOLS.find(v => !stage.symbols.includes(v)) : stage.symbols[at];
    return options(stage, answer, r === 4 ? stage.symbols : SYMBOLS, rng);
  }
  if (m === 'cups') {
    stage.visual = 'cups'; stage.marked = r === 4 ? 3 : integer(rng, 0, 3); stage.swaps = [];
    const positions = [0, 1, 2, 3];
    for (let i = 0; i < r + 1; i++) {
      const left = integer(rng, 0, 3), right = (left + integer(rng, 1, 3)) % 4;
      stage.swaps.push([left, right]); [positions[left], positions[right]] = [positions[right], positions[left]];
    }
    stage.swapBeat = Math.max(0.25, 0.65 - level * 0.04);
    stage.preview = 0.9 + stage.swaps.length * stage.swapBeat; stage.prompt = r === 4 ? 'Де скринька, що починала праворуч?' : 'Де скринька із зіркою?';
    stage.choices = ['1', '2', '3', '4']; stage.answer = positions.indexOf(stage.marked); return stage;
  }
  return makeExpansionPuzzle(s, rng);
}
