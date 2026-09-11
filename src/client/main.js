import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Net, defaultServerUrl } from './net.js';
import { sfx, setMuted, isMuted } from './sound.js';
import { createWorld, step, addHand, setHandTarget, restart, levelInfo, advanceHand, useMedkit, anyHandSlowed, setSkin, setGlove, useRage, canTap, maxLivesOf } from '../shared/physics.js';
import { WORLD, RULES, HARDCORE, TEAM, PLAYER_COLORS, PLAYER_COLOR_NAMES, PLAYER_NAMES, MEDKIT, RAGE, COIN, SKINS, GLOVES, CHARACTERS, PERKS, BUFFS, handKit, biomeAt, rulesFor, skullReward, perkMask } from '../shared/constants.js';

const $ = (s) => document.querySelector(s);

const game = {
  mode: null,        // як грають: 'solo' | 'local2' | 'online'
  kind: 'normal',    // у ЩО грають: 'normal' | 'hardcore' | 'team' — це режим світу
  hardcore: false,   // похідні від kind, щоб перевірки читались коротко
  team: false,
  world: null,
  net: null,
  ghost: null,       // локальний прогноз власної долоні в мультиплеєрі
  over: false,
};

let renderer, input;
let banner = { text: '', t: 0 };   // тимчасовий підпис «Рівень N!»
let bestCombo = 0;                 // найдовша серія пасів за партію — у підсумок
// Вибраний скін переживає перезавантаження — дитина не має щоразу шукати «свою» кульку.
let skin = Math.min(Number(localStorage.getItem('balloon-skin') || 0), SKINS.length - 1);
let glove = Math.min(Number(localStorage.getItem('balloon-glove') || 0), GLOVES.length - 1);
let char = Math.min(Number(localStorage.getItem('balloon-char') || 0), CHARACTERS.length - 1);

/** Режим світу тримаємо в одному місці: похідні прапорці не мають розходитись. */
function setKind(k) {
  game.kind = k;
  game.hardcore = k === 'hardcore';
  game.team = k === 'team';
}

async function boot() {
  renderer = await new Renderer().init($('#stage'));
  input = new Input(renderer, { slots: 2 });

  $('#btn-solo').onclick = () => startLocal(1);
  $('#btn-local2').onclick = () => startLocal(2);
  $('#btn-hc').onclick = () => startLocal(1, 'hardcore');
  $('#btn-hc2').onclick = () => startLocal(2, 'hardcore');
  $('#btn-hc-host').onclick = () => startOnline('', 'hardcore');
  $('#btn-team2').onclick = () => startLocal(2, 'team');
  $('#btn-team-host').onclick = () => startOnline('', 'team');
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
  buildPicker('char');
  buildPicker('perk');
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
  else if (mode === 'hardcore') startLocal(1, 'hardcore');
  else if (mode === 'hardcore2') startLocal(2, 'hardcore');
  else if (mode === 'team') startLocal(2, 'team');

  renderer.app.ticker.add((t) => frame(Math.min(t.deltaMS / 1000, 1 / 20)));
}

// ------------------------------------------------------------------ магазин
//
// Монети — річ особиста і живуть у localStorage, а не у світі: у мультиплеєрі
// кожен збирає свій гаманець зі своїх влучань, тож сервер про них не знає.

// Черепи — друга валюта і живуть у тому ж гаманці, але заробляються інакше:
// не за влучання, а лише за пройдений хардкор-рівень. Тому їх не «накопичиш
// між ділом» у дитячій грі: щоб купити персонажа, треба саме хардкор грати.
const wallet = {
  coins: Number(localStorage.getItem('balloon-coins') || 0),
  skulls: Number(localStorage.getItem('balloon-skulls') || 0),
  tokens: Number(localStorage.getItem('balloon-tokens') || 0),
  owned: {
    skin: new Set(JSON.parse(localStorage.getItem('balloon-owned-skins') || '["red"]')),
    glove: new Set(JSON.parse(localStorage.getItem('balloon-owned-gloves') || '["hand"]')),
    char: new Set(JSON.parse(localStorage.getItem('balloon-owned-chars') || '["racoon"]')),
    // Перки, на відміну від скінів, не «вдягаються»: куплений діє завжди.
    perk: new Set(JSON.parse(localStorage.getItem('balloon-owned-perks') || '[]')),
  },
  earned: 0,        // монет за поточну партію — показуємо в кінці
  earnedSkulls: 0,  // і черепів за неї ж
  earnedTokens: 0,  // і жетонів
};

