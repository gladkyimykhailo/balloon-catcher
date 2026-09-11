#!/usr/bin/env node
// Викладає зібрану гру на GitHub Pages: вміст dist-pages стає гілкою gh-pages.
//
// Гілка щоразу переписується з нуля (окремий репозиторій усередині dist-pages
// і push --force), бо в ній немає нічого, крім останньої збірки: історія збірок
// нікому не потрібна, а так вона не тягне за собою старі файли.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-pages');
const BRANCH = 'gh-pages';

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`Впало: ${cmd} ${args.join(' ')}`); process.exit(1); }
};
const out_of = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8' }).stdout.trim();

if (!fs.existsSync(path.join(out, 'index.html'))) {
  console.error('Немає dist-pages. Спершу: npm run build:pages');
  process.exit(1);
}

const origin = out_of('git', ['remote', 'get-url', 'origin'], root);
if (!origin) { console.error('У репозиторія немає origin — нікуди викладати.'); process.exit(1); }

// .nojekyll — інакше Pages ховає теки, що починаються з підкреслення.
fs.writeFileSync(path.join(out, '.nojekyll'), '');

// ws.json кладе туди `npm run share` — це адреса сервера кімнат, і вона не має
// стосунку до збірки. Гілка переписується форсом, тож переносимо файл руками:
// інакше викладка посеред спільної гри мовчки вимикала б кімнати на сайті.
const keep = spawnSync('gh', ['api', 'repos/' + origin.replace(/\.git$/, '').split(/[:/]/).slice(-2).join('/') + '/contents/ws.json?ref=' + BRANCH, '--jq', '.content'], { encoding: 'utf8' });
if (keep.status === 0 && keep.stdout.trim()) {
  fs.writeFileSync(path.join(out, 'ws.json'), Buffer.from(keep.stdout.trim(), 'base64'));
  console.log('Адресу сервера кімнат (ws.json) збережено.');
}

fs.rmSync(path.join(out, '.git'), { recursive: true, force: true });
run('git', ['init', '-q', '-b', BRANCH], out);
run('git', ['add', '-A'], out);
run('git', ['commit', '-qm', `Збірка ${new Date().toISOString()}`], out);
run('git', ['push', '-qf', origin, `${BRANCH}:${BRANCH}`], out);
fs.rmSync(path.join(out, '.git'), { recursive: true, force: true });

const slug = origin.replace(/\.git$/, '').split(/[:/]/).slice(-2);
console.log(`\nВикладено в гілку ${BRANCH}. Сторінка: https://${slug[0]}.github.io/${slug[1]}/`);
