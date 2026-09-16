import { WORLD, FLOOR_Y, CEIL_Y } from './constants.js';

export const BASKETBALL = {
  teamSize: 4, target: 5, radius: 32, handRadius: 42, gravity: 700,
  netX: WORLD.w / 2, netTop: 400, netHalf: 8, speed: 1000, pause: 1.3,
  botSpeed: 600, botReaction: 0.28,
};
export const HOOPS = { left: 150, right: WORLD.w - 150, y: 330, half: 65 };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const BOT_DIFFICULTIES = {
  easy: { speed: 400, reaction: 0.42 },
  medium: { speed: BASKETBALL.botSpeed, reaction: BASKETBALL.botReaction },
  hard: { speed: 900, reaction: 0.10 },
};
const botSettings = h => Object.hasOwn(BOT_DIFFICULTIES, h.botDifficulty)
  ? BOT_DIFFICULTIES[h.botDifficulty] : BOT_DIFFICULTIES.medium;

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

export function basketballHand(x, y, tx, ty, dt, player, speed = BASKETBALL.speed, fullCourt = false) {
  const side = basketballTeam(player);
  const r = BASKETBALL.handRadius;
  const lo = fullCourt || side === 0 ? r : BASKETBALL.netX + BASKETBALL.netHalf + r;
  const hi = !fullCourt && side === 0 ? BASKETBALL.netX - BASKETBALL.netHalf - r : WORLD.w - r;
  tx = clamp(Number.isFinite(tx) ? tx : x, lo, hi);
  ty = clamp(Number.isFinite(ty) ? ty : y, CEIL_Y + r, FLOOR_Y - r);
  const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy);
  const k = d ? Math.min(1, speed * dt / d) : 0;
  let nx = clamp(x + dx * k, lo, hi), ny = clamp(y + dy * k, CEIL_Y + r, FLOOR_Y - r);
  if (fullCourt) for (const cx of [HOOPS.left, HOOPS.right]) {
    const left = cx - HOOPS.half - r, right = cx + HOOPS.half + r;
    const top = HOOPS.y - 7 - r, bottom = HOOPS.y + 65 + r;
    let enter = 0, leave = 1, axis = null;
    for (const [start, delta, min, max, name] of [[x,nx-x,left,right,'x'],[y,ny-y,top,bottom,'y']]) {
      if (Math.abs(delta)<1e-9) { if (start<=min || start>=max) leave=-1; continue; }
      const a=(min-start)/delta, b=(max-start)/delta, near=Math.min(a,b), far=Math.max(a,b);
      if (near>=enter) { enter=near; axis=name; }
      leave=Math.min(leave,far);
    }
    if (enter<=leave && leave>=0 && enter<=1 && axis) {
      const t=Math.max(0,enter-0.00001); nx=x+(nx-x)*t; ny=y+(ny-y)*t;
    } else if (nx>left && nx<right && ny>top && ny<bottom) {
      const edges=[[nx-left,'x',left],[right-nx,'x',right],[ny-top,'y',top],[bottom-ny,'y',bottom]].sort((a,b)=>a[0]-b[0]);
      if(edges[0][1]==='x') nx=edges[0][2]; else ny=edges[0][2];
    }
  }
  return { x: nx, y: ny };
}

export function placeBasketballHand(h) {
  const spawn = basketballSpawn(h.player);
  h.x = h.px = h.tx = spawn.x;
  h.y = h.py = h.ty = spawn.y;
  h.r = BASKETBALL.handRadius;
  h.vx = h.vy = h.flash = h.slow = h.cooldown = 0;
  h.touching = false;
  h.think = 0;
  h.char = 0;
  h.rages = h.gloves = h.shell = 0;
}

export function resetBasketball(w) {
  w.basketball = { score: [0, 0], winner: null, serve: 0, round: 0, angle: 0, kind: w.mode, target: w.mode === 'hoops' ? 10 : BASKETBALL.target };
  w.score = 0; w.level = 1; w.state = 'playing'; w.timer = 0;
  w.events.length = 0; w.medkits = 0; w.cornerHold = null;
  for (const h of w.hands) placeBasketballHand(h);
  serve(w);
}

function serve(w) {
  const m = w.basketball;
  m.ball = { x: WORLD.w * (m.serve === 0 ? 0.25 : 0.75), y: 240, vx: 0, vy: 0 };
  m.angle = 0;
  m.lastShot = null;
  for (const h of w.hands) {
    h.touching = false; h.cooldown = 0; h.think = 0;
  }
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
  // Give our team's shot room to reach the basket, including between reactions.
  // Once it misses below the rim, chase the rebound again.
  if (w.mode === 'hoops' && w.basketball.lastShot === basketballTeam(h.player)
      && (b.vy < 0 || b.y <= HOOPS.y)) {
    h.tx = h.x;
    h.ty = FLOOR_Y - BASKETBALL.handRadius;
    h.think = 0;
    return;
  }
  h.think = (h.think ?? 0) - dt;
  if (h.think > 0) return;
  h.think = botSettings(h).reaction;
  // Reacts with a delay and aims behind/below the ball. It uses the same
  // collisions as a human, with a lower movement speed.
  if (w.mode === 'hoops' || b.x > BASKETBALL.netX - 70) {
    h.tx = b.x + b.vx * 0.14 + (basketballTeam(h.player) === 0 ? -25 : 25);
    h.ty = b.y + 68;
  } else {
    h.tx = WORLD.w * 0.75; h.ty = FLOOR_Y - 125;
  }
}

