import { EXTRA_GAMES, extraCommand, extraStatus } from '../shared/extra-games.js';
import { ARCADE_GAMES, LEVELS, MAX_ARCADE_LEVEL, createArcade, updateArcade, arcadeAction, arcadeDirection, clamp } from '../shared/arcade.js';
import { drawArcade } from './arcade-view.js';
import { storage, savedNumber } from './storage.js';
import { discoveryStatus, isMotor } from '../shared/anthology/engine.js';
import { openFighterMultiplayer } from './fighter-multiplayer.js';
import { arcadeUnlockedLevel } from '../shared/arcade-levels.js';

let activeClose = null;
export function openArcade(kind, onFinish = () => {}) {
  if(!Object.hasOwn(ARCADE_GAMES,kind))return;
  activeClose?.();
  const info=ARCADE_GAMES[kind], mechanic=info.anthology ? 'discovery' : info.base ?? kind, key=`shelter-level-${kind}`;
  let wonFifth=false;
  try{wonFifth=JSON.parse(storage.getItem('balloon-achievements'))?.stats?.[`arcade-${kind}-final`]>0;}catch{}
  let unlocked=arcadeUnlockedLevel(savedNumber(key,1),wonFifth), level=unlocked;
  if(wonFifth&&unlocked===6)storage.setItem(key,unlocked);
  const panel=document.createElement('div');
  panel.className='arcade-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',info.name);
  panel.innerHTML=`<div class="arcade-header"><h2>${info.name}</h2><button data-exit aria-label="Закрити гру">← Меню</button></div>
    <div class="arcade-toolbar"><label>Рівень <select data-level aria-label="Обрати рівень"></select></label><span data-progress></span></div>
    <p class="arcade-help">${info.help}</p>
    <canvas width="900" height="550" tabindex="0" aria-label="Ігрове поле: ${info.name}"></canvas>
    <p data-status role="status" aria-live="polite"></p>
    <p data-question hidden></p><div data-answers class="arcade-answers" hidden></div>
    <div class="arcade-buttons"><button data-play>▶ Грати</button><button data-next hidden>Наступний рівень →</button><button data-restart>Заново</button><button data-pause disabled>Пауза</button></div>
    <div class="arcade-controls" aria-label="Керування"><button data-dir="-1,0" aria-label="Ліворуч">←</button><button data-dir="0,-1" aria-label="Угору">↑</button><button data-dir="0,1" aria-label="Униз">↓</button><button data-dir="1,0" aria-label="Праворуч">→</button><button data-action>Дія</button></div>`;
  const commands = mechanic==='fighter' ? [['punch','Кулак · J'],['kick','Нога · K'],['special','Енергія · L']] : mechanic==='sokoban' ? [['undo','Скасувати · Z']] : mechanic==='mines' ? [['flag','Прапорець · F']] : [];
  for(const [command,label] of commands){const button=document.createElement('button');button.dataset.command=command;button.textContent=label;panel.querySelector('.arcade-controls').append(button);}
  const previousFocus=document.activeElement;
  const siblings=Array.from(document.body.children).map(el=>[el,el.inert]);for(const [el] of siblings)el.inert=true;
  document.body.append(panel);
  const find=s=>panel.querySelector(s),canvas=find('canvas'),c=canvas.getContext('2d'),select=find('[data-level]');
  const answerButtons=[];
  if(mechanic==='discovery')for(let i=0;i<4;i++){
    const button=document.createElement('button');button.type='button';
    button.onclick=()=>{if(started&&!paused&&!state.over&&state.stage.choices){state.cursor=i;arcadeAction(state);}};
    find('[data-answers]').append(button);answerButtons.push(button);
  }
  let state,started=false,paused=false,awarded=false,raf,previous=performance.now(),heldAction=false,pulse=false,pointer=null,closed=false;
  const keys=new Set(),touch=new Map();
  const fillLevels=()=>{select.replaceChildren(...LEVELS.map((name,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent=`${i+1}. ${name}${i+1>unlocked?' 🔒':''}`;o.disabled=i+1>unlocked;return o;}));select.value=level;find('[data-progress]').textContent=`Відкрито ${unlocked} / ${MAX_ARCADE_LEVEL}`;};
  function clearInput(){keys.clear();touch.clear();heldAction=false;pulse=false;pointer=null;}
  function reset(){state=createArcade(kind,level);started=false;paused=false;awarded=false;clearInput();find('[data-play]').hidden=false;find('[data-next]').hidden=true;find('[data-pause]').disabled=true;find('[data-pause]').textContent='Пауза';fillLevels();}
  function start(){started=true;paused=false;find('[data-play]').hidden=true;find('[data-pause]').disabled=false;canvas.focus();}
  function pause(){if(!started||state.over)return;paused=!paused;clearInput();find('[data-pause]').textContent=paused?'Продовжити':'Пауза';}
  function close(){if(closed)return;closed=true;cancelAnimationFrame(raf);window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);panel.remove();for(const [el,inert] of siblings)el.inert=inert;previousFocus?.focus();activeClose=null;}
  activeClose=close;
  if(mechanic==='fighter')for(const [mode,label] of [['local','👥 Двоє на пристрої'],['online','🌐 Онлайн-двобій']]){
    const button=document.createElement('button');button.textContent=label;if(mode==='online')button.className='online-block';
    button.onclick=()=>{close();openFighterMultiplayer(mode);};find('.arcade-buttons').append(button);
  }
  const directions={ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0],ArrowUp:[0,-1],KeyW:[0,-1],ArrowDown:[0,1],KeyS:[0,1]};
  if(mechanic==='fighter')Object.assign(directions,{Space:[0,-1],ShiftLeft:[0,1],ShiftRight:[0,1]});
  function down(e){
    e.stopImmediatePropagation();
    if(e.code==='Escape'){e.preventDefault();close();return;}
    if(e.code==='Tab'){
      const focusable=[...panel.querySelectorAll('button:not([hidden]):not(:disabled), select, canvas')].filter(el=>el.getClientRects().length);
      const at=focusable.indexOf(document.activeElement);if(e.shiftKey&&at<=0){e.preventDefault();focusable.at(-1)?.focus();}else if(!e.shiftKey&&at===focusable.length-1){e.preventDefault();focusable[0]?.focus();}return;
    }
    if(e.target===select)return;
    if(e.code==='KeyP'){e.preventDefault();if(!e.repeat)pause();return;}
    const command = mechanic==='fighter' ? {KeyJ:'punch',KeyK:'kick',KeyL:'special'}[e.code] : mechanic==='sokoban' && e.code==='KeyZ' ? 'undo' : mechanic==='mines' && e.code==='KeyF' ? 'flag' : null;
    if(command){e.preventDefault();if(started&&!paused&&!state.over&&!e.repeat)extraCommand(state,command);return;}
    if(directions[e.code]){e.preventDefault();keys.add(e.code);pointer=null;if(started&&!paused&&!state.over)arcadeDirection(state,...directions[e.code]);}
    if(e.code==='Space'&&mechanic!=='fighter'&&e.target===canvas){e.preventDefault();if(!started)start();heldAction=true;if(!e.repeat)pulse=true;}
  }
  function up(e){e.stopImmediatePropagation();keys.delete(e.code);if(e.code==='Space')heldAction=false;}
  function blur(){clearInput();if(started&&!paused&&!state.over)pause();}
  function visibility(){if(document.hidden)blur();}
  window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
  const coords=e=>{const r=canvas.getBoundingClientRect();return {x:clamp((e.clientX-r.left)*900/r.width,0,900),y:clamp((e.clientY-r.top)*550/r.height,0,550)};};
  canvas.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);pointer=coords(e);if(!started||paused||state.over)return;arcadeAction(state,pointer.x,pointer.y);if(mechanic==='shooter')heldAction=true;};
  canvas.onpointermove=e=>{pointer=coords(e);};
  canvas.onpointerup=canvas.onpointercancel=()=>{heldAction=false;};
  for(const b of panel.querySelectorAll('[data-dir]')) {
    const direction=b.dataset.dir.split(',').map(Number);
    b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch.set(e.pointerId,direction);pointer=null;if(started&&!paused&&!state.over)arcadeDirection(state,...direction);};
    b.onpointerup=b.onpointercancel=e=>touch.delete(e.pointerId);
  }
  const action=find('[data-action]');
  action.onpointerdown=e=>{e.preventDefault();action.setPointerCapture(e.pointerId);if(started&&!paused){pulse=true;heldAction=true;}};
  action.onpointerup=action.onpointercancel=()=>{heldAction=false;};
  for(const button of panel.querySelectorAll('[data-command]'))button.onclick=()=>{if(started&&!paused&&!state.over)extraCommand(state,button.dataset.command);};
  canvas.oncontextmenu=e=>{e.preventDefault();if(mechanic==='mines'&&started&&!paused&&!state.over){const old=state.flagMode;state.flagMode=true;const p=coords(e);arcadeAction(state,p.x,p.y);state.flagMode=old;}};
  const hasAction=['runner','flappy','shooter','target','stack','connect','lights','mines','sequence','flood','discovery'].includes(mechanic);action.hidden=!hasAction;action.textContent=mechanic==='stack'?'Поставити':mechanic==='connect'?'Кинути фішку':mechanic==='mines'?'Відкрити / позначити':'Дія';
  find('.arcade-controls').hidden=['memory','mole'].includes(mechanic);
  for(const b of panel.querySelectorAll('[data-dir]'))b.hidden=['runner','flappy','stack'].includes(mechanic)||(['bricks','stars','shooter','race','connect'].includes(mechanic)&&b.dataset.dir.startsWith('0,'));
  if(mechanic==='fighter'){find('[data-dir="0,-1"]').textContent='↑ / Пробіл · Стрибок';find('[data-dir="0,1"]').textContent='↓ / Shift · Блок';}
  if(mechanic==='discovery') {
    const motor=isMotor(info.mechanic), moving=['aim','tracker','catcher'].includes(info.mechanic);
    for(const b of panel.querySelectorAll('[data-dir]'))b.hidden=motor&&!moving&&info.mechanic!=='sorting'||(!['aim','tracker'].includes(info.mechanic)&&b.dataset.dir.startsWith('0,'));
    action.hidden=info.mechanic==='tracker';
    if(!motor||info.mechanic==='sorting')action.textContent='Відповісти';
  }
  find('[data-exit]').onclick=close;find('[data-play]').onclick=start;find('[data-restart]').onclick=reset;find('[data-pause]').onclick=pause;
  select.onchange=()=>{level=clamp(Number(select.value),1,unlocked);reset();};
  find('[data-next]').onclick=()=>{if(state.won&&level<MAX_ARCADE_LEVEL){level++;reset();}};
  reset();find('[data-play]').focus();
  function frame(now){
    if(closed)return;
    const dt=Math.min((now-previous)/1000,0.04);previous=now;
    if(started&&!paused&&!state.over&&!document.hidden){
      const dirs=[...keys].map(k=>directions[k]).filter(Boolean).concat([...touch.values()]);
      const dx=Math.sign(dirs.reduce((n,d)=>n+d[0],0)),dy=Math.sign(dirs.reduce((n,d)=>n+d[1],0));
      updateArcade(state,dt,{dx,dy,...(mechanic==='fighter'?{jump:dirs.some(d=>d[1]<0),block:dirs.some(d=>d[1]>0)}:{}),...(pointer??{}),action:pulse||(mechanic==='shooter'&&heldAction)});pulse=false;
    }
    if(state.over&&!awarded){awarded=true;onFinish({kind,level,won:state.won});clearInput();if(state.won){unlocked=Math.max(unlocked,Math.min(MAX_ARCADE_LEVEL,level+1));storage.setItem(key,unlocked);fillLevels();find('[data-next]').hidden=level===MAX_ARCADE_LEVEL;}find('[data-pause]').disabled=true;}
    const overlay=state.over?(state.won?(level===MAX_ARCADE_LEVEL?'🏆 Усі рівні пройдено!':'🏆 Рівень пройдено!'):'Спробуй ще!'):!started?'Готовий до гри?':paused?'Пауза':'';
    drawArcade(c,state,overlay);
    if(mechanic==='discovery'){
      const stage=state.stage,choices=stage.choices;
      find('[data-answers]').hidden=!choices;find('[data-question]').hidden=!choices;
      const question=[stage.prompt,...(stage.lines||[])].join(' · ');
      if(find('[data-question]').textContent!==question)find('[data-question]').textContent=question;
      for(let i=0;i<answerButtons.length;i++){
        const button=answerButtons[i],label=choices?.[i]||'';
        if(button.textContent!==label)button.textContent=label;
        button.disabled=!started||paused||state.over||state.between>0||stage.age<stage.preview;
      }
    }
    if(mechanic==='mines')find('[data-command="flag"]').setAttribute('aria-pressed',String(state.flagMode));
    const time=state.limit?` · Час: ${Math.max(0,Math.ceil(state.limit-state.time))} с`:'';
    const points=['dodge','race'].includes(mechanic)?'Дістанься кінця рівня':mechanic==='pong'?`Рахунок: ${state.score} : ${state.enemy}`:`Ціль: ${state.score} / ${state.target}`;
    const status=mechanic==='discovery'?`Рівень ${level} / ${MAX_ARCADE_LEVEL} · ${discoveryStatus(state)}${state.over?(state.won?' · Перемога!':' · Гру завершено'):''}`:Object.hasOwn(EXTRA_GAMES,mechanic)?`Рівень ${level} / ${MAX_ARCADE_LEVEL} · ${extraStatus(state)}${state.over?(state.won?' · Перемога!':' · Гру завершено'):''}`:`Рівень ${level} / ${MAX_ARCADE_LEVEL} · ${points}${time}${['memory','maze','snake','flappy','target','pong'].includes(mechanic)?'':` · ♥ ${state.lives}`}${state.over?(state.won?' · Перемога!':' · Гру завершено'):''}`;
    if(find('[data-status]').textContent!==status)find('[data-status]').textContent=status;
    raf=requestAnimationFrame(frame);
  }
  raf=requestAnimationFrame(frame);
}
