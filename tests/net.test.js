import test from 'node:test';
import assert from 'node:assert/strict';
import { Net } from '../src/client/net.js';

test('a server that never sends welcome times out instead of hanging reconnect', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  class Socket { close() { this.closed = true; this.onclose?.(); } }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  Object.defineProperty(globalThis, 'WebSocket', { value: Socket, configurable: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'WebSocket', descriptor);
    else delete globalThis.WebSocket;
  });
  const net = new Net();
  const pending = assert.rejects(net.connect('ws://localhost'), /вчасно/);
  t.mock.timers.tick(10000);
  await pending;
  assert.equal(net.ws.closed, true);
});

test('welcome clears the connection timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  class Socket { close() { this.closed = true; this.onclose?.(); } }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  Object.defineProperty(globalThis, 'WebSocket', { value: Socket, configurable: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'WebSocket', descriptor);
    else delete globalThis.WebSocket;
  });
  const net = new Net();
  const pending = net.connect('ws://localhost');
  net.ws.onmessage({ data: JSON.stringify({ t: 'welcome', side: 0, room: 'ABCD', maxLives: 3 }) });
  await pending;
  t.mock.timers.tick(10000);
  assert.equal(net.ws.closed, undefined);
});

test('spectator handshake preserves role and suppresses gameplay messages', async t => {
  class Socket { sent = []; send(raw) { this.sent.push(JSON.parse(raw)); } close() {} readyState = 1; }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  Object.defineProperty(globalThis, 'WebSocket', { value: Socket, configurable: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'WebSocket', descriptor);
    else delete globalThis.WebSocket;
  });
  const net = new Net();
  const pending = net.connect('ws://localhost', 'ABCD', 'hoops', { spectator: true });
  net.ws.onopen();
  assert.equal(net.ws.sent[0].spectator, true);
  net.ws.onmessage({ data: JSON.stringify({ t: 'welcome', side: -1, spectator: true, room: 'ABCD', mode: 'hoops', maxLives: 3 }) });
  await pending;
  net.sendInput(300, 300); net.restart(); net.setSkin(3); net.setGlove(2); net.medkit(); net.wear(); net.rage();
  assert.equal(net.ws.sent.length, 1);
});
