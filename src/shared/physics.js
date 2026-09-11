// М'яка фізика повітряної кульки.
//
// Кулька — це замкнене кільце з N точкових мас. Форму тримають дві сили:
//   1) пружини між сусідніми точками (гумова оболонка);
//   2) внутрішній тиск P = pConst / A (закон ідеального газу для 2D):
//      стискаєш кульку -> площа падає -> тиск росте -> вона випинається деінде.
// Саме тому вона мнеться від долоні, а потім пружно вистрілює назад.

import { WORLD, FLOOR_Y, CEIL_Y, BALLOON, HAND, RULES, LEVELS, GULL, SPIKE, MEDKIT, RAGE, POOP, BUCKET, SUBSTEPS, skinAt, gloveAt, biomeAt, bucketSpots } from './constants.js';

const TAU = Math.PI * 2;

/** Скільки влучань потрібно на рівні `n` (1-based). */
export function levelTarget(n) {
  return Math.round((LEVELS.first * Math.pow(LEVELS.growth, n - 1)) / 5) * 5;
}

/**
 * Рівень, прогрес і ціль — чиста функція від загального рахунку.
 * Завдяки цьому клієнту в мультиплеєрі досить самого рахунку зі снапшота.
 */
export function levelInfo(score) {
  let level = 1;
  let base = 0;
  let target = levelTarget(1);
  while (score - base >= target) {
    base += target;
    level++;
    target = levelTarget(level);
  }
  return { level, progress: score - base, target };
}

export function createWorld() {
  const w = {
    time: 0,
    tick: 0,
    balloon: null,
    hands: [],
    score: 0,
    level: 1,
    gull: null,          // чайка в польоті
    gullTimer: GULL.period,
    deflate: 0,          // скільки секунд кулька ще здута
    spikes: [],          // шипи в польоті або на попередженні
    spikesOn: false,     // чи випав поточному рівню «шиповий» жереб
    spikeTimer: 0,
    spikeSeq: 0,
    poops: [],           // те, що падає з чайки
    poopSeq: 0,
    medkits: MEDKIT.perLevel,   // заряди аптечки, спільні на всіх гравців
    skin: 0,             // скін кульки; від нього залежать здібності нижче
    lives: RULES.lives,
    paused: false,         // напр., чекаємо, поки приєднається другий гравець
    state: 'playing',      // playing | respawn | over
    timer: 0,
    events: [],            // події для звуку/частинок: {type,x,y,player}
  };
  spawnBalloon(w, WORLD.w / 2, 220);
  return w;
}

export function spawnBalloon(w, cx, cy) {
  const { n, radius, mass, ks, kd, restScale, pressure, aspect, taper } = BALLOON;

  // Форма кульки — не коло, а «крапля»: трохи витягнута вгору і звужена донизу.
  // Довжину спокою кожного ребра беремо з цієї форми, тож оболонка сама
  // повертається саме в неї, а не в коло.
  const shape = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const s = Math.sin(a);
    const narrow = 1 - taper * Math.max(0, s);   // s > 0 — це низ (вісь Y вниз)
    shape.push({ x: Math.cos(a) * radius * narrow, y: s * radius * aspect });
  }

  const rest = [];
  let perim = 0;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = shape[i];
    const c = shape[(i + 1) % n];
    const L = Math.hypot(c.x - a.x, c.y - a.y);
    rest.push(L * restScale);
    perim += L;
    area2 += a.x * c.y - c.x * a.y;
  }
  const area0 = Math.abs(area2 * 0.5);

  // 2D-закон Лапласа T = P * R: підбираємо тиск так, щоб він урівноважив
  // натяг оболонки на еквівалентному радіусі — кулька тримає заданий розмір.
  const rEff = Math.sqrt(area0 / Math.PI);
  const tension = ks * (perim / n) * (1 - restScale);
  const pConst = (tension / rEff) * area0 * pressure;

  let sx = 0, sy = 0;
  for (const p of shape) { sx += p.x; sy += p.y; }
  sx /= n; sy /= n;
  const spokes = shape.map((p) => Math.hypot(p.x - sx, p.y - sy));

  const pts = shape.map((p) => ({
    x: cx + p.x, y: cy + p.y,
    vx: 0, vy: 0, fx: 0, fy: 0,
    m: mass,
  }));

  w.balloon = { pts, rest, spokes, ks, kd, pConst, radius, inflate: 1 };
  return w.balloon;
}

