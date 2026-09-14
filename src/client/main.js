import { storage, savedNumber, savedSet } from './storage.js';
import { BASKETBALL, basketballHand, basketballTeam, basketballRoster, basketballSpawn } from '../shared/basketball.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Net, defaultServerUrl, setServerUrl } from './net.js';
import { sfx, setMuted, isMuted } from './sound.js';
import { createWorld, step, addHand, setHandTarget, restart, levelInfo, advanceHand, useMedkit, anyHandSlowed, setSkin, setGlove, useRage, useGlove, canTap, maxLivesOf } from '../shared/physics.js';
import { WORLD, RULES, HARDCORE, TEAM, SKUNK, PLAYER_COLORS, PLAYER_COLOR_NAMES, PLAYER_NAMES, MEDKIT, RAGE, COIN, SKINS, GLOVES, CHARACTERS, PERKS, BUFFS, handKit, biomeAt, ladderAt, rulesFor, skullReward, perkMask } from '../shared/constants.js';

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
let pendingNet = null;
let connectionVersion = 0;
function cancelConnection() {
  connectionVersion++;
  pendingNet?.close();
  pendingNet = null;
}
let banner = { text: '', t: 0 };   // тимчасовий підпис «Рівень N!»
let bestCombo = 0;                 // найдовша серія пасів за партію — у підсумок
// Вибраний скін переживає перезавантаження — дитина не має щоразу шукати «свою» кульку.
let skin = Math.min(savedNumber('balloon-skin'), SKINS.length - 1);
let glove = Math.min(savedNumber('balloon-glove'), GLOVES.length - 1);
let char = Math.min(savedNumber('balloon-char'), CHARACTERS.length - 1);

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
  $('#btn-basket-bot').onclick = () => startLocal(1, 'basketball');
  $('#btn-team2').onclick = () => startLocal(2, 'team');
  // Кімната є в кожного режиму, і влаштована всюди однаково: кнопка «створити»
  // плюс поле коду поруч.
  wireRoom('#btn-host', '#btn-join', '#room-input', 'normal');
  wireRoom('#btn-hc-host', '#btn-hc-join', '#room-hc', 'hardcore');
  wireRoom('#btn-team-host', '#btn-team-join', '#room-team', 'team');
  wireRoom('#btn-basket-host', '#btn-basket-join', '#room-basket', 'basketball');
  // Меню екранне: будь-яка кнопка з `data-go` веде на свій екран, а «←» — це
  // та сама кнопка з `data-go="home"`.
  for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => showScreen(b.dataset.go);
  showScreen('home');
  $('#btn-menu').onclick = () => toMenu();
  $('#btn-again').onclick = () => doRestart();
  $('#btn-full').onclick = () => (inFullscreen() ? leaveFullscreen() : enterFullscreen());
  // Вийти можна й повз кнопку (Esc, системний жест) — іконку синхронізує подія.
  document.addEventListener('fullscreenchange', syncFullBtn);
  document.addEventListener('webkitfullscreenchange', syncFullBtn);
  syncFullBtn();
  $('#btn-mute').onclick = () => {
    setMuted(!isMuted());
    $('#btn-mute').textContent = isMuted() ? '🔇' : '🔊';
  };
  $('#btn-copy').onclick = async () => {
    try {
      // Режим у посиланні потрібен на випадок, коли друг відкриє його раніше,
      // ніж кімната встигне ожити: тоді вона створиться саме тим режимом.
      await navigator.clipboard.writeText(inviteLink());
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
  $('#btn-glove').onclick = (e) => { e.preventDefault(); $('#btn-glove').blur(); doWear(); };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && game.over) { e.preventDefault(); doRestart(); }
    // Esc із гри веде в меню, а всередині меню — на крок назад, на головний.
    if (e.code === 'Escape' && game.mode) toMenu();
    else if (e.code === 'Escape') showScreen('home');
    // KeyH — за розкладкою клавіш, тож працює і на кирилиці («Р»).
    if (e.code === 'KeyH' && game.mode && !game.over) { e.preventDefault(); doMedkit(); }
    if (e.code === 'KeyB' && game.mode && !game.over) { e.preventDefault(); doRage(); }
    if (e.code === 'KeyG' && game.mode && !game.over) { e.preventDefault(); doWear(); }
  });
  window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

  // Контекстне меню прибрано в усіх режимах: на планшеті довге натискання
  // посеред гри відкривало системну виноску («Скопіювати», «Поділитись»), і
  // удар пропадав. Поля коду кімнати — виняток, там воно потрібне для «Вставити».
  window.addEventListener('contextmenu', (e) => {
    if (!e.target.closest?.('input')) e.preventDefault();
  });

  // Посилання-запрошення виду ?room=ABCD одразу веде в кімнату,
  // а ?mode=solo / ?mode=local2 — одразу в локальну гру.
  const q = new URLSearchParams(location.search);

  // Збірка для статичного хостингу ховає онлайн лише тоді, коли сервера кімнат
  // справді нема куди питати. Дали адресу при збірці (VITE_WS_URL) або в
  // посиланні (?ws=wss://…) — кімнати повертаються в меню всіма режимами.
  let finding = null;
  if (import.meta.env.VITE_NO_ONLINE && !import.meta.env.VITE_WS_URL && !q.get('ws')) {
    document.body.classList.add('no-online');
    finding = findSharedServer();   // меню не чекає: кнопки просто з'являться самі
  }
  const invite = q.get('room');
  const mode = q.get('mode');
  // Посилання-запрошення — єдиний випадок, коли адресу треба знати ВЖЕ: воно
  // з'єднується саме, не даючи кнопкам шансу з'явитись.
  if (invite) await finding;
  if (invite) {
    const kind = kindOf(mode);
    // Екран режиму відкриваємо навіть при вдалому вході: якщо зв'язок обірветься
    // або кімната виявиться повною, гравець опиниться саме там, де його код.
    showScreen(screenOf(kind));
    $(codeField(kind)).value = invite.toUpperCase();
    startOnline(invite.toUpperCase(), kind);
  }
  else if (mode === 'solo') startLocal(1);
  else if (mode === 'local2') startLocal(2);
  else if (mode === 'hardcore') startLocal(1, 'hardcore');
  else if (mode === 'hardcore2') startLocal(2, 'hardcore');
  else if (mode === 'team') startLocal(2, 'team');
  else if (mode === 'basketball') startLocal(1, 'basketball');
  // ?host=hardcore — одразу створити кімнату потрібного режиму, не заходячи в меню.
  else if (q.get('host')) { await finding; showScreen(screenOf(kindOf(q.get('host')))); startOnline('', kindOf(q.get('host'))); }

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
  coins: savedNumber('balloon-coins'),
  skulls: savedNumber('balloon-skulls'),
  tokens: savedNumber('balloon-tokens'),
  owned: {
    skin: savedSet('balloon-owned-skins', ["red"]),
    glove: savedSet('balloon-owned-gloves', ["hand"]),
    char: savedSet('balloon-owned-chars', ["racoon"]),
    // Перки, на відміну від скінів, не «вдягаються»: куплений діє завжди.
    perk: savedSet('balloon-owned-perks', []),
  },
  earned: 0,        // монет за поточну партію — показуємо в кінці
  earnedSkulls: 0,  // і черепів за неї ж
  earnedTokens: 0,  // і жетонів
};

