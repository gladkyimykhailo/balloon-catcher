import { createFighterMatch, stepFighterMatch, fighterInput } from '../shared/fighter-multiplayer.js';
import { drawArcade } from './arcade-view.js';
import { FighterNet } from './fighter-net.js';
import { defaultServerUrl } from './net.js';

let closeActive;
export function openFighterMultiplayer(mode = 'local') {
  closeActive?.();
  const online = mode === 'online', previousFocus = document.activeElement;
  const siblings = [...document.body.children].map(el => [el, el.inert]); for (const [el] of siblings) el.inert = true;
  const panel = document.createElement('div'); panel.className = 'arcade-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Тіньовий двобій: мультиплеєр');
  panel.innerHTML = `<div class="arcade-header"><h2>🥋 Двобій · ${online ? 'онлайн' : 'двоє на одному пристрої'}</h2><button data-exit>← Меню</button></div>
    <p>${online ? 'Створи кімнату, передай її код другові та натисніть «Готовий».' : 'Гравець 1: WASD, F/G/H — удари. Гравець 2: стрілки, J/K/L — удари. Унизу є кнопки для дотику.'}</p>
    <div data-lobby class="arcade-toolbar" ${online ? '' : 'hidden'}><button data-host>Створити кімнату</button><label>Код <input data-room maxlength="4" placeholder="ABCD" autocomplete="off" aria-label="Код кімнати"></label><button data-join>Приєднатися</button></div>
    <p data-room-info></p><canvas width="900" height="550" tabindex="0" aria-label="Арена для двох гравців"></canvas>
    <p data-status role="status" aria-live="polite"></p>
    <div class="arcade-buttons"><button data-ready>${online ? 'Готовий / реванш' : 'Грати / реванш'}</button><button data-pause disabled>Пауза</button></div>
    <div class="fighter-touch"></div>`;
  document.body.append(panel);
  const find = selector => panel.querySelector(selector), canvas = find('canvas'), context = canvas.getContext('2d');
  let state = createFighterMatch(), started = false, paused = false, closed = false, connecting = false, connected = false, raf, last = performance.now(), sendTime = 0, net, error = '';
  const keys = new Set(), touches = new Map(), pulses = [fighterInput(), fighterInput()];
  const bindings = online ? { KeyA: [0, 'left'], ArrowLeft: [0, 'left'], KeyD: [0, 'right'], ArrowRight: [0, 'right'], KeyW: [0, 'jump'], ArrowUp: [0, 'jump'], Space: [0, 'jump'], KeyS: [0, 'block'], ArrowDown: [0, 'block'], ShiftLeft: [0, 'block'], KeyJ: [0, 'punch'], KeyK: [0, 'kick'], KeyL: [0, 'special'] } : {
    KeyA: [0, 'left'], KeyD: [0, 'right'], KeyW: [0, 'jump'], KeyS: [0, 'block'], KeyF: [0, 'punch'], KeyG: [0, 'kick'], KeyH: [0, 'special'],
    ArrowLeft: [1, 'left'], ArrowRight: [1, 'right'], ArrowUp: [1, 'jump'], ArrowDown: [1, 'block'], KeyJ: [1, 'punch'], KeyK: [1, 'kick'], KeyL: [1, 'special'],
  };
  const attack = action => ['punch', 'kick', 'special'].includes(action);
  function clear() { keys.clear(); touches.clear(); pulses.forEach(p => { p.punch = p.kick = p.special = false; }); net?.input(fighterInput()); }
  function setPause(value) { if (online && !connected || !online && !started) return; paused = value; clear(); if (online) net.pause(value); }
  function close() {
    if (closed) return; closed = true; clear(); net?.close(); cancelAnimationFrame(raf);
    window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
    panel.remove(); for (const [el, inert] of siblings) el.inert = inert; previousFocus?.focus(); closeActive = null;
  }
  closeActive = close;
  function down(e) {
    e.stopImmediatePropagation();
    if (e.code === 'Escape') { e.preventDefault(); close(); return; }
    if (e.code === 'Tab') {
      const focusable = [...panel.querySelectorAll('button, input, canvas')].filter(el => !el.disabled && el.getClientRects().length), at = focusable.indexOf(document.activeElement);
      if (e.shiftKey && at <= 0) { e.preventDefault(); focusable.at(-1)?.focus(); } else if (!e.shiftKey && at === focusable.length - 1) { e.preventDefault(); focusable[0]?.focus(); } return;
    }
    if (e.target.tagName === 'INPUT') { if(e.code==='Enter'){e.preventDefault();find('[data-join]').click();} return; }
    if (e.code === 'KeyP') { e.preventDefault(); if (!e.repeat) setPause(!paused); return; }
    const binding = bindings[e.code]; if (!binding) return;
    e.preventDefault(); const [side, action] = binding;
    if (attack(action)) { if (!e.repeat) pulses[side][action] = true; } else keys.add(e.code);
  }
  function up(e) { e.stopImmediatePropagation(); keys.delete(e.code); }
  function blur() { if (online ? net?.packet?.playing : started) setPause(true); else clear(); }
  function visibility() { if (document.hidden) blur(); }
  window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
  for (let side = 0; side < (online ? 1 : 2); side++) {
    const group = document.createElement('div'); group.className = 'arcade-controls'; group.setAttribute('aria-label', online ? 'Твоє керування' : `Керування гравця ${side + 1}`);
    const label = document.createElement('b'); label.textContent = online ? 'Твої кнопки' : `Гравець ${side + 1}`; group.append(label);
    for (const [action, name] of [['left', '←'], ['right', '→'], ['jump', 'Стрибок'], ['block', 'Блок'], ['punch', 'Кулак'], ['kick', 'Нога'], ['special', 'Енергія']]) {
      const button = document.createElement('button'); button.textContent = name;
      button.onpointerdown = e => { e.preventDefault(); button.setPointerCapture(e.pointerId); if (attack(action)) pulses[side][action] = true; else touches.set(e.pointerId, [side, action]); };
      button.onpointerup = button.onpointercancel = e => touches.delete(e.pointerId); group.append(button);
    }
    find('.fighter-touch').append(group);
  }
  async function connect(room) {
    if (connecting) return; connecting = true; connected = false; error = ''; net?.close(); clear();
    const connection = new FighterNet(); net = connection;
    connection.onStatus = message => { if (closed || net !== connection) return; error = message; connected = false; connecting = false; };
    try {
      await connection.connect(defaultServerUrl(), room);
      if (closed || net !== connection) { connection.close(); return; }
      connected = true; paused = false; find('[data-room-info]').textContent = `Кімната ${connection.room} · Ти — гравець ${connection.side + 1}. Стрілки / WASD, J/K/L — удари.`;
      find('[data-room]').value = connection.room;
    } catch (e) { if (!closed && net === connection) error = e.message; }
    finally { if (!closed && net === connection) connecting = false; }
  }
  find('[data-host]').onclick = () => connect('');
  find('[data-join]').onclick = () => { const code = find('[data-room]').value.trim().toUpperCase(); if (!/^[A-Z0-9]{4}$/.test(code)) error = 'Введи код із 4 літер або цифр.'; else connect(code); };
  find('[data-room]').onkeydown = e => { if (e.key === 'Enter') find('[data-join]').click(); };
  find('[data-ready]').onclick = () => {
    clear(); if (online) { if (connected) { paused = false; net.ready(); } } else { state = createFighterMatch(); started = true; paused = false; }
    canvas.focus();
  };
  find('[data-pause]').onclick = () => setPause(!paused); find('[data-exit]').onclick = close;
  find('[data-exit]').focus();
  function frame(now) {
    if (closed) return;
    const dt = Math.min(0.04, (now - last) / 1000); last = now;
    const controls = [fighterInput(pulses[0]), fighterInput(pulses[1])];
    for (const [side, action] of [...keys].map(k => bindings[k]).filter(Boolean).concat([...touches.values()])) {
      if (action === 'left') controls[side].dx--; else if (action === 'right') controls[side].dx++; else controls[side][action] = true;
    }
    if (online) {
      if (net?.state) state = net.state;
      sendTime += dt;
      if (connected && sendTime >= 1 / 30) { net.input(controls[0]); pulses[0] = fighterInput(); sendTime = 0; }
    } else {
      if (started && !paused && !state.over) stepFighterMatch(state, dt, controls);
      pulses[0] = fighterInput(); pulses[1] = fighterInput();
    }
    const packet = net?.packet, active = online ? connected && packet?.playing : started;
    const sharedPause = online ? packet?.paused : paused;
    const overlay = error ? 'З’єднання недоступне' : connecting ? 'Підключення…' : online && !connected ? 'Створи кімнату або введи код' : packet?.waiting ? 'Чекаємо на другого гравця' : state.over ? `🏆 Переміг гравець ${state.winner + 1}!` : !active ? (online ? 'Обидва гравці мають бути готові' : 'Натисни «Грати»') : sharedPause ? 'Пауза' : '';
    drawArcade(context, state, overlay);
    const status = error || (online && !active ? `Готовність: ${packet?.ready?.[0] ? '✓' : '—'} / ${packet?.ready?.[1] ? '✓' : '—'}` : `Раунд ${state.round} · ${state.roundWins[0]} : ${state.roundWins[1]} · ${Math.ceil(state.roundTime)} с`);
    if (find('[data-status]').textContent !== status) find('[data-status]').textContent = status;
    find('[data-ready]').disabled = online && (!connected || !!packet?.playing || !!packet?.ready?.[net.side]);
    find('[data-pause]').disabled = !active || state.over; find('[data-pause]').textContent = paused ? 'Продовжити' : 'Пауза';
    find('[data-host]').disabled = find('[data-join]').disabled = connecting || connected;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}
