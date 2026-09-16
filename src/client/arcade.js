import { ARCADE_GAMES, LEVELS, createArcade, updateArcade, arcadeAction, arcadeDirection, clamp } from '../shared/arcade.js';
import { drawArcade } from './arcade-view.js';
import { storage, savedNumber } from './storage.js';

let activeClose = null;
export function openArcade(kind) {
  if(!Object.hasOwn(ARCADE_GAMES,kind))return;
  activeClose?.();
  const info=ARCADE_GAMES[kind], key=`shelter-level-${kind}`;
  let unlocked=clamp(savedNumber(key,1),1,5), level=unlocked;
  const panel=document.createElement('div');
  panel.className='arcade-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',info.name);
  panel.innerHTML=`<div class="arcade-header"><h2>${info.name}</h2><button data-exit aria-label="Закрити гру">← Меню</button></div>
    <div class="arcade-toolbar"><label>Рівень <select data-level aria-label="Обрати рівень"></select></label><span data-progress></span></div>
    <p class="arcade-help">${info.help}</p>
    <canvas width="900" height="550" tabindex="0" aria-label="Ігрове поле: ${info.name}"></canvas>
    <p data-status role="status" aria-live="polite"></p>
    <div class="arcade-buttons"><button data-play>▶ Грати</button><button data-next hidden>Наступний рівень →</button><button data-restart>Заново</button><button data-pause disabled>Пауза</button></div>
    <div class="arcade-controls" aria-label="Керування"><button data-dir="-1,0" aria-label="Ліворуч">←</button><button data-dir="0,-1" aria-label="Угору">↑</button><button data-dir="0,1" aria-label="Униз">↓</button><button data-dir="1,0" aria-label="Праворуч">→</button><button data-action>Дія</button></div>`;
  const previousFocus=document.activeElement;
  const siblings=Array.from(document.body.children).map(el=>[el,el.inert]);for(const [el] of siblings)el.inert=true;
  document.body.append(panel);
  const find=s=>panel.querySelector(s),canvas=find('canvas'),c=canvas.getContext('2d'),select=find('[data-level]');
  let state,started=false,paused=false,awarded=false,raf,previous=performance.now(),heldAction=false,pulse=false,pointer=null,closed=false;
  const keys=new Set(),touch=new Map();
  const fillLevels=()=>{select.replaceChildren(...LEVELS.map((name,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent=`${i+1}. ${name}${i+1>unlocked?' 🔒':''}`;o.disabled=i+1>unlocked;return o;}));select.value=level;find('[data-progress]').textContent=`Відкрито ${unlocked} / 5`;};
  function clearInput(){keys.clear();touch.clear();heldAction=false;pulse=false;pointer=null;}
  function reset(){state=createArcade(kind,level);started=false;paused=false;awarded=false;clearInput();find('[data-play]').hidden=false;find('[data-next]').hidden=true;find('[data-pause]').disabled=true;find('[data-pause]').textContent='Пауза';fillLevels();}
  function start(){started=true;paused=false;find('[data-play]').hidden=true;find('[data-pause]').disabled=false;canvas.focus();}
  function pause(){if(!started||state.over)return;paused=!paused;clearInput();find('[data-pause]').textContent=paused?'Продовжити':'Пауза';}
  function close(){if(closed)return;closed=true;cancelAnimationFrame(raf);window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);panel.remove();for(const [el,inert] of siblings)el.inert=inert;previousFocus?.focus();activeClose=null;}
  activeClose=close;
  const directions={ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0],ArrowUp:[0,-1],KeyW:[0,-1],ArrowDown:[0,1],KeyS:[0,1]};
  function down(e){
    e.stopImmediatePropagation();
    if(e.code==='Escape'){e.preventDefault();close();return;}
    if(e.code==='Tab'){
      const focusable=[...panel.querySelectorAll('button:not([hidden]):not(:disabled), select, canvas')].filter(el=>el.getClientRects().length);
      const at=focusable.indexOf(document.activeElement);if(e.shiftKey&&at<=0){e.preventDefault();focusable.at(-1)?.focus();}else if(!e.shiftKey&&at===focusable.length-1){e.preventDefault();focusable[0]?.focus();}return;
    }
    if(e.target===select)return;
    if(e.code==='KeyP'){e.preventDefault();if(!e.repeat)pause();return;}
    if(directions[e.code]){e.preventDefault();keys.add(e.code);pointer=null;arcadeDirection(state,...directions[e.code]);}
    if(e.code==='Space'&&e.target===canvas){e.preventDefault();if(!started)start();heldAction=true;if(!e.repeat)pulse=true;}
  }
  function up(e){e.stopImmediatePropagation();keys.delete(e.code);if(e.code==='Space')heldAction=false;}
  function blur(){clearInput();if(started&&!paused&&!state.over)pause();}
  function visibility(){if(document.hidden)blur();}
  window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
  const coords=e=>{const r=canvas.getBoundingClientRect();return {x:clamp((e.clientX-r.left)*900/r.width,0,900),y:clamp((e.clientY-r.top)*550/r.height,0,550)};};
  canvas.onpointerdown=e=>{e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);pointer=coords(e);if(!started||paused||state.over)return;arcadeAction(state,pointer.x,pointer.y);if(kind==='shooter')heldAction=true;};
  canvas.onpointermove=e=>{pointer=coords(e);};
  canvas.onpointerup=canvas.onpointercancel=()=>{heldAction=false;};
  for(const b of panel.querySelectorAll('[data-dir]')) {
    const direction=b.dataset.dir.split(',').map(Number);
    b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch.set(e.pointerId,direction);pointer=null;arcadeDirection(state,...direction);};
    b.onpointerup=b.onpointercancel=()=>touch.clear();
  }
  const action=find('[data-action]');
  action.onpointerdown=e=>{e.preventDefault();action.setPointerCapture(e.pointerId);if(started&&!paused){pulse=true;heldAction=true;}};
  action.onpointerup=action.onpointercancel=()=>{heldAction=false;};
  const hasAction=['runner','flappy','shooter','target'].includes(kind);action.hidden=!hasAction;
  find('.arcade-controls').hidden=['memory','mole'].includes(kind);
  for(const b of panel.querySelectorAll('[data-dir]'))b.hidden=['runner','flappy'].includes(kind)||(['bricks','stars','shooter','race'].includes(kind)&&b.dataset.dir.startsWith('0,'));
  find('[data-exit]').onclick=close;find('[data-play]').onclick=start;find('[data-restart]').onclick=reset;find('[data-pause]').onclick=pause;
  select.onchange=()=>{level=clamp(Number(select.value),1,unlocked);reset();};
  find('[data-next]').onclick=()=>{if(state.won&&level<5){level++;reset();}};
  reset();find('[data-play]').focus();
  function frame(now){
    if(closed)return;
    const dt=Math.min((now-previous)/1000,0.04);previous=now;
    if(started&&!paused&&!state.over&&!document.hidden){
      const dirs=[...keys].map(k=>directions[k]).filter(Boolean).concat([...touch.values()]);
      const dx=Math.sign(dirs.reduce((n,d)=>n+d[0],0)),dy=Math.sign(dirs.reduce((n,d)=>n+d[1],0));
      updateArcade(state,dt,{dx,dy,...(pointer??{}),action:pulse||(kind==='shooter'&&heldAction)});pulse=false;
    }
    if(state.over&&!awarded){awarded=true;clearInput();if(state.won){unlocked=Math.max(unlocked,Math.min(5,level+1));storage.setItem(key,unlocked);fillLevels();find('[data-next]').hidden=level===5;}find('[data-pause]').disabled=true;}
    const overlay=state.over?(state.won?(level===5?'🏆 Усі рівні пройдено!':'🏆 Рівень пройдено!'):'Спробуй ще!'):!started?'Готовий до гри?':paused?'Пауза':'';
    drawArcade(c,state,overlay);
    const time=state.limit?` · Час: ${Math.max(0,Math.ceil(state.limit-state.time))} с`:'';
    const points=['dodge','race'].includes(kind)?'Дістанься кінця рівня':kind==='pong'?`Рахунок: ${state.score} : ${state.enemy}`:`Ціль: ${state.score} / ${state.target}`;
    const status=`Рівень ${level} / 5 · ${points}${time}${['memory','maze','snake','flappy','target','pong'].includes(kind)?'':` · ♥ ${state.lives}`}${state.over?(state.won?' · Перемога!':' · Гру завершено'):''}`;
    if(find('[data-status]').textContent!==status)find('[data-status]').textContent=status;
    raf=requestAnimationFrame(frame);
  }
  raf=requestAnimationFrame(frame);
}
