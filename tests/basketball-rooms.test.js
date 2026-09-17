import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as physics from '../src/shared/physics.js';
import * as constants from '../src/shared/constants.js';
import * as football from '../src/shared/football.js';
import * as basketball from '../src/shared/basketball.js';
import { Net } from '../src/client/net.js';
import { createFighterRooms } from '../server/fighter-rooms.js';

// Run real server room handlers with an in-memory transport: no ports,
// Cloudflare, or external service needed for authoritative multiplayer tests.
function server() {
  const sourceUrl = new URL('../server/index.js', import.meta.url);
  const source = fs.readFileSync(sourceUrl, 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(sourceUrl.href));
  class WebSocketServer extends EventEmitter { clients = new Set(); }
  const httpServer = new EventEmitter();
  httpServer.listen = () => {};
  const app = vm.runInNewContext(source + '\n({ wss, rooms, snapshot, tickRoom, server });', {
    ...physics, ...constants, ...basketball, ...football, fs, path, fileURLToPath, WebSocketServer,
    createFighterRooms: () => createFighterRooms({ schedule: () => 1, cancel: () => {} }),
    http: { createServer: handler => { httpServer.request = handler; return httpServer; } }, URL, console,
    process: { env: {}, exit: code => { throw Error('Unexpected exit ' + code); } },
    setInterval: () => 1, clearInterval: () => {},
  });
  app.connect = (room = '', mode = 'basketball', options = {}) => {
    const ws = new EventEmitter();
    ws.readyState = 1; ws.messages = [];
    ws.send = text => ws.messages.push(JSON.parse(text));
    app.wss.emit('connection', ws, { url: options.endpoint || '/' });
    ws.emit('message', JSON.stringify({ t: 'join', room, mode, ...options }));
    return ws;
  };
  return app;
}

test('basketball creates a code, balances eight players and rejects a ninth', () => {
  const app = server(), host = app.connect();
  const welcome = host.messages.find(m => m.t === 'welcome');
  assert.match(welcome.room, /^[A-Z2-9]{4}$/);
  assert.equal(welcome.maxPlayers, 8);
  assert.equal(host.room.world.paused, true);
  const guest = app.connect(welcome.room, 'normal'); // Room determines the mode.
  assert.equal(guest.room, host.room);
  assert.equal(guest.messages.find(m => m.t === 'welcome').mode, 'basketball');
  assert.equal(guest.side, 1);
  assert.equal(host.room.world.paused, false);
  for (let i = 0; i < 6; i++) assert.ok(app.connect(welcome.room).messages.some(m => m.t === 'welcome'));
  const ninth = app.connect(welcome.room);
  assert.ok(ninth.messages.some(m => m.t === 'error'));
  assert.equal(ninth.room, undefined);
  assert.equal(host.room.clients.size, 8);
  assert.deepEqual(basketball.basketballRoster([...host.room.clients].map(c => c.side)), [4, 4]);
});

test('separate rooms stay isolated; both peers receive the authoritative score', () => {
  const app = server(), host = app.connect();
  const peers = Array.from({ length: 7 }, () => app.connect(host.room.code));
  const other = app.connect();
  const room = host.room;
  Object.assign(room.world.basketball.ball, { x: 900, y: constants.FLOOR_Y - 33, vx: 0, vy: 300 });
  room.last -= 40;
  app.tickRoom(room);
  for (const ws of [host, ...peers]) {
    const snap = ws.messages.findLast(m => m.t === 'snap');
    assert.deepEqual(snap.bk.score, [1, 0]);
    assert.equal(snap.md, 'basketball');
    assert.equal(snap.st, 'respawn');
    const client = new Net();
    client.push(snap);
    assert.deepEqual(client.sample().basketball.score, [1, 0]);
  }
  assert.deepEqual(other.room.world.basketball.score, [0, 0]);
});

