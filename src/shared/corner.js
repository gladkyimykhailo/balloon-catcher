import { WORLD, FLOOR_Y, CEIL_Y, BALLOON } from './constants.js';

export const CORNER_HOLD = { grace: 5, interval: 1, edge: 28, contact: 18, release: 0.3 };

// Shared by local physics and the authoritative room server.
export function cornerPenalty(w, dt, hands) {
  const pts = w.balloon.pts;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const side = minX <= BALLOON.skin + CORNER_HOLD.edge ? 'left'
    : maxX >= WORLD.w - BALLOON.skin - CORNER_HOLD.edge ? 'right' : '';
  const end = minY <= CEIL_Y + BALLOON.skin + CORNER_HOLD.edge ? 'top'
    : maxY >= FLOOR_Y - CORNER_HOLD.edge ? 'bottom' : '';
  let holder = null, closest = Infinity;
  if (side && end) {
    for (const h of hands) {
      if (!h.active || h.out) continue;
      const distance = Math.min(...pts.map(p => Math.hypot(p.x - h.x, p.y - h.y))) - h.r;
      if (distance <= BALLOON.skin + CORNER_HOLD.contact && distance < closest) {
        holder = h; closest = distance;
      }
    }
  }
  if (!holder) {
    if (w.cornerHold) {
      w.cornerHold.away += dt;
      if (w.cornerHold.away >= CORNER_HOLD.release) w.cornerHold = null;
    }
    return null;
  }
  const key = side + end;
  if (!w.cornerHold || w.cornerHold.key !== key) {
    w.cornerHold = { key, elapsed: 0, next: CORNER_HOLD.grace, away: 0 };
  }
  const hold = w.cornerHold;
  hold.away = 0;
  hold.elapsed += dt;
  let damage = 0;
  while (hold.elapsed + 1e-9 >= hold.next) {
    damage++;
    hold.next += CORNER_HOLD.interval;
  }
  return damage ? { holder, damage } : null;
}
