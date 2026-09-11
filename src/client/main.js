import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Net, defaultServerUrl } from './net.js';
import { sfx, setMuted, isMuted } from './sound.js';
import { createWorld, step, addHand, setHandTarget, restart, levelInfo, advanceHand, useMedkit, anyHandSlowed, setSkin, setGlove, useRage } from '../shared/physics.js';
import { WORLD, RULES, PLAYER_COLORS, PLAYER_COLOR_NAMES, MEDKIT, RAGE, COIN, SKINS, GLOVES, gloveAt, biomeAt } from '../shared/constants.js';

const $ = (s) => document.querySelector(s);

const game = {
  mode: null,        // 'solo' | 'local2' | 'online'
  world: null,
  net: null,
  ghost: null,       // локальний прогноз власної долоні в мультиплеєрі
  over: false,
};

let renderer, input;
let banner = { text: '', t: 0 };   // тимчасовий підпис «Рівень N!»
// Вибраний скін переживає перезавантаження — дитина не має щоразу шукати «свою» кульку.
let skin = Math.min(Number(localStorage.getItem('balloon-skin') || 0), SKINS.length - 1);
let glove = Math.min(Number(localStorage.getItem('balloon-glove') || 0), GLOVES.length - 1);

async function boot() {
  renderer = await new Renderer().init($('#stage'));
  input = new Input(renderer, { slots: 2 });

  $('#btn-solo').onclick = () => startLocal(1);
  $('#btn-local2').onclick = () => startLocal(2);
  $('#btn-host').onclick = () => startOnline('');
  $('#btn-join').onclick = () => {
    const code = $('#room-input').value.trim().toUpperCase();
    if (code.length < 3) { setNote('Введи код кімнати з 4 символів', true); return; }
    startOnline(code);
  };
  $('#room-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-join').click(); });
  $('#btn-menu').onclick = () => toMenu();
  $('#btn-again').onclick = () => doRestart();
  $('#btn-mute').onclick = () => {
    setMuted(!isMuted());
    $('#btn-mute').textContent = isMuted() ? '🔇' : '🔊';
  };
  $('#btn-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname + '?room=' + game.net.room);
      $('#btn-copy').textContent = 'Скопійовано ✓';
      setTimeout(() => ($('#btn-copy').textContent = 'Копіювати посилання'), 1600);
    } catch { setNote('Скопіюй код вручну: ' + game.net.room, false); }
  };

  ensureOwned();
  buildPicker('skin');
  buildPicker('glove');
  showCoins();

  $('#btn-med').onclick = (e) => { e.preventDefault(); $('#btn-med').blur(); doMedkit(); };
  $('#btn-rage').onclick = (e) => { e.preventDefault(); $('#btn-rage').blur(); doRage(); };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && game.over) { e.preventDefault(); doRestart(); }
    if (e.code === 'Escape' && game.mode) toMenu();
    // KeyH — за розкладкою клавіш, тож працює і на кирилиці («Р»).
    if (e.code === 'KeyH' && game.mode && !game.over) { e.preventDefault(); doMedkit(); }
    if (e.code === 'KeyB' && game.mode && !game.over) { e.preventDefault(); doRage(); }
  });
  window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

  // Посилання-запрошення виду ?room=ABCD одразу веде в кімнату,
  // а ?mode=solo / ?mode=local2 — одразу в локальну гру.
  const q = new URLSearchParams(location.search);
  const invite = q.get('room');
  const mode = q.get('mode');
  if (invite) { $('#room-input').value = invite.toUpperCase(); startOnline(invite.toUpperCase()); }
  else if (mode === 'solo') startLocal(1);
  else if (mode === 'local2') startLocal(2);

  renderer.app.ticker.add((t) => frame(Math.min(t.deltaMS / 1000, 1 / 20)));
}

// ------------------------------------------------------------------ магазин
//
// Монети — річ особиста і живуть у localStorage, а не у світі: у мультиплеєрі
// кожен збирає свій гаманець зі своїх влучань, тож сервер про них не знає.

