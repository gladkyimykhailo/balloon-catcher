import { MAX_ARCADE_LEVEL } from '../../shared/arcade-levels.js';
export function showVariants(group, open) {
  const previousFocus = document.activeElement, dialog = document.createElement('dialog'); dialog.className = 'arcade-variants-dialog';
  dialog.setAttribute('aria-label', `Варіанти: ${group.name}`);
  const heading = document.createElement('h2'); heading.textContent = group.name;
  const close = document.createElement('button'); close.textContent = '← Назад'; close.className = 'ghost'; close.onclick = () => dialog.close();
  const summary = document.createElement('p'); summary.textContent = `${group.variants.length} варіантів · ${MAX_ARCADE_LEVEL} рівнів у кожному`;
  const list = document.createElement('div'); list.className = 'stack';
  function choice(id, label, note, mode) {
    const button = document.createElement('button'); button.className = `menu-btn blue${mode === 'online' ? ' online-block' : ''}`;
    const title = document.createElement('b'); title.textContent = label;
    const help = document.createElement('i'); help.textContent = note; button.append(title, help);
    button.onclick = () => { dialog.close(); open(id, mode); }; list.append(button);
  }
  if (group.id === 'fighter') {
    choice('fighter', '👥 Двоє на одному пристрої', 'WASD + F/G/H та стрілки + J/K/L', 'local');
    choice('fighter', '🌐 Онлайн-двобій', 'Створити кімнату або приєднатися за кодом', 'online');
  }
  for (const [id, info] of group.variants) choice(id, group.id === 'fighter' ? '🤖 Проти бота' : info.name, info.help);
  dialog.append(close, heading, summary, list); document.body.append(dialog);
  dialog.addEventListener('close', () => { dialog.remove(); previousFocus?.focus(); }, { once: true });
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  dialog.showModal(); close.focus(); return dialog;
}
