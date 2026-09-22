import { holePoint } from '../shared/arcade.js';

// Canvas artwork stays crisp at every display size, without downloaded assets.
export function drawMoleGarden(c, s) {
  const ellipse = (x, y, rx, ry, color) => {
    c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
  };
  const line = (x, y, tx, ty, color, width = 2) => {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x, y); c.lineTo(tx, ty); c.stroke();
  };
  const sky = c.createLinearGradient(0, 0, 0, 550);
  sky.addColorStop(0, '#bce8e5'); sky.addColorStop(.3, '#8fca87'); sky.addColorStop(1, '#345e44');
  c.fillStyle = sky; c.fillRect(0, 0, 900, 550);
  ellipse(770, 48, 43, 43, '#fff0ba');
  ellipse(170, 133, 260, 72, '#77b87d'); ellipse(690, 147, 350, 74, '#69a975');
  for (let i = 0; i < 45; i++) {
    const x = (i * 139 + 23) % 890, y = 170 + (i * 73) % 370;
    line(x, y, x - 4, y - 9, '#9cc97e'); line(x, y, x + 5, y - 12, '#9cc97e');
    if (i % 4 === 0) {
      for (let j = 0; j < 5; j++) ellipse(x + Math.cos(j * 1.257) * 5, y - 15 + Math.sin(j * 1.257) * 5, 4, 4, '#ffefd2');
      ellipse(x, y - 15, 3, 3, '#edb94d');
    }
  }
  c.font = 'bold 24px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#234c3a'; c.fillText('КРОТОВИЙ САД', 450, 34);
  c.font = '16px system-ui'; c.fillText('Лови кротів · Бережи їжачків', 450, 62);
  for (let i = 0; i < s.holes.length; i++) {
    const p = holePoint(i), h = s.holes[i];
    ellipse(p.x, p.y + 34, 72, 25, '#24453355');
    ellipse(p.x, p.y + 27, 68, 26, '#b48856');
    ellipse(p.x, p.y + 25, 57, 20, '#38291f');
    ellipse(p.x, p.y + 29, 48, 13, '#201e1a');
    if (h.time > 0) {
      const duration = 1.35 - s.difficulty * .12;
      const rise = Math.max(0, Math.min(1, (duration - h.time) / .12, h.time / .16));
      c.save(); c.beginPath(); c.rect(p.x - 65, p.y - 85, 130, 124); c.clip();
      c.translate(p.x, p.y + (1 - rise) * 73);
      if (h.bad) {
        c.fillStyle = '#9f4b42'; c.beginPath();
        for (let j = 0; j < 24; j++) {
          const a = j * Math.PI / 12, radius = j % 2 ? 36 : 53;
          c.lineTo(Math.cos(a) * radius, Math.sin(a) * radius - 5);
        }
        c.closePath(); c.fill();
      }
      const fur = c.createLinearGradient(-40, -40, 40, 35);
      fur.addColorStop(0, h.bad ? '#e7a18b' : '#9c7e69'); fur.addColorStop(1, h.bad ? '#b96859' : '#514337');
      ellipse(0, 12, 39, 42, fur);
      ellipse(-29, -24, 10, 12, h.bad ? '#b96859' : '#665244');
      ellipse(29, -24, 10, 12, h.bad ? '#b96859' : '#665244');
      ellipse(0, -12, 37, 32, fur);
      ellipse(0, 3, 26, 19, '#dfc5a5');
      for (const side of [-1, 1]) {
        ellipse(side * 14, -14, 5, 6, '#241e1c'); ellipse(side * 14 - 1, -16, 1.6, 2, '#fff8eb');
        ellipse(side * 34, 26, 15, 10, '#dfb293');
        for (let nail = 0; nail < 3; nail++) line(side * 34 - 7 + nail * 6, 28, side * 34 - 7 + nail * 6, 34, '#fff0d5', 3);
        for (let whisker = 0; whisker < 3; whisker++) line(side * 16, 3 + whisker * 4, side * 34, whisker * 8 - 2, '#59483d', 1);
      }
      ellipse(0, -1, 10, 7, '#d78686'); ellipse(-3, -3, 3, 2, '#ffc1b2');
      line(0, 6, 0, 12, '#695047');
      if (h.bad) {
        ellipse(0, -66, 12, 12, '#b13f46'); c.fillStyle = '#fff5db'; c.font = 'bold 18px system-ui'; c.fillText('!', 0, -65);
      }
      c.restore();
    }
    c.strokeStyle = '#d3ad73'; c.lineWidth = 5; c.beginPath(); c.ellipse(p.x, p.y + 26, 61, 21, 0, 0, Math.PI); c.stroke();
    for (let stone = 0; stone < 4; stone++) ellipse(p.x - 46 + stone * 30, p.y + 48 + stone % 2 * 3, 5, 3, '#c69d67');
  }
}