const wallet = {
  coins: Number(localStorage.getItem('balloon-coins') || 0),
  owned: {
    skin: new Set(JSON.parse(localStorage.getItem('balloon-owned-skins') || '["red"]')),
    glove: new Set(JSON.parse(localStorage.getItem('balloon-owned-gloves') || '["hand"]')),
  },
  earned: 0,   // зароблено за поточну партію — показуємо в кінці
};

function saveWallet() {
  localStorage.setItem('balloon-coins', String(wallet.coins));
  localStorage.setItem('balloon-owned-skins', JSON.stringify([...wallet.owned.skin]));
  localStorage.setItem('balloon-owned-gloves', JSON.stringify([...wallet.owned.glove]));
}

function addCoins(n) {
  wallet.coins += n;
  wallet.earned += n;
  saveWallet();
  showCoins();
}

function showCoins() {
  $('#coins').textContent = '🪙 ' + wallet.coins;
  $('#coins-hud').textContent = '🪙 ' + wallet.coins;
}

/** Опис одного ряду магазину: список, де зберігається вибір, що робити після. */
const PICKERS = {
  skin: {
    box: '#skins', list: SKINS, store: 'balloon-skin',
    name: '#skin-name', ability: '#skin-ability',
    color: (it) => '#' + it.color.toString(16).padStart(6, '0'),
    apply: (i) => { skin = i; if (demo) setSkin(demo, i); },
  },
  glove: {
    box: '#gloves', list: GLOVES, store: 'balloon-glove',
    name: '#glove-name', ability: '#glove-ability',
    color: () => '#e8f2f8',
    apply: (i) => { glove = i; },
  },
};

/**
 * Рядок кружечків у меню. Куплені обираються кліком, некуплені показують ціну
 * і купуються тим самим кліком — окремої кнопки «купити» немає, бо для дитини
 * менше кроків важливіше за формальність.
 */
function buildPicker(kind) {
  const p = PICKERS[kind];
  const box = $(p.box);
  box.innerHTML = '';
  p.list.forEach((it, i) => {
    const cell = document.createElement('div');
    cell.className = 'pick';
    const b = document.createElement('button');
    b.className = 'skin';
    b.type = 'button';
    b.textContent = it.emoji;
    b.title = it.name + ' — ' + it.ability;
    b.style.background = p.color(it);
    b.onclick = () => pickItem(kind, i);
    const tag = document.createElement('span');
    tag.className = 'price';
    cell.append(b, tag);
    box.appendChild(cell);
  });
  refreshPicker(kind);
}

/** Клік: своє — вдягаємо, чуже — пробуємо купити. */
function pickItem(kind, i) {
  const p = PICKERS[kind];
  const it = p.list[i];
  if (!wallet.owned[kind].has(it.id)) {
    if (wallet.coins < it.price) {
      // Підпис саме під цим рядом, а не в загальному #note внизу картки:
      // картка прокручується, і повідомлення там просто не побачили б.
      flashPicker(kind, 'Не вистачає 🪙 ' + (it.price - wallet.coins) + '. Збивай кульку — за кожне влучання монета!', true);
      return;
    }
    wallet.coins -= it.price;
    wallet.owned[kind].add(it.id);
    saveWallet();
    showCoins();
    sfx.level();
    buildPicker(kind);   // ціна зникає, кружечок оживає
    flashPicker(kind, 'Куплено: ' + it.emoji + ' ' + it.name + '!', false);
  }
  localStorage.setItem(p.store, String(i));
  p.apply(i);
  refreshPicker(kind);
}

/** Тимчасовий підпис під рядом магазину; за дві секунди повертається опис. */
function flashPicker(kind, text, isError) {
  const el = $(PICKERS[kind].ability);
  el.textContent = text;
  el.classList.toggle('warn', !!isError);
  clearTimeout(PICKERS[kind].timer);
  PICKERS[kind].timer = setTimeout(() => refreshPicker(kind), 2200);
}