test('disconnect pauses; replacement preserves score; restart resets it for both', () => {
  const app = server(), host = app.connect(), peer = app.connect(host.room.code);
  host.room.world.basketball.score[0] = 3;
  peer.emit('close');
  assert.equal(host.room.world.paused, true);
  const replacement = app.connect(host.room.code);
  assert.equal(replacement.side, 1);
  assert.equal(host.room.world.paused, false);
  assert.deepEqual(host.room.world.basketball.score, [3, 0]);
  host.emit('message', JSON.stringify({ t: 'restart' }));
  assert.deepEqual(host.room.world.basketball.score, [0, 0]);
  assert.ok(replacement.messages.some(m => m.t === 'restarted'));
  replacement.emit('close'); host.emit('close');
  assert.equal(app.rooms.size, 0);
});

test('classic rooms still support four players', () => {
  const app = server(), host = app.connect('', 'normal');
  for (let i = 0; i < 3; i++) assert.ok(app.connect(host.room.code).messages.some(m => m.t === 'welcome'));
  assert.equal(host.room.clients.size, 4);
  assert.ok(app.connect(host.room.code).messages.some(m => m.t === 'error'));
});


test('two remaining teammates wait for an opponent; rejoining resumes without resetting score', () => {
  const app = server(), host = app.connect(), opponent = app.connect(host.room.code);
  const teammate = app.connect(host.room.code);
  assert.equal(teammate.side, 2);
  host.room.world.basketball.score[0] = 2;
  opponent.emit('close');
  assert.equal(host.room.clients.size, 2);
  assert.equal(host.room.world.paused, true);
  const replacement = app.connect(host.room.code);
  assert.equal(replacement.side, 1);
  assert.equal(host.room.world.paused, false);
  assert.deepEqual(host.room.world.basketball.score, [2, 0]);
});

test('new players fill the smaller team after uneven departures, even if an earlier slot is empty', () => {
  const app = server(), host = app.connect();
  const players = [host, ...Array.from({ length: 7 }, () => app.connect(host.room.code))];
  const room = host.room;
  for (const i of [0, 1, 3, 5]) players[i].emit('close');
  assert.deepEqual(basketball.basketballRoster([...room.clients].map(c => c.side)), [3, 1]);
  const newcomer = app.connect(room.code);
  assert.equal(newcomer.side % 2, 1);
  assert.deepEqual(basketball.basketballRoster([...room.clients].map(c => c.side)), [3, 2]);
  for (let i = 0; i < 3; i++) app.connect(room.code);
  assert.deepEqual(basketball.basketballRoster([...room.clients].map(c => c.side)), [4, 4]);
  assert.ok(app.connect(room.code).messages.some(m => m.t === 'error'));
});

test('malformed messages do not crash or corrupt a room', () => {
  const app = server(), host = app.connect('', 'normal');
  for (const raw of ['null', '[]', '42', '{', '{"t":"input"}', '{"t":"input","x":{},"y":10}']) {
    assert.doesNotThrow(() => host.emit('message', raw));
  }
  const h = host.room.world.hands[0];
  assert.ok(Number.isFinite(h.tx) && Number.isFinite(h.ty));
  const ws = new EventEmitter();
  app.wss.emit('connection', ws);
  assert.doesNotThrow(() => ws.emit('message', '{"t":"join","room":42}'));
  assert.equal(ws.room, undefined);
});

test('restart discards queued events from the previous match', () => {
  const app = server(), host = app.connect();
  host.room.pending.push({ type: 'basketPoint', player: 0 });
  host.emit('message', '{"t":"restart"}');
  assert.equal(app.snapshot(host.room).ev.length, 0);
});


test('HTTP rejects malformed URLs and traversal into sibling directories', () => {
  const app = server();
  for (const [url, expected] of [['/%ZZ', 400], ['/%00', 400], ['/..%2fdist-pages/index.html', 403]]) {
    let status;
    const res = { writeHead: code => { status = code; }, end() {} };
    assert.doesNotThrow(() => app.server.request({ url }, res));
    assert.equal(status, expected);
  }
});

