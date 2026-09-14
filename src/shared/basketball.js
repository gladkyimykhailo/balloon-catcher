import { WORLD, FLOOR_Y, CEIL_Y } from './constants.js';

export const BASKETBALL = {
  teamSize: 4, target: 5, radius: 32, handRadius: 42, gravity: 700,
  netX: WORLD.w / 2, netTop: 400, netHalf: 8, speed: 1000, pause: 1.3,
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Even player slots are orange (left), odd slots are blue (right).
export const basketballTeam = player => player % 2;
export function basketballRoster(slots) {
  const counts = [0, 0];
  for (const slot of slots) counts[basketballTeam(slot)]++;
  return counts;
}

export function basketballSeat(taken) {
  const counts = basketballRoster(taken);
  if (counts.every(n => n >= BASKETBALL.teamSize)) return -1;
  const team = counts[0] <= counts[1] ? 0 : 1;
  for (let slot = team; slot < BASKETBALL.teamSize * 2; slot += 2) {
    if (!taken.has(slot)) return slot;
  }
  return -1;
}

export function basketballSpawn(player) {
  const team = basketballTeam(player), index = Math.floor(player / 2);
  // Distinct starting positions for teammates; the captain starts at the serve.
  const offset = [300, 180, 420, 60][index] ?? 300;
  return { x: team === 0 ? offset : WORLD.w - offset, y: FLOOR_Y - 110 };
}

export function basketballHand(x, y, tx, ty, dt, player) {
  const side = basketballTeam(player);
  const r = BASKETBALL.handRadius;
  const lo = side === 0 ? r : BASKETBALL.netX + BASKETBALL.netHalf + r;
  const hi = side === 0 ? BASKETBALL.netX - BASKETBALL.netHalf - r : WORLD.w - r;
  tx = clamp(Number.isFinite(tx) ? tx : x, lo, hi);
  ty = clamp(Number.isFinite(ty) ? ty : y, CEIL_Y + r, FLOOR_Y - r);
  const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy);
  const k = d ? Math.min(1, BASKETBALL.speed * dt / d) : 0;
  return { x: clamp(x + dx * k, lo, hi), y: clamp(y + dy * k, CEIL_Y + r, FLOOR_Y - r) };
}

export function placeBasketballHand(h) {
  const spawn = basketballSpawn(h.player);
  h.x = h.px = h.tx = spawn.x;
  h.y = h.py = h.ty = spawn.y;
  h.r = BASKETBALL.handRadius;
  h.vx = h.vy = h.flash = h.slow = h.cooldown = 0;
  h.touching = false;
  h.glove = h.char = 0;
  h.rages = h.gloves = h.shell = 0;
}

export function resetBasketball(w) {
  w.basketball = { score: [0, 0], winner: null, serve: 0, round: 0, angle: 0 };
  w.score = 0; w.level = 1; w.state = 'playing'; w.timer = 0;
  w.events.length = 0; w.medkits = 0; w.cornerHold = null;
  for (const h of w.hands) placeBasketballHand(h);
  serve(w);
}

function serve(w) {
  const m = w.basketball;
  m.ball = { x: WORLD.w * (m.serve === 0 ? 0.25 : 0.75), y: 240, vx: 0, vy: 0 };
  m.angle = 0;
  for (const h of w.hands) { h.touching = false; h.cooldown = 0; }
  syncPoints(w);
}

function syncPoints(w) {
  const b = w.basketball.ball;
  w.balloon.pts.forEach((p, i, pts) => {
    const a = i * Math.PI * 2 / pts.length;
    p.x = b.x + Math.cos(a) * BASKETBALL.radius;
    p.y = b.y + Math.sin(a) * BASKETBALL.radius;
    p.vx = b.vx; p.vy = b.vy;
  });
}

function botTarget(w, h, dt) {
  const b = w.basketball.ball;
  h.think = (h.think ?? 0) - dt;
  if (h.think > 0) return;
  h.think = 0.14;
  // Reacts with a delay and aims behind/below the ball. It uses the same
  // movement limits and collisions as a human, without teleporting the ball.
  if (b.x > BASKETBALL.netX - 70) {
    h.tx = b.x + b.vx * 0.14 + 25;
    h.ty = b.y + 68;
  } else {
    h.tx = WORLD.w * 0.75; h.ty = FLOOR_Y - 125;
  }
}