function refreshPicker(kind) {
  const p = PICKERS[kind];
  const cur = kind === 'skin' ? skin : glove;
  const cells = $(p.box).children;
  for (let k = 0; k < cells.length; k++) {
    const it = p.list[k];
    const has = wallet.owned[kind].has(it.id);
    const b = cells[k].firstChild;
    b.setAttribute('aria-pressed', String(k === cur));
    b.classList.toggle('locked', !has);
    cells[k].lastChild.textContent = has ? '' : '🪙 ' + it.price;
  }
  $(p.name).textContent = p.list[cur].emoji + ' ' + p.list[cur].name;
  $(p.ability).textContent = p.list[cur].ability;
  $(p.ability).classList.remove('warn');
}

/**
 * Вибір із localStorage може вказувати на скін, який ще не куплено (наприклад,
 * після скидання гаманця) — тоді тихо повертаємось до класичного.
 */
function ensureOwned() {
  if (!wallet.owned.skin.has(SKINS[skin]?.id)) skin = 0;
  if (!wallet.owned.glove.has(GLOVES[glove]?.id)) glove = 0;
}

// ------------------------------------------------------------------ режими

function startLocal(players) {
  game.mode = players === 1 ? 'solo' : 'local2';
  game.world = createWorld();
  setSkin(game.world, skin);
  game.over = false;
  // Обидва локальні гравці грають вибраною перчаткою: пікер у меню один.
  for (let i = 0; i < players; i++) addHand(game.world, 'h' + i, i, glove);
  input.reset(players);
  showHud(players === 1 ? 'Веди мишкою або WASD' : 'Гравець 1 — WASD, Гравець 2 — стрілки. На сенсорі — два пальці');
  sfx.start();
}

async function startOnline(room) {
  setNote("З'єднуємось…", false);
  const net = new Net();
  net.onError = (m) => setNote(m, true);
  net.onEvent = onWorldEvent;
  net.onStatus = (m) => {
    if (m.t === 'closed') { setNote("З'єднання втрачено", true); toMenu(); return; }
    $('#peer-info').textContent = peerLabel(m.n, net.maxPlayers);
  };
  try {
    await net.connect(defaultServerUrl(), room);
  } catch (e) {
    setNote(e.message + '. Запусти сервер: npm start', true);
    return;
  }
  net.setSkin(skin);    // кулька в кімнаті одна, тож діє вибір того, хто обрав останнім
  net.setGlove(glove);  // а перчатка особиста — сервер змінить лише твою долоню
  game.mode = 'online';
  game.net = net;
  game.world = null;
  game.over = false;
  input.reset(1);
  game.ghost = { x: WORLD.w / 2, y: WORLD.h - 180 };
  $('#room-code').textContent = net.room;
  $('#room-badge').hidden = false;
  $('#peer-info').textContent = peerLabel(net.peers, net.maxPlayers);
  showHud('Ти — ' + PLAYER_COLOR_NAMES[net.side] + ' долоня. Дай друзям код ' + net.room);
  sfx.start();
}

/** «Чекаємо…» / «Граєте втрьох» / «Кімната повна» — одним рядком. */
function peerLabel(n, max) {
  if (n < 2) return 'Чекаємо на друзів…';
  const words = { 2: 'вдвох', 3: 'втрьох', 4: 'вчотирьох' };
  const who = words[n] ?? n + ' гравці';
  return `Граєте ${who} 🎉` + (n < max ? ` · є місце ще для ${max - n}` : '');
}

function toMenu() {
  game.net?.close();
  game.net = null;
  game.world = null;
  game.mode = null;
  game.over = false;
  input.reset(2);
  $('#menu').hidden = false;
  $('#hud').hidden = true;
  $('#gameover').hidden = true;
  $('#room-badge').hidden = true;
  setNote('', false);
}

