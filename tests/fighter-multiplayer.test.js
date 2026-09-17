import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createFighterMatch, stepFighterMatch, fighterInput } from '../src/shared/fighter-multiplayer.js';
import { createFighterRooms } from '../server/fighter-rooms.js';
import { FighterNet, fighterSocketUrl } from '../src/client/fighter-net.js';

function server() {
  let time = 0, timer = 0; const cancelled = [];
  const app = createFighterRooms({ now: () => time, schedule: () => ++timer, cancel: id => cancelled.push(id) });
  app.connectClient = (room = '') => {
    const ws = new EventEmitter(); ws.readyState = 1; ws.messages = []; ws.send = raw => ws.messages.push(JSON.parse(raw));
    ws.message = m => ws.emit('message', JSON.stringify(m)); app.connect(ws); ws.message({ t: 'join', room }); return ws;
  };
  app.advance = seconds => { for (let i = 0; i < seconds / 0.02; i++) { time += 20; for (const room of app.rooms.values()) app.tick(room); } };
  app.cancelled = cancelled; return app;
}
const ready = (a, b) => { a.message({ t: 'ready' }); b.message({ t: 'ready' }); };

test('two humans control independent fighters and the bot stays disabled', () => {
  const s = createFighterMatch();
  stepFighterMatch(s, 0.04, [{ dx: 1 }, {}]); assert.ok(s.fighters[0].x > 260); assert.equal(s.fighters[1].x, 640);
  stepFighterMatch(s, 0.04, [{}, { dx: -1, jump: true }]); assert.ok(s.fighters[1].x < 640); assert.ok(s.fighters[1].vy < 0);
  const idle = createFighterMatch(); for (let i = 0; i < 100; i++) stepFighterMatch(idle, 0.04, []);
  assert.equal(idle.fighters[1].x, 640); assert.equal(idle.fighters[0].hp, 100);
  const fight = createFighterMatch(); fight.fighters[1].x = fight.fighters[0].x + 65;
  stepFighterMatch(fight, 0.02, [{ block: true }, { punch: true }]); assert.equal(fight.fighters[0].hp, 98);
  assert.equal(fight.fighters[1].hp, 100);
  assert.deepEqual(fighterInput({ dx: Infinity, jump: 'yes', block: true, punch: 3, kick: true, hp: 0 }), { dx: 0, jump: false, block: true, punch: false, kick: true, special: false });
});

test('either fighter can win two rounds and the final state freezes', () => {
  for (const winner of [0, 1]) {
    const s = createFighterMatch();
    s.fighters[1 - winner].hp = 0; stepFighterMatch(s, 0.02, []);
    assert.equal(s.over, false);
    for (let i = 0; i < 100; i++) stepFighterMatch(s, 0.02, []);
    s.fighters[1 - winner].hp = 0; stepFighterMatch(s, 0.02, []);
    assert.equal(s.winner, winner); assert.equal(s.over, true);
    const frozen = structuredClone(s); stepFighterMatch(s, 0.04, [{ punch: true }, { special: true }]); assert.deepEqual(s, frozen);
  }
});

test('rooms wait for two ready players, reject a third and reject unknown codes', () => {
  const app = server(), a = app.connectClient(), room = a.fighterRoom;
  assert.match(room.code, /^[A-Z2-9]{4}$/); assert.equal(a.side, 0);
  a.message({ t: 'ready' }); app.advance(1); assert.equal(room.state.time, 0);
  const b = app.connectClient(room.code); assert.equal(b.side, 1); assert.equal(room.playing, false);
  const extra = app.connectClient(room.code); assert.ok(extra.messages.some(m => m.t === 'error')); assert.equal(extra.fighterRoom, undefined);
  const missing = app.connectClient('0000'); assert.ok(missing.messages.some(m => m.t === 'error'));
  ready(a, b); app.advance(0.1); assert.ok(room.state.time > 0); assert.equal(room.playing, true);
  a.message({ t: 'ready' }); assert.ok(room.state.time > 0, 'ready cannot restart an active match');
});

