#!/usr/bin/env node
// Піднімає гру і відкриває на неї публічне посилання через Cloudflare quick tunnel.
// Посилання тимчасове: воно живе, поки працює ця команда, і щоразу нове.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'cloudflared');
const PORT = process.env.PORT || 8090;

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
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, PORT },
});
kids.push(server);

const tunnel = spawn(bin, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
kids.push(tunnel);

let announced = false;
const scan = (chunk) => {
  const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m || announced) return;
  announced = true;
  const url = m[0];
  console.log(`
  ╭──────────────────────────────────────────────────────────────╮
  │  Гра доступна за посиланням (до 4 гравців у кімнаті):        │
  ╰──────────────────────────────────────────────────────────────╯

     ${url}

  Кидай його друзям. Кожен відкриває, тисне «Створити кімнату»
  або вводить код кімнати — і граєте разом.

  Посилання живе, поки працює ця команда. Ctrl+C — зупинити.
`);
};
tunnel.stdout.on('data', scan);
tunnel.stderr.on('data', scan);   // cloudflared пише адресу саме в stderr

const bye = () => { for (const k of kids) k.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
for (const k of kids) k.on('exit', bye);
