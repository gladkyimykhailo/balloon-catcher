// Клієнт мультиплеєра: надсилає позицію своєї долоні і згладжує снапшоти сервера.
//
// Малюємо не останній отриманий стан, а стан на INTERP мс у минулому — тоді
// між двома снапшотами завжди є пара, яку можна інтерполювати, і кулька рухається
// плавно навіть при джитері мережі.

const INTERP = 90;

export class Net {
  constructor() {
    this.ws = null;
    this.buf = [];
    this.side = 0;
    this.room = '';
    this.peers = 1;
    this.maxLives = 3;
    this.maxPlayers = 4;
    this.offset = null;       // різниця годинників клієнта і сервера
    this.onEvent = () => {};
    this.onStatus = () => {};
    this.onError = () => {};
  }

  connect(url, room) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;

      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', room: room || '' }));

      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'welcome') {
          this.side = m.side;
          this.room = m.room;
          this.maxLives = m.maxLives;
          this.maxPlayers = m.maxPlayers ?? 4;
          settled = true;
          resolve(m);
        } else if (m.t === 'snap') {
          this.push(m);
        } else if (m.t === 'peers') {
          this.peers = m.n;
          this.onStatus(m);
        } else if (m.t === 'restarted') {
          this.buf.length = 0;
        } else if (m.t === 'error') {
          this.onError(m.msg);
          if (!settled) { settled = true; reject(new Error(m.msg)); }
          ws.close();
        }
      };

      ws.onerror = () => { if (!settled) { settled = true; reject(new Error("Не вдалося під'єднатися до сервера")); } };
      ws.onclose = () => {
        if (!settled) { settled = true; reject(new Error("З'єднання закрито")); }
        else this.onStatus({ t: 'closed' });
      };
    });
  }

  push(snap) {
    // Прив'язуємось до годинника сервера один раз, далі тримаємо ту саму дельту.
    if (this.offset === null) this.offset = Date.now() - snap.ts;
    snap.local = snap.ts + this.offset;
    this.buf.push(snap);
    if (this.buf.length > 24) this.buf.shift();
    for (const e of snap.ev) this.onEvent({ type: e[0], x: e[1], y: e[2], player: e[3], power: e[4], level: e[5], spikes: !!e[6], healed: !!e[7] });
  }

  sendInput(x, y) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ t: 'input', x: Math.round(x), y: Math.round(y) }));
    }
  }

  restart() {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'restart' }));
  }

  /** Аптечку витрачає сервер — він один знає, скільки зарядів лишилось. */
  medkit() {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'medkit' }));
  }

  /** Скін кульки спільний на кімнату: діє вибір того, хто обрав останнім. */
  setSkin(i) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'skin', i }));
  }

  /** Перчатка, навпаки, особиста — сервер міняє тільки твою долоню. */
  setGlove(i) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'glove', i }));
  }

  rage() {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'rage' }));
  }

  close() { this.ws?.close(); }

  /** Стан світу для рендера: інтерпольований між двома снапшотами. */
  sample() {
    const n = this.buf.length;
    if (!n) return null;
    const t = Date.now() - INTERP;

    let a = this.buf[0];
    let b = this.buf[n - 1];
    for (let i = 0; i < n - 1; i++) {
      if (this.buf[i].local <= t && this.buf[i + 1].local >= t) { a = this.buf[i]; b = this.buf[i + 1]; break; }
    }
    if (t >= this.buf[n - 1].local) { a = b = this.buf[n - 1]; }

    const span = b.local - a.local;
    const k = span > 0 ? Math.max(0, Math.min(1, (t - a.local) / span)) : 1;

    const points = [];
    const len = Math.min(a.p.length, b.p.length);
    for (let i = 0; i < len; i += 2) {
      points.push({ x: a.p[i] + (b.p[i] - a.p[i]) * k, y: a.p[i + 1] + (b.p[i + 1] - a.p[i + 1]) * k });
    }

    const hands = b.h.map((hb) => {
      const ha = a.h.find((x) => x[0] === hb[0]) || hb;
      return {
        id: hb[0], player: Number(String(hb[0]).slice(1)) || 0,
        x: ha[1] + (hb[1] - ha[1]) * k, y: ha[2] + (hb[2] - ha[2]) * k,
        flash: hb[3], slow: hb[4] ?? 0,
        glove: hb[5] ?? 0, rage: hb[6] ?? 0, rages: hb[7] ?? 0, dirty: hb[8] === 1,
      };
    });

    // Чайку інтерполюємо лише коли вона є в обох снапшотах, інакше беремо як є.
    let gull = null;
    if (b.g) {
      gull = a.g
        ? { x: a.g[0] + (b.g[0] - a.g[0]) * k, y: a.g[1] + (b.g[1] - a.g[1]) * k, dir: b.g[2], flap: b.g[3] }
        : { x: b.g[0], y: b.g[1], dir: b.g[2], flap: b.g[3] };
    }

    // Шипи летять швидко (760 px/с), тож між снапшотами їх обов'язково
    // інтерполюємо — і саме за id, бо індекси в масиві зсуваються.
    const spikes = (b.sp ?? []).map((sb) => {
      const sa = (a.sp ?? []).find((x) => x[0] === sb[0]);
      return {
        id: sb[0],
        x: sa ? sa[1] + (sb[1] - sa[1]) * k : sb[1],
        y: sa ? sa[2] + (sb[2] - sa[2]) * k : sb[2],
        flying: sb[3] === 1,
        dead: sb[4] === 1,
      };
    });

    // Купки летять швидко, тож інтерполюємо їх так само, як шипи — за id.
    const poops = (b.pp ?? []).map((pb) => {
      const pa = (a.pp ?? []).find((x) => x[0] === pb[0]);
      return {
        id: pb[0],
        x: pa ? pa[1] + (pb[1] - pa[1]) * k : pb[1],
        y: pa ? pa[2] + (pb[2] - pa[2]) * k : pb[2],
      };
    });

    return {
      points, hands, gull, spikes, poops,
      deflate: b.df ?? 0, spikesOn: !!b.so,
      score: b.sc, lives: b.lv, state: b.st,
      medkits: b.mk ?? 0, skin: b.sk ?? 0,
    };
  }
}

export function defaultServerUrl() {
  const q = new URLSearchParams(location.search).get('ws');
  if (q) return q;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  // У режимі `vite dev` сторінка на 5173, а сервер гри — на 8090.
  if (import.meta.env.DEV) return `${proto}//${location.hostname}:8090`;
  return `${proto}//${location.host}`;
}
