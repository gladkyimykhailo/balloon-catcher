import { CONTRACTS, MECHANICS } from './catalog.js';
import { makePuzzle, integer } from './puzzles.js';
import { EXPANSION_MOTOR, MOTOR_PROMPTS, expansionMotorGeometry } from './expansion-motor.js';

const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const end = (s, won) => { s.over = true; s.won = won; };
const MOTOR = new Set(['reaction', 'rhythm', 'orbit', 'dial', 'catcher', 'aim', 'sorting', 'tracker', ...EXPANSION_MOTOR]);
export const isMotor = mechanic => MOTOR.has(mechanic);
// State owns its PRNG, so generated rounds are reproducible and serializable.
function random(s) {
  s.randomState = (Math.imul(s.randomState, 1664525) + 1013904223) >>> 0;
  return s.randomState / 2 ** 32;
}
export function initDiscovery(s, info, rng) {
  s.mechanic = info.mechanic; s.rule = info.rule; s.contract = info.contract;
  s.timeBonus = info.timeBonus;
  s.randomState = Math.floor(rng() * 2 ** 32) >>> 0;
  const contract = CONTRACTS.find(c => c.id === s.contract);
  s.target = contract.target + s.level - 1;
  // Timed goals stay within the available minute as task difficulty increases.
  if(s.contract==='blitz')s.target=contract.target+Math.min(s.level,10)-1;
  if(s.contract==='survival')s.target=contract.target+Math.min(s.level,5)-1;
  s.lives = contract.lives || 3; s.limit = contract.limit || 0;
  s.attempts = 0; s.maxAttempts = s.target + 3; s.successes = 0; s.streak = 0; s.seal = 0;
  s.score = s.contract === 'energy' ? 4 : 0;
  s.cursor = 0; s.feedback = ''; s.between = 0; s.rival = 0;
  nextStage(s);
}
function nextStage(s) {
  const rng = () => random(s); s.feedback = ''; s.between = 0; s.cursor = 0;
  if (!isMotor(s.mechanic)) { s.stage = makePuzzle(s, rng); return; }
  const r = s.rule;
  s.stage = { age: 0, visual: s.mechanic, prompt: '', preview: 0, seed: rng(), offset: rng() * TAU, delay: 1.3 + rng() * 1.7, hold: 0 };
  const stage = s.stage;
  if (s.mechanic === 'reaction') {
    stage.delay *= Math.max(0.4, 1 - Math.max(0, s.level - 5) * 0.09);
    stage.prompt = ['Натисни на ЗЕЛЕНИЙ', 'Натисни на СИНІЙ, зелений — пастка', 'Натисни на ДРУГИЙ зелений спалах', 'Натисни в ТЕМНИЙ інтервал після спалаху', 'Встигни на короткий зелений спалах'][r];
  } else if (s.mechanic === 'sorting') {
    stage.color = integer(rng, 0, 3); stage.symbol = integer(rng, 0, 3); stage.number = integer(rng, 1, 30);
    stage.label = integer(rng, 0, 3);
    stage.choices = r === 0 ? ['ЧЕРВОНИЙ', 'СИНІЙ', 'ЖОВТИЙ', 'ЗЕЛЕНИЙ'] : r === 1 ? ['●', '◆', '★', '▲'] : r === 2 ? ['ПАРНЕ', 'НЕПАРНЕ', 'МЕНШЕ 0', 'ДОРІВНЮЄ 0'] : ['А', 'Б', 'В', 'Г'];
    stage.answer = r === 0 ? stage.color : r === 1 ? stage.symbol : r === 2 ? stage.number % 2 : r === 3 ? stage.label : (stage.label + 1) % 4;
    stage.prompt = ['Сортуй за кольором', 'Сортуй за формою печатки', 'Сортуй за парністю числа', 'Сортуй за літерою', 'Наступна адреса: А → Б → В → Г → А'][r];
  } else stage.prompt = {
    ...MOTOR_PROMPTS,
    rhythm: 'Натисни, коли нота у світлій смузі', orbit: 'Натисни, коли супутник у золотому секторі', dial: 'Зупини покажчик у зеленій зоні',
    catcher: 'Рухай кошик — «Дія» ловить посилку поруч', aim: 'Злови об’єкт у кадр — клік або «Дія»', tracker: 'Утримуй приціл на світлячку до заповнення кільця',
  }[s.mechanic];
  stage.spawnX = 210 + stage.seed * 480;
}
export function choiceRect(index) { return { x: 80 + index * 190, y: 418, w: 170, h: 70 }; }
export function choiceAt(x, y) {
  for (let i = 0; i < 4; i++) { const b = choiceRect(i); if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i; }
  return -1;
}
export function discoveryDirection(s, dx, dy) {
  if (s.over || s.between > 0) return;
  if (s.stage.choices) s.cursor = clamp(s.cursor + Math.sign(dx || dy), 0, 3);
}
export function resolveDiscovery(s, correct) {
  if (s.over || s.between > 0) return;
  s.attempts++;
  if (correct) {
    s.successes++; s.streak++;
    if (s.contract === 'streak') s.score = s.streak;
    else if (s.contract === 'energy') s.score = Math.min(s.target, s.score + 2);
    else if (s.contract === 'pairs') { if (++s.seal === 2) { s.score++; s.seal = 0; } }
    else s.score++;
    if (s.contract === 'overtime') s.limit += s.timeBonus;
    s.feedback = 'Влучно!';
  } else {
    s.streak = 0; s.seal = 0;
    if (s.contract === 'streak') s.score = 0;
    if (s.contract === 'energy') s.score = Math.max(0, s.score - 3);
    else if (s.contract !== 'budget') s.lives--;
    s.feedback = 'Спробуй наступне завдання';
  }
  if (s.score >= s.target && s.contract !== 'survival') end(s, true);
  else if (s.lives <= 0 || s.contract === 'energy' && s.score === 0 || s.contract === 'budget' && s.attempts >= s.maxAttempts) end(s, false);
  if (!s.over) s.between = 0.65;
}