export function addHand(w, id, player, glove = 0) {
  const h = {
    id, player,
    x: WORLD.w / 2, y: WORLD.h - 180,
    px: WORLD.w / 2, py: WORLD.h - 180,
    tx: WORLD.w / 2, ty: WORLD.h - 180,
    vx: 0, vy: 0,
    r: HAND.r,
    active: true,
    touching: false,
    slow: 0,          // скільки секунд долоня ще обважніла після удару
    flash: 0,
    glove: 0,         // скін перчатки; на відміну від кульки, він особистий
    rage: 0,          // скільки секунд ще триває шалений режим
    rages: RAGE.perLevel,
    dirty: false,     // чайка влучила: кулька ковзає, очки не йдуть
  };
  setGlove(w, id, glove, h);
  w.hands.push(h);
  return h;
}

/**
 * Скін перчатки. Розмір долоні беремо тут раз і назавжди, щоб фізика зіткнень
 * далі просто читала `h.r` і нічого не знала про скіни.
 */
export function setGlove(w, id, i, hand = null) {
  const h = hand ?? getHand(w, id);
  if (!h) return;
  h.glove = Math.max(0, Math.min(i | 0, 99));
  h.r = HAND.r * gloveAt(h.glove).sizeMul;
  if (!gloveAt(h.glove).rage) h.rage = 0;   // не боксерська — шал гасне
}

/**
 * Шалений режим: 5 секунд без кулдауну. Тільки для боксерської перчатки і лише
 * поки є заряди. Як і аптечка, повертає подію, а не кладе її у `w.events`.
 */
export function useRage(w, handId) {
  if (w.state === 'over') return null;
  const h = getHand(w, handId);
  if (!h || !gloveAt(h.glove).rage) return null;
  if (h.rages <= 0 || h.rage > 0) return null;   // під час шалу другий заряд не палимо
  h.rages--;
  h.rage = RAGE.time;
  h.slow = 0;
  return { type: 'rage', x: h.x, y: h.y, player: h.player, level: h.rages };
}

/**
 * Скін кульки. Він живе у світі, а не в клієнті: здібності (гравітація, ціна
 * шипа, штраф долоні) мусять бути однакові для всіх, хто грає в цій кімнаті.
 */
export function setSkin(w, i) {
  w.skin = Math.max(0, Math.min(i | 0, 99));
}

export function getHand(w, id) {
  return w.hands.find((h) => h.id === id);
}

export function removeHand(w, id) {
  const i = w.hands.findIndex((h) => h.id === id);
  if (i >= 0) w.hands.splice(i, 1);
}

export function setHandTarget(w, id, x, y) {
  const h = getHand(w, id);
  if (!h) return;
  h.tx = clamp(x, 0, WORLD.w);
  h.ty = clamp(y, 0, WORLD.h);
}

// ---------------------------------------------------------------- крок світу

export function step(w, dt) {
  w.time += dt;
  w.tick++;
  w.events.length = 0;

  moveHands(w, dt);
  if (w.paused) return;   // долоні рухаються, кулька висить на місці
  updateGull(w, dt);
  updatePoops(w, dt);
  updateWashing(w);
  updateSpikes(w, dt);
  updateInflation(w, dt);

  if (w.state === 'respawn') {
    w.timer -= dt;
    if (w.timer <= 0) {
      w.state = 'playing';
      spawnBalloon(w, WORLD.w / 2 + (Math.random() - 0.5) * 220, 200);
    }
    return;
  }
  if (w.state === 'over') return;

  const h = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    // Долоню рухаємо всередині підкроків теж — інакше швидкий ляпас "протикає" оболонку.
    substep(w, h, (s + 1) / SUBSTEPS);
  }

  checkFloor(w);
}

/**
 * Чайка: прилітає з випадкового боку, наводиться на кульку, клює і йде геть.
 * Живе у спільній фізиці, тож у мультиплеєрі обидва бачать ту саму птаху.
 */
