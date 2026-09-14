import WebSocket from 'ws';
import fs from 'node:fs';

const CDP = 'http://localhost:9224';
const SITE = 'https://gladkyimykhailo.github.io/balloon-catcher/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(url) {
  const r = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res) => ws.on('open', res));
  let id = 0; const waiting = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const closeTarget = async () => { await fetch(`${CDP}/json/close/${t.id}`); ws.close(); };
  return { send, evalJs, closeTarget };
}

const ROOMS = [
  { code: 'GAME', mode: 'normal',   link: SITE + '?room=GAME' },
  { code: 'HARD', mode: 'hardcore', link: SITE + '?room=HARD&mode=hardcore' },
  { code: 'TEAM', mode: 'team',     link: SITE + '?room=TEAM&mode=team' },
];

let shot = 0;
for (const r of ROOMS) {
  console.log(`\n─── ${r.code} (${r.mode}) ───`);
  const A = await newPage(r.link);
  await sleep(7000);
  console.log('  A: код =', await A.evalJs(`document.querySelector('#room-code').textContent`),
              '| меню сховано =', await A.evalJs(`document.querySelector('#menu').hidden`));
  console.log('  A: підпис =', (await A.evalJs(`document.querySelector('#tip').textContent`) || '').slice(0, 90));

  const B = await newPage(r.link);
  await sleep(7000);
  console.log('  B: код =', await B.evalJs(`document.querySelector('#room-code').textContent`));
  console.log('  B: note про режим =', JSON.stringify(await B.evalJs(`document.querySelector('#note').textContent`)));
  await sleep(2500);
  console.log('  A: peer-info =', await A.evalJs(`document.querySelector('#peer-info').textContent`));
  console.log('  A: гра йде (стан) =', await A.evalJs(`(game => game)(window.__dbg ?? 'n/a')`) ?? 'n/a');
  // режим світу з боку клієнта видно по снапшоту: питаємо у сервера через сам снапшот
  console.log('  A: посилання з кнопки «Копіювати» =',
    await A.evalJs(`document.querySelector('#btn-copy') && (location.origin + location.pathname + '?room=' + document.querySelector('#room-code').textContent)`));

  const png = (await A.send('Page.captureScreenshot', { format: 'png' })).result.data;
  fs.writeFileSync(`${process.argv[2]}/room-${r.code}.png`, Buffer.from(png, 'base64'));
  await A.closeTarget(); await B.closeTarget();
  await sleep(1200);
  shot++;
}
console.log('\nскріншотів:', shot);
process.exit(0);