function doRestart() {
  $('#gameover').hidden = true;
  banner = { text: '', t: 0 };
  game.over = false;
  wallet.earned = 0;
  if (game.mode === 'online') game.net.restart();
  else if (game.world) restart(game.world);
  sfx.start();
}

/**
 * Аптечка. У мультиплеєрі рішення за сервером (заряди спільні), локально —
 * рахуємо самі й одразу програємо подію: `step()` чистить події на початку
 * кроку, тож у світі вона б не дожила до наступного кадру.
 */
function doMedkit() {
  if (game.mode === 'online') { game.net.medkit(); return; }
  if (!game.world) return;
  const ev = useMedkit(game.world);
  if (ev) onWorldEvent(ev);
}

/** Шал боксерської перчатки — той самий шлях, що й аптечка. */
function doRage() {
  if (game.mode === 'online') { game.net.rage(); return; }
  if (!game.world) return;
  const ev = useRage(game.world, 'h0');
  if (ev) onWorldEvent(ev);
}

/**
 * Кнопка шалу видима лише для боксерської перчатки — решті вона нічого не дає.
 * Поки шал триває, кнопка горить червоним і не приймає другий заряд.
 */
function updateRageButton(hand) {
  const box = $('#rage');
  const on = !!hand && gloveAt(hand.glove ?? 0).rage;
  box.hidden = !on;
  if (!on) return;
  const btn = $('#btn-rage');
  btn.disabled = !(hand.rages > 0 && !(hand.rage > 0));
  btn.classList.toggle('on', hand.rage > 0);
  $('#rage-left').textContent = hand.rage > 0
    ? 'ШАЛ! ' + hand.rage.toFixed(1) + ' с'
    : hand.rages + ' / ' + RAGE.perLevel + ' на рівень';
}

/**
 * Кнопка аптечки: скільки зарядів лишилось і чи є що лікувати.
 * «Є що лікувати» — це або втрачене серце, або обважніла після удару рука.
 */
function updateMedButton(medkits, lives, maxLives, slowed) {
  const btn = $('#btn-med');
  btn.disabled = !(medkits > 0 && (lives < maxLives || slowed));
  $('#med-left').textContent = medkits + ' / ' + MEDKIT.perLevel + ' на рівень';
}

function showHud(tip) {
  wallet.earned = 0;
  $('#menu').hidden = true;
  $('#gameover').hidden = true;
  $('#hud').hidden = false;
  $('#tip').textContent = tip;
  setTimeout(() => { $('#tip').classList.add('fade'); }, 4000);
  $('#tip').classList.remove('fade');
}

function setNote(text, isError) {
  const el = $('#note');
  el.textContent = text;
  el.classList.toggle('error', !!isError);
  el.hidden = !text;
}

// ------------------------------------------------------------------ кадр

function frame(dt) {
  input.update(dt);
  if (banner.t > 0) banner.t -= dt;

  let view = null;
  if (game.mode === 'online') view = frameOnline(dt);
  else if (game.mode) view = frameLocal(dt);
  else view = idleView(dt);

  if (view) {
    renderer.draw(view, dt);
    if (game.mode) {
      // У мультиплеєрі сервер відпускає долоню того, хто натиснув, тож і кнопка
      // має дивитись саме на свою руку, а не на будь-чию.
      const mine = game.mode === 'online' ? view.hands.filter((h) => h.self) : view.hands;
      updateMedButton(view.medkits ?? 0, view.lives, view.maxLives, anyHandSlowed(mine));
      updateRageButton(mine[0]);
    }
  }
}