function updateGull(w, dt) {
  if (w.state !== 'playing') return;

  // Відлік іде завжди, тож наступна чайка з'являється рівно через period
  // після попередньої, а не через period після її відльоту.
  if (w.gullTimer > 0) w.gullTimer -= dt;

  if (!w.gull) {
    if (w.gullTimer > 0) return;
    // Уночі чайки сплять. Ту, що вже летить, не чіпаємо — хай долітає,
    // інакше птаха зникала б просто в повітрі на переході рівня.
    if (!biomeAt(w.level).gulls) { w.gullTimer = GULL.period; return; }
    w.gullTimer = GULL.period;
    const fromLeft = Math.random() < 0.5;
    w.gull = {
      x: fromLeft ? -90 : WORLD.w + 90,
      y: 70 + Math.random() * 180,
      dir: fromLeft ? 1 : -1,
      vx: 0, vy: 0,
      flap: 0,
      phase: 'hunt',
      // Коли саме какати за цей приліт — вирішуємо наперед, щоб воно падало
      // в різні миті, а не двічі поспіль на одному кадрі.
      poopIn: 0.6 + Math.random() * 1.2,
      poopsLeft: POOP.perVisit,
    };
    w.events.push({ type: 'gull', x: w.gull.x, y: w.gull.y, player: -1 });
    return;
  }

  const g = w.gull;
  g.flap += dt * 11;

  // Какає будь-де над полем — і полюючи, і відлітаючи.
  if (g.poopsLeft > 0 && g.x > 0 && g.x < WORLD.w) {
    g.poopIn -= dt;
    if (g.poopIn <= 0) {
      g.poopsLeft--;
      g.poopIn = 0.8 + Math.random() * 1.4;
      w.poops.push({
        id: ++w.poopSeq,
        x: g.x, y: g.y + 14,
        vx: g.dir * POOP.fallDrift, vy: 40,
      });
      w.events.push({ type: 'poop', x: g.x, y: g.y + 14, player: -1 });
    }
  }

  if (g.phase === 'hunt') {
    const c = balloonCenter(w.balloon);
    const dx = c.x - g.x;
    const dy = c.y - g.y;
    const d = Math.hypot(dx, dy) || 1;
    g.x += (dx / d) * GULL.speed * dt;
    g.y += (dy / d) * GULL.speed * dt;
    g.dir = dx >= 0 ? 1 : -1;

    // Клюємо, коли дзьоб дістав саму оболонку, а не центр — тоді здута
    // й повнорозмірна кулька клюються однаково справедливо.
    let near = Infinity;
    for (const p of w.balloon.pts) {
      const dd = Math.hypot(p.x - g.x, p.y - g.y);
      if (dd < near) near = dd;
    }
    if (near < GULL.peckDist) {
      w.deflate = GULL.deflateTime * skinAt(w.skin).deflateMul;   // фіолетова здувається ненадовго
      w.events.push({ type: 'peck', x: g.x, y: g.y, player: -1 });
      g.phase = 'leave';
      g.vx = g.dir * GULL.speed * 1.15;
      g.vy = -GULL.speed * 0.55;
      // Дзьоб іще й підштовхує кульку — легко, головна кара це здування.
      const nx = (c.x - g.x) / d;
      const ny = (c.y - g.y) / d;
      for (const p of w.balloon.pts) { p.vx += nx * GULL.peckKick; p.vy += ny * GULL.peckKick; }
    }
  } else {
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    if (g.x < -160 || g.x > WORLD.w + 160 || g.y < -160) w.gull = null;
  }
}

/**
 * Новий рівень: жереб на шипи і свіжі заряди аптечки.
 * Заряди саме видаються наново, а не додаються — інакше обережний гравець
 * приходив би на десятий рівень із півсотнею аптечок у кишені.
 */
function onLevelUp(w, lvl) {
  w.level = lvl;
  w.medkits = MEDKIT.perLevel;
  for (const h of w.hands) h.rages = RAGE.perLevel;
  rollSpikes(w);
}

/**
 * Аптечка лікує двічі: повертає серце І знімає з долоні штраф за удар —
 * після неї рука знову швидка, не чекаючи, поки `slowTime` збіжить сам.
 * Спільна на кімнату, як і самі серця.
 *
 * `handId` — чия долоня одужує (у мультиплеєрі це той, хто натиснув). Без нього
 * (локальна гра, де кнопка одна на всіх) відпускає всі долоні світу.
 *
 * Заряд не витрачається даремно: якщо і серця повні, і рука свіжа, натискання
 * просто нічого не робить.
 *
 * Повертає подію (або null), а не кладе її в `w.events`: аптечку тиснуть між
 * кроками світу, а `step()` чистить події на початку кожного кроку — подія
 * загубилась би, не дійшовши ні до звуку, ні до снапшота.
 */
export function useMedkit(w, handId = null) {
  if (w.state === 'over' || w.medkits <= 0) return null;
  const hands = handId ? w.hands.filter((h) => h.id === handId) : w.hands;
  const canHeal = w.lives < RULES.lives;
  const canFreshen = hands.some((h) => h.slow > 0);
  if (!canHeal && !canFreshen) return null;

  w.medkits--;
  if (canHeal) w.lives = Math.min(RULES.lives, w.lives + MEDKIT.heal);
  for (const h of hands) h.slow = 0;
  return { type: 'heal', x: WORLD.w / 2, y: 230, player: -1, level: w.medkits, healed: canHeal };
}

/** Чи є зараз обважніла долоня — щоб кнопка аптечки знала, чи є що робити. */
export function anyHandSlowed(hands) {
  return hands.some((h) => (h.slow ?? 0) > 0);
}

/**
 * Те, що падає з чайки. Ловить його долоня, а не кулька: це морока для гравця,
 * а не ще одна кара для кульки — сердець тут не забирають.
 */
