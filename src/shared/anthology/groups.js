import { MECHANICS, selectCatalog } from './catalog.js';
export function catalogGroups(games, filters = {}) {
  const groups = new Map();
  for (const [id, info] of selectCatalog(games, { ...filters, variants: true })) {
    const key = info.anthology ? info.mechanic : info.base || id;
    if (!groups.has(key)) {
      const mechanic = MECHANICS.find(m => m.id === key);
      groups.set(key, { id: key, name: mechanic ? `${mechanic.icon} ${mechanic.name}` : games[key].name, variants: [] });
    }
  }
  // Search chooses game buttons; opening one still reveals every variant of that game.
  for (const [id, info] of selectCatalog(games, { ...filters, query: '', variants: true })) {
    const key = info.anthology ? info.mechanic : info.base || id;
    groups.get(key)?.variants.push([id, info]);
  }
  return [...groups.values()];
}