function saveWallet() {
  storage.setItem('balloon-coins', String(wallet.coins));
  storage.setItem('balloon-skulls', String(wallet.skulls));
  storage.setItem('balloon-owned-skins', JSON.stringify([...wallet.owned.skin]));
  storage.setItem('balloon-owned-gloves', JSON.stringify([...wallet.owned.glove]));
  storage.setItem('balloon-owned-chars', JSON.stringify([...wallet.owned.char]));
  storage.setItem('balloon-tokens', String(wallet.tokens));
  storage.setItem('balloon-owned-perks', JSON.stringify([...wallet.owned.perk]));
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

/**
 * Гаманець світиться в кількох місцях одразу (головний екран, магазин, острів
 * режиму, HUD), тож оновлюємо не за id, а за `data-w` — додати ще одне місце
 * тепер можна самою розміткою.
 */
function showCoins() {
  const money = { coins: '🪙 ' + wallet.coins, skulls: '☠ ' + wallet.skulls, tokens: '🤝 ' + wallet.tokens };
  for (const el of document.querySelectorAll('[data-w]')) el.textContent = money[el.dataset.w];
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
  if (p.store) storage.setItem(p.store, String(i));
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

// ------------------------------------------------------- на весь екран

/**
 * Світ у грі горизонтальний (1200×800), а телефон у руці вертикальний: у
 * портреті гра стискається у смужку посеред екрана, бо `layout()` вписує світ
 * цілком. Тому на дотикових пристроях гра сама проситься на весь екран і
 * повертає екран у ландшафт.
 *
 * І запит екрана, і поворот дозволені лише всередині жесту користувача, тож
 * гукаємо їх з того самого обробника, що запускає гру, а не при завантаженні.
 *
 * На iPhone Fullscreen API немає зовсім (Safari дає його тільки відео), і
 * кнопка там просто ховається. Повний екран на ньому дає «Поділитись → На
 * початковий екран» — заради цього в <head> і лежать apple-mobile-web-app-*.
 */
const fsEl = () => document.documentElement;
const canFullscreen = () => !!(fsEl().requestFullscreen || fsEl().webkitRequestFullscreen);
const inFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

async function enterFullscreen() {
  if (!canFullscreen() || inFullscreen()) return;
  try {
    await (fsEl().requestFullscreen?.({ navigationUI: 'hide' }) ?? fsEl().webkitRequestFullscreen());
  } catch {
    return;                                    // браузер відмовив — гра грається й так
  }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* дозволено не всюди */ }
}

async function leaveFullscreen() {
  try { screen.orientation?.unlock?.(); } catch { /* те саме */ }
  try { await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.()); } catch { /* уже вийшли */ }
}