function point(w, loser) {
  const m = w.basketball, scorer = 1 - loser;
  m.score[scorer] += w.mode === 'hoops' ? 2 : 1;
  m.serve = loser;
  m.round++;
  w.score = m.score[0] + m.score[1];
  w.events.push({ type: 'basketPoint', player: scorer, x: m.ball.x, y: FLOOR_Y, level: m.score[scorer] });
  if (m.score[scorer] >= m.target) {
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
  if (w.mode === 'hoops' && (b.x <= r || b.x >= WORLD.w - r)
      && (b.y <= CEIL_Y + r || b.y >= FLOOR_Y - r)) {
    b.x = WORLD.w / 2; b.y = (CEIL_Y + FLOOR_Y) / 2;
    b.vx = b.vy = 0;
    m.angle = 0; m.lastShot = null;
    for (const h of w.hands) { h.touching = false; h.cooldown = 0; h.think = 0; }
    return;
  }
  if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * 0.8; }
  if (b.x > WORLD.w - r) { b.x = WORLD.w - r; b.vx = -Math.abs(b.vx) * 0.8; }
  if (b.y < CEIL_Y + r) { b.y = CEIL_Y + r; b.vy = Math.abs(b.vy) * 0.8; }
  // Solid centre net: the ball must clear the top; it cannot pass through.
  const left = BASKETBALL.netX - BASKETBALL.netHalf;
  const right = BASKETBALL.netX + BASKETBALL.netHalf;
  if (w.mode !== 'hoops' && b.x + r > left && b.x - r < right && b.y + r > BASKETBALL.netTop) {
    if (oldY + r <= BASKETBALL.netTop) {
      b.y = BASKETBALL.netTop - r; b.vy = -Math.abs(b.vy) * 0.7;
    } else if (oldX < BASKETBALL.netX) {
      b.x = left - r; b.vx = -Math.abs(b.vx) * 0.8;
    } else {
      b.x = right + r; b.vx = Math.abs(b.vx) * 0.8;
    }
  }
  if (w.mode === 'hoops') {
    for (const [side, x] of [HOOPS.left, HOOPS.right].entries()) {
      // Only a downward crossing through the opening counts as a basket.
      if (oldY < HOOPS.y && b.y >= HOOPS.y && b.vy > 0) {
        const crossingX = oldX + (b.x - oldX) * (HOOPS.y - oldY) / (b.y - oldY);
        if (Math.abs(crossingX - x) < HOOPS.half - r) {
          point(w, side);
          return;
        }
      }
      const boardX = x + (side === 0 ? -1 : 1) * (HOOPS.half + 12);
      if (b.y + r > HOOPS.y - 130 && b.y - r < HOOPS.y + 20 && Math.abs(b.x - boardX) < r + 5) {
        const dir = oldX < boardX ? -1 : 1;
        b.x = boardX + dir * (r + 5);
        b.vx = dir * Math.abs(b.vx) * 0.75;
      }
      for (const rimX of [x - HOOPS.half, x + HOOPS.half]) {
        const dx = b.x - rimX, dy = b.y - HOOPS.y, distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < r + 5) {
          const nx = dx / distance, ny = dy / distance;
          b.x = rimX + nx * (r + 5); b.y = HOOPS.y + ny * (r + 5);
          const impact = b.vx * nx + b.vy * ny;
          if (impact < 0) { b.vx -= 1.7 * impact * nx; b.vy -= 1.7 * impact * ny; }
        }
      }
    }
  }
  // Ground wins over a late hand contact: touching the floor ends the rally.
  if (b.y + r >= FLOOR_Y) {
    b.y = FLOOR_Y - r;
    if (w.mode !== 'hoops') {
      point(w, b.x < BASKETBALL.netX ? 0 : 1);
      return;
    }
    b.vy = -Math.max(360, Math.abs(b.vy) * 0.7);
    b.vx *= 0.85;
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
      if (w.mode === 'hoops') {
        m.lastShot = basketballTeam(h.player);
        const targetX = dir > 0 ? HOOPS.right : HOOPS.left;
        const apex = Math.min(b.y, HOOPS.y) - 120;
        b.vy = -Math.sqrt(2 * BASKETBALL.gravity * (b.y - apex));
        const flight = -b.vy / BASKETBALL.gravity + Math.sqrt(2 * (HOOPS.y - apex) / BASKETBALL.gravity);
        b.vx = (targetX - b.x) / flight;
      }
      h.flash = 1; h.cooldown = 0.18;
      w.events.push({ type: 'basketHit', x: b.x, y: b.y, player: h.player, power: 0.6 });
    }
    h.touching = true;
  }
  // A hand beside the net must not push the ball through it during separation.
  if (w.mode !== 'hoops' && b.x + r > left && b.x - r < right && b.y + r > BASKETBALL.netTop) {
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
      const p = basketballHand(h.x, h.y, h.tx, h.ty, sub, h.player,
        h.bot ? botSettings(h).speed : BASKETBALL.speed, w.mode === 'hoops');
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
