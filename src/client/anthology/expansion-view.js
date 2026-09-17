// Drawing is isolated from generation and hit testing; the same geometry is used by input.
export function drawExpansion(s, g, { c, rect, circle, text, line }) {
  const stage = s.stage, ready = stage.age >= stage.preview;
  if (stage.visual === 'geometry') {
    const [a, b, depth] = stage.sides;
    if (stage.shape === 'triangle') {
      line(290, 325, 610, 325); line(290, 325, 440, 153); line(440, 153, 610, 325);
      text(a, 340, 220); text(b, 550, 220); text(depth, 450, 353);
    } else {
      rect(300, 190, 280, 140, '#315a75', 3); text(a, 440, 353); text(b, 267, 260);
      if (stage.shape === 'box') {
        for (const [x, y] of [[300, 190], [580, 190], [580, 330]]) line(x, y, x + 55, y - 50);
        line(355, 140, 635, 140); line(635, 140, 635, 280); text(depth, 639, 314, 22, '#ffd88b');
      }
    }
  }
  if (['map-grid', 'mosaic-grid', 'memory-grid'].includes(stage.visual)) {
    const n = stage.n, size = 230 / n, x0 = 335, y0 = 150, hidden = stage.visual === 'memory-grid' && ready;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const px = x0 + x * size, py = y0 + (n - 1 - y) * size;
      rect(px + 2, py + 2, size - 4, size - 4, hidden ? '#203049' : stage.cells?.[y * n + x] ? '#74baf0' : '#31465e', 4);
      if (hidden) text('?', px + size / 2, py + size / 2, 22, '#627c97');
      else if (stage.point?.[0] === x && stage.point?.[1] === y) text('★', px + size / 2, py + size / 2, 28, '#ffe29d');
    }
    for (let i = 0; i < n; i++) { text(i, x0 + (i + 0.5) * size, 396, 16); text(i, x0 - 20, y0 + (n - i - 0.5) * size, 16); }
    text('x →', 607, 396, 17); text('y ↑', 298, 137, 17);
  }
  if (stage.visual === 'gates') {
    const binary = n => n.toString(2).padStart(4, '0');
    line(230, 200, 400, 225); line(230, 300, 400, 275); line(535, 250, 685, 250);
    rect(375, 191, 160, 118, '#3f657e'); text(stage.gate, 455, 250, 32, '#ffe09a');
    text(binary(stage.bitsA), 200, 170, 30); text(binary(stage.bitsB), 200, 330, 30); text('????', 690, 220, 32);
    text(stage.explanation, 450, 369, 22, '#a9d6ec');
  }
  if (stage.visual === 'domino') {
    rect(270, 170, 360, 170, '#e9eef2'); line(450, 179, 450, 330, '#203049', 3);
    const layouts = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
    stage.pips.forEach((n, side) => layouts[n].forEach(([x, y]) => circle(360 + side * 180 + x * 43, 255 + y * 45, 12, '#233b52')));
  }
  if (stage.visual === 'bars') {
    line(225, 365, 675, 365, '#8fb5ce', 3);
    stage.heights.forEach((h, i) => { const height = h * 13; rect(245 + i * 105, 365 - height, 75, height, ['#77bae8', '#bba2ec', '#e5b66c', '#7fcab0'][i], 5); text(h, 282 + i * 105, 345 - height, 22); text(String.fromCharCode(65 + i), 282 + i * 105, 388, 17); });
  }
  if (stage.visual === 'digit-memory') {
    stage.digits.forEach((digit, i) => { rect(205 + i * 125, 200, 110, 108, '#365774'); text(ready ? '?' : digit, 260 + i * 125, 254, 48, '#ffdf94'); });
  }
  if (stage.visual === 'gears') {
    const count = stage.gearCount, size = 52, left = 450 - (count - 1) * 59;
    for (let i = 0; i < count; i++) {
      const x = left + i * 118; circle(x, 255, size, i % 2 ? '#6d85b6' : '#c0a36d'); circle(x, 255, size - 12, '#183149');
      for (let j = 0; j < 12; j++) { const a = j * Math.PI / 6; line(x + Math.cos(a) * 47, 255 + Math.sin(a) * 47, x + Math.cos(a) * 57, 255 + Math.sin(a) * 57, '#d5dfeb', 7); }
      text(i ? '?' : stage.clockwise ? '↻' : '↺', x, 255, 40, '#f5e1b0');
      if (count === 2 && s.rule !== 0 && s.rule !== 4) text(`${stage.teeth[i]} зубців`, x, 345, 20);
    }
    if (s.rule !== 0 && s.rule !== 4) text(`Перша: ${stage.turns} обертів`, 450, 148, 25);
  }
  if (stage.visual === 'routes') {
    const points = [[450, 140], [285, 255], [615, 255], [450, 370]];
    for (const [i, j, weight] of [[0, 1, 0], [1, 3, 1], [0, 2, 2], [2, 3, 3]]) {
      const [x, y] = points[i], [u, v] = points[j]; line(x, y, u, v, stage.closed && weight < 2 ? '#b9647b' : '#79bddb', 5);
      const mx = (x + u) / 2 + (weight < 2 ? -24 : 24), my = (y + v) / 2; circle(mx, my, 18, '#102a42'); text(stage.roads[weight], mx, my, 23, '#ffe09b');
    }
    points.forEach(([x, y], i) => { circle(x, y, 24, '#3b5974'); text(['A', 'B', 'C', 'D'][i], x, y, 23); });
    if (stage.closed) text('×', 285, 213, 36, '#ff8a9e');
  }
  if (s.mechanic === 'pulse') {
    c.strokeStyle = '#ffd686'; c.lineWidth = g.tolerance * 2; c.beginPath(); c.arc(g.x, g.y, g.targetRadius, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#f4f8ff'; c.lineWidth = 4; c.beginPath(); c.arc(g.x, g.y, g.radius, 0, Math.PI * 2); c.stroke();
  }
  if (s.mechanic === 'pendulum') {
    rect(335, 110, 230, 14, '#66879f', 4); circle(450, 125, 10, '#e4d8ab'); line(450, 125, g.x, g.y, '#d8e3ef', 4); rect(g.x - 20, g.y - 15, 40, 30, '#e5bb71', 5);
    rect(g.targetX - g.width / 2, 365, g.width, 15, '#7bd6ad', 4);
    line(g.targetX, 340, g.targetX, 356, '#7bd6ad', 2);
  }
  if (s.mechanic === 'crossing') {
    line(175, 250, 725, 250, '#3e536f', 2); line(450, 105, 450, 390, '#3e536f', 2);
    circle(g.x, g.y, 22, '#80d4f5'); circle(g.otherX, g.otherY, 18, '#f7bd79'); text('✦', g.x, g.y, 32, '#fff'); text('✦', g.otherX, g.otherY, 26, '#fff0d9');
  }
  if (s.mechanic === 'aperture') {
    rect(255, 108, 390, 285, '#385273', 14); rect(450 - g.gapX, 250 - g.gapY, g.gapX * 2, g.gapY * 2, '#0c1d32', 2);
    c.strokeStyle = '#d7c2f6'; c.lineWidth = 3; c.strokeRect(450 - g.shipSize, 250 - g.shipSize, g.shipSize * 2, g.shipSize * 2);
    text('✧', 450, 250, 58, '#c7b4f0');
  }
}