function updatePoops(w, dt) {
  for (let i = w.poops.length - 1; i >= 0; i--) {
    const p = w.poops[i];
    p.vy += POOP.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    let caught = null;
    for (const h of w.hands) {
      if (!h.active) continue;
      if (Math.hypot(h.x - p.x, h.y - p.y) < h.r + POOP.r) { caught = h; break; }
    }
    if (caught) {
      caught.dirty = true;
      w.events.push({ type: 'splat', x: p.x, y: p.y, player: caught.player });
      w.poops.splice(i, 1);
      continue;
    }
    if (p.y > FLOOR_Y) {
      w.events.push({ type: 'plop', x: p.x, y: FLOOR_Y, player: -1 });
      w.poops.splice(i, 1);
    }
  }
}

/** Долоня біля відра — миється. Одразу, без таймера: дитині й так не до того. */
function updateWashing(w) {
  const spots = bucketSpots();
  for (const h of w.hands) {
    if (!h.dirty) continue;
    for (const b of spots) {
      if (Math.hypot(h.x - b.x, h.y - b.y) < BUCKET.r + h.r) {
        h.dirty = false;
        w.events.push({ type: 'wash', x: b.x, y: b.y - 20, player: h.player });
        break;
      }
    }
  }
}

/** Кидає жереб, чи буде поточний рівень із шипами. */
function rollSpikes(w) {
  w.spikesOn = w.level >= SPIKE.firstLevel && Math.random() < SPIKE.levelChance;
  w.spikes.length = 0;
  w.spikeTimer = SPIKE.minGap;
}

/**
 * Шипи вилітають із землі вгору. Кожен спершу «проклюється» на землі
 * (фаза warn) — без цього попередження втрата двох сердець була б несправедливою.
 */
function updateSpikes(w, dt) {
  if (w.state !== 'playing') return;

  for (let i = w.spikes.length - 1; i >= 0; i--) {
    const s = w.spikes[i];

    if (s.phase === 'warn') {
      s.t -= dt;
      if (s.t <= 0) {
        s.phase = 'fly';
        s.y = FLOOR_Y;
        w.events.push({ type: 'spikeUp', x: s.x, y: FLOOR_Y, player: -1 });
      }
      continue;
    }

    // Відбитий шип уже нікому не шкодить — просто падає назад у землю.
    if (s.phase === 'fall') {
      s.y += SPIKE.parryFall * dt;
      if (s.y > WORLD.h + 90) w.spikes.splice(i, 1);
      continue;
    }

    s.y -= SPIKE.speed * dt;
    if (s.y < -90) { w.spikes.splice(i, 1); continue; }

    // Спершу долоня, потім кулька: шип, що летить крізь долоню в кульку,
    // має бути відбитий, а не зарахований як влучання.
    const hd = handAtSpike(w, s, dt);
    if (hd) {
      s.phase = 'fall';
      // У шаленому режимі рука не втомлюється зовсім — ні від кульки, ні від шипа.
      if (hd.rage <= 0) hd.slow = HAND.slowTime * skinAt(w.skin).slowMul;
      w.events.push({ type: 'parry', x: s.x, y: s.y, player: hd.player });
      continue;
    }

    if (spikeHitsBalloon(w.balloon, s.x, s.y)) {
      w.events.push({ type: 'spike', x: s.x, y: s.y, player: -1 });
      loseLives(w, skinAt(w.skin).spikeCost);   // зелена тримає удар за одне серце
      return;   // кулька вже відроджується, решту шипів прибрано
    }
  }

  if (!w.spikesOn) return;
  w.spikeTimer -= dt;
  if (w.spikeTimer > 0) return;
  w.spikeTimer = SPIKE.minGap + Math.random() * (SPIKE.maxGap - SPIKE.minGap);

  // Цілимось приблизно під кульку, але з розкидом — щоб шип був загрозою,
  // від якої все ж можна відвести кульку вбік.
  const c = balloonCenter(w.balloon);
  const x = clamp(c.x + (Math.random() - 0.5) * SPIKE.spread, 60, WORLD.w - 60);
  w.spikes.push({ id: ++w.spikeSeq, x, y: FLOOR_Y, phase: 'warn', t: SPIKE.warn });
  w.events.push({ type: 'spikeWarn', x, y: FLOOR_Y, player: -1 });
}

/**
 * Долоня, яка накрила вістря шипа. Шип летить швидко (760 px/с — це 12 px за
 * кадр), тому дивимось не на саму точку вістря, а на весь відрізок, який воно
 * пройшло за цей кадр: інакше шип «перестрибував» би долоню.
 */