/** Кнопка показує, що станеться від натискання, а не де ми зараз. */
function syncFullBtn() {
  const b = $('#btn-full');
  b.hidden = !canFullscreen();
  b.textContent = inFullscreen() ? '⤡' : '⛶';
  b.title = inFullscreen() ? 'Вийти з повного екрана' : 'На весь екран';
}

function startLocal(players, kind = 'normal') {
  cancelConnection();
  game.net?.close();
  game.net = null;
  if (isTouch()) enterFullscreen();
  setKind(kind);
  game.mode = players === 1 ? 'solo' : 'local2';
  game.world = createWorld(kind);
  setSkin(game.world, skin);
  game.over = false;
  // Обидва локальні гравці грають вибраним: пікер у меню один на всіх, і перки
  // за одним комп'ютером теж спільні — гаманець же один.
  const mask = perkMask(wallet.owned.perk);
  for (let i = 0; i < players; i++) addHand(game.world, 'h' + i, i, glove, char, mask);
  if (kind === 'basketball' && players === 1) addHand(game.world, 'bot', 1).bot = true;
  input.reset(players);
  const how = players === 1 ? 'Веди мишкою або WASD' : 'Гравець 1 — WASD, Гравець 2 — стрілки. На сенсорі — два пальці';
  const tip = kind === 'basketball' ? '🏀 Перекинь м’яч через сітку на підлогу суперника. До ' + BASKETBALL.target + ' очок. '
    : kind === 'hardcore' ? '☠ Хардкор: камінці з неба, шипи щорівня, два серця. '
    : kind === 'team' ? '🤝 Тім-ап: тапнув — пасуй! Двічі поспіль не можна. '
    : '';
  showHud(tip + how);
  sfx.start();
}