function frameLocal(dt) {
  const w = game.world;
  for (let i = 0; i < w.hands.length; i++) {
    const t = input.target(i);
    setHandTarget(w, 'h' + i, t.x, t.y);
  }
  step(w, dt);
  for (const e of w.events) onWorldEvent(e);

  if (w.state === 'over' && !game.over) endGame(w.score);

  return {
    points: w.balloon.pts,
    hands: w.hands.map((h) => ({
      id: h.id, player: h.player, x: h.x, y: h.y, flash: h.flash, slow: h.slow,
      glove: h.glove, rage: h.rage, rages: h.rages, dirty: h.dirty, self: false,
    })),
    score: w.score,
    lives: w.lives,
    maxLives: RULES.lives,
    state: w.state,
    gull: w.gull,
    spikes: w.spikes.map((s) => ({ id: s.id, x: s.x, y: s.y, flying: s.phase !== 'warn', dead: s.phase === 'fall' })),
    poops: w.poops.map((p) => ({ id: p.id, x: p.x, y: p.y })),
    medkits: w.medkits,
    skin: w.skin,
    deflate: w.deflate,
    spikesOn: w.spikesOn,
    level: levelInfo(w.score),
    message: banner.t > 0 ? banner.text : (w.state === 'respawn' ? 'Кулька впала!' : ''),
  };
}

function frameOnline(dt) {
  const t = input.target(0);
  game.net.sendInput(t.x, t.y);

  // Свою долоню малюємо локально тим самим кроком, що й сервер: так вона
  // слухається миттєво, але не "стрибає" відносно серверної позиції. Штраф за
  // удар беремо з останнього снапшота — інакше локальна долоня була б швидша
  // за серверну рівно тоді, коли гра її навмисно сповільнила.
  const snap = game.net.sample();
  if (!snap) return null;

  const myId = 'p' + game.net.side;
  const mine = snap.hands.find((h) => h.id === myId);
  const g = advanceHand(game.ghost.x, game.ghost.y, t.x, t.y, dt, (mine?.slow ?? 0) > 0);
  game.ghost.x = g.x;
  game.ghost.y = g.y;
  const hands = snap.hands.map((h) =>
    h.id === myId
      ? { ...h, x: game.ghost.x, y: game.ghost.y, player: game.net.side, self: true }
      : { ...h, self: false });

  if (snap.state === 'over' && !game.over) endGame(snap.score);
  if (snap.state !== 'over' && game.over) { game.over = false; $('#gameover').hidden = true; }

  return {
    points: snap.points,
    hands,
    score: snap.score,
    lives: snap.lives,
    maxLives: game.net.maxLives,
    state: snap.state,
    gull: snap.gull,
    spikes: snap.spikes,
    poops: snap.poops,
    medkits: snap.medkits,
    skin: snap.skin,
    deflate: snap.deflate,
    spikesOn: snap.spikesOn,
    level: levelInfo(snap.score),
    message: banner.t > 0 ? banner.text
      : snap.state === 'waiting' ? 'Чекаємо на друзів…'
      : snap.state === 'respawn' ? 'Кулька впала!' : '',
  };
}

// У меню кулька просто плаває сама — жива заставка.
let demo = null;
function idleView(dt) {
  if (!demo) { demo = createWorld(); setSkin(demo, skin); }
  if (demo.state !== 'playing') restart(demo);
  // Не даємо їй впасти: невидима "рука вітру" підбиває знизу.
  let low = -Infinity;
  for (const p of demo.balloon.pts) low = Math.max(low, p.y);
  if (low > 560) for (const p of demo.balloon.pts) p.vy -= 900 * dt;
  step(demo, dt);
  demo.events.length = 0;
  return {
    points: demo.balloon.pts,
    hands: [],
    score: 0,
    lives: RULES.lives,
    maxLives: RULES.lives,
    state: 'playing',
    gull: null,
    spikes: [],
    poops: [],
    medkits: 0,
    skin: demo.skin,
    deflate: 0,
    spikesOn: false,
    level: levelInfo(0),
    message: '',
    hud: false,
  };
}

