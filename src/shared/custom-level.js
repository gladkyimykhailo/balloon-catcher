export const CUSTOM_MODES = { normal: '🎈 Класика', hardcore: '☠ Хардкор', team: '🤝 Тім-ап',
  hoops: '🏀 Баскетбол', basketball: '🏐 Волейбалл', football: '⚽ Футбол' };
export const isSport = mode => ['hoops', 'basketball', 'football'].includes(mode);
const number = (n, fallback, min, max) => typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;

export function normalizeCustomLevel(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  const mode = Object.hasOwn(CUSTOM_MODES, v.mode) ? v.mode : 'normal';
  return {
    version: 1,
    name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 50) : 'Мій рівень',
    mode,
    target: Math.round(number(v.target, mode === 'hoops' ? 10 : isSport(mode) ? 5 : 25, 1, isSport(mode) ? 50 : 1000)),
    lives: Math.round(number(v.lives, mode === 'hardcore' ? 2 : 3, 1, 10)),
    pace: number(v.pace, 1, 0.5, 1.5),
    hazards: v.hazards !== false,
    players: mode === 'team' ? 2 : Math.round(number(v.players, 1, 1, 2)),
    teamSize: Math.round(number(v.teamSize, mode === 'football' ? 4 : 1, 1, 4)),
    difficulty: ['easy', 'medium', 'hard'].includes(v.difficulty) ? v.difficulty : 'medium',
    spawn: { x: number(v.spawn?.x, mode === 'basketball' ? 300 : 600, 150, 1050),
      y: number(v.spawn?.y, mode === 'football' ? 420 : 240, 160, 550) },
  };
}

// Shared by initial creation and restart, without changing global game rules.
export function applyCustomLevel(w) {
  if (!w.custom) return;
  const c = w.custom;
  w.customWon = false;
  w.lives = c.lives;
  for (const h of w.hands) h.lives = c.lives;
  if (w.football) {
    w.football.target = c.target;
    w.football.owner = null;
    Object.assign(w.football.ball, c.spawn, { vx: 0, vy: 0 });
  } else if (w.basketball) {
    w.basketball.target = c.target;
    Object.assign(w.basketball.ball, c.spawn, { vx: 0, vy: 0 });
    w.balloon.pts.forEach((p, i, pts) => {
      const a = i * Math.PI * 2 / pts.length;
      p.x = c.spawn.x + Math.cos(a) * 32; p.y = c.spawn.y + Math.sin(a) * 32;
      p.vx = p.vy = 0;
    });
  } else {
    const pts = w.balloon.pts;
    const x = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
    const y = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
    for (const p of pts) { p.x += c.spawn.x - x; p.y += c.spawn.y - y; }
  }
}
