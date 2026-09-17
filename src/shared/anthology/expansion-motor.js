export const EXPANSION_MOTOR = ['pulse', 'pendulum', 'crossing', 'aperture'];
export const MOTOR_PROMPTS = {
  pulse: 'Натисни, коли біле кільце збігається із золотим',
  pendulum: 'Натисни, коли вантаж над платформою',
  crossing: 'Натисни, коли дві комети сумістяться',
  aperture: 'Натисни, коли корабель поміститься у шлюз',
};
export function expansionMotorGeometry(s) {
  const t = s.stage.age, r = s.rule, phase = t * (1.3 + s.level * 0.08) + s.stage.offset;
  const expired = t > 10;
  if (s.mechanic === 'pulse') {
    const travel = (t * (55 + s.level * 5) + s.stage.seed * 140) % 140;
    const radius = r === 1 ? 170 - travel : r === 2 ? 100 + 65 * Math.sin(phase) : 30 + travel;
    const targetRadius = r === 3 ? 100 + Math.sin(phase * 0.7) * 25 : 100, tolerance = r === 4 ? 6 : 12;
    return { x: 450, y: 250, radius, targetRadius, tolerance, active: Math.abs(radius - targetRadius) < tolerance, expired };
  }
  if (s.mechanic === 'pendulum') {
    const angle = Math.sin(phase) * 0.95, x = 450 + Math.sin(angle) * 190, y = 125 + Math.cos(angle) * 190;
    const targetX = r === 1 ? 350 : r === 2 ? 550 : r === 3 ? 450 + Math.sin(phase * 0.6) * 75 : 450;
    const width = r === 4 ? 35 : 70;
    return { x, y, targetX, width, active: Math.abs(x - targetX) < width / 2, expired };
  }
  if (s.mechanic === 'crossing') {
    const wave = Math.sin(phase), x = 450 + wave * 240, y = r === 2 ? 250 + Math.sin(phase * 2) * 65 : r === 3 ? 250 + wave * 110 : 250;
    const otherX = r === 1 ? 450 : 450 - wave * 240, otherY = r === 1 ? 250 + wave * 140 : 500 - y;
    const tolerance = r === 4 ? 20 : 45;
    return { x, y, otherX, otherY, tolerance, active: Math.hypot(x - otherX, y - otherY) < tolerance, expired };
  }
  if (s.mechanic === 'aperture') {
    const open = 30 + 65 * (r === 3 ? Math.sin(phase) ** 2 : (Math.sin(phase) + 1) / 2);
    const gapX = r === 1 ? 125 : open, gapY = r === 0 || r === 4 ? 110 : r === 2 ? 30 + 65 * (Math.sin(phase + Math.PI / 3) + 1) / 2 : open;
    const shipSize = r === 4 ? 72 : 48;
    return { x: 450, y: 250, gapX, gapY, shipSize, active: gapX > shipSize + 5 && gapY > shipSize + 5, expired };
  }
  return null;
}