/** Запрошення веде на той самий сервер, навіть зі статичної сторінки. */
function inviteLink() {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('room', game.net.room);
  if (game.kind !== 'normal') url.searchParams.set('mode', game.kind);
  // Беремо адресу активного з'єднання: ws.json міг змінитися після входу,
  // а друг має потрапити саме до кімнати, у якій ми вже граємо.
  url.searchParams.set('ws', game.net.ws.url);
  return url.href;
}

/** Екран меню, на якому живе цей режим. */
function screenOf(kind) {
  return kind === 'normal' ? 'classic' : kind;
}

/** Поле коду того екрана меню, що відповідає режиму. */
function codeField(kind) {
  return { hardcore: '#room-hc', team: '#room-team', basketball: '#room-basket' }[kind] || '#room-input';
}

/** Режим світу з рядка: усе незнайоме — звичайна гра. */
function kindOf(s) {
  return ['hardcore', 'team', 'basketball'].includes(s) ? s : 'normal';
}

/**
 * Один режим — одна пара «створити / приєднатись». Режим тут лише побажання
 * для НОВОЇ кімнати: якщо за кодом уже грають, діє її режим (див. startOnline),
 * бо світ у кімнаті один на всіх.
 */
function wireRoom(hostSel, joinSel, inputSel, kind) {
  const input = $(inputSel);
  const join = () => {
    const code = input.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { setNote('Введи код кімнати з 4 символів', true); return; }
    startOnline(code, kind);
  };
  $(hostSel).onclick = () => startOnline('', kind);
  $(joinSel).onclick = join;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
}

/**
 * `quiet` — це вхід у кімнату після обриву: гравець уже в грі, тож ні
 * повноекранного режиму, ні вітального підпису вдруге показувати не треба.
 * Повертає, чи вийшло зайти — на цьому тримається `reconnect`.
 */
async function startOnline(room, kind = 'normal', { quiet = false, refreshed = false } = {}) {
  if (isTouch() && !quiet) enterFullscreen();
  if (!quiet) setNote("З'єднуємось…", false);
  cancelConnection();
  const version = connectionVersion;
  const net = new Net();
  pendingNet = net;
  net.onError = m => { if (version === connectionVersion) setNote(m, true); };
  net.onEvent = e => { if (game.net === net) onWorldEvent(e); };
  net.onStatus = (m) => {
    if (m.t === 'closed') {
      // `clean` — ми самі пішли (меню, інша кімната). А якщо ми вже встигли
      // перепід'єднатись, прощання старого сокета нічого не означає.
      if (m.clean || game.net !== net) return;
      reconnect(net.room, game.kind);
      return;
    }
    $('#peer-info').textContent = peerLabel(m.n, net.maxPlayers, net.mode, net.sides);
  };
  const serverUrl = defaultServerUrl();
  try {
    await net.connect(serverUrl, room, kind);
  } catch (e) {
    if (version !== connectionVersion) return false;
    pendingNet = null;
    net.closing = true;
    net.ws?.close();
    // Старий тунель у запрошенні може вже не існувати. Лише для тимчасових
    // тунелів перевіряємо нову опубліковану адресу й повторюємо один раз.
    if (!e.fromServer && !refreshed && isTunnelUrl(serverUrl)) {
      const fresh = await findSharedServer();
      if (version !== connectionVersion) return false;
      if (fresh && new URL(fresh).href !== new URL(serverUrl).href) {
        const url = new URL(location.href);
        url.searchParams.set('ws', fresh);
        history.replaceState(null, '', url);
        return startOnline(room, kind, { quiet, refreshed: true });
      }
    }
    // Сервер відповів і відмовив (кімната повна) — тоді його слова й показуємо:
    // радити «запусти сервер» тому, хто щойно з ним говорив, безглуздо.
    setNote(e.fromServer ? e.message
      : 'Сервер кімнат недоступний. Тимчасове посилання могло застаріти — попроси нове посилання у того, хто запустив гру.', true);
    return false;
  }
  // Режим кімнати вирішує той, хто її створив: світ у ній один. Тому дивимось
  // не на те, що ми просили, а на те, що відповів сервер.
  if (version !== connectionVersion) { net.close(); return false; }
  pendingNet = null;
  game.net?.close();
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
  game.ghost = game.kind === 'basketball' ? basketballSpawn(net.side) : { x: WORLD.w / 2, y: WORLD.h - 180 };
  if (game.kind === 'basketball') { input.targets[0].x = game.ghost.x; input.targets[0].y = game.ghost.y; }
  $('#room-code').textContent = net.room;
  $('#room-badge').hidden = false;
  $('#peer-info').textContent = peerLabel(net.peers, net.maxPlayers, net.mode, net.sides);
  const who = game.kind === 'basketball' ? '🏀 Твоя команда — ' + (basketballTeam(net.side) === 0 ? 'помаранчева, ліворуч' : 'синя, праворуч') + '. Матч до ' + BASKETBALL.target + ' очок'
    : game.hardcore
    ? '☠ Хардкор! Ти — ' + CHARACTERS[char].emoji + ' ' + CHARACTERS[char].name + ' у ' + PLAYER_COLOR_NAMES[net.side] + 'му нашийнику'
    : game.team
      ? '🤝 Тім-ап! Ти — ' + PLAYER_COLOR_NAMES[net.side] + ' долоня. Тапнув — пасуй, двічі поспіль не можна'
      : 'Ти — ' + PLAYER_COLOR_NAMES[net.side] + ' долоня';
  if (quiet) {
    // Після обриву HUD уже на екрані, і перезапускати його не можна: showHud
    // обнуляє зароблене за партію.
    setNote('Знову в кімнаті ' + net.room + ' ✓', false);
    setTimeout(() => { if (game.net === net) setNote('', false); }, 2500);
    return true;
  }
  showHud(who + '. Дай друзям код ' + net.room);
  // Просив один режим, а кімната виявилась іншою — про це треба сказати прямо,
  // інакше гравець довго не розумів би, чому нема камінців (чи пасів).
  if (kind !== net.mode) {
    setNote({ hardcore: 'Ця кімната хардкорна ☠', team: 'Ця кімната — тім-ап 🤝', basketball: 'Ця кімната — basketball 🏀' }[net.mode]
      || 'Ця кімната звичайна', false);
  }
  sfx.start();
  return true;
}

