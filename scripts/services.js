#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const names = ['shelter-games.service', 'shelter-games-dev.service'];
const action = process.argv[2] || 'status';
function run(command, args, quiet = false) {
  const result = spawnSync(command, args, { cwd: root, stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
// systemd expands percent specifiers even in quoted values.
const quote = value => '"' + value.replace(/%/g, '%%').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
function unit(description, args, environment = '') {
  return `[Unit]
Description=${description}
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=${root.replace(/%/g, '%%')}
ExecStart=${[process.execPath, ...args].map(quote).join(' ')}
${environment}Restart=always
RestartSec=5
TimeoutStopSec=15

[Install]
WantedBy=default.target
`;
}

if (action === 'install') {
  // Check access before writing configuration or building.
  run('systemctl', ['--user', 'list-units', '--quiet', '--no-pager'], true);
  run('npm', ['run', 'build']);
  const directory = path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'systemd/user');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, names[0]), unit('Shelter Games server', [path.join(root, 'server/index.js')], 'Environment=PORT=8090\nEnvironment=NODE_ENV=production\n'));
  writeFileSync(path.join(directory, names[1]), unit('Shelter Games development server', [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '0.0.0.0', '--port', '5173', '--strictPort']));
  run('systemctl', ['--user', 'daemon-reload']);
  run('systemctl', ['--user', 'enable', ...names]);
  run('systemctl', ['--user', 'restart', ...names]);
  console.log('Автозапуск після входу ввімкнено. Для запуску ще до входу: loginctl enable-linger');
  run('systemctl', ['--user', 'status', '--no-pager', ...names]);
} else if (action === 'logs') {
  run('journalctl', ['--user', '-u', names[0], '-u', names[1], '-n', '100', '-f']);
} else if (action === 'stop') {
  run('systemctl', ['--user', 'disable', '--now', ...names]);
} else if (action === 'restart' || action === 'status') {
  run('systemctl', ['--user', action, '--no-pager', ...names]);
} else {
  console.error('Використання: node scripts/services.js install|status|restart|logs|stop');
  process.exit(1);
}
