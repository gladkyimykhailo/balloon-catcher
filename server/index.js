// Сервер мультиплеєра + роздача зібраного клієнта.
//
// Фізику рахує сервер (авторитетна симуляція) — обидва браузери бачать
// однакову кульку. Клієнт малює свою долоню одразу локально, щоб керування
// не відчувало пінг, а чужу долоню й кульку — з інтерполяцією між снапшотами.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { createWorld, step, addHand, removeHand, setHandTarget, restart, useMedkit, setSkin, setGlove, setChar, setPerks, useRage, useGlove, canTap, maxLivesOf } from '../src/shared/physics.js';
import { TICK, MAX_PLAYERS, rulesFor, modeOf } from '../src/shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 8090);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST)) return send(res, 403, 'forbidden');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    return send(res, 404, 'Клієнт не зібрано. Запусти: npm run build');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function send(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

const wss = new WebSocketServer({ server });
const rooms = new Map();

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = Array.from({ length: 4 }, () => alphabet[(Math.random() * alphabet.length) | 0]).join('');
  } while (rooms.has(c));
  return c;
}

/**
 * Кімната. Режим задає той, хто її створив: світ у кімнаті один, тож грати в
 * ній у різні ігри неможливо. Хто приєднується пізніше, просто дізнається з
 * `welcome`, куди саме він потрапив.
 */
function getRoom(code, mode) {
  let room = rooms.get(code);
  if (room) return room;
  room = {
    code,
    mode: modeOf(mode),
    clients: new Set(),
    world: createWorld(mode),
    acc: 0,
    last: Date.now(),
    sendAcc: 0,
    pending: [],           // події, що накопичились між розсилками
  };
  room.world.paused = true;   // чекаємо на другого гравця
  room.timer = setInterval(() => tickRoom(room), 1000 / 60);
  rooms.set(code, room);
  return room;
}

function closeRoom(room) {
  clearInterval(room.timer);
  rooms.delete(room.code);
}

function tickRoom(room) {
  const now = Date.now();
  let dt = (now - room.last) / 1000;
  room.last = now;
  if (dt > 0.25) dt = 0.25;       // після засинання вкладки не проганяємо годину симуляції
  room.acc += dt;

  while (room.acc >= TICK) {
    step(room.world, TICK);
    if (room.world.events.length) room.pending.push(...room.world.events);
    room.acc -= TICK;
  }

  room.sendAcc += dt;
  if (room.sendAcc >= 1 / 30) {
    room.sendAcc = 0;
    broadcast(room, snapshot(room));
    room.pending.length = 0;
  }
}

function snapshot(room) {
  const w = room.world;
  const p = [];
  for (const pt of w.balloon.pts) { p.push(Math.round(pt.x * 10) / 10, Math.round(pt.y * 10) / 10); }
  return {
    t: 'snap',
    ts: Date.now(),
    p,
    h: w.hands.map((h) => [
      h.id, Math.round(h.x), Math.round(h.y), Math.max(0, +h.flash.toFixed(2)), Math.max(0, +h.slow.toFixed(2)),
      h.glove, +h.rage.toFixed(2), h.rages, h.dirty ? 1 : 0, h.char,
      // Правило черги рахує сервер: клієнт отримує готове «можеш / не можеш».
      h.lives, h.out ? 1 : 0, +h.web.toFixed(2), h.shield, w.team && !canTap(w, h) && !h.out && h.web <= 0 ? 1 : 0,
      maxLivesOf(w, h), +h.gloveOn.toFixed(2), h.gloves,
    ]),
    g: w.gull ? [Math.round(w.gull.x), Math.round(w.gull.y), w.gull.dir, +w.gull.flap.toFixed(2)] : null,
    df: +w.deflate.toFixed(2),
    sp: w.spikes.map((s) => [s.id, Math.round(s.x), Math.round(s.y), s.phase === 'fly' ? 1 : 0, s.phase === 'fall' ? 1 : 0]),
    pp: w.poops.map((p) => [p.id, Math.round(p.x), Math.round(p.y)]),
    // Кут камінця веземо цілим у сотих радіана — інакше він один з'їдав би
    // більше місця в снапшоті, ніж уся решта каменя.
    sn: w.stones.map((s) => [s.id, Math.round(s.x), Math.round(s.y), s.phase === 'fall' ? 1 : 0, s.dead ? 1 : 0, Math.round(s.spin * 100)]),
    md: w.mode,
    tp: w.traps.map((t) => [t.id, Math.round(t.x), Math.round(t.y), t.type === 'web' ? 1 : 0, Math.round(t.life * 10)]),
    hg: w.hogs.map((h) => [h.id, Math.round(h.x), Math.round(h.y), h.dir, Math.round(h.spin * 100), ['run', 'jump', 'leave'].indexOf(h.phase)]),
    sk: w.skunks.map((s) => [s.id, Math.round(s.x), s.dir, ['run', 'hiss', 'leave'].indexOf(s.phase)]),
    gz: w.gas.map((g) => [g.id, Math.round(g.x), Math.round(g.life * 10)]),
    cb: w.combo,
    bf: [Math.round(w.buff.speed * 10), Math.round(w.buff.size * 10)],
    mk: w.medkits,
    sk: w.skin,
    sc: w.score,
    lv: w.lives,
    st: w.paused ? 'waiting' : w.state,
    ev: room.pending.map((e) => [e.type, Math.round(e.x), Math.round(e.y), e.player, +(e.power ?? 0).toFixed(2), e.level ?? 0, e.spikes ? 1 : 0, e.healed ? 1 : 0]),
  };
}

