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
    this.spectator = false;
    this.room = '';
    this.peers = 1;
    this.sides = [];
    this.maxLives = 3;
    this.maxPlayers = 4;
    this.mode = 'normal';     // режим кімнати; його вирішує сервер, а не клієнт
    this.hardcore = false;
    this.closing = false;     // чи ми самі закрили сокет (див. onStatus 'closed')
    this.offset = null;       // різниця годинників клієнта і сервера
    this.onEvent = () => {};
    this.onStatus = () => {};
    this.onError = () => {};
  }

  /**
   * `mode` — це лише побажання на випадок, коли кімната створюється зараз.
   * Якщо кімната вже існує, діє ЇЇ режим: два гравці в одній кімнаті не можуть
   * грати в різні ігри, бо світ у них один. Сервер відповість, що вийшло.
   */
  connect(url, room, mode = 'normal', { spectator = false, bots = false } = {}) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.closing = true;
        ws.close();
        reject(new Error('Сервер не відповів вчасно'));
      }, 10000);

      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', room: room || '', mode, spectator, bots }));

      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'welcome') {
          this.side = m.side;
          this.spectator = m.spectator === true;
          this.sides = m.sides ?? [m.side];
          this.peers = this.sides.length;
          this.room = m.room;
          this.maxLives = m.maxLives;
          this.maxPlayers = m.maxPlayers ?? 4;
          this.mode = m.mode || (m.hc ? 'hardcore' : 'normal');
          this.hardcore = this.mode === 'hardcore';
          clearTimeout(timeout);
          settled = true;
          resolve(m);
        } else if (m.t === 'snap') {
          this.push(m);
        } else if (m.t === 'peers') {
          this.peers = m.n;
          this.sides = m.sides ?? this.sides;
          this.onStatus(m);
        } else if (m.t === 'restarted') {
          this.buf.length = 0;
        } else if (m.t === 'error') {
          clearTimeout(timeout);
          this.onError(m.msg);
          // `fromServer` відрізняє «сервер відповів і відмовив» (кімната повна)
          // від «сервера взагалі нема»: порада «запусти сервер» доречна лише в
          // другому випадку.
          if (!settled) { settled = true; reject(Object.assign(new Error(m.msg), { fromServer: true })); }
          this.closing = true;
          ws.close();
        }
      };

      ws.onerror = () => { clearTimeout(timeout); if (!settled) { settled = true; reject(new Error("Не вдалося під'єднатися до сервера")); } };
      ws.onclose = () => {
        clearTimeout(timeout);
        if (!settled) { settled = true; reject(new Error("З'єднання закрито")); }
        // `clean` — це «ми пішли самі» (меню, нова кімната): такий обрив не
        // треба лікувати перепід'єднанням.
        else this.onStatus({ t: 'closed', clean: this.closing });
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
    if (!this.spectator && this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ t: 'input', x: Math.round(x), y: Math.round(y) }));
    }
  }

  restart() {
    if (!this.spectator && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'restart' }));
  }

  /** Аптечку витрачає сервер — він один знає, скільки зарядів лишилось. */
  medkit() {
    if (!this.spectator && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'medkit' }));
  }

  /** Скін кульки спільний на кімнату: діє вибір того, хто обрав останнім. */
  setSkin(i) {
    if (!this.spectator && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'skin', i }));
  }

  /** Перчатка, навпаки, особиста — сервер міняє тільки твою долоню. */
  setGlove(i) {
    if (!this.spectator && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'glove', i }));
  }

  /** Хардкор-персонаж — річ особиста, як і перчатка. */
  setChar(i) {
    if (!this.spectator && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'char', i }));
  }

  /** Перки тім-апа: купує кожен собі, але два з трьох діють на всю команду. */
  setPerks(mask) {
    if (!this.spectator && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'perks', m: mask }));
  }

  /** Вдягнути рукавичку від газу — сервер вдягне її саме твоєму персонажу. */
  wear() {
    if (!this.spectator && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'wear' }));
  }

  rage() {
    if (!this.spectator && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'rage' }));
  }

  close() { this.closing = true; this.ws?.close(); }

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

    if (b.bk && (a.bk?.round !== b.bk.round || a.st !== b.st)) a = b;
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
        id: hb[0], player: hb[19] ?? (Number(String(hb[0]).slice(1)) || 0), bot: hb[20] === 1,
        x: ha[1] + (hb[1] - ha[1]) * k, y: ha[2] + (hb[2] - ha[2]) * k,
        flash: hb[3], slow: hb[4] ?? 0,
        glove: hb[5] ?? 0, rage: hb[6] ?? 0, rages: hb[7] ?? 0, dirty: hb[8] === 1,
        char: hb[9] ?? 0,
        // Тім-ап: усе особисте. `locked` рахує сервер — правило черги живе там,
        // і клієнту не треба знати, хто ще може бити.
        lives: hb[10] ?? 0, out: hb[11] === 1, web: hb[12] ?? 0,
        shield: hb[13] ?? 0, locked: hb[14] === 1, maxLives: hb[15] ?? 3,
        gloveOn: hb[16] ?? 0, gloves: hb[17] ?? 0, shell: hb[18] ?? 0,
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

    // Камінці падають ще швидше за шипи, тож інтерполюємо їх так само за id.
    // Кут обертання не інтерполюємо: камінь крутиться і так, а стрибок на
    // кадрі між снапшотами на око не читається.
    const stones = (b.sn ?? []).map((sb) => {
      const sa = (a.sn ?? []).find((x) => x[0] === sb[0]);
      return {
        id: sb[0],
        x: sa ? sa[1] + (sb[1] - sa[1]) * k : sb[1],
        y: sa ? sa[2] + (sb[2] - sa[2]) * k : sb[2],
        flying: sb[3] === 1,
        dead: sb[4] === 1,
        spin: sb[5] / 100,
      };
    });

    // Пастки стоять на місці, тож їх не інтерполюємо — везеться лише те, що
    // міняється: залишок життя (по ньому пастка блимає перед зникненням).
    const traps = (b.tp ?? []).map((t) => ({ id: t[0], x: t[1], y: t[2], type: t[3] ? 'web' : 'tar', life: t[4] / 10 }));

    // Їжачки бігають і стрибають швидко, тож інтерполюємо їх за id, як шипи.
    const hogs = (b.hg ?? []).map((hb) => {
      const ha = (a.hg ?? []).find((x) => x[0] === hb[0]);
      return {
        id: hb[0],
        x: ha ? ha[1] + (hb[1] - ha[1]) * k : hb[1],
        y: ha ? ha[2] + (hb[2] - ha[2]) * k : hb[2],
        dir: hb[3], spin: hb[4] / 100, phase: ['run', 'jump', 'leave'][hb[5]] ?? 'run',
      };
    });

    // Скунси бігають по підлозі, тож везеться лише x; хмара газу стоїть на місці.
    const skunks = (b.sk ?? []).map((sb) => {
      const sa = (a.sk ?? []).find((x) => x[0] === sb[0]);
      return {
        id: sb[0],
        x: sa ? sa[1] + (sb[1] - sa[1]) * k : sb[1],
        dir: sb[2], phase: ['run', 'hiss', 'leave'][sb[3]] ?? 'run',
      };
    });
    const gas = (b.gz ?? []).map((g) => ({ id: g[0], x: g[1], life: g[2] / 10 }));

    return {
      points, hands, gull, spikes, poops, stones, traps, hogs, skunks, gas,
      basketball: b.bk ?? null,
      deflate: b.df ?? 0,
      mode: b.md || 'normal', hardcore: b.md === 'hardcore', team: b.md === 'team',
      combo: b.cb ?? 0, buff: { speed: (b.bf?.[0] ?? 0) / 10, size: (b.bf?.[1] ?? 0) / 10 },
      score: b.sc, lives: b.lv, state: b.st,
      medkits: b.mk ?? 0, skin: b.si ?? 0,
    };
  }
}

/**
 * Адреса, знайдена вже під час роботи (див. `findSharedServer` у main.js):
 * статичний сайт не має власного сервера, але `npm run share` лишає поруч зі
 * сторінкою файл ws.json з адресою тунелю. Вона живіша за вбудовану, тож б'є її.
 */
let shared = null;
export function setServerUrl(url) { shared = url; }

export function defaultServerUrl() {
  const q = new URLSearchParams(location.search).get('ws');
  if (q) return q;
  if (shared) return shared;
  // Статична збірка (GitHub Pages) сама нічого не слухає, тож адресу сервера
  // кімнат вона отримує при збірці: VITE_WS_URL=wss://… npm run deploy:pages.
  // Без неї онлайн у такій збірці взагалі не показується (клас `no-online`).
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  // У режимі `vite dev` сторінка на 5173, а сервер гри — на 8090.
  if (import.meta.env.DEV) return `${proto}//${location.hostname}:8090`;
  return `${proto}//${location.host}`;
}
