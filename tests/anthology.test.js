import test from 'node:test';
import assert from 'node:assert/strict';
import { ANTHOLOGY_GAMES, MECHANICS, CONTRACTS, selectCatalog } from '../src/shared/anthology/catalog.js';
import { ARCADE_GAMES, createArcade, arcadeAction, arcadeDirection, updateArcade } from '../src/shared/arcade.js';
import { choiceRect, motorGeometry, resolveDiscovery } from '../src/shared/anthology/engine.js';
import { drawArcade } from '../src/client/arcade-view.js';
const id = (mechanic, rule = 0, contract = 'expedition') => `discovery-${mechanic}-${rule}-${contract}`;
const make = (mechanic = 'arithmetic', rule = 0, contract = 'expedition') => createArcade(id(mechanic, rule, contract), 1, () => 0.42);
const tick = (s, seconds) => { for (let i = 0; i < seconds / 0.04 && !s.over; i++) updateArcade(s, 0.04); };
const click = (s, index) => { const r = choiceRect(index); arcadeAction(s, r.x + r.w / 2, r.y + r.h / 2); };

test('catalog has exactly 1,000 stable, uniquely named combinations with real rule descriptors', () => {
  const entries = Object.entries(ANTHOLOGY_GAMES);
  assert.equal(entries.length, 1000); assert.equal(new Set(entries.map(([, g]) => g.name)).size, 1000);
  assert.equal(new Set(entries.map(([, g]) => `${g.mechanic}/${g.rule}/${g.contract}`)).size, 1000);
  assert.equal(MECHANICS.length, 40); assert.equal(CONTRACTS.length, 5);
  for (const m of MECHANICS) {
    assert.equal(selectCatalog(ANTHOLOGY_GAMES, { mechanic: m.id }).length, 25);
    assert.equal(m.scenes.length, 5);
  }
  assert.equal(selectCatalog(ARCADE_GAMES).length, 1023);
  assert.equal(selectCatalog(ARCADE_GAMES, { variants: true }).length, 1023);
  assert.equal(selectCatalog(ARCADE_GAMES, { category: 'classic' }).length, 23);
  assert.equal(selectCatalog(ARCADE_GAMES, { category: 'memory' }).length, 100);
  assert.equal(selectCatalog(ARCADE_GAMES, { query: 'ОРБІТА експедиція' }).length, 5);
  assert.equal(selectCatalog(ARCADE_GAMES, { query: 'неіснуючагра' }).length, 0);
});

test('all 40,000 levels can be won through their public input and update paths', () => {
  const failures = [];
  for (const key of Object.keys(ANTHOLOGY_GAMES)) for (let level = 1; level <= 40; level++) for (const seed of [0.01, 0.42, 0.99]) {
    const s = createArcade(key, level, () => seed);
    let frames = 0;
    while (!s.over && frames++ < 7500) {
      if (s.between > 0) { updateArcade(s, 0.04); continue; }
      if (s.stage.choices) {
        if (s.stage.age >= s.stage.preview) click(s, s.stage.answer);
        updateArcade(s, 0.04);
      } else {
        const g = motorGeometry(s);
        if (s.mechanic === 'tracker') updateArcade(s, 0.04, { x: g.x, y: g.y });
        else if (s.mechanic === 'aim') { arcadeAction(s, g.x, g.y); updateArcade(s, 0.04); }
        else if (s.mechanic === 'catcher') { updateArcade(s, 0.04, { x: g.x }); if (motorGeometry(s).active) arcadeAction(s); }
        else { if (g.active) arcadeAction(s); updateArcade(s, 0.04); }
      }
    }
    if (!s.won) failures.push(`${key}/${level}/${seed}: ${s.score}/${s.target}, time=${s.time.toFixed(2)}, lives=${s.lives}`);
  }
  assert.deepEqual(failures, []);
});

test('puzzle options are distinct, clicks outside choices do nothing, memory cannot be answered early', () => {
  for (const m of MECHANICS.filter(m => ['logic', 'attention', 'memory'].includes(m.category))) for (let rule = 0; rule < 5; rule++) for (const level of [1, 10, 20, 30, 40]) {
    const s = createArcade(id(m.id, rule), level, () => 0.42);
    if (m.category === 'memory') assert.ok(s.stage.preview > 0, `${m.id}/${level} must show a preview`);
    if (!s.stage.choices) continue;
    assert.equal(new Set(s.stage.choices).size, 4); assert.ok(s.stage.answer >= 0 && s.stage.answer < 4);
    arcadeAction(s, 0, 0); assert.equal(s.attempts, 0);
    if (s.stage.preview) { click(s, s.stage.answer); assert.equal(s.attempts, 0); tick(s, s.stage.preview + 0.04); }
    const answer = s.stage.answer;
    for (let i = 0; i < answer; i++) arcadeDirection(s, 1, 0);
    updateArcade(s, 0.01, { action: true }); assert.equal(s.successes, 1);
  }
});

test('contracts change failure, scoring, deadline and victory behavior', () => {
  const act = (s, correct) => { resolveDiscovery(s, correct); tick(s, 0.7); };
  const streak = make('arithmetic', 0, 'streak'); act(streak, true); act(streak, true); act(streak, false); assert.equal(streak.score, 0);
  const perfect = make('arithmetic', 0, 'perfect'); act(perfect, false); assert.equal(perfect.over, true);
  const survival = make('arithmetic', 0, 'survival'); for (let i = 0; i < survival.target; i++) act(survival, true); assert.equal(survival.over, false); tick(survival, 46); assert.equal(survival.won, true);
  const timeout = make('arithmetic', 0, 'blitz'); tick(timeout, 61); assert.equal(timeout.over, true); assert.equal(timeout.won, false);
});

test('motor challenges penalize early actions and missed windows; tracker needs sustained contact', () => {
  const reaction = make('reaction'); arcadeAction(reaction); assert.equal(reaction.lives, 2);
  const missed = make('catcher'); tick(missed, 7); assert.ok(missed.lives < 3);
  const tracker = make('tracker'); const g = motorGeometry(tracker); arcadeAction(tracker, g.x, g.y); assert.equal(tracker.score, 0);
  updateArcade(tracker, 0.04, { x: g.x, y: g.y }); assert.ok(tracker.stage.hold > 0);
  tick(tracker, 0.2); assert.equal(tracker.score, 0);
});

test('finished games freeze and round state is reproducible without sharing mutable data', () => {
  const a = make(), b = make(); assert.deepEqual(a, b); a.stage.choices[0] = 'changed'; assert.notDeepEqual(a.stage, b.stage);
  const s = make('arithmetic', 0, 'perfect'); click(s, (s.stage.answer + 1) % 4); const frozen = structuredClone(s);
  arcadeAction(s); arcadeDirection(s, 1, 0); updateArcade(s, 0.04, { action: true }); assert.deepEqual(s, frozen);
});

test('all 200 scenes render valid geometry during preview, active play and feedback', () => {
  const c = new Proxy({}, { get: (_, name) => name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...args) => {
    for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), String(name));
  }, set: () => true });
  for (const m of MECHANICS) for (let rule = 0; rule < 5; rule++) {
    const s = make(m.id, rule); drawArcade(c, s); tick(s, 2); drawArcade(c, s); resolveDiscovery(s, true); drawArcade(c, s, 'Пауза');
  }
});
