import { EXTRA_GAMES } from '../shared/extra-games.js';
import { drawExtra } from './extra-games-view.js';
import { drawDiscovery } from './anthology/view.js';
import { cardRect } from '../shared/arcade.js';
import { drawMoleGarden } from './mole-view.js';
const PALETTES=[['#102f30','#236454','#8ce7bd'],['#102c4b','#23587b','#7ad9ff'],['#292145','#643f65','#ffb59e'],['#131b3d','#303b75','#b7a5ff'],['#392439','#783d4d','#ffcd76']];
const SYMBOLS=['☀','☾','★','♥','♣','♦','♫','✿'];
export function drawArcade(c,s,overlay='') {
  const [bg,mid,accent]=PALETTES[(s.level-1)%PALETTES.length];
  const rect=(x,y,w,h,color,r=8)=>{c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();};
  const circle=(x,y,r,color)=>{c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();};
  const text=(str,x,y,size=24,color='white')=>{c.fillStyle=color;c.font=`bold ${size}px system-ui`;c.textAlign='center';c.textBaseline='middle';c.fillText(str,x,y);};
  const star=(x,y,r=18,color='#ffdc69')=>{c.fillStyle=color;c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,k=i%2?r*.45:r;c.lineTo(x+Math.cos(a)*k,y+Math.sin(a)*k);}c.closePath();c.fill();};
  const ship=(x,y,color)=>{c.fillStyle=color;c.beginPath();c.moveTo(x,y-23);c.lineTo(x+22,y+22);c.quadraticCurveTo(x,y+10,x-22,y+22);c.closePath();c.fill();circle(x,y,7,'#d9f7ff');};
  const gradient=c.createLinearGradient(0,0,0,550);gradient.addColorStop(0,bg);gradient.addColorStop(1,mid);c.fillStyle=gradient;c.fillRect(0,0,900,550);
  for(let i=0;i<24;i++)circle((i*137+31)%900,(i*79+23)%550,1+i%2,'#ffffff18');
  const blink=s.invincible>0&&Math.floor(s.time*12)%2===0;
  if(s.kind==='pong') {
    for(let y=12;y<550;y+=28)rect(448,y,4,12,'#ffffff35',2);
    rect(24,s.y-55,14,110,'#ffbe55');rect(862,s.bot-55,14,110,accent);
    text(`${s.score}     ${s.enemy}`,450,50,36,'#ffffff80');
  }
  if(s.kind==='bricks') {
    const half=70-s.difficulty*4;rect(s.x-half,490,half*2,18,accent);
    for(const b of s.bricks)if(b.hp>0){rect(b.x,b.y,78,24,b.hp>=2?'#fff0ad':['#ffb45c','#fa7297','#75d6af','#83afff'][Math.floor((b.y-45)/29)%4]);if(b.hp>2)text(String(b.hp),b.x+39,b.y+12,16,'#28334d');if(b.hp===2)rect(b.x+8,b.y+5,62,3,'#b88342',1);}
  }
  if(['pong','bricks'].includes(s.kind)) {circle(s.bx,s.by,17,'#ffffff18');circle(s.bx,s.by,10,'white');}
  if(s.kind==='stars') {
    if(!blink)rect(s.x-60,490,120,18,accent);
    for(const p of s.items)if(p.bad){circle(p.x,p.y,16,'#ff5577');text('×',p.x,p.y,23);}else star(p.x,p.y);
  }
  if(s.kind==='snake') {
    rect(86,35,728,458,'#091e2d',18);
    for(const p of s.walls)rect(90+p.x*30,39+p.y*30,28,28,'#67799a',7);
    for(let i=s.body.length-1;i>=0;i--){const p=s.body[i];rect(90+p.x*30,39+p.y*30,28,28,i===0?'#d6ffb1':accent,10);}
    const head=s.body[0];circle(104+head.x*30+s.dir.x*6,53+head.y*30+s.dir.y*6,4,'#163545');
    circle(104+s.food.x*30,53+s.food.y*30,11,'#ff6979');rect(103+s.food.x*30,38+s.food.y*30,4,7,'#b5ef95',2);
  }
  if(s.kind==='memory')for(let i=0;i<s.cards.length;i++) {
    const card=s.cards[i],r=cardRect(s,i),shown=card.matched||s.open.includes(i);
    rect(r.x,r.y,r.w,r.h,card.matched?'#63bfa6':shown?'#fff0d4':mid,14);
    c.strokeStyle=accent;c.lineWidth=2;c.stroke();
    text(shown?SYMBOLS[card.value]:'?',r.x+r.w/2,r.y+r.h/2,38,shown?'#28334d':accent);
  }
  if(s.kind==='mole')drawMoleGarden(c,s);
  if(s.kind==='target') {
    circle(s.mark.x,s.mark.y,s.mark.r,'#fff0d4');circle(s.mark.x,s.mark.y,s.mark.r*.7,'#ef687a');circle(s.mark.x,s.mark.y,s.mark.r*.35,'#fff0d4');
    c.strokeStyle=accent;c.lineWidth=2;c.beginPath();c.arc(s.x,s.y,15,0,Math.PI*2);c.moveTo(s.x-24,s.y);c.lineTo(s.x+24,s.y);c.moveTo(s.x,s.y-24);c.lineTo(s.x,s.y+24);c.stroke();
  }
  if(s.kind==='runner') {
    rect(0,465,900,85,'#132c39');rect(0,465,900,5,accent,0);
    for(const p of s.items)rect(p.x,450-p.h,p.w,p.h+15,'#ff8c7a',5);
    if(!blink){circle(170,s.y-37,14,'#ffe1be');rect(152,s.y-24,36,35,accent,10);rect(155,s.y+8,10,15,'#eef4ff',4);rect(175,s.y+8,10,15,'#eef4ff',4);}
  }
  if(s.kind==='dodge') {
    for(const p of s.items){circle(p.x,p.y,p.r,'#b88f89');circle(p.x-p.r*.25,p.y-3,p.r*.3,'#7f6875');}
    if(!blink)ship(s.x,s.y,accent);
  }
  if(s.kind==='shooter') {
    if(!blink)ship(s.x,485,accent);
    for(const p of s.shots)rect(p.x-3,p.y-12,6,24,'#ffdc69',3);
    for(const p of s.items){rect(p.x-23,p.y-12,46,24,'#f77f9f',10);circle(p.x,p.y-10,12,'#bad9ff');}
  }
  if(s.kind==='flappy') {
    const half=108-s.difficulty*7;
    for(const p of s.items){rect(p.x,-20,65,p.gap-half+20,accent,10);rect(p.x,p.gap+half,65,570-p.gap-half,accent,10);}
    circle(s.x,s.y,17,'#ffdd6c');circle(s.x+7,s.y-5,4,'#243853');circle(s.x-8,s.y+4,9,'#f6ac55');
  }
  if(s.kind==='race') {
    rect(240,0,420,550,'#26344d',0);
    for(const x of [240,654])rect(x,0,6,550,accent,0);
    for(const x of [378,518])for(let y=-80;y<550;y+=95)rect(x,(y+(s.time*(230+s.difficulty*45))%95),4,45,'#ffffff70',2);
    const car=(x,y,color)=>{rect(x-29,y-35,9,20,'#101722',3);rect(x+20,y-35,9,20,'#101722',3);rect(x-29,y+15,9,20,'#101722',3);rect(x+20,y+15,9,20,'#101722',3);rect(x-22,y-43,44,86,color,12);rect(x-15,y-20,30,23,'#c9edff',6);};
    for(const p of s.items)car(p.x,p.y,'#ee849d');if(!blink)car(s.x,455,accent);
  }
  if(s.kind==='maze') {
    const size=480/s.n,ox=210,oy=35;
    rect(ox-8,oy-8,496,496,'#0a1729',14);
    for(let y=0;y<s.n;y++)for(let x=0;x<s.n;x++)if(s.grid[y][x])rect(ox+x*size,oy+y*size,size-1,size-1,mid,Math.min(5,size/5));
    const center=p=>({x:ox+(p.x+.5)*size,y:oy+(p.y+.5)*size});
    const end=center(s.exit);rect(end.x-size*.42,end.y-size*.42,size*.84,size*.84,s.keys.length?'#6a728c':'#66e2aa',5);
    for(const key of s.keys){const p=center(key);star(p.x,p.y,size*.34);}
    const p=center(s.cell);circle(p.x,p.y,size*.33,'#fff0d4');
  }
  if(Object.hasOwn(EXTRA_GAMES,s.kind))drawExtra(c,s);
  if(s.kind==='discovery')drawDiscovery(c,s);
  if(overlay){rect(0,0,900,550,'#081324bb',0);rect(145,180,610,170,bg,25);text(overlay,450,245,32);text(s.multiplayer?'Керування та готовність — під ареною':s.over?(s.won?'Обирай наступний рівень!':'Натисни «Заново», щоб спробувати ще'):'Натисни «Грати», коли будеш готовий',450,300,20,accent);}
}