function isTunnelUrl(value) {
  try { return new URL(value).hostname.endsWith('.trycloudflare.com'); } catch { return false; }
}

const RECONNECT_TRIES = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Обрив зв'язку. Кімната на сервері живе, поки в ній лишився хоч хтось, тож
 * найчастіше повернутись можна просто в ту саму гру — пробуємо кілька разів і
 * лише потім відпускаємо гравця в меню. Мертвий `game.net` навмисно лишаємо на
 * місці: він тримає останній снапшот, і сцена завмирає замість того, щоб
 * блимнути порожнім небом.
 */
async function reconnect(room, kind) {
  const previous = game.net;
  for (let i = 1; i <= RECONNECT_TRIES; i++) {
    setNote(`Зв'язок обірвався. Повертаємось у кімнату ${room}… (${i}/${RECONNECT_TRIES})`, true);
    // Пауза росте: після обриву мережі сервер ще якийсь час тримає наше старе
    // місце (поки не відповімо на ping), і кімната виглядає повною. Разом
    // спроби вкладаються приблизно в 40 секунд — довше за той привид.
    await sleep(Math.min(1200 * i, 5000));
    if (game.mode !== 'online' || game.net !== previous) return;        // гравець сам вийшов у меню
    if (await startOnline(room, kind, { quiet: true })) return;
    if (game.mode !== 'online' || game.net !== previous) return;
  }
  setNote('Кімната ' + room + ' не відповідає', true);
  toMenu();
}

/**
 * Кімнати на статичному сайті. Сам сайт сервера не має, але `npm run share`
 * піднімає його на комп'ютері господаря і кладе поруч зі сторінкою `ws.json` з
 * адресою тунелю. Поки той файл свіжий — кімнати в меню вмикаються, і працюють
 * усі три режими; коли комп'ютер вимкнено, файл або зник, або застарів, і меню
 * лишається таким, як було.
 *
 * Тунель живе годинами, не тижнями, тож старіший за півдоби запис ігноруємо:
 * краще не показати кімнат, ніж показати кнопку, яка нікуди не з'єднається.
 */