function broadcast(room, obj) {
  const s = JSON.stringify(obj);
  for (const c of room.clients) {
    if (c.readyState === 1) c.send(s);
  }
}

function announce(room) {
  broadcast(room, {
    t: 'peers',
    n: room.clients.size,
    sides: [...room.clients].map((c) => c.side),
  });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'join') {
      if (ws.room) return;
      const code = (m.room || '').toUpperCase().trim() || makeCode();
      const room = getRoom(code, m.mode || (m.hc ? 'hardcore' : 'normal'));
      if (room.clients.size >= MAX_PLAYERS) {
        ws.send(JSON.stringify({ t: 'error', msg: `У цій кімнаті вже ${MAX_PLAYERS} гравці` }));
        return;
      }
      // Беремо найменший вільний номер, щоб той, хто вийшов, звільнив своє місце.
      const taken = new Set([...room.clients].map((c) => c.side));
      let side = 0;
      while (taken.has(side)) side++;
      ws.side = side;
      ws.room = room;
      ws.handId = 'p' + ws.side;
      room.clients.add(ws);
      addHand(room.world, ws.handId, ws.side);
      // Гра стартує лише коли зібралось двоє — інакше перший гравець
      // встиг би розгубити всі життя, поки чекає на друга.
      if (room.clients.size >= 2 && room.world.paused) {
        room.world.paused = false;
        restart(room.world);
      }
      ws.send(JSON.stringify({
        t: 'welcome', room: code, side: ws.side, mode: room.mode,
        maxLives: rulesFor(room.mode).lives, maxPlayers: MAX_PLAYERS, hc: room.mode === 'hardcore' ? 1 : 0,
      }));
      announce(room);
      return;
    }

    if (!ws.room) return;

    if (m.t === 'input') {
      setHandTarget(ws.room.world, ws.handId, m.x, m.y);
    } else if (m.t === 'restart') {
      restart(ws.room.world);
      broadcast(ws.room, { t: 'restarted' });
    } else if (m.t === 'glove') {
      // Перчатка особиста, тож міняємо саме долоню того, хто прислав.
      setGlove(ws.room.world, ws.handId, Number(m.i) || 0);
    } else if (m.t === 'char') {
      // Хардкор-персонаж — так само особистий.
      setChar(ws.room.world, ws.handId, Number(m.i) || 0);
    } else if (m.t === 'perks') {
      // Перки тім-апа: особисті, але командні з них діють на всю кімнату.
      setPerks(ws.room.world, ws.handId, Number(m.m) || 0);
    } else if (m.t === 'wear') {
      // Рукавичка від газу — річ особиста, як шал: сервер вдягає її саме тому,
      // хто натиснув.
      const ev = useGlove(ws.room.world, ws.handId);
      if (ev) ws.room.pending.push(ev);
    } else if (m.t === 'rage') {
      const ev = useRage(ws.room.world, ws.handId);
      if (ev) ws.room.pending.push(ev);
    } else if (m.t === 'skin') {
      // Кулька в кімнаті одна, тож скін теж один — діє вибір того, хто обрав
      // останнім. Здібності живуть у світі, тому їх достатньо змінити тут.
      setSkin(ws.room.world, Number(m.i) || 0);
    } else if (m.t === 'medkit') {
      // Аптечка спільна на кімнату, тож рішення про заряд — за сервером.
      // Подія про лікування розлетиться всім у наступному снапшоті.
      const ev = useMedkit(ws.room.world, ws.handId);
      if (ev) ws.room.pending.push(ev);
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    room.clients.delete(ws);
    removeHand(room.world, ws.handId);
    if (room.clients.size === 0) { closeRoom(room); return; }
    // Пауза лише коли лишився один: якщо з чотирьох пішов один, гра триває.
    if (room.clients.size < 2) room.world.paused = true;
    announce(room);
  });
});

// Killed-tab detection: інакше кімната лишається "повною" з привидом.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`Кулька: сервер на http://localhost:${PORT}  (ws на тому ж порту)`);
});
