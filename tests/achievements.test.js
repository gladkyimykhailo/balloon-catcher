import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, createAchievements } from '../src/client/achievements.js';

function setup(initial = null) {
  let value = initial;
  const storage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  const earned = [];
  return { storage, earned, tracker: createAchievements(storage, a => earned.push(a.id)) };
}
const solo = { mode: 'solo', kind: 'hoops' };
const entry = (tracker, id) => tracker.entries().find(a => a.id === id);

test('only human hits advance taps and unlock once across reloads', () => {
  const { tracker, earned, storage } = setup();
  tracker.event({ type: 'basketHit', player: 1 }, solo);
  assert.equal(entry(tracker, 'first-tap').progress, 0);
  for (let i = 0; i < 25; i++) tracker.event({ type: 'hit', player: 0 }, solo);
  assert.deepEqual(earned, ['first-tap', 'taps-10', 'warming-up']);
  const reloaded = createAchievements(storage, () => assert.fail('Duplicate unlock'));
  reloaded.event({ type: 'hit', player: 0 }, solo);
  assert.equal(entry(reloaded, 'tap-master').progress, 26);
  assert.equal(entry(reloaded, 'warming-up').unlocked, true);
});

test('online progress belongs to the player and baskets to their team; spectators earn nothing', () => {
  const { tracker } = setup();
  const online = { mode: 'online', kind: 'hoops', side: 3 };
  tracker.event({ type: 'hit', player: 1 }, online);
  tracker.event({ type: 'hit', player: 3 }, { ...online, spectator: true });
  tracker.event({ type: 'basketPoint', player: 1 }, { ...online, spectator: true });
  tracker.event({ type: 'basketPoint', player: 0 }, online);
  assert.equal(entry(tracker, 'first-tap').progress, 0);
  assert.equal(entry(tracker, 'first-basket').progress, 0);
  tracker.event({ type: 'basketHit', player: 3 }, online);
  tracker.event({ type: 'basketPoint', player: 1 }, online);
  assert.equal(entry(tracker, 'first-tap').unlocked, true);
  assert.equal(entry(tracker, 'first-basket').unlocked, true);
});

test('bot trophies require winning a solo sports match at the actual difficulty', () => {
  const { tracker, earned } = setup();
  const win = { ...solo, winner: 0, difficulty: 'hard' };
  for (const override of [{ winner: 1 }, { winner: null }, { mode: 'online' }, { mode: 'local2' }, { spectator: true }, { kind: 'normal' }, { difficulty: 'invalid' }]) {
    tracker.finish({ ...win, ...override });
  }
  assert.deepEqual(earned, []);
  tracker.finish(win);
  tracker.finish(win);
  tracker.finish({ ...win, difficulty: 'easy', kind: 'basketball' });
  tracker.finish({ ...win, difficulty: 'medium' });
  assert.deepEqual(earned, ['beat-hard-bot', 'beat-easy-bot', 'beat-medium-bot']);
});

test('passes, parries and shared local progress use their own milestones', () => {
  const { tracker } = setup();
  const local = { mode: 'local2', kind: 'team' };
  for (let i = 0; i < 10; i++) tracker.event({ type: 'pass', player: i % 2 }, local);
  tracker.event({ type: 'stoneParry', player: 1 }, local);
  tracker.event({ type: 'basketPoint', player: 0 }, { ...local, kind: 'basketball' });
  assert.equal(entry(tracker, 'team-player').unlocked, true);
  assert.equal(entry(tracker, 'nice-save').unlocked, true);
  assert.equal(entry(tracker, 'first-basket').unlocked, false);
});

test('damaged saved progress safely starts at zero', () => {
  for (const value of ['broken', 'null', '{"stats":{"taps":-2,"baskets":"100","passes":1.5}}']) {
    const { tracker } = setup(value);
    assert.ok(tracker.entries().every(a => a.progress === 0 && !a.unlocked));
    tracker.event({ type: 'hit', player: 0 }, solo);
    assert.equal(entry(tracker, 'first-tap').unlocked, true);
  }
});


