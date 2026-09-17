import { createFighterMatch, stepFighterMatch, fighterInput } from '../src/shared/fighter-multiplayer.js';

export function createFighterRooms({ now = Date.now, schedule = setInterval, cancel = clearInterval, random = Math.random } = {}) {
  const rooms = new Map();
  const send = (ws, packet) => { if (ws.readyState === 1) ws.send(JSON.stringify(packet)); };
  function snapshot(room) {
    return { t: 'fighter-snap', state: room.state, room: room.code, ready: room.ready,
      waiting: room.clients.size < 2, paused: room.paused.some(Boolean), playing: room.playing, sides: [...room.clients].map(c => c.side) };
  }
  const broadcast = room => { const packet = snapshot(room); for (const ws of room.clients) send(ws, packet); };
  function tick(room) {
    const time = now(), dt = Math.min(0.1, Math.max(0, (time - room.last) / 1000)); room.last = time;
    if (room.playing && room.clients.size === 2 && !room.paused.some(Boolean) && !room.state.over) {
      room.acc += dt;
      while (room.acc >= 1 / 60) {
        const inputs = [0, 1].map(side => time - room.inputTime[side] <= 500 ? room.inputs[side] : fighterInput());
        stepFighterMatch(room.state, 1 / 60, inputs);
        for (const input of room.inputs) input.punch = input.kick = input.special = false;
        room.acc -= 1 / 60;
      }
    } else room.acc = 0;
    if (room.state.over && room.playing) { room.playing = false; room.ready = [false, false]; }
    room.sendAcc += dt;
    if (room.sendAcc >= 1 / 30) { room.sendAcc = 0; broadcast(room); }
  }
  function code() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let value;
    do { value = Array.from({ length: 4 }, () => alphabet[Math.floor(random() * alphabet.length)]).join(''); } while (rooms.has(value));
    return value;
  }
  function join(ws, message) {
    if (ws.fighterRoom) return;
    if (message.room != null && typeof message.room !== 'string') return;
    const requested = (message.room || '').trim().toUpperCase();
    if (requested && !/^[A-Z0-9]{4}$/.test(requested)) { send(ws, { t: 'error', msg: 'Код має містити 4 літери або цифри.' }); return; }
    let room = rooms.get(requested);
    if (requested && !room) { send(ws, { t: 'error', msg: 'Кімнату не знайдено.' }); return; }
    if (!room) {
      room = { code: code(), clients: new Set(), state: createFighterMatch(), ready: [false, false], paused: [false, false],
        inputs: [fighterInput(), fighterInput()], inputTime: [0, 0], playing: false, last: now(), acc: 0, sendAcc: 0 };
      rooms.set(room.code, room); room.timer = schedule(() => tick(room), 1000 / 60);
    }
    if (room.clients.size === 2) { send(ws, { t: 'error', msg: 'У двобої вже є два гравці.' }); return; }
    ws.side = [...room.clients].some(c => c.side === 0) ? 1 : 0; ws.fighterRoom = room; room.clients.add(ws);
    room.ready = [false, false]; room.paused = [false, false]; room.playing = false;
    send(ws, { t: 'welcome', room: room.code, side: ws.side, mode: 'fighter' }); broadcast(room);
  }
  function connect(ws) {
    ws.on('message', raw => {
      if (raw.length > 4096) return;
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object' || Array.isArray(m)) return;
      if (m.t === 'join') { join(ws, m); return; }
      const room = ws.fighterRoom; if (!room) return;
      if (m.t === 'input' && room.playing && !room.paused.some(Boolean) && !room.state.over) {
        const input = fighterInput(m.input), old = room.inputs[ws.side];
        for (const action of ['punch', 'kick', 'special']) input[action] ||= old[action];
        room.inputs[ws.side] = input; room.inputTime[ws.side] = now();
      } else if (m.t === 'ready' && !room.playing) {
        room.ready[ws.side] = true;
        if (room.clients.size === 2 && room.ready.every(Boolean)) {
          room.state = createFighterMatch(); room.playing = true; room.paused = [false, false]; room.inputs = [fighterInput(), fighterInput()]; room.last = now(); room.acc = 0;
        }
        broadcast(room);
      } else if (m.t === 'pause' && room.playing && typeof m.paused === 'boolean') {
        room.paused[ws.side] = m.paused; room.inputs = [fighterInput(), fighterInput()]; broadcast(room);
      }
    });
    ws.on('close', () => {
      const room = ws.fighterRoom; if (!room) return;
      room.clients.delete(ws); ws.fighterRoom = null; room.playing = false; room.ready = [false, false]; room.inputs = [fighterInput(), fighterInput()]; room.paused = [false, false];
      if (!room.clients.size) { cancel(room.timer); rooms.delete(room.code); } else broadcast(room);
    });
  }
  return { connect, rooms, tick, snapshot };
}