export function motorGeometry(s) {
  const expansion = expansionMotorGeometry(s); if (expansion) return expansion;
  const t = s.stage.age, r = s.rule, speed = 0.7 + Math.min(s.level, 10) * 0.08, offset = s.stage.offset;
  let x = 450, y = 255, radius = r === 4 ? 22 : 40, active = false, phase = '';
  if (s.mechanic === 'reaction') {
    const since = t - s.stage.delay;
    const start = r === 2 ? 0.95 : r === 3 ? 0.45 : 0, width = r === 4 ? 0.32 : r === 3 ? 0.6 : 0.85;
    active = since >= start && since <= start + width;
    phase = active ? (r === 1 ? 'blue' : r === 3 ? 'dark' : 'green') : (r === 1 && since > -0.7 && since < -0.2 || r === 2 && since >= 0 && since < 0.4 || r === 3 && since >= 0 && since < 0.45) ? 'green' : 'red';
    return { x, y, radius: 70, active, phase, expired: since > start + width };
  }
  if (s.mechanic === 'orbit') {
    const angle = offset + t * speed * (r === 1 ? -1 : 1) + (r === 3 ? Math.sin(t * 3) * 0.4 : 0);
    const targetAngle = r === 2 ? Math.sin(t * 0.8) * 0.7 - Math.PI / 2 : -Math.PI / 2;
    const window = r === 4 ? 0.14 : 0.25;
    x = 450 + Math.cos(angle) * 150; y = 260 + Math.sin(angle) * 150;
    const diff = Math.atan2(Math.sin(angle - targetAngle), Math.cos(angle - targetAngle));
    return { x, y, radius: 15, angle, targetAngle, window, active: Math.abs(diff) < window, expired: t > 11 };
  }
  if (s.mechanic === 'rhythm' || s.mechanic === 'dial') {
    const travel = t * (150 + s.level * 16) + (r === 2 && s.mechanic === 'rhythm' ? t * t * 15 : 0);
    x = r === 3 ? 450 + Math.sin(t * speed * 2 + offset) * 300 : 140 + ((travel + s.stage.seed * 620) % 620);
    if (r === 1) x = 900 - x;
    const targetX = r === 2 && s.mechanic === 'dial' ? 450 + Math.sin(t) * 140 : 450;
    const width = r === 4 ? 36 : 64;
    return { x, y, targetX, width, active: Math.abs(x - targetX) <= width / 2, expired: t > 10 };
  }
  if (s.mechanic === 'catcher') {
    x = clamp(s.stage.spawnX + (r === 1 ? t * 40 : r === 2 ? -t * 40 : r === 3 ? Math.sin(t * 3) * 120 : 0), 65, 835);
    y = 90 + t * (75 + s.level * 9);
    return { x, y, radius, active: Math.abs(s.x - x) < radius + 15 && Math.abs(y - 445) < 35, expired: y > 490 };
  }
  if (s.mechanic === 'sorting') return { x: 110 + t * (55 + s.level * 4), y, expired: t > 9 - s.level * 0.3 };
  if (s.mechanic === 'aim' || s.mechanic === 'tracker') {
    if (r === 0 || r === 4) { x = 450 + Math.sin(t * speed + offset) * 290; y = 230; }
    if (r === 1) { x = 450; y = 250 + Math.sin(t * speed + offset) * 135; }
    if (r === 2) { x = 450 + Math.cos(t * speed + offset) * 210; y = 260 + Math.sin(t * speed + offset) * 130; }
    if (r === 3) { x = 450 + Math.sin(t * speed + offset) * 270; y = 260 + Math.sin(t * speed * 3 + offset) * 100; }
    return { x, y, radius, active: Math.hypot(s.x - x, s.y - y) < radius, expired: t > 12 };
  }
  return { x, y, radius, active, expired: false };
}
export function discoveryAction(s, x, y) {
  if (s.over || s.between > 0 || s.stage.age < s.stage.preview) return;
  if (s.stage.choices) {
    const index = Number.isFinite(x) && Number.isFinite(y) ? choiceAt(x, y) : s.cursor;
    if (index < 0) return;
    s.cursor = index; resolveDiscovery(s, index === s.stage.answer); return;
  }
  if (s.mechanic === 'tracker') return;
  if (Number.isFinite(x) && s.mechanic === 'aim') { s.x = clamp(x, 30, 870); s.y = clamp(y, 80, 490); }
  if (Number.isFinite(x) && s.mechanic === 'catcher') s.x = clamp(x, 55, 845);
  resolveDiscovery(s, motorGeometry(s).active);
}
export function updateDiscovery(s, dt, input) {
  if (s.limit && s.time >= s.limit) { end(s, s.contract === 'survival' && s.score >= s.target); return; }
  if (s.contract === 'rival') { s.rival = Math.floor(s.time / 7); if (s.rival >= s.target) { end(s, false); return; } }
  if (s.between > 0) { s.between -= dt; if (s.between <= 0) nextStage(s); return; }
  s.stage.age += dt;
  if (['catcher', 'aim', 'tracker'].includes(s.mechanic)) {
    if (Number.isFinite(input.x)) s.x = input.x;
    if (Number.isFinite(input.y)) s.y = input.y;
    s.x = clamp(s.x + (input.dx || 0) * 420 * dt, 30, 870);
    s.y = clamp(s.y + (input.dy || 0) * 420 * dt, 80, 490);
  }
  if (isMotor(s.mechanic)) {
    const geometry = motorGeometry(s);
    if (geometry.expired) { resolveDiscovery(s, false); return; }
    if (s.mechanic === 'tracker') {
      s.stage.hold = geometry.active ? s.stage.hold + dt : Math.max(0, s.stage.hold - dt * 1.5);
      if (s.stage.hold >= 0.7 + Math.min(s.level, 10) * 0.07) { resolveDiscovery(s, true); return; }
    }
  }
  if (input.action) discoveryAction(s);
}
export function discoveryStatus(s) {
  const lives = ['budget', 'energy'].includes(s.contract) ? '' : ` · ♥ ${s.lives}`;
  const time = s.limit ? ` · ${Math.max(0, Math.ceil(s.limit - s.time))} с` : '';
  const extra = s.contract === 'budget' ? ` · Спроб: ${s.maxAttempts - s.attempts}` : s.contract === 'rival' ? ` · Суперник: ${s.rival}/${s.target}` : s.contract === 'pairs' ? ` · Печатка: ${s.seal}/2` : '';
  return `${MECHANICS.find(m => m.id === s.mechanic).name} · ${s.score}/${s.target}${lives}${time}${extra}`;
}