function saveWallet() {
  localStorage.setItem('balloon-coins', String(wallet.coins));
  localStorage.setItem('balloon-skulls', String(wallet.skulls));
  localStorage.setItem('balloon-owned-skins', JSON.stringify([...wallet.owned.skin]));
  localStorage.setItem('balloon-owned-gloves', JSON.stringify([...wallet.owned.glove]));
  localStorage.setItem('balloon-owned-chars', JSON.stringify([...wallet.owned.char]));
  localStorage.setItem('balloon-tokens', String(wallet.tokens));
  localStorage.setItem('balloon-owned-perks', JSON.stringify([...wallet.owned.perk]));
}

function addCoins(n) {
  wallet.coins += n;
  wallet.earned += n;
  saveWallet();
  showCoins();
}

function addSkulls(n) {
  wallet.skulls += n;
  wallet.earnedSkulls += n;
  saveWallet();
  showCoins();
}

function addTokens(n) {
  wallet.tokens += n;
  wallet.earnedTokens += n;
  saveWallet();
  showCoins();
}

function showCoins() {
  $('#coins').textContent = '🪙 ' + wallet.coins;
  $('#coins-hud').textContent = '🪙 ' + wallet.coins;
  $('#skulls').textContent = '☠ ' + wallet.skulls;
  $('#skulls-hud').textContent = '☠ ' + wallet.skulls;
  $('#tokens').textContent = '🤝 ' + wallet.tokens;
  $('#tokens-hud').textContent = '🤝 ' + wallet.tokens;
}

/** Опис одного ряду магазину: список, де зберігається вибір, що робити після. */
const PICKERS = {
  skin: {
    box: '#skins', list: SKINS, store: 'balloon-skin',
    name: '#skin-name', ability: '#skin-ability',
    money: 'coins', coin: '🪙',
    color: (it) => '#' + it.color.toString(16).padStart(6, '0'),
    cur: () => skin,
    apply: (i) => { skin = i; if (demo) setSkin(demo, i); },
  },
  glove: {
    box: '#gloves', list: GLOVES, store: 'balloon-glove',
    name: '#glove-name', ability: '#glove-ability',
    money: 'coins', coin: '🪙',
    color: () => '#e8f2f8',
    cur: () => glove,
    apply: (i) => { glove = i; },
  },
  // Третій ряд — хардкор-персонажі. Ряд той самий, що й два верхні, різниця
  // лише у валюті: черепи замість монет.
  char: {
    box: '#chars', list: CHARACTERS, store: 'balloon-char',
    name: '#char-name', ability: '#char-ability',
    money: 'skulls', coin: '☠',
    color: () => '#4a3a63',
    cur: () => char,
    apply: (i) => { char = i; },
  },
  // Четвертий ряд — перки тім-апа. Єдиний ряд, де вибору немає: перк не
  // вдягається замість іншого, а просто діє, щойно куплений. Тому `multi`.
  perk: {
    box: '#perks', list: PERKS, store: null, multi: true,
    name: '#perk-name', ability: '#perk-ability',
    money: 'tokens', coin: '🤝',
    color: () => '#1f8f6a',
    // Перк не вибирається замість іншого, тож «поточного» тут немає — лише
    // останній, на який дивились, щоб було що підписати під рядом.
    cur: () => perkLook,
    apply: (i) => { perkLook = i; },
  },
};

