import { WORLD } from './constants.js';

export const FOOTBALL = { left: 60, right: 1140, top: 115, bottom: 725, goalTop: 310, goalBottom: 530,
  radius: 12, playerRadius: 22, speed: 260, shotSpeed: 820, target: 5 };
const F = FOOTBALL;
export const FOOTBALL_DIFFICULTIES = {
  easy: { speed: 180, reaction: 0.5, keeperSpeed: 110, prediction: 0, windup: 0.7, range: 460, aimError: 145, corner: 20 },
  medium: { speed: 235, reaction: 0.25, keeperSpeed: 160, prediction: 0.18, windup: 0.5, range: 520, aimError: 48, corner: 60 },
  hard: { speed: 260, reaction: 0.1, keeperSpeed: 210, prediction: 0.45, windup: 0.3, range: 420, aimError: 8, corner: 78 },
};
const botSettings = h => Object.hasOwn(FOOTBALL_DIFFICULTIES, h.botDifficulty)
  ? FOOTBALL_DIFFICULTIES[h.botDifficulty] : FOOTBALL_DIFFICULTIES.medium;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const footballTeam = player => player % 2;
export function footballSpawn(player) {
  const index = Math.floor(player / 2), side = footballTeam(player);
  const x = [470, 340, 340, 130][index] ?? 340;
  return { x: side ? WORLD.w - x : x, y: [420, 240, 600, 420][index] ?? 420 };
}
export function placeFootballPlayer(h) {
  Object.assign(h, footballSpawn(h.player));
  h.tx = h.px = h.x; h.ty = h.py = h.y;
  h.r = F.playerRadius; h.vx = h.vy = h.flash = h.slow = 0;
  h.rages = h.gloves = h.shell = 0;
  h.aimX = h.player % 2 ? F.left : F.right; h.aimY = 420;
  h.kick = false; h.trip = false; h.stun = 0; h.tripCooldown = 0; h.pickup = 0; h.think = 0;
}
function kickoff(w) {
  const m = w.football;
  for (const h of w.hands) placeFootballPlayer(h);
  m.ball = { x: 600, y: 420, vx: 0, vy: 0 };
  m.owner = null; m.held = 0; m.protect = 0; m.lastShot = null;
  m.offside = []; m.whistle = 0; m.restartKind = null; m.directRestart = null; m.lastTouch = m.serve;
  const captain = w.hands.find(h => h.active && !h.out && h.player % 2 === m.serve);
  if (captain) { captain.x = captain.tx = m.serve ? 630 : 570; m.owner = captain.id; m.protect = 0.8; }
}
export function resetFootball(w) {
  w.football = { kind: 'football', noRules: !!w.football?.noRules, lastTouch: 0, offside: [], notice: '', noticeTime: 0, score: [0, 0], target: F.target, winner: null, round: 0, serve: 0 };
  for (const h of w.hands) { h.cards = 0; h.out = false; }
  w.state = 'playing'; w.score = 0; w.timer = 0; w.medkits = 0; w.events.length = 0;
  kickoff(w);
}
export function setFootballInput(w, id, input) {
  if (w.mode !== 'football' || w.paused || w.state !== 'playing') return;
  const h = w.hands.find(h => h.id === id && !h.bot && !h.out);
  if (!h) return;
  for (const [key, field, min, max] of [['x', 'tx', F.left, F.right], ['y', 'ty', F.top, F.bottom],
    ['aimX', 'aimX', 0, WORLD.w], ['aimY', 'aimY', 0, WORLD.h]]) {
    if (Number.isFinite(input[key])) h[field] = clamp(input[key], min, max);
  }
  if (input.trip === true) h.trip = true;
  if (input.kick === true && w.football.owner === id) h.kick = true;
}
// Restarts are taken by the nearest eligible teammate after a short whistle pause.
function restartPlay(w, side, x, y, label) {
  const m = w.football;
  const taker = w.hands.filter(h => h.active && !h.out && h.player % 2 === side)
    .sort((a, b) => Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
  m.ball = { x, y, vx: 0, vy: 0 }; m.owner = taker?.id ?? null;
  m.lastTouch = side; m.offside = []; m.held = 0; m.protect = 1.5;
  m.notice = label; m.noticeTime = 2; m.whistle = 0.8;
  m.restartKind = label;
  if (taker) { taker.x = taker.tx = clamp(x, F.left+22, F.right-22); taker.y = taker.ty = clamp(y,F.top+22,F.bottom-22); }
  for (const h of w.hands) {
    h.kick = h.trip = false;
    if (h !== taker && Math.hypot(h.x-x,h.y-y)<95) {
      h.x = h.tx = clamp(x+(side ? 100 : -100),F.left+22,F.right-22);
      h.y = h.ty = clamp(y+100,F.top+22,F.bottom-22);
    }
  }
}
function tripPlayer(w, h) {
  const m = w.football;
  if (!h.trip || h.tripCooldown > 0 || h.stun > 0) return;
  h.tripCooldown = 1.2;
  const victim = w.hands.find(p => p.active && !p.out && p.player%2 !== h.player%2 && Math.hypot(p.x-h.x,p.y-h.y)<75);
  if (!victim) return;
  victim.stun = 1.1;
  if (m.noRules) {
    if (m.owner === victim.id) { m.owner = null; victim.pickup = 1.1; m.ball.vx = h.player%2 ? -180 : 180; }
    m.notice = 'ПІДНІЖКА!'; m.noticeTime = 1;
  } else {
    h.cards = (h.cards ?? 0) + 1;
    if (h.cards >= 2) h.out = true;
    const side = victim.player%2;
    const penalty = victim.y > 265 && victim.y < 575 && (side ? victim.x < 225 : victim.x > 975);
    restartPlay(w, side, penalty ? (side ? 180 : 1020) : victim.x, penalty ? 420 : victim.y,
      (penalty ? 'Пенальті' : 'Штрафний удар') + (h.out ? ' · червона картка' : ' · жовта картка'));
  }
}
function botInput(w, h) {
  const m = w.football, b = m.ball, side = h.player % 2, dir = side ? -1 : 1;
  const settings = botSettings(h);
  const owner = w.hands.find(p => p.id === m.owner);
  const goal = side ? F.left : F.right;
  if (m.owner === h.id) {
    h.tx = goal - dir * 100; h.ty = 420;
    const keeper = w.hands.find(p => p.player % 2 !== side && Math.floor(p.player / 2) === 3);
    h.aimX = goal;
    h.aimY = 420 + (keeper && keeper.y < 420 ? settings.corner : -settings.corner)
      + Math.sin(w.time * 1.7 + h.player) * settings.aimError;
    h.kick = m.held >= settings.windup && Math.abs(goal - h.x) < settings.range;
    return;
  }
  const keeper = Math.floor(h.player / 2) === 3;
  const teammates = w.hands.filter(p => p.active && !p.out && p.player % 2 === side && Math.floor(p.player / 2) !== 3);
  const nearest = teammates.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
  if (keeper) {
    h.tx = side ? F.right - 45 : F.left + 45;
    const arrival = b.vx ? (h.tx - b.x) / b.vx : 0;
    const lead = clamp(arrival, 0, settings.prediction);
    h.ty = clamp(b.y + b.vy * lead, F.goalTop + 20, F.goalBottom - 20);
  } else if ((!owner || owner.player % 2 !== side) && !(m.lastShot === side && Math.hypot(b.vx, b.vy) > 100) && nearest === h) {
    const lead = Math.min(settings.prediction, 0.3);
    h.tx = b.x + b.vx * lead; h.ty = b.y + b.vy * lead;
  } else {
    const spawn = footballSpawn(h.player);
    h.tx = clamp(b.x - dir * 130, side ? 470 : 200, side ? 1000 : 730);
    h.ty = spawn.y;
  }
}
function goal(w, side) {
  const m = w.football;
  m.score[side]++; m.round++; m.serve = 1 - side;
  w.score = m.score[0] + m.score[1];
  w.events.push({ type: 'footballGoal', player: side, x: m.ball.x, y: m.ball.y });
  m.owner = null; m.goalTime = w.time; m.goalSide = side;
  if (m.score[side] >= m.target) { m.winner = side; w.state = 'over'; }
  else { w.state = 'respawn'; w.timer = 1.5; }
}
export function stepFootball(w, dt) {
  w.events.length = 0;
  if (w.paused || w.state === 'over') return;
  const steps = Math.max(1, Math.ceil(dt * 120)), sub = dt / steps;
  for (let i = 0; i < steps; i++) {
    w.time += sub;
    if (w.state === 'respawn') {
      w.timer -= sub;
      if (w.timer <= 0) { kickoff(w); w.state = 'playing'; }
      continue;
    }
    const m = w.football, b = m.ball;
    m.noticeTime = Math.max(0, m.noticeTime - sub);
    if (m.whistle > 0) { m.whistle -= sub; continue; }
    m.protect = Math.max(0, m.protect - sub);
    for (const h of w.hands) {
      if (!h.active || h.out) continue;
      h.tripCooldown = Math.max(0, (h.tripCooldown ?? 0) - sub);
      h.stun = Math.max(0, (h.stun ?? 0) - sub);
      if (h.stun > 0) continue;
      if (m.noRules && h.bot && m.owner !== h.id) h.trip = true;
      tripPlayer(w, h); h.trip = false;
      h.think = Math.max(0, h.think - sub);
      const settings = botSettings(h);
      if (h.bot && h.think <= 0) {
        botInput(w, h); h.think = settings.reaction;
      }
      const speed = !h.bot ? F.speed : Math.floor(h.player / 2) === 3 && m.owner !== h.id
        ? settings.keeperSpeed : settings.speed;
      const dx = h.tx - h.x, dy = h.ty - h.y, distance = Math.hypot(dx, dy);
      const k = distance ? Math.min(1, speed * sub / distance) : 0;
      h.px = h.x; h.py = h.y;
      h.x = clamp(h.x + dx * k, F.left + h.r, F.right - h.r);
      h.y = clamp(h.y + dy * k, F.top + h.r, F.bottom - h.r);
      h.vx = (h.x - h.px) / sub; h.vy = (h.y - h.py) / sub;
      h.pickup = Math.max(0, h.pickup - sub);
      h.flash = Math.max(0, h.flash - sub * 3);
    }
    if (m.whistle > 0) continue;
    let owner = w.hands.find(h => h.id === m.owner && h.active && !h.out);
    if (!owner) m.owner = null;
    if (owner) {
      m.held += sub;
      const angle = Math.atan2(owner.aimY - owner.y, owner.aimX - owner.x);
      b.x = owner.x + Math.cos(angle) * 32; b.y = owner.y + Math.sin(angle) * 32;
      b.vx = b.vy = 0;
      if (owner.kick) {
        b.vx = Math.cos(angle) * F.shotSpeed; b.vy = Math.sin(angle) * F.shotSpeed;
        owner.pickup = 0.4; owner.flash = 1;
        m.lastShot = owner.player % 2;
        m.lastTouch = owner.player % 2;
        const side = m.lastTouch, dir = side ? -1 : 1;
        const defenders = w.hands.filter(h => h.active && !h.out && h.player%2 !== side).map(h => h.x*dir).sort((a,b)=>b-a);
        m.offside = m.noRules || ['Аут', 'Удар від воріт', 'Кутовий'].includes(m.restartKind) ? [] : w.hands.filter(h => h.id !== owner.id && h.player%2 === side && h.x*dir > 600*dir && h.x*dir > b.x*dir && h.x*dir > (defenders[1] ?? defenders[0] ?? Infinity)).map(h=>h.id);
        m.directRestart = m.restartKind; m.restartKind = null;
        w.events.push({ type: 'footballKick', player: owner.player, x: b.x, y: b.y });
        m.owner = null; m.held = 0; m.protect = 0;
        owner = null;
      }
    }
    for (const h of w.hands) h.kick = false;
    if (!owner) {
      const oldX = b.x, oldY = b.y;
      b.x += b.vx * sub; b.y += b.vy * sub;
      b.vx *= Math.exp(-0.48 * sub); b.vy *= Math.exp(-0.48 * sub);
      for (const [side, x] of [[1, F.left - F.radius], [0, F.right + F.radius]]) {
        if (side === 1 ? b.x <= x && b.vx < 0 : b.x >= x && b.vx > 0) {
          const crossing = oldY + (b.y - oldY) * clamp((x - oldX) / (b.x - oldX || 1), 0, 1);
          if (crossing > F.goalTop + F.radius && crossing < F.goalBottom - F.radius) {
            const ownGoal = side !== m.lastTouch;
            const indirect = m.directRestart === 'Аут' || m.directRestart?.startsWith('Офсайд');
            if (!m.noRules && m.directRestart && (ownGoal || indirect)) {
              restartPlay(w, ownGoal ? side : 1-side, side ? 90 : 1110, ownGoal ? F.top+22 : 420, ownGoal ? 'Кутовий' : 'Удар від воріт');
            } else goal(w, side);
            break;
          }
        }
      }
      if (w.state !== 'playing') { if (w.state === 'over') break; continue; }
      if (m.whistle > 0) continue;
      if (!m.noRules) {
        if (b.y < F.top-F.radius || b.y > F.bottom+F.radius) {
          restartPlay(w,1-m.lastTouch,clamp(b.x,F.left+22,F.right-22), b.y < F.top ? F.top+22 : F.bottom-22,'Аут');
        } else if (b.x < F.left-F.radius || b.x > F.right+F.radius) {
          const defending = b.x < F.left ? 0 : 1;
          const corner = m.lastTouch === defending;
          restartPlay(w,corner ? 1-defending : defending, defending ? F.right-30 : F.left+30,
            corner ? (b.y<420 ? F.top+22 : F.bottom-22) : 420, corner ? 'Кутовий' : 'Удар від воріт');
        }
      } else {
        if (b.x < F.left-F.radius || b.x > F.right+F.radius) { b.vx *= -0.7; b.x = clamp(b.x,F.left,F.right); }
        if (b.y < F.top+F.radius || b.y > F.bottom-F.radius) { b.vy *= -0.7; b.y = clamp(b.y,F.top+F.radius,F.bottom-F.radius); }
      }
    }
    for (const h of w.hands) {
      if (!h.active || h.out || h.stun > 0 || h.pickup > 0 || h.id === m.owner) continue;
      if (owner && (m.protect > 0 || h.player % 2 === owner.player % 2)) continue;
      if (Math.hypot(h.x - b.x, h.y - b.y) < h.r + F.radius + 4) {
        if (!m.noRules && m.offside.includes(h.id)) { restartPlay(w,1-h.player%2,h.x,h.y,'Офсайд · вільний удар'); break; }
        m.offside = []; m.directRestart = null; m.lastTouch = h.player%2;
        if (owner) owner.pickup = 0.5;
        m.owner = h.id; m.held = 0; m.protect = 0.9; m.lastShot = null;
        b.vx = b.vy = 0;
        break;
      }
    }
  }
  w.tick++;
}