test('hoops rooms share baskets, cosmetics and mode with joining clients', () => {
  const app = server(), host = app.connect('', 'hoops');
  const guest = app.connect(host.room.code);
  const room = host.room;
  assert.equal(guest.messages.find(m => m.t === 'welcome').mode, 'hoops');
  assert.equal(room.world.paused, false);
  host.emit('message', JSON.stringify({ t: 'skin', i: 2 }));
  host.emit('message', JSON.stringify({ t: 'glove', i: 3 }));
  Object.assign(room.world.basketball.ball, {
    x: basketball.HOOPS.right, y: basketball.HOOPS.y - 1, vx: 0, vy: 300,
  });
  room.last -= 40;
  app.tickRoom(room);
  for (const ws of [host, guest]) {
    const snapshot = ws.messages.findLast(m => m.t === 'snap');
    const client = new Net();
    client.push(snapshot);
    const view = client.sample();
    assert.equal(view.basketball.kind, 'hoops');
    assert.equal(view.basketball.target, 10);
    assert.deepEqual(view.basketball.score, [2, 0]);
    assert.equal(view.skin, 2);
    assert.equal(view.hands.find(h => h.player === 0).glove, 3);
  }
  for (let i = 0; i < 6; i++) app.connect(room.code);
  assert.deepEqual(basketball.basketballRoster([...room.clients].map(c => c.side)), [4, 4]);
  assert.ok(app.connect(room.code).messages.some(m => m.t === 'error'));
});

test('basketball room bots fill seats, yield to people and return on departure', () => {
  const app = server(), host = app.connect('', 'hoops', { bots: true });
  const room = host.room;
  assert.equal(room.world.hands.length, 8);
  assert.equal(room.world.hands.filter(h => h.bot).length, 7);
  assert.equal(room.world.paused, false);
  const guest = app.connect(room.code);
  assert.equal(room.world.hands.length, 8);
  assert.equal(room.world.hands.find(h => h.player === guest.side).bot, undefined);
  room.last -= 40; app.tickRoom(room);
  const client = new Net(); client.push(host.messages.findLast(m => m.t === 'snap'));
  const hands = client.sample().hands;
  assert.equal(new Set(hands.map(h => h.player)).size, 8);
  assert.equal(hands.filter(h => h.bot).length, 6);
  guest.emit('close');
  assert.equal(room.world.hands.find(h => h.player === guest.side).bot, true);
  host.emit('close');
  assert.equal(app.rooms.size, 0);
});

test('spectators can watch full rooms but cannot change the match', () => {
  const app = server(), host = app.connect('', 'hoops');
  for (let i = 0; i < 7; i++) app.connect(host.room.code);
  const room = host.room, watch = app.connect(room.code, 'normal', { spectator: true });
  assert.equal(watch.messages.find(m => m.t === 'welcome').spectator, true);
  assert.equal(room.clients.size, 8);
  assert.equal(room.world.hands.length, 8);
  assert.equal(room.spectators.size, 1);
  const before = structuredClone(room.world);
  for (const t of ['input', 'restart', 'skin', 'glove', 'char', 'perks', 'wear', 'rage', 'medkit']) {
    watch.emit('message', JSON.stringify({ t, i: 4, x: 100, y: 100, m: 7 }));
  }
  assert.deepEqual(room.world, before);
  room.last -= 40; app.tickRoom(room);
  assert.ok(watch.messages.some(m => m.t === 'snap'));
  watch.emit('close');
  assert.equal(room.world.hands.length, 8);
  assert.equal(room.spectators.size, 0);
});