test('authoritative rooms ignore spoofed state, expire held input, synchronize results and require both players for rematch', () => {
  const app = server(), a = app.connectClient(), room = a.fighterRoom, b = app.connectClient(room.code); ready(a, b);
  b.message({ t: 'input', side: 0, input: { dx: -100, hp: 0, winner: 1 } }); app.advance(0.2);
  assert.equal(room.state.fighters[0].x, 260); assert.ok(room.state.fighters[1].x < 640); assert.equal(room.state.fighters[0].hp, 100);
  app.advance(0.5); const x = room.state.fighters[1].x; app.advance(1); assert.equal(room.state.fighters[1].x, x);
  a.message({ t: 'state', state: { winner: 0, over: true } }); assert.equal(room.state.over, false);
  room.state.fighters[0].hp = 0; app.advance(2); room.state.fighters[0].hp = 0; app.advance(0.1);
  assert.equal(room.state.winner, 1); assert.equal(room.playing, false);
  const last = ws => ws.messages.findLast(m => m.t === 'fighter-snap'); assert.deepEqual(last(a), last(b));
  a.message({ t: 'ready' }); assert.equal(room.state.over, true); b.message({ t: 'ready' }); assert.equal(room.state.over, false); assert.equal(room.state.fighters[0].hp, 100);
});

test('pause is shared, disconnect requires fresh readiness and empty rooms release timers', () => {
  const app = server(), a = app.connectClient(), room = a.fighterRoom, b = app.connectClient(room.code); ready(a, b);
  a.message({ t: 'pause', paused: true }); const time = room.state.time;
  b.message({ t: 'pause', paused: true }); a.message({ t: 'pause', paused: false }); app.advance(1); assert.equal(room.state.time, time);
  b.message({ t: 'pause', paused: false }); app.advance(0.1); assert.ok(room.state.time > time);
  b.emit('close'); assert.equal(room.playing, false); const state = structuredClone(room.state); app.advance(1); assert.deepEqual(room.state, state);
  const c = app.connectClient(room.code); assert.equal(c.side, 1); assert.equal(room.playing, false); ready(a, c); assert.equal(room.playing, true);
  a.emit('close'); c.emit('close'); assert.equal(app.rooms.size, 0); assert.equal(app.cancelled.length, 1);
});

test('fighter client uses dedicated endpoint, receives state and closes without lingering connection state', async () => {
  class Socket {
    constructor(url) { this.url = url; this.readyState = 1; this.messages = []; }
    send(raw) { this.messages.push(JSON.parse(raw)); }
    close() { this.readyState = 3; this.onclose?.(); }
    receive(packet) { this.onmessage({ data: JSON.stringify(packet) }); }
  }
  assert.equal(fighterSocketUrl('wss://example.test/base?q=1'), 'wss://example.test/fighter?q=1');
  const client = new FighterNet(Socket), connection = client.connect('ws://example.test', 'ABCD'), ws = client.ws;
  ws.onopen(); assert.deepEqual(ws.messages[0], { t: 'join', room: 'ABCD' });
  ws.receive({ t: 'welcome', side: 1, room: 'ABCD' }); await connection;
  const state = createFighterMatch(); ws.receive({ t: 'fighter-snap', state, ready: [true, true] }); assert.equal(client.side, 1); assert.equal(client.state.kind, 'fighter');
  client.ready(); client.input({ dx: -1 }); client.pause(true); assert.equal(ws.messages.at(-1).t, 'pause');
  client.close(); const count = ws.messages.length; client.ready(); assert.equal(ws.messages.length, count);
  const denied = new FighterNet(Socket), promise = denied.connect('ws://example.test'); denied.ws.receive({ t: 'error', msg: 'Повна кімната' });
  await assert.rejects(promise, /Повна кімната/); assert.equal(denied.ws.readyState, 3);
});