function handAtSpike(w, s, dt) {
  const reach = HAND.r + SPIKE.parryRadius;
  const from = { x: s.x, y: s.y + SPIKE.speed * dt };
  const to = { x: s.x, y: s.y };
  for (const hd of w.hands) {
    if (!hd.active) continue;
    const [d] = segDist(from, to, hd.x, hd.y);
    if (d < reach) return hd;
  }
  return null;
}

function spikeHitsBalloon(b, x, y) {
  if (pointInPolygon(x, y, b.pts)) return true;
  for (const p of b.pts) {
    if (Math.hypot(p.x - x, p.y - y) < SPIKE.hitRadius) return true;
  }
  return false;
}

/** Спільний шлях втрати сердець: і від падіння, і від шипа. */
function loseLives(w, n) {
  w.lives = Math.max(0, w.lives - n);
  if (w.lives <= 0) {
    w.state = 'over';
  } else {
    w.state = 'respawn';
    w.timer = RULES.respawnDelay;
  }
  // Нова кулька прилітає надутою, а чайки й шипи починають відлік наново.
  w.deflate = 0;
  w.gull = null;
  w.gullTimer = GULL.period;
  w.spikes.length = 0;
  w.spikeTimer = SPIKE.minGap;
  w.poops.length = 0;
}

/** Плавне здування після укусу і таке ж плавне повернення до норми. */
function updateInflation(w, dt) {
  if (w.deflate > 0) w.deflate = Math.max(0, w.deflate - dt);
  const target = w.deflate > 0 ? GULL.deflateScale : 1;
  const b = w.balloon;
  b.inflate += (target - b.inflate) * (1 - Math.exp(-dt * GULL.inflateRate));
}

/**
 * Один крок згладженого руху долоні до цілі.
 * Винесено окремо, бо цим самим кроком клієнт веде свою локальну долоню в
 * мультиплеєрі — інакше вона розходилась би з серверною, щойно обважніє.
 */
export function advanceHand(x, y, tx, ty, dt, slowed, glove = null) {
  const speedMul = (glove ?? gloveAt(0)).speedMul ?? 1;
  const k = 1 - Math.pow(1 - HAND.follow * (slowed ? HAND.slowFactor : 1), dt * 60);
  let nx = x + (tx - x) * k;
  let ny = y + (ty - y) * k;
  // Самого лише млявішого follow замало: за ціллю, що їде рівномірно, долоня
  // однаково розганяється до її швидкості, просто з більшим відставанням.
  // Тому обважнілій ріжемо ще й сам шлях за кадр — саме це й дає чесні «вдвічі
  // повільніше» на довгому веденні миші, а не тільки на ривку.
  const lim = (slowed ? HAND.slowSpeed : HAND.maxSpeed) * speedMul * dt;
  const dx = nx - x;
  const dy = ny - y;
  const d = Math.hypot(dx, dy);
  if (d > lim && d > 1e-6) { nx = x + (dx / d) * lim; ny = y + (dy / d) * lim; }
  return { x: nx, y: ny };
}

function moveHands(w, dt) {
  for (const h of w.hands) {
    h.px = h.x;
    h.py = h.y;
    const n = advanceHand(h.x, h.y, h.tx, h.ty, dt, h.slow > 0, gloveAt(h.glove));
    h.x = n.x;
    h.y = n.y;
    h.vx = (h.x - h.px) / dt;
    h.vy = (h.y - h.py) / dt;
    const sp = Math.hypot(h.vx, h.vy);
    if (sp > HAND.maxSpeed) {
      h.vx = (h.vx / sp) * HAND.maxSpeed;
      h.vy = (h.vy / sp) * HAND.maxSpeed;
    }
    if (h.slow > 0) h.slow = Math.max(0, h.slow - dt);
    if (h.rage > 0) h.rage = Math.max(0, h.rage - dt);
    if (h.flash > 0) h.flash -= dt * 3;
  }
}