function point(w, loser) {
  const m = w.basketball, scorer = 1 - loser;
  m.score[scorer]++;
  m.serve = loser;
  m.round++;
  w.score = m.score[0] + m.score[1];
  w.events.push({ type: 'basketPoint', player: scorer, x: m.ball.x, y: FLOOR_Y, level: m.score[scorer] });
  if (m.score[scorer] >= BASKETBALL.target) {
    m.winner = scorer; w.state = 'over';
  } else {
    w.state = 'respawn'; w.timer = BASKETBALL.pause;
  }
}

function moveBall(w, dt) {
  const m = w.basketball, b = m.ball, r = BASKETBALL.radius;
  const oldX = b.x, oldY = b.y;
  b.vy += BASKETBALL.gravity * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;
  m.angle += b.vx * dt / r;
  if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * 0.8; }
  if (b.x > WORLD.w - r) { b.x = WORLD.w - r; b.vx = -Math.abs(b.vx) * 0.8; }
  if (b.y < CEIL_Y + r) { b.y = CEIL_Y + r; b.vy = Math.abs(b.vy) * 0.8; }
  // Solid centre net: the ball must clear the top; it cannot pass through.
  const left = BASKETBALL.netX - BASKETBALL.netHalf;
  const right = BASKETBALL.netX + BASKETBALL.netHalf;
  if (b.x + r > left && b.x - r < right && b.y + r > BASKETBALL.netTop) {
    if (oldY + r <= BASKETBALL.netTop) {
      b.y = BASKETBALL.netTop - r; b.vy = -Math.abs(b.vy) * 0.7;
    } else if (oldX < BASKETBALL.netX) {
      b.x = left - r; b.vx = -Math.abs(b.vx) * 0.8;
    } else {
      b.x = right + r; b.vx = Math.abs(b.vx) * 0.8;
    }
  }
  // Ground wins over a late hand contact: touching the floor ends the rally.
  if (b.y + r >= FLOOR_Y) {
    b.y = FLOOR_Y - r;
    point(w, b.x < BASKETBALL.netX ? 0 : 1);
    return;
  }
  for (const h of w.hands) {
    if (!h.active || h.out) continue;
    const dx = b.x - h.x, dy = b.y - h.y, d = Math.hypot(dx, dy);
    if (d >= r + h.r) { h.touching = false; continue; }
    const nx = d ? dx / d : 0, ny = d ? dy / d : -1;
    b.x = h.x + nx * (r + h.r); b.y = h.y + ny * (r + h.r);
    if (!h.touching && h.cooldown <= 0) {
      const dir = basketballTeam(h.player) === 0 ? 1 : -1;
      b.vx = dir * clamp(350 + h.vx * dir * 0.2, 240, 520);
      b.vy = -clamp(660 - h.vy * 0.2, 570, 850);
      h.flash = 1; h.cooldown = 0.18;
      w.events.push({ type: 'basketHit', x: b.x, y: b.y, player: h.player, power: 0.6 });
    }
    h.touching = true;
  }
  // A hand beside the net must not push the ball through it during separation.
  if (b.x + r > left && b.x - r < right && b.y + r > BASKETBALL.netTop) {
    b.x = oldX < BASKETBALL.netX ? left - r : right + r;
    b.vx = (oldX < BASKETBALL.netX ? -1 : 1) * Math.abs(b.vx) * 0.8;
  }
}

export function stepBasketball(w, dt) {
  w.events.length = 0;
  if (w.paused || w.state === 'over') return;
  w.time += dt; w.tick++;
  const steps = Math.max(1, Math.ceil(dt * 120)), sub = dt / steps;
  for (let i = 0; i < steps; i++) {
    for (const h of w.hands) {
      if (h.bot && w.state === 'playing') botTarget(w, h, sub);
      const p = basketballHand(h.x, h.y, h.tx, h.ty, sub, h.player);
      h.px = h.x; h.py = h.y;
      h.vx = (p.x - h.x) / sub; h.vy = (p.y - h.y) / sub;
      h.x = p.x; h.y = p.y;
      h.flash = Math.max(0, h.flash - sub * 3);
      h.cooldown = Math.max(0, h.cooldown - sub);
    }
    if (w.state === 'respawn') {
      w.timer -= sub;
      if (w.timer <= 0) { w.state = 'playing'; serve(w); }
    } else moveBall(w, sub);
    if (w.state === 'over') break;
  }
  syncPoints(w);
}
