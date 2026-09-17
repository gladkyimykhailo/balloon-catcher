import test from 'node:test';
import assert from 'node:assert/strict';
import { initArcadeCatalog } from '../src/client/anthology/menu.js';
import { showVariants } from '../src/client/anthology/variants.js';
import { catalogGroups } from '../src/shared/anthology/groups.js';
import { ARCADE_GAMES } from '../src/shared/arcade.js';

class Element {
  constructor() { this.children = []; this.value = ''; this.textContent = ''; this.dataset = {}; this.hidden = false; this.disabled = false; this.listeners = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this[name] = value; }
  get options() { return this.children; }
  get firstElementChild() { return this.children[0]; }
  focus() { this.focused = true; }
  emit(name) { this.listeners[name]?.(); }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
  remove() { this.removed = true; }
}

test('each mechanic has one button and every variant appears exactly once in its group', () => {
  const groups = catalogGroups(ARCADE_GAMES);
  assert.equal(groups.length, 63);
  const ids = groups.flatMap(g => g.variants.map(([id]) => id));
  assert.equal(ids.length, 1023); assert.equal(new Set(ids).size, 1023);
  assert.equal(groups.find(g => g.id === 'arithmetic').variants.length, 25);
  assert.equal(groups.find(g => g.id === 'snake').variants.length, 1);
  assert.equal(catalogGroups(ARCADE_GAMES, { collection: 'second' }).length, 20);
  assert.equal(catalogGroups(ARCADE_GAMES, { query: 'змійка' })[0].variants.length, 1);
});

test('catalog paginates groups, filters collections and opens a variant picker instead of launching immediately', () => {
  const oldDocument = globalThis.document;
  const elements = Object.fromEntries(['games', 'search', 'collection', 'category', 'mechanic', 'previous', 'next', 'random', 'count', 'page', 'clear'].map(name => [`#arcade-${name}`, new Element()]));
  elements['#arcade-category'].append(new Element()); elements['#arcade-mechanic'].append(new Element());
  const shown = [], opened = [], root = { querySelector: selector => elements[selector] };
  globalThis.document = { createElement: () => new Element() };
  try {
    initArcadeCatalog(root, key => opened.push(key), (group, open) => shown.push({ group, open }));
    const list = elements['#arcade-games'], next = elements['#arcade-next'], previous = elements['#arcade-previous'];
    assert.equal(list.children.length, 24); assert.equal(previous.disabled, true);
    const first = list.children[0].dataset.group; list.children[0].onclick(); assert.equal(opened.length, 0); assert.equal(shown[0].group.id, first);
    shown[0].open(shown[0].group.variants[0][0]); assert.equal(opened.length, 1);
    next.onclick(); assert.notEqual(list.children[0].dataset.group, first); assert.equal(list.children[0].focused, true);
    next.onclick(); assert.equal(list.children.length, 15); assert.equal(next.disabled, true);
    const collection = elements['#arcade-collection']; collection.value = 'second'; collection.emit('change');
    assert.equal(list.children.length, 20); assert.match(elements['#arcade-count'].textContent, /500/);
    elements['#arcade-random'].onclick(); assert.ok(shown.at(-1).group.variants.every(([, info]) => info.collection === 'second'));
    const category = elements['#arcade-category'], mechanic = elements['#arcade-mechanic'];
    category.value = 'memory'; category.emit('change'); assert.equal(list.children.length, 2);
    assert.equal(mechanic.options.find(o => o.value === 'aim').hidden, true);
    const search = elements['#arcade-search']; search.value = 'неіснуючагра'; search.emit('input'); assert.equal(list.children.length, 0); assert.equal(elements['#arcade-random'].disabled, true);
    elements['#arcade-clear'].onclick(); assert.equal(list.children.length, 24); assert.equal(collection.value, ''); assert.equal(search.focused, true);
    category.value = 'classic'; category.emit('change'); assert.equal(list.children.length, 23); assert.equal(next.disabled, true);
    list.children.find(b => b.dataset.group === 'snake').onclick(); assert.equal(shown.at(-1).group.variants.length, 1);
  } finally { globalThis.document = oldDocument; }
});

test('variant dialog lists every option, offers both fighter modes and restores focus on close', () => {
  const previous = globalThis.document, focus = new Element(), body = new Element(), opened = [];
  globalThis.document = { activeElement: focus, body, createElement: () => new Element() };
  try {
    const groups = catalogGroups(ARCADE_GAMES), group = groups.find(g => g.id === 'arithmetic');
    const dialog = showVariants(group, (...args) => opened.push(args));
    assert.equal(dialog.open, true); assert.equal(dialog.children.at(-1).children.length, 25);
    dialog.children.at(-1).children[17].onclick(); assert.equal(dialog.removed, true); assert.equal(focus.focused, true); assert.equal(opened[0][0], group.variants[17][0]);
    const fighter = showVariants(groups.find(g => g.id === 'fighter'), (...args) => opened.push(args));
    assert.equal(fighter.children.at(-1).children.length, 3); fighter.children.at(-1).children[1].onclick(); assert.deepEqual(opened.at(-1), ['fighter', 'online']);
  } finally { globalThis.document = previous; }
});