function substep(w, h, alpha) {
  const b = w.balloon;
  const pts = b.pts;
  const n = pts.length;
  const bio = biomeAt(w.level);
  let gravity = Math.min(BALLOON.gravity + w.score * RULES.gravityRamp, RULES.maxGravity);
  gravity *= skinAt(w.skin).gravityMul;    // синя кулька падає повільніше
  gravity *= bio.gravityMul;               // у космосі — майже невагомість
  if (w.deflate > 0) gravity *= GULL.gravityMul;
  const sway = Math.sin(w.time * 0.7) * BALLOON.sway * bio.swayMul;

  // 1. Скидаємо сили, додаємо гравітацію та легкий протяг.
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    p.fx = sway * p.m;
    p.fy = gravity * p.m;
  }

  // 2. Пружини оболонки (з демпфуванням по відносній швидкості).
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % n];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const nx = dx / d;
    const ny = dy / d;
    const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
    const f = (d - b.rest[i] * b.inflate) * b.ks + rv * b.kd;
    a.fx += nx * f; a.fy += ny * f;
    c.fx -= nx * f; c.fy -= ny * f;
  }

  // 3. Тиск повітря всередині: сила на кожне ребро = P * довжина, назовні по нормалі.
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % n];
    area2 += a.x * c.y - c.x * a.y;
  }
  const area = Math.max(Math.abs(area2 * 0.5), 1);
  // Тиск масштабується як квадрат розміру, інакше здута кулька не втримає форму.
  const P = (b.pConst * b.inflate * b.inflate) / area;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % n];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const L = Math.hypot(dx, dy) || 1e-6;
    const fx = (dy / L) * P * L * 0.5;   // (dy,-dx)/L — зовнішня нормаль ребра
    const fy = (-dx / L) * P * L * 0.5;
    a.fx += fx; a.fy += fy;
    c.fx += fx; c.fy += fy;
  }

  // 4. «Спиці» до центру мас: дуже м'які, лише повертають силует краплі.
  //    Протидію рівномірно розкладаємо по всіх точках, інакше кулька
  //    штовхала б сама себе.
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += pts[i].x; cy += pts[i].y; }
  cx /= n; cy /= n;
  let rx = 0, ry = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy) || 1e-6;
    const nx = dx / d;
    const ny = dy / d;
    const f = (d - b.spokes[i] * b.inflate) * BALLOON.ksR + (p.vx * nx + p.vy * ny) * BALLOON.kdR;
    p.fx -= nx * f; p.fy -= ny * f;
    rx += nx * f; ry += ny * f;
  }
  for (let i = 0; i < n; i++) { pts[i].fx += rx / n; pts[i].fy += ry / n; }

  // 5. Опір повітря + інтегрування (напівнеявний Ейлер).
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const sp = Math.hypot(p.vx, p.vy);
    // Здута кулька менша, тож і опору повітря має менше — саме це й дає
    // обіцяне «падає вдвічі швидше» разом із подвоєною гравітацією.
    const c = (BALLOON.drag * b.inflate + BALLOON.drag2 * sp) * bio.dragMul;
    p.fx -= p.vx * c * p.m;
    p.fy -= p.vy * c * p.m;
    p.vx += (p.fx / p.m) * h;
    p.vy += (p.fy / p.m) * h;
    p.x += p.vx * h;
    p.y += p.vy * h;
  }

  collideHands(w, alpha);
  collideWalls(w);
  limitStretch(w.balloon);
}

/**
 * Не даємо оболонці розтягнутись понад міру. Без цього різке смикання долонею
 * тягне точки контакту за собою, решта кульки відстає, і пружини (ks=1500)
 * вистрілюють на десятки тисяч px/с.
 */
function limitStretch(b) {
  const pts = b.pts;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % n];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const d = Math.hypot(dx, dy);
    const lim = b.rest[i] * b.inflate * BALLOON.maxStretch;
    if (d <= lim || d < 1e-6) continue;
    const k = ((d - lim) / d) * 0.5;
    a.x += dx * k; a.y += dy * k;
    c.x -= dx * k; c.y -= dy * k;
  }
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > BALLOON.maxSpeed) {
      const f = BALLOON.maxSpeed / sp;
      p.vx *= f; p.vy *= f;
    }
  }
}