/** Підказка, де взяти валюту, якої не вистачило. */
const MONEY_HINT = {
  coins: 'Збивай кульку — за кожне влучання монета!',
  skulls: 'Черепи дають лише за пройдені хардкор-рівні.',
  tokens: 'Жетони дають за паси в тім-апі — передавайте кульку одне одному.',
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
let perkLook = 0;   // на який перк дивиться підпис під рядом

function pickItem(kind, i) {
  const p = PICKERS[kind];
  const it = p.list[i];
  if (!wallet.owned[kind].has(it.id)) {
    if (wallet[p.money] < it.price) {
      // Підпис саме під цим рядом, а не в загальному #note внизу картки:
      // картка прокручується, і повідомлення там просто не побачили б.
      flashPicker(kind, 'Не вистачає ' + p.coin + ' ' + (it.price - wallet[p.money]) + '. ' + MONEY_HINT[p.money], true);
      return;
    }
    wallet[p.money] -= it.price;
    wallet.owned[kind].add(it.id);
    saveWallet();
    showCoins();
    sfx.level();
    buildPicker(kind);   // ціна зникає, кружечок оживає
    flashPicker(kind, 'Куплено: ' + it.emoji + ' ' + it.name + '!', false);
  }
  if (p.store) localStorage.setItem(p.store, String(i));
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
  const cur = p.cur();
  const cells = $(p.box).children;
  for (let k = 0; k < cells.length; k++) {
    const it = p.list[k];
    const has = wallet.owned[kind].has(it.id);
    const b = cells[k].firstChild;
    // У ряду з вибором «натиснутий» — вибраний; у ряду перків — кожен куплений,
    // бо там діють усі одразу.
    b.setAttribute('aria-pressed', String(p.multi ? has : k === cur));
    b.classList.toggle('locked', !has);
    cells[k].lastChild.textContent = has ? '' : p.coin + ' ' + it.price;
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
  if (!wallet.owned.char.has(CHARACTERS[char]?.id)) char = 0;
}

// ------------------------------------------------------------------ режими

function startLocal(players, kind = 'normal') {
  setKind(kind);
  game.mode = players === 1 ? 'solo' : 'local2';
  game.world = createWorld(kind);
  setSkin(game.world, skin);
  game.over = false;
  // Обидва локальні гравці грають вибраним: пікер у меню один на всіх, і перки
  // за одним комп'ютером теж спільні — гаманець же один.
  const mask = perkMask(wallet.owned.perk);
  for (let i = 0; i < players; i++) addHand(game.world, 'h' + i, i, glove, char, mask);
  input.reset(players);
  const how = players === 1 ? 'Веди мишкою або WASD' : 'Гравець 1 — WASD, Гравець 2 — стрілки. На сенсорі — два пальці';
  const tip = kind === 'hardcore' ? '☠ Хардкор: камінці з неба, шипи щорівня, два серця. '
    : kind === 'team' ? '🤝 Тім-ап: тапнув — пасуй! Двічі поспіль не можна. '
    : '';
  showHud(tip + how);
  sfx.start();
}

async function startOnline(room, kind = 'normal') {
  setNote("З'єднуємось…", false);
  const net = new Net();
  net.onError = (m) => setNote(m, true);
  net.onEvent = onWorldEvent;
  net.onStatus = (m) => {
    if (m.t === 'closed') { setNote("З'єднання втрачено", true); toMenu(); return; }
    $('#peer-info').textContent = peerLabel(m.n, net.maxPlayers);
  };
  try {
    await net.connect(defaultServerUrl(), room, kind);
  } catch (e) {
    setNote(e.message + '. Запусти сервер: npm start', true);
    return;
  }
  // Режим кімнати вирішує той, хто її створив: світ у ній один. Тому дивимось
  // не на те, що ми просили, а на те, що відповів сервер.
  setKind(net.mode);
  net.setSkin(skin);    // кулька в кімнаті одна, тож діє вибір того, хто обрав останнім
  if (game.hardcore) net.setChar(char);  // персонаж особистий — сервер змінить лише твою руку
  else net.setGlove(glove);              // як і перчатка у звичайній грі
  if (game.team) net.setPerks(perkMask(wallet.owned.perk));
  game.mode = 'online';
  game.net = net;
  game.world = null;
  game.over = false;
  input.reset(1);
  game.ghost = { x: WORLD.w / 2, y: WORLD.h - 180 };
  $('#room-code').textContent = net.room;
  $('#room-badge').hidden = false;
  $('#peer-info').textContent = peerLabel(net.peers, net.maxPlayers);
  const who = game.hardcore
    ? '☠ Хардкор! Ти — ' + CHARACTERS[char].emoji + ' ' + CHARACTERS[char].name + ' у ' + PLAYER_COLOR_NAMES[net.side] + 'му нашийнику'
    : game.team
      ? '🤝 Тім-ап! Ти — ' + PLAYER_COLOR_NAMES[net.side] + ' долоня. Тапнув — пасуй, двічі поспіль не можна'
      : 'Ти — ' + PLAYER_COLOR_NAMES[net.side] + ' долоня';
  showHud(who + '. Дай друзям код ' + net.room);
  // Просив один режим, а кімната виявилась іншою — про це треба сказати прямо,
  // інакше гравець довго не розумів би, чому нема камінців (чи пасів).
  if (kind !== net.mode) {
    setNote({ hardcore: 'Ця кімната хардкорна ☠', team: 'Ця кімната — тім-ап 🤝' }[net.mode]
      || 'Ця кімната звичайна', false);
  }
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
  setKind('normal');
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
  wallet.earnedSkulls = 0;
  wallet.earnedTokens = 0;
  bestCombo = 0;
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
  // Шал — здібність боксерської перчатки, і в хардкорі його просто немає:
  // handKit там віддає персонажа, а в жодного персонажа rage не стоїть.
  const on = !!hand && handKit(game.kind, hand.glove ?? 0, hand.char ?? 0).rage;
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
  const per = game.hardcore ? HARDCORE.medkits : game.team ? TEAM.medkits : MEDKIT.perLevel;
  $('#med-left').textContent = medkits + ' / ' + per + ' на рівень';
}

function showHud(tip) {
  wallet.earned = 0;
  wallet.earnedSkulls = 0;
  wallet.earnedTokens = 0;
  bestCombo = 0;
  // Лічильники другої й третьої валют показуємо лише там, де їх дають, — щоб у
  // дитячій грі не світились два незрозумілі рахунки.
  $('#skulls-hud').hidden = !game.hardcore;
  $('#tokens-hud').hidden = !game.team;
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
    if (view.combo > bestCombo) bestCombo = view.combo;
    if (game.mode) {
      // У мультиплеєрі сервер відпускає долоню того, хто натиснув, тож і кнопка
      // має дивитись саме на свою руку, а не на будь-чию.
      const mine = game.mode === 'online' ? view.hands.filter((h) => h.self) : view.hands;
      // У тім-апі серця особисті, тож і кнопка аптечки дивиться на СВОЇ серця,
      // а не на спільні — і додатково світиться, коли є з чого визволятись.
      if (view.team) {
        const me = mine[0];
        updateMedButton(view.medkits ?? 0, me?.lives ?? 0, me?.maxLives ?? 3,
          anyHandSlowed(mine) || mine.some((h) => h.web > 0));
      } else {
        updateMedButton(view.medkits ?? 0, view.lives, view.maxLives, anyHandSlowed(mine));
      }
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
      glove: h.glove, char: h.char, rage: h.rage, rages: h.rages, dirty: h.dirty, self: false,
      // Правило черги рахуємо тут, щоб малювальник просто малював привида,
      // а не переказував правила гри своїми словами.
      lives: h.lives, out: h.out, web: h.web, shield: h.shield,
      maxLives: maxLivesOf(w, h),
      locked: w.team && !h.out && h.web <= 0 && !canTap(w, h),
    })),
    score: w.score,
    lives: w.lives,
    maxLives: rulesFor(w.mode).lives,
    state: w.state,
    gull: w.gull,
    spikes: w.spikes.map((s) => ({ id: s.id, x: s.x, y: s.y, flying: s.phase !== 'warn', dead: s.phase === 'fall' })),
    stones: w.stones.map((s) => ({ id: s.id, x: s.x, y: s.y, spin: s.spin, flying: s.phase === 'fall', dead: s.dead })),
    traps: w.traps.map((t) => ({ id: t.id, x: t.x, y: t.y, type: t.type, life: t.life })),
    poops: w.poops.map((p) => ({ id: p.id, x: p.x, y: p.y })),
    medkits: w.medkits,
    skin: w.skin,
    deflate: w.deflate,
    spikesOn: w.spikesOn,
    hardcore: w.hardcore,
    team: w.team,
    combo: w.combo,
    buff: w.buff,
    level: levelInfo(w.score, w.mode),
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
  // Кит потрібен і тут: пацюк ходить за курсором помітно швидше, і без цього
  // локальна рука розходилась би з серверною рівно на цю різницю.
  const kit = handKit(snap.mode, mine?.glove ?? 0, mine?.char ?? 0);
  const g = advanceHand(game.ghost.x, game.ghost.y, t.x, t.y, dt, (mine?.slow ?? 0) > 0, kit);
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
    stones: snap.stones,
    traps: snap.traps,
    poops: snap.poops,
    medkits: snap.medkits,
    skin: snap.skin,
    deflate: snap.deflate,
    spikesOn: snap.spikesOn,
    hardcore: snap.hardcore,
    team: snap.team,
    combo: snap.combo,
    buff: snap.buff,
    level: levelInfo(snap.score, snap.mode),
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
    stones: [],
    traps: [],
    poops: [],
    medkits: 0,
    skin: demo.skin,
    deflate: 0,
    spikesOn: false,
    hardcore: false,
    team: false,
    combo: 0,
    buff: { speed: 0, size: 0 },
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
  } else if (e.type === 'pass') {
    // Жетон за кожен пас — і всім одразу, на відміну від монет: пас це робота
    // двох, і ділити його на «мій» і «чужий» було б проти суті режиму.
    addTokens(TEAM.tokenPerPass);
    if (e.level % 5 !== 0) banner = { text: 'Пас! ×' + e.level, t: 0.8 };
    sfx.pass(Math.min(1, e.level / 15));
  } else if (e.type === 'buff') {
    const b = BUFFS[e.buff ?? 0];
    addTokens(TEAM.tokenPerBuff);
    banner = { text: e.level + ' пасів! ' + b.emoji + ' ' + b.name + ' — ' + b.note, t: 2.4 };
    renderer.burst(e.x, e.y, 0x8ef0c8, 1);
    renderer.barPulse = 1;
    sfx.level();
  } else if (e.type === 'trap') {
    banner = { text: e.player === 1 ? 'Павутина! 🕸 не влети' : 'Смола! 🫧 кулька в ній грузне', t: 2.0 };
    sfx.trap();
  } else if (e.type === 'web') {
    banner = { text: 'Застряг у павутині 🕸 нехай сусід визволить!', t: 2.2 };
    renderer.burst(e.x, e.y, 0xffffff, 0.8);
    sfx.web();
  } else if (e.type === 'freed') {
    banner = { text: 'Визволили! 🤝', t: 1.4 };
    renderer.burst(e.x, e.y, 0x8ef0c8, 0.9);
    sfx.wash();
  } else if (e.type === 'shield') {
    banner = { text: 'Щит витримав пастку 🛡', t: 1.6 };
    renderer.burst(e.x, e.y, 0x7fd8ff, 0.9);
    sfx.parry();
  } else if (e.type === 'lose') {
    banner = { text: 'Не встиг! ' + PLAYER_NAMES[e.player] + ' втрачає серце ❤️ · лишилось ' + e.level, t: 2.0 };
  } else if (e.type === 'out') {
    banner = { text: PLAYER_NAMES[e.player] + ' вибув! Грайте далі без нього', t: 2.6 };
    renderer.burst(e.x, e.y, 0xff4d6d, 1);
    renderer.shake = 0.8;
    sfx.over();
  } else if (e.type === 'stoneWarn') {
    banner = { text: 'Камінь! ☠', t: 1.0 };
    sfx.stoneWarn();
  } else if (e.type === 'stoneParry') {
    banner = { text: 'Камінь збито! 💥', t: 1.2 };
    renderer.burst(e.x, e.y, 0xd8d2c9, 0.9);
    renderer.shake = 0.5;
    sfx.parry();
  } else if (e.type === 'thud') {
    renderer.burst(e.x, e.y, 0x9a9086, 0.5);
    sfx.thud();
  } else if (e.type === 'stone') {
    banner = { text: 'Камінь влучив! −1 ❤️', t: 2.0 };
    renderer.burst(e.x, e.y, 0x9a9086, 1);
    renderer.shake = 1;
    sfx.stoneHit();
  } else if (e.type === 'pop') {
    // Колючки їжачка. Кажемо прямо, чому кулька зникла: інакше це читалось би
    // як баг, а не як плата за найсильніший удар у грі.
    banner = { text: 'Колючки! Кулька луснула 🦔', t: 2.2 };
    renderer.burst(e.x, e.y, 0xffffff, 1);
    renderer.shake = 1;
    sfx.pop();
  } else if (e.type === 'stink') {
    banner = { text: 'Фу, ванючка! Лапа брудна — до відра 🪣', t: 2.2 };
    renderer.burst(e.x, e.y, 0x9ad36b, 0.7);
    sfx.stink();
  } else if (e.type === 'spike') {
    banner = { text: 'Шип! −2 ❤️', t: 2.2 };
    renderer.burst(e.x, e.y, 0xff4d4d, 1);
    renderer.shake = 1;
    sfx.spikeHit();
  } else if (e.type === 'level') {
    // На новому рівні міняється і місце — кажемо, куди саме прилетіла кулька.
    const b = biomeAt(e.level);
    // Черепи — за ПРОЙДЕНИЙ рівень, тобто за той, що був до цієї події.
    // На відміну від монет, їх не фільтруємо по гравцеві: рівень у кімнаті
    // спільний, тож і проходять його всі разом.
    let earned = '';
    if (game.hardcore) {
      const n = skullReward(e.level - 1);
      addSkulls(n);
      earned = '\n+☠ ' + n + ' за пройдений рівень';
    }
    banner = {
      text: 'Рівень ' + e.level + '! ' + b.emoji + ' ' + b.name + ' — ' + b.note
        + (e.spikes && !game.hardcore ? '\nОбережно, шипи ⚠' : '') + earned,
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
  $('#earned-tokens').textContent = wallet.earnedTokens;
  $('#best-combo').textContent = bestCombo;
  $('#team-earned').hidden = !game.team;
  $('#earned').textContent = wallet.earned;
  $('#final-score').textContent = score;
  $('#final-level').textContent = levelInfo(score, game.hardcore).level;
  $('#earned-skulls').textContent = wallet.earnedSkulls;
  $('#hc-earned').hidden = !game.hardcore;
  $('#gameover').hidden = false;
  sfx.over();
  // Рекорд у хардкорі окремий: рівні там удвічі коротші, тож спільний рекорд
  // порівнював би непорівнянне.
  const key = game.hardcore ? 'balloon-best-hardcore' : game.team ? 'balloon-best-team' : 'balloon-best';
  const best = Math.max(score, Number(localStorage.getItem(key) || 0));
  localStorage.setItem(key, String(best));
  $('#best-score').textContent = best;
}

// Зручний доступ до стану гри з консолі браузера (налагодження/тести).
window.__balloon = game;

boot();