const SHARE_TTL = 12 * 3600 * 1000;

async function findSharedServer() {
  try {
    const r = await fetch('./ws.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!r.ok) return;
    const d = await r.json();
    if (!d.url || Date.now() - (d.ts ?? 0) > SHARE_TTL) return;
    const url = new URL(d.url);
    if (!['ws:', 'wss:'].includes(url.protocol)) return;
    if (location.protocol === 'https:' && url.protocol !== 'wss:') return;
    setServerUrl(url.href);
    document.body.classList.remove('no-online');
    return url.href;
  } catch {
    /* немає файлу чи немає мережі — просто граємо без кімнат */
  }
}

/** «Чекаємо…» / «Граєте втрьох» / «Кімната повна» — одним рядком. */
function peerLabel(n, max, mode, sides = []) {
  if (mode === 'basketball') {
    const counts = basketballRoster(sides);
    return '🟠 ' + counts[0] + '/' + BASKETBALL.teamSize + ' · 🔵 ' + counts[1] + '/' + BASKETBALL.teamSize
      + (counts.some(count => count === 0) ? ' · Чекаємо на суперників…' : ' · ' + n + '/' + max + ' гравців');
  }
  if (n < 2) return 'Чекаємо на друзів…';
  const words = { 2: 'вдвох', 3: 'втрьох', 4: 'вчотирьох' };
  const who = words[n] ?? n + ' гравці';
  return `Граєте ${who} 🎉` + (n < max ? ` · є місце ще для ${max - n}` : '');
}

/**
 * Один екран меню за раз. Картка щоразу прокручується на початок: інакше,
 * зайшовши в довгий екран і вийшовши, гравець бачив би головний десь із
 * середини.
 */
function showScreen(name) {
  for (const s of document.querySelectorAll('#menu .screen')) s.hidden = s.dataset.screen !== name;
  $('#menu .card').scrollTop = 0;
  setNote('', false);
}

function toMenu() {
  cancelConnection();
  showScreen('home');
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

/** Рукавичка від газу — той самий шлях, що аптечка й шал. */
function doWear() {
  if (game.mode === 'online') { game.net.wear(); return; }
  if (!game.world) return;
  const ev = useGlove(game.world, 'h0');
  if (ev) onWorldEvent(ev);
}

/**
 * Кнопка рукавички живе лише в хардкорі — більше ніде немає скунсів.
 * Поки рукавичка вдягнена, кнопка горить і показує, скільки ще тримає.
 */
function updateGloveButton(hand) {
  const box = $('#glove');
  box.hidden = !(game.hardcore && hand);
  if (box.hidden) return;
  const btn = $('#btn-glove');
  const on = (hand.gloveOn ?? 0) > 0;
  btn.disabled = !((hand.gloves ?? 0) > 0 && !on);
  btn.classList.toggle('on', on);
  $('#glove-left').textContent = on
    ? 'Вдягнена ' + hand.gloveOn.toFixed(1) + ' с'
    : (hand.gloves ?? 0) + ' / ' + SKUNK.glovePerLevel + ' на рівень';
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
  $('#med').hidden = game.kind === 'basketball';
  $('#coins-hud').hidden = game.kind === 'basketball';
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
      updateGloveButton(mine[0]);
    }
  }
}

