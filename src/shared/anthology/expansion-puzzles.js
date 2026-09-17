import { integer, shuffled, options, numbers } from './puzzle-options.js';
const DAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота', 'Неділя'];
const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const timeLabel = value => { const n = ((value % 1440) + 1440) % 1440; return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; };
export const isLeapYear = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

export function makeExpansionPuzzle(s, rng) {
  const r = s.rule, m = s.mechanic, level = s.level;
  const stage = { age: 0, preview: 0, visual: 'text', prompt: '', lines: [] };
  const a = integer(rng, 2, 7 + level), b = integer(rng, 2, 6 + level);
  if (m === 'geometry') {
    stage.visual = 'geometry'; stage.sides = [a, b, a + b - 1]; stage.shape = r === 2 ? 'triangle' : r === 4 ? 'box' : 'rectangle';
    if (r === 3) stage.sides[1] = a;
    stage.prompt = ['Яка площа прямокутника?', 'Який периметр прямокутника?', 'Який периметр трикутника?', 'Яка площа квадрата?', 'Який об’єм коробки?'][r];
    return numbers(stage, [a * b, 2 * (a + b), a + b + stage.sides[2], a * a, a * b * stage.sides[2]][r], rng);
  }
  if (m === 'coordinates') {
    stage.visual = 'map-grid'; stage.n = 5; stage.point = [integer(rng, 0, 4), integer(rng, 0, 4)];
    const [x, y] = stage.point;
    stage.prompt = ['Яка координата x скарбу?', 'Яка координата y скарбу?', 'Скільки кроків від (0; 0), без діагоналей?', 'Який x після віддзеркалення ліворуч ↔ праворуч?', 'Скільки кроків до (4; 4), без діагоналей?'][r];
    return numbers(stage, [x, y, x + y, 4 - x, 8 - x - y][r], rng);
  }
  if (m === 'robot') {
    const directions = ['↑', '→', '↓', '←'], moves = Array.from({ length: 4 + level }, () => integer(rng, 0, 3));
    let x = 0, y = 0, turns = 0;
    moves.forEach((d, i) => { x += [0, 1, 0, -1][d]; y += [1, 0, -1, 0][d]; if (i && moves[i - 1] !== d) turns++; });
    stage.robotMoves = moves; stage.lines = [moves.map(i => directions[i]).join('  '), 'Старт: (0; 0). ↑ збільшує y, → збільшує x.'];
    stage.prompt = ['Де робот: координата x?', 'Де робот: координата y?', 'Скільки кроків до бази без діагоналей?', 'Яка команда скасує останній крок?', 'Скільки разів змінювався напрямок?'][r];
    if (r === 3) return options(stage, directions[(moves.at(-1) + 2) % 4], directions, rng);
    return numbers(stage, [x, y, Math.abs(x) + Math.abs(y), 0, turns][r], rng);
  }
  if (m === 'sets') {
    const universe = Array.from({ length: 9 }, (_, i) => i + 1);
    stage.setA = shuffled(universe, rng).slice(0, 4).sort((x, y) => x - y); stage.setB = shuffled(universe, rng).slice(0, 4).sort((x, y) => x - y);
    const intersection = stage.setA.filter(n => stage.setB.includes(n)).length, union = new Set([...stage.setA, ...stage.setB]).size;
    stage.lines = [`A: ${stage.setA.join(', ')}     B: ${stage.setB.join(', ')}`, 'На всіх полицях — числа від 1 до 9.'];
    stage.prompt = ['Скільки чисел є в обох колекціях?', 'Скільки різних чисел разом?', 'Скільки чисел є тільки в A?', 'Скільки чисел є лише в одній колекції?', 'Скількох чисел немає ані в A, ані в B?'][r];
    return numbers(stage, [intersection, union, 4 - intersection, union - intersection, 9 - union][r], rng);
  }
  if (m === 'logic-gates') {
    stage.visual = 'gates'; stage.bitsA = integer(rng, 0, 15); stage.bitsB = integer(rng, 0, 15);
    stage.gate = ['І', 'АБО', 'XOR', 'НЕ І', 'НЕ АБО'][r];
    stage.explanation = ['1 лише коли обидва біти 1', '1 коли хоча б один біт 1', '1 коли біти різні', '0 лише коли обидва біти 1', '1 лише коли обидва біти 0'][r];
    const values = [stage.bitsA & stage.bitsB, stage.bitsA | stage.bitsB, stage.bitsA ^ stage.bitsB, ~(stage.bitsA & stage.bitsB) & 15, ~(stage.bitsA | stage.bitsB) & 15];
    stage.prompt = 'Який запис на виході схеми?';
    return options(stage, values[r].toString(2).padStart(4, '0'), Array.from({ length: 16 }, (_, i) => i.toString(2).padStart(4, '0')), rng);
  }
  if (m === 'market') {
    const price = a * 2, count = b, total = price * count, paid = total + integer(rng, 1, 10) * 5;
    stage.market = { price, count, total, paid };
    stage.prompt = ['Скільки монет за всі речі?', 'Скільки монет решти?', 'Яка ціна зі знижкою 50%?', 'Купи 2, отримай 1: скільки за 3 речі?', 'Скільки коштує одна річ?'][r];
    stage.lines = r === 4 ? [`${count} речей коштують ${total} монет`] : [`Ціна: ${price} монет`, r === 0 ? `Кількість: ${count}` : r === 1 ? `Купуєш ${count}, платиш ${paid}` : r === 2 ? 'Платиш половину ціни' : 'Третя річ безкоштовна'];
    return numbers(stage, [total, paid - total, price / 2, price * 2, price][r], rng);
  }
  if (m === 'measures') {
    const factors = [100, 1000, 60, 1000, 10000], units = ['м → см', 'кг → г', 'год → хв', 'л → мл', 'м² → см²'];
    stage.prompt = `Переведи: ${units[r]}`; stage.lines = [`${a} ${units[r]} = ?`, `1 ${units[r].split(' → ')[0]} = ${factors[r]} ${units[r].split(' → ')[1]}`];
    return numbers(stage, a * factors[r], rng);
  }
  if (m === 'calendar') {
    const day = integer(rng, 0, 6), offset = integer(rng, 1, 15), month = integer(rng, 0, 11);
    stage.calendar = { day, offset, month };
    if (r < 2) {
      stage.prompt = r ? 'Який день був раніше?' : 'Який день буде потім?'; stage.lines = [`Сьогодні: ${DAYS[day]}`, `${r ? 'Назад' : 'Уперед'} на ${offset} днів`];
      return options(stage, DAYS[(day + (r ? -offset : offset) + 21) % 7], DAYS, rng);
    }
    if (r === 2) { stage.prompt = 'Скільки днів у цьому місяці?'; stage.lines = [MONTHS[month], 'Звичайний, не високосний рік']; return options(stage, MONTH_DAYS[month], [28, 29, 30, 31], rng); }
    if (r === 3) {
      const year = [1900, 2000, 2024, 2025, 2028, 2100, 2400][integer(rng, 0, 6)]; stage.calendar.year = year;
      stage.prompt = 'Скільки днів у лютому?'; stage.lines = [`Рік ${year}`, 'Високосний: кратний 4, але століття — лише кратні 400.']; return options(stage, isLeapYear(year) ? 29 : 28, [28, 29, 30, 31], rng);
    }
    stage.prompt = 'Який місяць буде через 3 місяці?'; stage.lines = [MONTHS[month]]; return options(stage, MONTHS[(month + 3) % 12], MONTHS, rng);
  }
  if (m === 'domino') {
    stage.visual = 'domino'; stage.pips = [integer(rng, 0, 6), integer(rng, 0, 6)]; const [left, right] = stage.pips;
    stage.prompt = ['Скільки крапок разом?', 'Яка різниця: більша мінус менша?', 'Який добуток чисел половинок?', 'Скільки крапок бракує до 12?', 'Скільки крапок у більшій половинці?'][r];
    return numbers(stage, [left + right, Math.abs(left - right), left * right, 12 - left - right, Math.max(left, right)][r], rng);
  }
  if (m === 'mosaic' || m === 'memory-grid') {
    const memory = m === 'memory-grid'; stage.visual = memory ? 'memory-grid' : 'mosaic-grid'; stage.n = memory ? 3 : 4;
    stage.cells = Array.from({ length: stage.n ** 2 }, () => integer(rng, 0, 1)); stage.row = integer(rng, 0, stage.n - 1); stage.col = integer(rng, 0, stage.n - 1);
    if (memory) {
      stage.preview = Math.max(1, 2.6 - level * 0.15); stage.point = [stage.col, stage.row]; stage.cells[stage.row * stage.n + stage.col] = 1;
      const corners = [0, 2, 6, 8].reduce((sum, i) => sum + stage.cells[i], 0);
      stage.prompt = ['У якому стовпчику була зірка?', 'У якому рядку була зірка?', 'Скільки всього було синіх клітинок?', 'Скільки синіх клітинок було в кутах?', 'Скільки синіх клітинок було в середньому рядку?'][r];
      return numbers(stage, [stage.col, stage.row, stage.cells.reduce((sum, v) => sum + v, 0), corners, stage.cells.slice(3, 6).reduce((sum, v) => sum + v, 0)][r], rng);
    }
    const counts = [stage.cells.reduce((sum, v) => sum + v, 0), stage.cells.slice(stage.row * 4, stage.row * 4 + 4).reduce((sum, v) => sum + v, 0), stage.cells.filter((v, i) => i % 4 === stage.col && v).length, [0, 5, 10, 15].reduce((sum, i) => sum + stage.cells[i], 0), stage.cells.filter((v, i) => v && (i < 4 || i >= 12 || i % 4 === 0 || i % 4 === 3)).length];
    stage.prompt = ['Скільки всього синіх плиток?', `Скільки синіх плиток у рядку ${stage.row}?`, `Скільки синіх плиток у стовпчику ${stage.col}?`, 'Скільки синіх плиток на діагоналі ↗?', 'Скільки синіх плиток на краю поля?'][r];
    return numbers(stage, counts[r], rng);
  }
  if (m === 'heights') {
    stage.visual = 'bars'; stage.heights = shuffled(Array.from({ length: 10 + level }, (_, i) => i + 1), rng).slice(0, 4);
    const sorted = [...stage.heights].sort((x, y) => x - y), sum = sorted.reduce((v, n) => v + n, 0);
    stage.prompt = ['Яка висота найвищої вежі?', 'Яка висота найнижчої вежі?', 'Яка сума висот?', 'Яка різниця між найвищою і найнижчою?', 'Яка висота другої найвищої вежі?'][r];
    return numbers(stage, [sorted[3], sorted[0], sum, sorted[3] - sorted[0], sorted[2]][r], rng);
  }
  if (m === 'timetable') {
    const departure = r === 4 ? 1380 + integer(rng, 0, 11) * 5 : integer(rng, 6, 18) * 60 + integer(rng, 0, 11) * 5;
    const duration = r === 4 ? 1440 - departure + integer(rng, 1, 12) * 5 : integer(rng, 3, 18) * 5, transfer = integer(rng, 1, 6) * 5;
    stage.trip = { departure, duration, transfer };
    stage.prompt = ['Коли прибудемо?', 'Коли треба виїхати?', 'Скільки хвилин триває рейс?', 'Коли прибудемо після двох переїздів?', 'Коли прибудемо після опівночі?'][r];
    stage.lines = r === 1 ? [`Прибуття ${timeLabel(departure + duration)}`, `У дорозі ${duration} хв`] : r === 2 ? [`Виїзд ${timeLabel(departure)}`, `Прибуття ${timeLabel(departure + duration)}`] : [`Виїзд ${timeLabel(departure)}`, r === 3 ? `${duration} хв + ${transfer} хв` : `У дорозі ${duration} хв`];
    if (r === 2) return numbers(stage, duration, rng);
    const answer = r === 1 ? departure : departure + duration + (r === 3 ? transfer : 0);
    return options(stage, timeLabel(answer), [5, 10, 15, 30, 60].map(delta => timeLabel(answer + delta)), rng);
  }
  if (m === 'memory-digits') {
    stage.visual = 'digit-memory'; stage.preview = Math.max(1, 2.5 - level * 0.1); stage.digits = Array.from({ length: 4 }, () => integer(rng, 1, 9));
    stage.prompt = ['Яка сума чотирьох цифр?', 'Яка цифра була найбільшою?', 'Яка цифра була найменшою?', 'Який запис у зворотному порядку?', 'Яка сума першої та останньої цифр?'][r];
    return numbers(stage, [stage.digits.reduce((v, n) => v + n, 0), Math.max(...stage.digits), Math.min(...stage.digits), Number([...stage.digits].reverse().join('')), stage.digits[0] + stage.digits[3]][r], rng);
  }
  if (m === 'gears') {
    stage.visual = 'gears'; stage.gearCount = r === 0 || r === 4 ? integer(rng, 2, 5) : 2;
    stage.teeth = r === 1 ? [20, 40] : r === 2 ? [40, 20] : [20, 20]; stage.turns = r === 1 ? a * 2 : a; stage.clockwise = integer(rng, 0, 1);
    stage.prompt = ['Куди обертається остання шестерня?', 'Скільки обертів зробить друга?', 'Скільки обертів зробить друга?', 'Перша зробить удвічі більше обертів: скільки друга?', 'Скільки шестерень обертаються проти першої?'][r];
    if (r === 0) return options(stage, (stage.clockwise + stage.gearCount - 1) % 2 ? 'За годинником' : 'Проти годинника', ['За годинником', 'Проти годинника', 'Не рухається', 'В обидва боки'], rng);
    return numbers(stage, r === 4 ? Math.floor(stage.gearCount / 2) : stage.turns * stage.teeth[0] / stage.teeth[1] * (r === 3 ? 2 : 1), rng);
  }
  if (m === 'routes') {
    stage.visual = 'routes'; stage.roads = Array.from({ length: 4 }, () => integer(rng, 1, 8 + level)); stage.closed = r === 4;
    const left = stage.roads[0] + stage.roads[1], right = stage.roads[2] + stage.roads[3];
    stage.prompt = ['Яка довжина найкоротшого шляху A → D?', 'Яка довжина найдовшого шляху без повторів?', 'Яка довжина шляху A → B → D?', 'На скільки відрізняються два маршрути?', 'Шлях через B закритий. Яка довжина об’їзду?'][r];
    return numbers(stage, [Math.min(left, right), Math.max(left, right), left, Math.abs(left - right), right][r], rng);
  }
  throw new Error(`Unknown puzzle mechanic: ${m}`);
}