test('spectators cannot create a room or start a match by joining', () => {
  const app = server();
  const missing = app.connect('ABCD', 'hoops', { spectator: true });
  assert.ok(missing.messages.some(m => m.t === 'error'));
  assert.equal(app.rooms.size, 0);
  const host = app.connect();
  const watch = app.connect(host.room.code, 'normal', { spectator: true });
  assert.equal(host.room.world.paused, true);
  host.emit('close');
  assert.equal(watch.room.world.hands.length, 0);
  watch.emit('close');
  assert.equal(app.rooms.size, 0);
});

test('bots continue playing when the last player leaves a spectator watching', () => {
  const app = server(), host = app.connect('', 'hoops', { bots: true });
  const watch = app.connect(host.room.code, 'hoops', { spectator: true });
  host.emit('close');
  assert.equal(watch.room.world.hands.filter(h => h.bot).length, 8);
  assert.equal(watch.room.world.paused, false);
  watch.emit('close');
  assert.equal(app.rooms.size, 0);
});


test('football rooms replace bots with friends and synchronize goals and possession', () => {
  const app = server(), host = app.connect('', 'football', { bots: true });
  const room = host.room;
  assert.equal(room.world.mode, 'football');
  assert.equal(room.world.paused, false);
  assert.equal(room.world.hands.length, 8);
  const peer = app.connect(room.code, 'normal');
  assert.equal(peer.side, 1);
  assert.equal(room.world.hands.filter(h => h.bot).length, 6);
  const w = room.world, h = w.hands.find(h => h.id === host.handId);
  w.football.owner = h.id;
  host.emit('message', JSON.stringify({ t: 'input', x: h.x, y: h.y, aimX: h.x, aimY: 0, kick: true }));
  physics.step(w, 1 / 60);
  assert.ok(w.football.ball.vy < 0);
  for (const p of w.hands) p.active = false;
  w.football.owner = null;
  Object.assign(w.football.ball, { x: 1150, y: 420, vx: 800, vy: 0 });
  room.last -= 40;
  app.tickRoom(room);
  for (const ws of [host, peer]) {
    const snap = ws.messages.findLast(m => m.t === 'snap');
    assert.deepEqual(snap.ft.score, [1, 0]);
    const net = new Net(); net.push(snap);
    assert.equal(net.sample().mode, 'football');
    assert.deepEqual(net.sample().football.score, [1, 0]);
  }
  peer.emit('close');
  assert.equal(w.hands.filter(h => h.bot).length, 7);
  host.emit('message', JSON.stringify({ t: 'restart' }));
  assert.deepEqual(w.football.score, [0, 0]);
});

test('football rooms without bots wait for opponents; spectators cannot shoot', () => {
  const app = server(), host = app.connect('', 'football');
  assert.equal(host.room.world.paused, true);
  const watcher = app.connect(host.room.code, 'football', { spectator: true });
  watcher.emit('message', JSON.stringify({ t: 'input', x: 1000, y: 420, kick: true }));
  assert.equal(host.room.world.hands.length, 1);
  const peer = app.connect(host.room.code, 'football');
  assert.equal(host.room.world.paused, false);
  peer.emit('close');
  assert.equal(host.room.world.paused, true);
});

test('fighter endpoint uses its own authoritative rooms without touching ball-game rooms', () => {
  const app = server(), ball = app.connect();
  const a = app.connect('', 'fighter', { endpoint: '/fighter' });
  const welcome = a.messages.find(m => m.t === 'welcome');
  assert.equal(welcome.mode, 'fighter'); assert.equal(a.room, undefined);
  const b = app.connect(welcome.room, 'fighter', { endpoint: '/fighter' });
  assert.equal(b.fighterRoom, a.fighterRoom); assert.equal(b.side, 1);
  a.emit('message', JSON.stringify({ t: 'ready' })); b.emit('message', JSON.stringify({ t: 'ready' }));
  assert.equal(a.fighterRoom.playing, true);
  assert.equal(b.messages.findLast(m => m.t === 'fighter-snap').state.multiplayer, true);
  assert.equal(app.rooms.size, 1); assert.equal(ball.room.mode, 'basketball');
  a.emit('close'); b.emit('close');
});
