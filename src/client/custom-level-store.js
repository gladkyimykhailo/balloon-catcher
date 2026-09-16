import { normalizeCustomLevel } from '../shared/custom-level.js';
const KEY = 'balloon-custom-levels';
export function customLevelStore(storage) {
  let levels = [];
  try {
    const saved = JSON.parse(storage.getItem(KEY));
    if (Array.isArray(saved)) levels = saved.filter(v => v && typeof v.id === 'string').slice(0, 30)
      .map(v => ({ id: v.id, ...normalizeCustomLevel(v) }));
  } catch { /* Damaged saves should not stop the editor. */ }
  const persist = () => storage.setItem(KEY, JSON.stringify(levels));
  return {
    list: () => structuredClone(levels),
    save(value, id = null) {
      const index = levels.findIndex(v => v.id === id);
      if (index < 0 && levels.length >= 30) throw new Error('Уже є 30 рівнів. Видали один, щоб зберегти новий.');
      const level = { ...normalizeCustomLevel(value), id: index < 0 ? (globalThis.crypto?.randomUUID?.() ?? `level-${Date.now()}-${Math.random().toString(36).slice(2)}`) : id };
      if (index < 0) levels.push(level); else levels[index] = level;
      persist();
      return structuredClone(level);
    },
    remove(id) { levels = levels.filter(v => v.id !== id); persist(); },
  };
}
