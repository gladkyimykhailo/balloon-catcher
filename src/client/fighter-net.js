export function fighterSocketUrl(address) {
  const url = new URL(address); if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Потрібна адреса WebSocket-сервера.');
  url.pathname = '/fighter'; url.hash = ''; return url.href;
}
export class FighterNet {
  constructor(WebSocketClass = globalThis.WebSocket) {
    this.WebSocketClass = WebSocketClass; this.ws = null; this.side = 0; this.room = ''; this.state = null;
    this.packet = null; this.onStatus = () => {}; this.closing = false;
  }
  connect(address, room = '') {
    return new Promise((resolve, reject) => {
      const ws = new this.WebSocketClass(fighterSocketUrl(address)); this.ws = ws;
      let settled = false;
      const fail = message => { if (!settled) { settled = true; reject(new Error(message)); } else this.onStatus(message); clearTimeout(timer); this.close(); };
      const timer = setTimeout(() => fail('Сервер не відповів. Перевір підключення.'), 10000);
      ws.onopen = () => { if (!this.closing) ws.send(JSON.stringify({ t: 'join', room })); };
      ws.onmessage = event => {
        if (this.closing) return;
        let m; try { m = JSON.parse(event.data); } catch { return; }
        if (m.t === 'welcome') { settled = true; clearTimeout(timer); this.side = m.side; this.room = m.room; resolve(m); }
        else if (m.t === 'fighter-snap' && m.state?.kind === 'fighter') { this.packet = m; this.state = m.state; }
        else if (m.t === 'error') fail(m.msg || 'Помилка кімнати.');
      };
      ws.onerror = () => fail('Не вдалося під’єднатися до сервера.');
      ws.onclose = () => { clearTimeout(timer); if (!settled) { settled = true; reject(new Error('З’єднання закрито.')); } else if (!this.closing) this.onStatus('З’єднання втрачено. Під’єднайся знову.'); };
    });
  }
  send(packet) { if (!this.closing && this.ws?.readyState === 1) this.ws.send(JSON.stringify(packet)); }
  input(input) { this.send({ t: 'input', input }); }
  ready() { this.send({ t: 'ready' }); }
  pause(paused) { this.send({ t: 'pause', paused }); }
  close() { this.closing = true; this.ws?.close(); }
}
