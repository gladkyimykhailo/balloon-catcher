#!/usr/bin/env node
// Піднімає гру і відкриває на неї публічне посилання через Cloudflare quick tunnel.
// Посилання тимчасове: воно живе, поки працює ця команда, і щоразу нове.
//
// Заразом ця ж адреса лягає на постійний сайт (гілка gh-pages, файл ws.json) —
// і тоді на github.io вмикаються кімнати в усіх трьох режимах: сторінка там
// статична й сервера не має, зате знає, куди стукати, поки цей комп'ютер
// увімкнений. Коли команду зупинити, файл прибирається, і сайт знову лишається
// одиночною грою. Без `gh` чи без доступу до репозиторію це просто не робиться —
// сам тунель від того не страждає.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'cloudflared');
// 0 просить ОС виділити вільний порт, не зачіпаючи вже запущені програми.
const PORT = process.env.PORT || '0';

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('Клієнт не зібрано. Спершу: npm run build');
  process.exit(1);
}
if (!fs.existsSync(bin)) {
  console.error(`Немає ${bin}. Завантаж один раз:
  mkdir -p bin && curl -fsSL -o bin/cloudflared \\
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x bin/cloudflared`);
  process.exit(1);
}

const kids = [];
const server = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  env: { ...process.env, PORT },
});
kids.push(server);

// Не створюємо публічне посилання на сервер, який ще не запустився.
const readyPort = await new Promise((resolve) => {
  const fail = () => {
    console.error('Сервер гри не запустився. Причина в повідомленні вище; публічне посилання не створено.');
    process.exit(1);
  };
  const onError = (error) => { console.error(error.message); fail(); };
  server.once('error', onError);
  server.once('exit', fail);
  server.once('message', (message) => {
    if (message?.type !== 'listening') return;
    server.removeListener('error', onError);
    server.removeListener('exit', fail);
    resolve(message.port);
  });
});

const tunnel = spawn(bin, ['tunnel', '--url', `http://localhost:${readyPort}`, '--no-autoupdate'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
kids.push(tunnel);

// -------------------------------------------------- адреса на постійному сайті

const slug = (() => {
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' });
  const m = (r.stdout || '').trim().replace(/\.git$/, '').match(/[:/]([^:/]+\/[^:/]+)$/);
  return m ? m[1] : null;
})();

const gh = (args) => spawnSync('gh', args, { cwd: root, encoding: 'utf8' });

/** sha файлу на гілці — Contents API без нього не дає ні переписати, ні стерти. */
function wsSha() {
  const r = gh(['api', `repos/${slug}/contents/ws.json?ref=gh-pages`, '--jq', '.sha']);
  return r.status === 0 ? r.stdout.trim() : null;
}

function publishWs(url) {
  if (!slug) return;
  // http(s) тунелю — це ws(s) для сокета: адреса та сама, схема інша.
  const ws = url.replace(/^http/, 'ws');
  const body = Buffer.from(JSON.stringify({ url: ws, ts: Date.now() }) + '\n').toString('base64');
  const sha = wsSha();
  const r = gh(['api', `repos/${slug}/contents/ws.json`, '-X', 'PUT',
    '-f', 'message=Кімнати: адреса тунелю', '-f', 'branch=gh-pages',
    '-f', `content=${body}`, ...(sha ? ['-f', `sha=${sha}`] : [])]);
  if (r.status === 0) {
    console.log('  Кімнати на постійному сайті вмикаються за хвилину — стільки збирається Pages.\n');
  } else {
    console.log(`  (кімнати на постійному сайті не ввімкнулись: ${(r.stderr || '').trim().split('\n')[0]})\n`);
  }
}

function unpublishWs() {
  if (!slug || !announced) return;
  const sha = wsSha();
  if (!sha) return;
  gh(['api', `repos/${slug}/contents/ws.json`, '-X', 'DELETE',
    '-f', 'message=Кімнати: сервер вимкнено', '-f', 'branch=gh-pages', '-f', `sha=${sha}`]);
}

let announced = false;
const scan = (chunk) => {
  // Quick Tunnel має згенероване ім'я зі слів через дефіс.
  // api.trycloudflare.com у тексті помилки — службова адреса, а не гра.
  const m = String(chunk).match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com\b/);
  if (!m || announced) return;
  announced = true;
  const url = m[0];
  console.log(`
  ╭──────────────────────────────────────────────────────────────╮
  │  Гра доступна за посиланням (Basketball — до 8 гравців):        │
  ╰──────────────────────────────────────────────────────────────╯

     ${url}

  Кидай його друзям. Кожен відкриває, тисне «Створити кімнату»
  або вводить код кімнати — і граєте разом.

  Посилання живе, поки працює ця команда. Ctrl+C — зупинити.
`);
  publishWs(url);
};
tunnel.stdout.on('data', scan);
tunnel.stderr.on('data', (chunk) => {
  // Не ховаємо помилки DNS/мережі: без них невдалий запуск виглядав як зависання.
  process.stderr.write(chunk);
  scan(chunk);   // cloudflared пише адресу саме в stderr
});

let leaving = false;
const bye = (code = 0) => {
  if (leaving) return;          // і SIGINT, і вихід дитини ведуть сюди — прибираємо раз
  leaving = true;
  unpublishWs();
  for (const k of kids) k.kill('SIGTERM');
  process.exit(code);
};
process.on('SIGINT', () => bye());
process.on('SIGTERM', () => bye());
for (const [i, k] of kids.entries()) {
  const name = i === 0 ? 'Сервер гри' : 'Публічний тунель';
  k.on('error', (error) => {
    console.error(`${name} не запустився: ${error.message}`);
    bye(1);
  });
  k.on('exit', (code, signal) => {
    if (leaving) return;
    console.error(`${name} зупинився (${signal || code}). Кімнати через це посилання недоступні.`);
    bye(code || 1);
  });
}
