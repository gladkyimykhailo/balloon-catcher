import { ARCADE_GAMES } from '../shared/arcade.js';
import { MAX_ARCADE_LEVEL } from '../shared/arcade-levels.js';
const milestones = (stat, goals, icon, label, note, legacy = {}) => goals.map((goal, i) => ({
  id: legacy[goal] ?? `${stat}-${goal}`,
  title: stat === 'taps' && goal === 1 ? 'The First Tap' : `${goal} ${label}`,
  note: `${note}: ${goal}. Прогрес накопичується між іграми.`,
  stat, goal, icon, reward: [10, 20, 35, 50, 75, 100, 150, 200, 300, 450, 600, 800, 1000, 1500][i],
}));

export const ACHIEVEMENTS = [
  ...Object.entries(ARCADE_GAMES).flatMap(([kind, game]) => [
    { id: `arcade-${kind}-first`, title: `${game.name} — перша перемога`, stat: `arcade-${kind}-wins`, goal: 1, icon: '🥉', reward: 25, note: 'Переможи на будь-якому рівні.' },
    { id: `arcade-${kind}-ten`, title: `${game.name} — 10 перемог`, stat: `arcade-${kind}-wins`, goal: 10, icon: '🥈', reward: 100, note: 'Здобудь 10 перемог; прогрес накопичується.' },
    { id: `arcade-${kind}-master`, title: `${game.name} — майстер`, stat: `arcade-${kind}-final`, goal: 1, icon: '🏆', reward: 150, note: 'Пройди п’ятий рівень або вище.' },
  ]),
  ...milestones('taps', [1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000],
    '👆', 'Taps', 'Влучання по кульці або м’ячу', { 1: 'first-tap', 25: 'warming-up', 100: 'tap-master', 1000: 'unstoppable' }),
  ...milestones('passes', [1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    '🤝', 'Passes', 'Паси в тім-апі', { 10: 'team-player' }),
  ...milestones('parries', [1, 5, 10, 25, 50, 100, 250, 500, 1000],
    '🛡️', 'Saves', 'Відбиті шипи або камені', { 1: 'nice-save' }),
  ...milestones('baskets', [1, 5, 10, 25, 50, 100, 250, 500, 1000],
    '🏀', 'Baskets', 'Кошики твоєї команди в баскетболі', { 1: 'first-basket', 25: 'bucket-getter' }),
  ...['easy', 'medium', 'hard'].flatMap((difficulty, i) => [1, 5, 10, 25, 50, 100].map((goal, j) => ({
    id: goal === 1 ? `beat-${difficulty}-bot` : `beat-${difficulty}-bot-${goal}`,
    title: `Beat the ${difficulty[0].toUpperCase() + difficulty.slice(1)} Bot${goal === 1 ? '' : ` ×${goal}`}`,
    note: `Переможи ${['легкого', 'середнього', 'складного'][i]} бота в баскетболі або волейболі ${goal} разів.`,
    stat: `${difficulty}Wins`, goal, icon: ['🥉', '🥈', '🏆'][i], reward: [50, 100, 200, 400, 750, 1200][j] * (i + 1),
  }))),
];
const KEY = 'balloon-achievements';

export function createAchievements(storage, onUnlock = () => {}) {
  let saved;
  try { saved = JSON.parse(storage.getItem(KEY)); } catch { /* Start fresh if damaged. */ }
  const stats = {};
  for (const a of ACHIEVEMENTS) {
    const n = saved?.stats?.[a.stat];
    stats[a.stat] = Number.isSafeInteger(n) && n >= 0 ? n : 0;
  }
  const unlocked = new Set(ACHIEVEMENTS.filter(a => stats[a.stat] >= a.goal).map(a => a.id));
  // Older saves contain only stats: their earned rewards can be claimed too.
  const rewarded = new Set(Array.isArray(saved?.rewarded) ? saved.rewarded.filter(id => typeof id === 'string') : []);
  function claimRewards() {
    const earned = ACHIEVEMENTS.filter(a => unlocked.has(a.id) && !rewarded.has(a.id));
    for (const a of earned) rewarded.add(a.id);
    storage.setItem(KEY, JSON.stringify({ stats, rewarded: [...rewarded] }));
    for (const a of earned) onUnlock(a);
  }
  function add(stat) {
    stats[stat] = Math.min(Number.MAX_SAFE_INTEGER, stats[stat] + 1);
    const earned = ACHIEVEMENTS.filter(a => a.stat === stat && stats[stat] >= a.goal && !unlocked.has(a.id));
    for (const a of earned) unlocked.add(a.id);
    claimRewards();
  }
  return {
    arcadeFinish({kind, level, won}) {
      if(!won || !Object.hasOwn(ARCADE_GAMES,kind) || !Number.isInteger(level) || level<1 || level>MAX_ARCADE_LEVEL)return;
      add(`arcade-${kind}-wins`);
      if(level>=5)add(`arcade-${kind}-final`);
    },
    claimRewards,
    entries: () => ACHIEVEMENTS.map(a => ({ ...a, progress: Math.min(stats[a.stat], a.goal), unlocked: unlocked.has(a.id) })),
    event(e, context) {
      if (context.spectator) return;
      const own = context.mode === 'online' ? e.player === context.side
        : context.mode === 'local2' ? e.player === 0 || e.player === 1 : e.player === 0;
      if (own && ['hit', 'basketHit'].includes(e.type)) add('taps');
      if (own && e.type === 'pass') add('passes');
      if (own && ['parry', 'stoneParry'].includes(e.type)) add('parries');
      if (context.kind === 'hoops' && e.type === 'basketPoint'
          && (context.mode === 'local2' || e.player === (context.side ?? 0) % 2)) add('baskets');
    },
    finish({ mode, kind, spectator, winner, difficulty }) {
      if (!spectator && mode === 'solo' && ['hoops', 'basketball'].includes(kind)
          && winner === 0 && ['easy', 'medium', 'hard'].includes(difficulty)) add(`${difficulty}Wins`);
    },
  };
}