function frameLocal(dt) {
  const w = game.world;
  for (let i = 0; i < w.hands.length; i++) {
    if (w.hands[i].bot) continue;
    const t = input.target(i);
    setHandTarget(w, w.hands[i].id, t.x, t.y);
  }
  step(w, dt);
  for (const e of w.events) onWorldEvent(e);

  if (w.state === 'over' && !game.over) endGame(w.score, w.basketball);

  return {
    points: w.balloon.pts,
    basketball: w.basketball,
    hands: w.hands.map((h) => ({
      id: h.id, player: h.player, x: h.x, y: h.y, flash: h.flash, slow: h.slow,
      glove: h.glove, char: h.char, rage: h.rage, rages: h.rages, dirty: h.dirty, self: false,
      // Правило черги рахуємо тут, щоб малювальник просто малював привида,
      // а не переказував правила гри своїми словами.
      lives: h.lives, out: h.out, web: h.web, shield: h.shield,
      gloveOn: h.gloveOn, gloves: h.gloves, shell: h.shell,
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
    hogs: w.hogs.map((h) => ({ id: h.id, x: h.x, y: h.y, dir: h.dir, spin: h.spin, phase: h.phase })),
    skunks: w.skunks.map((s) => ({ id: s.id, x: s.x, dir: s.dir, phase: s.phase })),
    gas: w.gas.map((g) => ({ id: g.id, x: g.x, life: g.life })),
    poops: w.poops.map((p) => ({ id: p.id, x: p.x, y: p.y })),
    medkits: w.medkits,
    skin: w.skin,
    deflate: w.deflate,
    hardcore: w.hardcore,
    team: w.team,
    combo: w.combo,
    buff: w.buff,
    level: levelInfo(w.score, w.mode),
    // Події гри передаємо звуком та ефектами, без спливного тексту.
    message: '',
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
  if (snap.team && snap.buff.speed > 0) kit.speedMul *= BUFFS[0].speedMul;
  const g = (snap.team && (mine?.web > 0 || mine?.out)) || (snap.basketball && snap.state === 'waiting')
    ? { x: mine?.x ?? game.ghost.x, y: mine?.y ?? game.ghost.y }
    : game.kind === 'basketball'
    ? basketballHand(game.ghost.x, game.ghost.y, t.x, t.y, dt, game.net.side)
    : advanceHand(game.ghost.x, game.ghost.y, t.x, t.y, dt, (mine?.slow ?? 0) > 0, kit);
  game.ghost.x = g.x;
  game.ghost.y = g.y;
  const hands = snap.hands.map((h) =>
    h.id === myId
      ? { ...h, x: game.ghost.x, y: game.ghost.y, player: game.net.side, self: true }
      : { ...h, self: false });

  if (snap.state === 'over' && !game.over) endGame(snap.score, snap.basketball);
  if (snap.state !== 'over' && game.over) { game.over = false; $('#gameover').hidden = true; }

  return {
    points: snap.points,
    basketball: snap.basketball,
    hands,
    score: snap.score,
    lives: snap.lives,
    maxLives: game.net.maxLives,
    state: snap.state,
    gull: snap.gull,
    spikes: snap.spikes,
    stones: snap.stones,
    traps: snap.traps,
    hogs: snap.hogs,
    skunks: snap.skunks,
    gas: snap.gas,
    poops: snap.poops,
    medkits: snap.medkits,
    skin: snap.skin,
    deflate: snap.deflate,
    hardcore: snap.hardcore,
    team: snap.team,
    combo: snap.combo,
    buff: snap.buff,
    level: levelInfo(snap.score, snap.mode),
    message: snap.state === 'waiting' ? (snap.basketball ? 'Чекаємо на команду суперників…' : 'Чекаємо на друзів…') : '',
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
    hogs: [],
    skunks: [],
    gas: [],
    poops: [],
    medkits: 0,
    skin: demo.skin,
    deflate: 0,
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
  if (e.type === 'basketHit') {
    renderer.burst(e.x, e.y, PLAYER_COLORS[basketballTeam(e.player)], 0.5);
    sfx.hit(0.6);
  } else if (e.type === 'basketPoint') {
    renderer.burst(e.x, e.y - 30, PLAYER_COLORS[e.player], 1);
    sfx.level();
  } else if (e.type === 'hit') {
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
  } else if (e.type === 'shell') {
    // level у цій події — скільки панцира лишилось на цьому рівні.
    banner = { text: 'Панцир! Кулька відскочила від спини 🛡', t: 2.0 };
    renderer.burst(e.x, e.y, 0xe0b070, 1);
    renderer.shake = 0.7;
    sfx.shell();
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
  } else if (e.type === 'skunk') {
    banner = { text: 'Скунс біжить! 🦨', t: 1.8 };
    sfx.hog();
  } else if (e.type === 'skunkWarn') {
    banner = { text: 'Зараз пустить газ! 🧤 вдягни рукавичку (G) або тікай убік', t: 2.2 };
    sfx.stoneWarn();
  } else if (e.type === 'gas') {
    renderer.burst(e.x, e.y, 0x9ad36b, 0.8);
    sfx.gas();
  } else if (e.type === 'glove') {
    banner = { text: 'Рукавичка вдягнена 🧤 · лишилось ' + e.level, t: 1.4 };
    renderer.burst(e.x, e.y, 0x3ec46d, 0.8);
    sfx.heal();
  } else if (e.type === 'choke') {
    banner = { text: 'Газ! −1 ❤️ · вдягни рукавичку або тікай', t: 1.2 };
    renderer.burst(e.x, e.y, 0x9ad36b, 0.7);
    renderer.shake = 0.5;
    sfx.choke();
  } else if (e.type === 'hog') {
    banner = { text: 'Їжачок біжить! 🦔 тримай кульку вище', t: 2.0 };
    sfx.hog();
  } else if (e.type === 'hogHit') {
    banner = { text: 'Їжачок збив кульку! 🦔 лови її!', t: 2.0 };
    renderer.burst(e.x, e.y, 0x8a6134, 1);
    renderer.shake = 0.9;
    sfx.hogHit();
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
    // У класиці кожен рівень додає нову загрозу — і саме про неї банер
    // попереджає окремим рядком. Сходинка рахується з номера рівня, тож
    // повідомлення однакове в усіх, хто грає в цій кімнаті.
    const adds = game.hardcore || game.team ? '' : ladderAt(e.level).adds;
    banner = {
      text: 'Рівень ' + e.level + '! ' + b.emoji + ' ' + b.name + ' — ' + b.note
        + (adds ? '\n' + adds : '') + earned,
      t: 2.8,
    };
    renderer.barPulse = 1;
    for (let i = 0; i < 3; i++) {
      renderer.burst(WORLD.w * (0.25 + i * 0.25), 200 + i * 40, [0xffd23f, 0x4dc9f6, 0xff9f1c][i], 1);
    }
    sfx.level();
  } else if (e.type === 'corner') {
    renderer.burst(e.x, e.y, 0xff4d6d, 0.5);
    sfx.drop();
  } else if (e.type === 'drop') {
    renderer.burst(e.x, e.y, 0xffffff, 1);
    renderer.shake = 1;
    sfx.drop();
  }
}

function endGame(score, basketball = null) {
  game.over = true;
  $('#gameover-title').textContent = basketball ? '🏀 Матч завершено!' : 'Кулька впала 😢';
  $('#classic-result').hidden = !!basketball;
  $('#basket-result').hidden = !basketball;
  if (basketball) {
    const mine = game.mode === 'online' ? basketballTeam(game.net.side) : 0;
    const winner = game.mode === 'local2'
      ? 'Переміг гравець ' + (basketball.winner + 1)
      : basketball.winner === mine ? (game.mode === 'online' ? 'Твоя команда перемогла! 🏆' : 'Ти переміг! 🏆') : game.mode === 'solo' ? 'Переміг бот. Спробуй ще!' : 'Перемогла команда суперників. Спробуй ще!';
    $('#basket-result').textContent = winner + ' · ' + basketball.score.join(' : ');
    $('#hc-earned').hidden = true;
    $('#team-earned').hidden = true;
    $('#gameover').hidden = false;
    sfx.over();
    return;
  }
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
  const best = Math.max(score, savedNumber(key));
  storage.setItem(key, String(best));
  $('#best-score').textContent = best;
}

// Зручний доступ до стану гри з консолі браузера (налагодження/тести).
window.__balloon = game;

boot();