function onWorldEvent(e) {
  if (e.type === 'hit') {
    renderer.burst(e.x, e.y, PLAYER_COLORS[e.player % PLAYER_COLORS.length], e.power ?? 0.5);
    sfx.hit(e.power ?? 0.5);
    // Монета за кожне влучання. В онлайні — тільки за свої: події прилітають
    // від усіх гравців кімнати, а гаманець у кожного власний.
    if (game.mode !== 'online' || e.player === game.net.side) addCoins(COIN.perHit);
  } else if (e.type === 'gull') {
    banner = { text: 'Чайка летить! 🕊', t: 1.6 };
    sfx.gull();
  } else if (e.type === 'peck') {
    banner = { text: 'Кулька здувається! 💨', t: 2.2 };
    renderer.burst(e.x, e.y, 0xffffff, 1);
    renderer.shake = 0.8;
    sfx.peck();
  } else if (e.type === 'poop') {
    sfx.poop();
  } else if (e.type === 'splat') {
    banner = { text: 'Фу! Помий руку у відрі 🪣', t: 2.4 };
    renderer.burst(e.x, e.y, 0x8a6134, 0.8);
    sfx.splat();
  } else if (e.type === 'plop') {
    renderer.burst(e.x, e.y, 0x8a6134, 0.4);
  } else if (e.type === 'wash') {
    banner = { text: 'Чисто! 💦', t: 1.2 };
    renderer.burst(e.x, e.y, 0x4dc9f6, 0.9);
    sfx.wash();
  } else if (e.type === 'spikeWarn') {
    sfx.spikeWarn();
  } else if (e.type === 'spikeUp') {
    sfx.spikeUp();
  } else if (e.type === 'parry') {
    banner = { text: 'Шип відбито! 🖐', t: 1.4 };
    renderer.burst(e.x, e.y, 0xfff0a5, 0.8);
    renderer.shake = 0.5;
    sfx.parry();
  } else if (e.type === 'rage') {
    banner = { text: 'ШАЛ! 5 секунд без кулдауну 🥊 · лишилось ' + e.level, t: 1.8 };
    renderer.burst(e.x, e.y, 0xff7a1a, 1);
    renderer.shake = 0.6;
    sfx.rage();
  } else if (e.type === 'heal') {
    // level у цій події — скільки зарядів лишилось (поле переїхало з рівня),
    // healed — чи було що лікувати серцем, чи аптечку взяли лише заради руки.
    banner = {
      text: (e.healed ? 'Аптечка! +1 ❤️' : 'Аптечка! Рука знову швидка 🖐') + ' · лишилось ' + e.level,
      t: 1.8,
    };
    renderer.burst(e.x, e.y, 0x3ec46d, 1);
    sfx.heal();
  } else if (e.type === 'spike') {
    banner = { text: 'Шип! −2 ❤️', t: 2.2 };
    renderer.burst(e.x, e.y, 0xff4d4d, 1);
    renderer.shake = 1;
    sfx.spikeHit();
  } else if (e.type === 'level') {
    // На новому рівні міняється і місце — кажемо, куди саме прилетіла кулька.
    const b = biomeAt(e.level);
    banner = {
      text: 'Рівень ' + e.level + '! ' + b.emoji + ' ' + b.name + ' — ' + b.note
        + (e.spikes ? '\nОбережно, шипи ⚠' : ''),
      t: 2.8,
    };
    renderer.barPulse = 1;
    for (let i = 0; i < 3; i++) {
      renderer.burst(WORLD.w * (0.25 + i * 0.25), 200 + i * 40, [0xffd23f, 0x4dc9f6, 0xff9f1c][i], 1);
    }
    sfx.level();
  } else if (e.type === 'drop') {
    renderer.burst(e.x, e.y, 0xffffff, 1);
    renderer.shake = 1;
    sfx.drop();
  }
}

function endGame(score) {
  game.over = true;
  $('#earned').textContent = wallet.earned;
  $('#final-score').textContent = score;
  $('#final-level').textContent = levelInfo(score).level;
  $('#gameover').hidden = false;
  sfx.over();
  const best = Math.max(score, Number(localStorage.getItem('balloon-best') || 0));
  localStorage.setItem('balloon-best', String(best));
  $('#best-score').textContent = best;
}

// Зручний доступ до стану гри з консолі браузера (налагодження/тести).
window.__balloon = game;

boot();