function collideHands(w, alpha) {
  const b = w.balloon;
  const pts = b.pts;
  const n = pts.length;

  for (const hd of w.hands) {
    if (!hd.active) continue;
    // Долоню рухаємо всередині підкроку — інакше швидкий ляпас проскакує оболонку.
    const hx = hd.px + (hd.x - hd.px) * alpha;
    const hy = hd.py + (hd.y - hd.py) * alpha;
    // Долоня тілесна завжди: обважніла — теж б'є, просто повільніше, а тому й
    // слабше (ляпас рахується від її швидкості). Смикати оболонку вона при
    // цьому не встигає — швидкість долоні обмежена в advanceHand.

    const minD = hd.r + BALLOON.skin;
    const handSpeed = Math.hypot(hd.vx, hd.vy);
    const hx0 = hx, hy0 = hy;

    // Імпульс ділимо: частина йде в точку контакту (вм'ятина),
    // частина рівномірно всій кульці (вона відлітає цілком, як у житті).
    const acc = { gx: 0, gy: 0, hits: 0, cx: 0, cy: 0 };

    if (pointInPolygon(hx, hy, pts)) {
      // Кулька «проковтнула» долоню: перевірка ребер тут не спрацює, бо всі вони
      // далі, ніж minD. Зсуваємо кульку ЦІЛКОМ у бік найближчого ребра — інакше
      // вийде лише вм'ятина, і долоня застрягне в ній, як у кишені.
      let best = -1, bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const [d] = segDist(pts[i], pts[(i + 1) % n], hx, hy);
        if (d < bestD) { bestD = d; best = i; }
      }
      // Найближче ребро показує найкоротший вихід, але зсувати кульку треба
      // ПРОТИ його зовнішньої нормалі: щоб долоня вийшла через ліву стінку,
      // кулька має поїхати праворуч.
      const on = outwardNormal(pts, best);
      const nrm = { x: -on.x, y: -on.y };
      const push = Math.min(minD + bestD, 30);   // за підкрок, щоб не було ривка
      let vx = 0, vy = 0;
      for (let i = 0; i < n; i++) {
        pts[i].x += nrm.x * push;
        pts[i].y += nrm.y * push;
        vx += pts[i].vx; vy += pts[i].vy;
      }
      vx /= n; vy /= n;
      const vn = (vx - hd.vx) * nrm.x + (vy - hd.vy) * nrm.y;
      // Тут лише виштовхування, без ляпаса: це шлях відновлення, а не удар.
      // Ляпас накладався б на всі n точок на кожному підкроці й розганяв кульку.
      let jx = 0, jy = 0;
      if (vn < 0) { const j = -(1 + HAND.restitution) * vn; jx = nrm.x * j; jy = nrm.y * j; }
      for (let i = 0; i < n; i++) { pts[i].vx += jx; pts[i].vy += jy; }
      acc.hits++;
      acc.cx += hx; acc.cy += hy;
    } else {
      for (let i = 0; i < n; i++) {
        const [d, t, qx, qy] = segDist(pts[i], pts[(i + 1) % n], hx, hy);
        if (d >= minD) continue;
        const inv = d > 1e-4 ? 1 / d : 0;
        const nx = inv ? (qx - hx) * inv : outwardNormal(pts, i).x;
        const ny = inv ? (qy - hy) * inv : outwardNormal(pts, i).y;
        resolveEdge(b, i, t, hx, hy, minD - d, { x: nx, y: ny }, hd, acc);
      }
    }

    if (acc.hits > 0) {
      const sx = acc.gx / n;
      const sy = acc.gy / n;
      for (let i = 0; i < n; i++) { pts[i].vx += sx; pts[i].vy += sy; }
      if (!hd.touching) {
        // Ляпас — рівно тут, на першому підкроці дотику, і рівно один раз.
        // Швидкість долоні додаємо ВСІЙ кульці однаково: спільний зсув швидкості
        // не змінює взаємних швидкостей точок, тож оболонку таким поштовхом
        // не розірве, хай яким сильним буде удар.
        // З брудної долоні кулька ковзає — удар виходить утричі слабший.
        let kick = HAND.slapBase + Math.min(handSpeed, HAND.slapCap) * HAND.slapPerSpeed;
        if (hd.dirty) kick *= POOP.slapMul;
        let dx, dy;
        if (handSpeed > 1) {
          dx = hd.vx / handSpeed;
          dy = hd.vy / handSpeed;
        } else {
          // Долоня стоїть — штовхаємо від неї до центру кульки.
          let cx = 0, cy = 0;
          for (let i = 0; i < n; i++) { cx += pts[i].x; cy += pts[i].y; }
          const ox = cx / n - hx0, oy = cy / n - hy0;
          const ol = Math.hypot(ox, oy) || 1;
          dx = ox / ol; dy = oy / ol;
        }
        for (let i = 0; i < n; i++) { pts[i].vx += dx * kick; pts[i].vy += dy * kick; }

        hd.flash = 1;
        // Очко — лише свіжій долоні. Обважніла все одно відбиває кульку, але
        // молотити нею впритул і набивати рахунок не вийде.
        // Брудна рука не заробляє: саме це й жене гравця до відра.
        const scores = hd.slow <= 0 && !hd.dirty;
        // Шал не лише прибирає штраф — саме тому в ньому й зараховується
        // кожен удар підряд: `scores` дивиться на той самий `slow`.
        if (hd.rage <= 0) hd.slow = HAND.slowTime * skinAt(w.skin).slowMul;
        if (scores) {
          w.score++;
          const lvl = levelInfo(w.score).level;
          if (lvl > w.level) {
            onLevelUp(w, lvl);
            w.events.push({ type: 'level', x: WORLD.w / 2, y: 220, player: hd.player, level: lvl, spikes: w.spikesOn });
          }
          w.events.push({
            type: 'hit',
            x: acc.cx / acc.hits, y: acc.cy / acc.hits,
            player: hd.player,
            power: Math.min(1, handSpeed / 1400),
          });
        }
      }
      hd.touching = true;
    } else {
      hd.touching = false;
    }
  }
}

