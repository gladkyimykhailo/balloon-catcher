import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as physics from '../src/shared/physics.js';
import * as constants from '../src/shared/constants.js';
import * as basketball from '../src/shared/basketball.js';
import { Net } from '../src/client/net.js';

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
    ...physics, ...constants, ...basketball, fs, path, fileURLToPath, WebSocketServer,
    http: { createServer: handler => { httpServer.request = handler; return httpServer; } }, URL, console,
    process: { env: {}, exit: code => { throw Error('Unexpected exit ' + code); } },
    setInterval: () => 1, clearInterval: () => {},
  });
  app.connect = (room = '', mode = 'basketball') => {
    const ws = new EventEmitter();
    ws.readyState = 1; ws.messages = [];
    ws.send = text => ws.messages.push(JSON.parse(text));
    app.wss.emit('connection', ws);
    ws.emit('message', JSON.stringify({ t: 'join', room, mode }));
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