test('all 3129 achievements have unique IDs and positive coin rewards', () => {
  assert.equal(ACHIEVEMENTS.length, 3129);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, 3129);
  assert.ok(ACHIEVEMENTS.every(a => Number.isSafeInteger(a.reward) && a.reward > 0));
  assert.deepEqual(ACHIEVEMENTS.filter(a => a.stat === 'taps').map(a => a.goal),
    [1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]);
});

test('coin rewards pay at milestones only, and never again after reloading', () => {
  const { storage } = setup();
  let coins = 0;
  const reward = a => { coins += a.reward; };
  const tracker = createAchievements(storage, reward);
  for (let i = 0; i < 9; i++) tracker.event({ type: 'hit', player: 0 }, solo);
  assert.equal(coins, 10);
  tracker.event({ type: 'hit', player: 0 }, solo);
  assert.equal(coins, 30);
  tracker.claimRewards();
  const reloaded = createAchievements(storage, reward);
  reloaded.claimRewards();
  reloaded.event({ type: 'hit', player: 0 }, solo);
  assert.equal(coins, 30);
});

test('existing progress receives old and newly added rewards exactly once', () => {
  const { storage } = setup(JSON.stringify({ stats: { taps: 100, hardWins: 5 } }));
  const paid = [];
  const tracker = createAchievements(storage, a => paid.push(a));
  tracker.claimRewards();
  assert.deepEqual(paid.map(a => a.id),
    ['first-tap', 'taps-10', 'warming-up', 'taps-50', 'tap-master', 'beat-hard-bot', 'beat-hard-bot-5']);
  assert.equal(paid.reduce((sum, a) => sum + a.reward, 0), 640);
  createAchievements(storage, () => assert.fail('Already paid')).claimRewards();
});

test('arcade achievements track each game independently and persist rewards', () => {
  const { tracker, storage, earned } = setup();
  tracker.arcadeFinish({ kind: 'discovery-arithmetic-0-expedition', level: 1, won: false });
  tracker.arcadeFinish({ kind: 'missing', level: 5, won: true });
  tracker.arcadeFinish({ kind: 'discovery-arithmetic-0-expedition', level: 41, won: true });
  assert.equal(earned.length, 0);
  for (let i = 0; i < 10; i++) tracker.arcadeFinish({ kind: 'discovery-arithmetic-0-expedition', level: i === 9 ? 5 : 1, won: true });
  assert.deepEqual(earned, ['arcade-discovery-arithmetic-0-expedition-first', 'arcade-discovery-arithmetic-0-expedition-ten', 'arcade-discovery-arithmetic-0-expedition-master']);
  assert.equal(entry(tracker, 'arcade-stars-first').progress, 0);
  const reloaded = createAchievements(storage, () => assert.fail('Duplicate arcade reward'));
  reloaded.claimRewards();
  reloaded.arcadeFinish({ kind: 'discovery-arithmetic-0-expedition', level: 5, won: true });
  assert.equal(entry(reloaded, 'arcade-discovery-arithmetic-0-expedition-master').unlocked, true);
});

test('every new independent game awards its own first win and final-level trophy', () => {
  const { tracker, earned, storage } = setup();
  for (const kind of ['fighter', 'sokoban', 'mines', 'sliding', 'connect', 'lights', 'stack', 'merge', 'sequence', 'flood']) {
    tracker.arcadeFinish({ kind, level: 1, won: false });
    assert.equal(entry(tracker, `arcade-${kind}-first`).unlocked, false);
    tracker.arcadeFinish({ kind, level: 1, won: true });
    tracker.arcadeFinish({ kind, level: 5, won: true });
    assert.equal(entry(tracker, `arcade-${kind}-first`).unlocked, true);
    assert.equal(entry(tracker, `arcade-${kind}-master`).unlocked, true);
    assert.equal(entry(tracker, `arcade-${kind}-ten`).progress, 2);
  }
  assert.equal(earned.length, 20);
  createAchievements(storage, () => assert.fail('Repeated new-game reward')).claimRewards();
});
