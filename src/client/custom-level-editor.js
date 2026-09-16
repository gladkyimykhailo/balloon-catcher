import { CUSTOM_MODES, isSport, normalizeCustomLevel } from '../shared/custom-level.js';
import { customLevelStore } from './custom-level-store.js';

export function initCustomLevelEditor(root, storage, play) {
  const store = customLevelStore(storage);
  const $ = selector => root.querySelector(selector);
  const form = $('#custom-form');
  const field = name => form.elements.namedItem(name);
  let selected = null;
  let settings = normalizeCustomLevel();
  const canvas = $('#custom-preview'), ctx = canvas.getContext('2d');
  for (const [mode, label] of Object.entries(CUSTOM_MODES)) {
    const option = document.createElement('option'); option.value = mode; option.textContent = label;
    field('mode').append(option);
  }
  function value() {
    return normalizeCustomLevel({
      name: field('name').value, mode: field('mode').value, target: Number(field('target').value),
      lives: Number(field('lives').value), pace: Number(field('pace').value), hazards: field('hazards').checked,
      players: Number(field('players').value), teamSize: Number(field('teamSize').value), difficulty: field('difficulty').value,
      spawn: { x: Number(field('spawnX').value), y: Number(field('spawnY').value) },
    });
  }
  function draw() {
    settings = value();
    const football = settings.mode === 'football', sport = isSport(settings.mode);
    $('#custom-sport').hidden = !sport;
    $('#custom-balloon').hidden = sport;
    field('players').disabled = settings.mode === 'team';
    $('#custom-target-label').textContent = football ? 'Голів для перемоги' : sport ? 'Очок для перемоги' : 'Влучань для проходження';
    field('target').max = sport ? 50 : 1000;
    $('#custom-pace-value').textContent = settings.pace.toFixed(1) + '×';
    $('#custom-spawn-value').textContent = `${Math.round(settings.spawn.x)}, ${Math.round(settings.spawn.y)}`;
    ctx.clearRect(0, 0, 600, 400);
    ctx.fillStyle = football ? '#328c4d' : sport ? '#dcad70' : '#b9e5fa';
    ctx.fillRect(0, 0, 600, 400);
    ctx.lineWidth = 2; ctx.strokeStyle = football ? '#edfdec' : '#647d88';
    if (football) {
      ctx.strokeRect(30, 57.5, 540, 305);
      ctx.beginPath(); ctx.moveTo(300, 57.5); ctx.lineTo(300, 362.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(300, 210, 42, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeRect(10, 155, 20, 110); ctx.strokeRect(570, 155, 20, 110);
    } else {
      ctx.fillStyle = '#59996b'; ctx.fillRect(0, 375, 600, 25);
      if (settings.mode === 'basketball') { ctx.fillStyle = '#586578'; ctx.fillRect(296, 200, 8, 175); }
      if (settings.mode === 'hoops') {
        for (const x of [75, 525]) { ctx.beginPath(); ctx.moveTo(x - 32, 165); ctx.lineTo(x + 32, 165); ctx.stroke(); }
      }
    }
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#123a52';
    ctx.beginPath(); ctx.arc(settings.spawn.x / 2, settings.spawn.y / 2, football ? 8 : 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#123a52'; ctx.font = 'bold 15px system-ui';
    ctx.fillText('СТАРТ', settings.spawn.x / 2 + 20, settings.spawn.y / 2 + 5);
  }
  function load(level) {
    settings = normalizeCustomLevel(level);
    for (const name of ['name', 'mode', 'target', 'lives', 'pace', 'players', 'teamSize', 'difficulty']) field(name).value = settings[name];
    field('hazards').checked = settings.hazards;
    field('spawnX').value = Math.round(settings.spawn.x);
    field('spawnY').value = Math.round(settings.spawn.y);
    draw();
  }
  function list() {
    const select = $('#custom-saved');
    select.replaceChildren();
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Новий рівень'; select.append(empty);
    for (const level of store.list()) {
      const option = document.createElement('option'); option.value = level.id;
      option.textContent = `${CUSTOM_MODES[level.mode]} · ${level.name}`; select.append(option);
    }
    select.value = selected ?? '';
    $('#custom-delete').disabled = !selected;
  }
  function note(text) { $('#custom-status').textContent = text; }
  form.addEventListener('input', draw);
  field('mode').addEventListener('change', () => {
    const defaults = normalizeCustomLevel({ mode: field('mode').value });
    load({ ...value(), target: defaults.target, lives: defaults.lives, teamSize: defaults.teamSize, spawn: defaults.spawn });
  });
  let dragging = false;
  const moveBall = event => {
    const rect = canvas.getBoundingClientRect();
    const spawn = normalizeCustomLevel({ spawn: { x: (event.clientX - rect.left) / rect.width * 1200,
      y: (event.clientY - rect.top) / rect.height * 800 } }).spawn;
    field('spawnX').value = Math.round(spawn.x); field('spawnY').value = Math.round(spawn.y); draw();
  };
  canvas.addEventListener('pointerdown', event => { dragging = true; canvas.setPointerCapture(event.pointerId); moveBall(event); });
  canvas.addEventListener('pointermove', event => { if (dragging) moveBall(event); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { dragging = false; });
  $('#custom-saved').addEventListener('change', event => {
    selected = event.target.value || null;
    load(store.list().find(v => v.id === selected)); list(); note('');
  });
  $('#custom-new').onclick = () => { selected = null; load(); list(); note('Новий рівень готовий до налаштування.'); };
  $('#custom-save').onclick = () => {
    if (!form.reportValidity()) return;
    try { const saved = store.save(value(), selected); selected = saved.id; list(); note('Рівень збережено ✓'); }
    catch (error) { note(error.message); }
  };
  $('#custom-delete').onclick = () => {
    store.remove(selected); selected = null; list(); note('Збережений рівень видалено. Налаштування залишились — можна зберегти заново.');
  };
  form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) play(value()); });
  load(); list();
}
