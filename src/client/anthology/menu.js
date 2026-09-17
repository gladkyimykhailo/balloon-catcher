import { ARCADE_GAMES } from '../../shared/arcade.js';
import { CATEGORIES, MECHANICS } from '../../shared/anthology/catalog.js';
import { catalogGroups } from '../../shared/anthology/groups.js';
import { showVariants } from './variants.js';
import { MAX_ARCADE_LEVEL } from '../../shared/arcade-levels.js';

export function openArcadeOptions(kind, open) {
  const group = catalogGroups(ARCADE_GAMES).find(g => g.id === kind || g.variants.some(([id]) => id === kind));
  if(group)showVariants(group,open);
}

export function initArcadeCatalog(root, open, show = showVariants) {
  const find = selector => root.querySelector(selector), list = find('#arcade-games');
  const search = find('#arcade-search'), category = find('#arcade-category'), mechanic = find('#arcade-mechanic');
  const collection = find('#arcade-collection');
  const previous = find('#arcade-previous'), next = find('#arcade-next');
  const random = find('#arcade-random');
  const addOption = (select, value, label) => { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); };
  for (const [id, name] of Object.entries(CATEGORIES)) addOption(category, id, name);
  addOption(category, 'classic', 'Попередні ігри');
  for (const m of MECHANICS) addOption(mechanic, m.id, `${m.icon} ${m.name}`);
  let page = 0, matches = [], pageSize = 24;
  function render() {
    matches = catalogGroups(ARCADE_GAMES, { query: search.value, category: category.value, mechanic: mechanic.value, collection: collection.value });
    const pages = Math.max(1, Math.ceil(matches.length / pageSize)); page = Math.max(0, Math.min(page, pages - 1));
    const buttons = matches.slice(page * pageSize, (page + 1) * pageSize).map(group => {
      const button = document.createElement('button'); button.className = 'menu-btn blue'; button.dataset.group = group.id; button.setAttribute('aria-haspopup', 'dialog');
      const title = document.createElement('b'); title.textContent = group.name;
      const note = document.createElement('i'); note.textContent = `${group.variants.length} варіантів · ${MAX_ARCADE_LEVEL} рівнів · натисни, щоб обрати`;
      button.append(title, note); button.onclick = () => show(group, open); return button;
    });
    list.replaceChildren(...buttons);
    find('#arcade-count').textContent = matches.length ? `Ігор: ${matches.length} · варіантів: ${matches.reduce((sum, group) => sum + group.variants.length, 0)}. Показано ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, matches.length)}.` : 'Ігор не знайдено. Зміни пошук або фільтри.';
    find('#arcade-page').textContent = `Сторінка ${page + 1} / ${pages}`;
    previous.disabled = page === 0; next.disabled = page === pages - 1; random.disabled = !matches.length;
  }
  const reset = () => { page = 0; render(); };
  search.addEventListener('input', reset); mechanic.addEventListener('change', reset);
  collection.addEventListener('change', () => { category.value = ''; mechanic.value = ''; for (const option of mechanic.options) option.hidden = false; reset(); });
  category.addEventListener('change', () => {
    if(category.value==='classic')collection.value='';
    mechanic.value = '';
    for (const option of mechanic.options) option.hidden = !!option.value && !!category.value && MECHANICS.find(m => m.id === option.value)?.category !== category.value;
    reset();
  });
  previous.onclick = () => { page--; render(); list.firstElementChild?.focus(); };
  next.onclick = () => { page++; render(); list.firstElementChild?.focus(); };
  random.onclick = () => { if (matches.length) show(matches[Math.floor(Math.random() * matches.length)], open); };
  find('#arcade-clear').onclick = () => {
    search.value = ''; category.value = ''; mechanic.value = ''; collection.value = '';
    for (const option of mechanic.options) option.hidden = false;
    reset(); search.focus();
  };
  render();
}