/**
 * Розв'язує контакт долоні з ребром `i` у точці з параметром `t`.
 * Зсув і імпульс розкладаємо на дві вершини ребра з вагами (1-t) і t,
 * а множник 1/(w0²+w1²) робить так, щоб саме точка контакту зсунулась на `pen`.
 */
function resolveEdge(b, i, t, hx, hy, pen, nrm, hd, acc) {
  const pts = b.pts;
  const a = pts[i];
  const c = pts[(i + 1) % pts.length];
  const w0 = 1 - t;
  const w1 = t;
  const s = 1 / Math.max(w0 * w0 + w1 * w1, 1e-6);

  const push = pen * s;
  a.x += nrm.x * push * w0; a.y += nrm.y * push * w0;
  c.x += nrm.x * push * w1; c.y += nrm.y * push * w1;

  const vx = a.vx * w0 + c.vx * w1;
  const vy = a.vy * w0 + c.vy * w1;
  const rvx = vx - hd.vx;
  const rvy = vy - hd.vy;
  const vn = rvx * nrm.x + rvy * nrm.y;

  let jx = 0, jy = 0;
  if (vn < 0) {
    const j = -(1 + HAND.restitution) * vn;
    jx += nrm.x * j;
    jy += nrm.y * j;
  }
  // Ковзний удар тягне оболонку вбік — кулька закручується.
  const tvx = rvx - nrm.x * vn;
  const tvy = rvy - nrm.y * vn;
  jx -= tvx * HAND.friction;
  jy -= tvy * HAND.friction;

  const local = (1 - HAND.spread) * s;
  a.vx += jx * local * w0; a.vy += jy * local * w0;
  c.vx += jx * local * w1; c.vy += jy * local * w1;
  acc.gx += jx * HAND.spread;
  acc.gy += jy * HAND.spread;
  acc.cx += hx + nrm.x * hd.r;
  acc.cy += hy + nrm.y * hd.r;
  acc.hits++;
}

/** Відстань від точки до відрізка: [дистанція, параметр t, найближча точка]. */
function segDist(a, c, px, py) {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 1e-9 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = a.x + dx * t;
  const qy = a.y + dy * t;
  return [Math.hypot(qx - px, qy - py), t, qx, qy];
}

/** Зовнішня нормаль ребра `i` (точки оболонки йдуть за годинниковою стрілкою). */
function outwardNormal(pts, i) {
  const a = pts[i];
  const c = pts[(i + 1) % pts.length];
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-6;
  return { x: dy / L, y: -dx / L };
}

function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const c = pts[j];
    if ((a.y > py) !== (c.y > py) && px < ((c.x - a.x) * (py - a.y)) / (c.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function collideWalls(w) {
  const pts = w.balloon.pts;
  const e = BALLOON.wallRestitution;
  const r = BALLOON.skin;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < r) { p.x = r; p.vx = Math.abs(p.vx) * e; }
    else if (p.x > WORLD.w - r) { p.x = WORLD.w - r; p.vx = -Math.abs(p.vx) * e; }
    if (p.y < CEIL_Y + r) { p.y = CEIL_Y + r; p.vy = Math.abs(p.vy) * e; }
  }
}

function checkFloor(w) {
  const pts = w.balloon.pts;
  let maxY = -Infinity;
  let mx = 0;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].y > maxY) { maxY = pts[i].y; mx = pts[i].x; }
  }
  if (maxY < FLOOR_Y) return;

  w.events.push({ type: 'drop', x: mx, y: FLOOR_Y, player: -1 });
  loseLives(w, 1);
}

export function restart(w) {
  w.score = 0;
  w.level = 1;
  w.gull = null;
  w.gullTimer = GULL.period;
  w.deflate = 0;
  w.spikes.length = 0;
  w.spikesOn = false;
  w.spikeTimer = SPIKE.minGap;
  w.medkits = MEDKIT.perLevel;
  w.lives = RULES.lives;
  w.state = 'playing';
  w.timer = 0;
  w.events.length = 0;
  spawnBalloon(w, WORLD.w / 2, 220);
  w.poops.length = 0;
  for (const h of w.hands) { h.touching = false; h.slow = 0; h.rage = 0; h.rages = RAGE.perLevel; h.dirty = false; }
}

// -------------------------------------------------------------- допоміжне

export function balloonCenter(b) {
  let x = 0, y = 0;
  for (const p of b.pts) { x += p.x; y += p.y; }
  return { x: x / b.pts.length, y: y / b.pts.length };
}

export function balloonBottom(b) {
  let y = -Infinity;
  for (const p of b.pts) if (p.y > y) y = p.y;
  return y;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
