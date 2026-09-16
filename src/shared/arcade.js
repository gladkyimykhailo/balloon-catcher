export const LEVELS = ['Сад', 'Узбережжя', 'Сутінки', 'Космос', 'Фінальний виклик'];
export const ARCADE_GAMES = {
  pong: { name: '🏓 Пінг-понг', help: 'Рухай ракетку вгору й униз. Переграй суперника до 7 очок.' },
  bricks: { name: '🧱 Арканоїд', help: 'Рухай платформу ліворуч і праворуч. Розбий усі блоки, збережи 3 життя.' },
  stars: { name: '⭐ Ловець зірок', help: 'Лови золоті зірки платформою. Уникай червоних бомб.' },
  snake: { name: '🐍 Змійка', help: 'Стрілки, WASD або кнопки напрямку. Збирай яблука, не врізайся у себе й стіни.' },
  memory: { name: '🃏 Знайди пару', help: 'Відкривай картки дотиком або мишкою. Знайди всі пари до завершення часу.' },
  mole: { name: '🔨 Кротобій', help: 'Натискай на кротів, поки вони не сховалися. Червоних їжачків не чіпай!' },
  runner: { name: '🏃 Бігун', help: 'Пробіл, клік або кнопка «Дія» — стрибок. Перестрибни всі перешкоди.' },
  dodge: { name: '☄️ Метеорний дощ', help: 'Рухай корабель у всі боки. Протримайся до кінця рівня, уникаючи метеорів.' },
  shooter: { name: '🚀 Космічний захисник', help: 'Рухай корабель ліворуч і праворуч. Пробіл або «Дія» — вогонь. Знищ ворогів.' },
  maze: { name: '🧭 Лабіринт', help: 'Стрілки, WASD або кнопки напрямку. Збери всі ключі й дістанься зеленого виходу.' },
  target: { name: '🎯 Влучний стрілець', help: 'Влучай у рухомі мішені кліком або дотиком. Стрілки рухають приціл, пробіл стріляє.' },
  flappy: { name: '🐤 Політ пташки', help: 'Пробіл, клік або «Дія» — змах крил. Пролети крізь усі ворота.' },
  race: { name: '🏎️ Перегони', help: 'Керуй машиною ліворуч і праворуч. Обганяй транспорт і дістанься фінішу.' },
};
export const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const near = (a,b,r) => Math.hypot(a.x-b.x,a.y-b.y)<r;
const pick = (rng,n) => Math.floor(rng()*n);
function shuffle(a,rng) { for(let i=a.length-1;i>0;i--){const j=pick(rng,i+1);[a[i],a[j]]=[a[j],a[i]];} return a; }
export function createArcade(kind, level=1, rng=Math.random) {
  if(!Object.hasOwn(ARCADE_GAMES,kind)) throw new Error('Unknown arcade game');
  level=clamp(Math.floor(Number(level)||1),1,5);
  const s={kind,level,time:0,score:0,lives:3,over:false,won:false,x:450,y:450,spawn:0,items:[],shots:[],cooldown:0,invincible:0,target:10+level*3};
  if(kind==='pong'||kind==='bricks') Object.assign(s,{bx:450,by:320,vx:260+level*35,vy:-230-level*20,bot:275,enemy:0,y:275,target:7,serve:0.6});
  if(kind==='bricks') {
    s.bricks=[];
    for(let row=0;row<3+level;row++)for(let col=0;col<10;col++) {
      if(level===2 && (row+col)%3===0 || level===3 && Math.abs(col-4.5)>row+2) continue;
      s.bricks.push({x:30+col*85,y:45+row*29,hp:level>=4 && row%2===0?2:1});
    }
    s.target=s.bricks.length;
  }
  if(kind==='stars') s.target=12+level*4;
  if(kind==='snake') {
    s.body=[{x:5,y:7},{x:4,y:7},{x:3,y:7}];s.dir={x:1,y:0};s.pending={...s.dir};s.clock=0;s.target=4+level*2;
    s.walls=[];
    for(let i=0;i<level-1;i++) for(let j=0;j<3;j++)s.walls.push({x:10+i*2,y:3+j});
    snakeFood(s,rng);
  }
  if(kind==='memory') {
    s.target=3+level;s.cards=shuffle(Array.from({length:s.target*2},(_,i)=>({value:Math.floor(i/2),matched:false})),rng);
    s.open=[];s.reveal=0;s.limit=90-level*8;
  }
  if(kind==='mole') {s.holes=Array.from({length:9},()=>({time:0,bad:false}));s.limit=40;s.target=10+level*3;}
  if(kind==='target') {s.limit=35;s.target=8+level*3;newTarget(s,rng);}
  if(kind==='runner') {s.y=440;s.vy=0;s.target=8+level*3;s.spawn=1.3;}
  if(kind==='dodge') {s.limit=18+level*5;s.spawn=0.5;}
  if(kind==='shooter') {s.target=10+level*4;s.spawn=0.6;}
  if(kind==='flappy') {s.x=180;s.y=250;s.vy=0;s.target=5+level*2;s.spawn=0.9;}
  if(kind==='race') {s.limit=20+level*5;s.spawn=0.8;s.x=450;}
  if(kind==='maze') makeMaze(s,rng);
  return s;
}
function finish(s,won) {s.over=true;s.won=won;}
function hurt(s) {if(s.invincible>0)return;s.lives--;s.invincible=1.2;if(s.lives<=0)finish(s,false);}
function snakeFood(s,rng) {
  const free=[];for(let y=0;y<15;y++)for(let x=0;x<24;x++)if(![...s.body,...s.walls].some(p=>p.x===x&&p.y===y))free.push({x,y});
  if(!free.length){finish(s,true);return;}s.food=free[pick(rng,free.length)];
}
function newTarget(s,rng) {s.mark={x:70+rng()*760,y:80+rng()*370,r:38-s.level*3,vx:(rng()<0.5?-1:1)*(35+s.level*18)};}
function makeMaze(s,rng) {
  const n=9+s.level*2;s.n=n;s.grid=Array.from({length:n},()=>Array(n).fill(1));
  const stack=[{x:1,y:1}];s.grid[1][1]=0;
  while(stack.length){const p=stack.at(-1), next=shuffle([{x:2,y:0},{x:-2,y:0},{x:0,y:2},{x:0,y:-2}],rng).map(d=>({x:p.x+d.x,y:p.y+d.y})).find(q=>q.x>0&&q.y>0&&q.x<n-1&&q.y<n-1&&s.grid[q.y][q.x]);
    if(next){s.grid[(p.y+next.y)/2][(p.x+next.x)/2]=0;s.grid[next.y][next.x]=0;stack.push(next);}else stack.pop();
  }
  s.cell={x:1,y:1};s.exit={x:n-2,y:n-2};s.clock=0;
  const free=[];for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++)if(!s.grid[y][x]&&(x!==1||y!==1)&&(x!==n-2||y!==n-2))free.push({x,y});
  s.keys=shuffle(free,rng).slice(0,s.level);s.target=s.keys.length;
}
export function cardRect(s,i) {const cols=4,rows=Math.ceil(s.cards.length/cols),w=130,h=Math.min(125,390/rows);return {x:150+(i%cols)*150,y:55+Math.floor(i/cols)*(h+14),w,h};}
export function holePoint(i){return {x:240+i%3*210,y:130+Math.floor(i/3)*145};}
export function arcadeAction(s,x=s.x,y=s.y,rng=Math.random) {
  if(s.over)return;
  if(s.kind==='runner'&&s.y>=440) s.vy=-640;
  if(s.kind==='flappy') s.vy=-285;
  if(s.kind==='shooter'&&s.cooldown<=0){s.shots.push({x:s.x,y:465});s.cooldown=0.18;}
  if(s.kind==='memory'&&s.open.length<2) {
    const i=s.cards.findIndex((_,i)=>{const r=cardRect(s,i);return x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;});
    if(i<0||s.cards[i].matched||s.open.includes(i))return;
    s.open.push(i);
    if(s.open.length===2){const [a,b]=s.open;if(s.cards[a].value===s.cards[b].value){s.cards[a].matched=s.cards[b].matched=true;s.score++;s.open=[];if(s.score===s.target)finish(s,true);}else s.reveal=0.75;}
  }
  if(s.kind==='mole') {
    const i=s.holes.findIndex((h,i)=>h.time>0&&near({x,y},holePoint(i),49));
    if(i<0)return;const h=s.holes[i];if(h.bad)hurt(s);else s.score++;h.time=0;
    if(s.score>=s.target)finish(s,true);
  }
  if(s.kind==='target') {if(near({x,y},s.mark,s.mark.r)){s.score++;newTarget(s,rng);if(s.score>=s.target)finish(s,true);}else s.limit=Math.max(s.time,s.limit-1);}
}
export function arcadeDirection(s,dx,dy) {
  if(s.kind==='snake' && (dx||dy) && !(dx===-s.dir.x&&dy===-s.dir.y)) s.pending={x:dx,y:dy};
}
export function updateArcade(s,dt,input={},rng=Math.random) {
  if(s.over)return;
  dt=clamp(dt,0,0.04);s.time+=dt;s.cooldown-=dt;s.invincible=Math.max(0,s.invincible-dt);
  const dx=input.dx||0,dy=input.dy||0;
  if(!['snake','maze','runner','flappy'].includes(s.kind)){
    if(Number.isFinite(input.x))s.x=input.x;
    if(Number.isFinite(input.y))s.y=input.y;
    s.x=clamp(s.x+dx*500*dt,60,840);s.y=clamp(s.y+dy*500*dt,55,495);
  }
  if(input.action)arcadeAction(s,undefined,undefined,rng);
  if(s.kind==='snake') {
    s.clock+=dt;if(s.clock>=0.23-s.level*0.025){s.clock=0;s.dir={...s.pending};const head={x:s.body[0].x+s.dir.x,y:s.body[0].y+s.dir.y},eat=head.x===s.food.x&&head.y===s.food.y;
      if(head.x<0||head.x>=24||head.y<0||head.y>=15||[...s.walls,...s.body.slice(0,eat?undefined:-1)].some(p=>p.x===head.x&&p.y===head.y)){finish(s,false);return;}
      s.body.unshift(head);if(eat){s.score++;snakeFood(s,rng);if(s.score>=s.target)finish(s,true);}else s.body.pop();
    }return;
  }
  if(s.kind==='maze') {
    s.clock-=dt;if(s.clock<=0&&(dx||dy)){const x=s.cell.x+Math.sign(dx),y=s.cell.y+(dx?0:Math.sign(dy));if(s.grid[y]?.[x]===0)s.cell={x,y};s.clock=0.13;
      s.keys=s.keys.filter(k=>{if(k.x===s.cell.x&&k.y===s.cell.y){s.score++;return false;}return true;});
      if(!s.keys.length&&s.cell.x===s.exit.x&&s.cell.y===s.exit.y)finish(s,true);
    }return;
  }
  if(s.kind==='memory'){if(s.reveal>0){s.reveal-=dt;if(s.reveal<=0)s.open=[];}}
  if(s.kind==='mole') {
    for(const h of s.holes)h.time=Math.max(0,h.time-dt);
    s.spawn-=dt;if(s.spawn<=0){s.spawn=0.85-s.level*0.09;const empty=s.holes.map((h,i)=>h.time<=0?i:-1).filter(i=>i>=0);if(empty.length)s.holes[empty[pick(rng,empty.length)]]={time:1.35-s.level*0.12,bad:rng()<0.12+s.level*0.025};}
  }
  if(s.kind==='target'){s.mark.x+=s.mark.vx*dt;if(s.mark.x<55||s.mark.x>845){s.mark.x=clamp(s.mark.x,55,845);s.mark.vx*=-1;}}
  if(['memory','mole','target'].includes(s.kind)){if(s.time>=s.limit)finish(s,false);return;}
  if(s.kind==='pong'||s.kind==='bricks') {updateBall(s,dt);return;}
  s.spawn-=dt;
  if(s.kind==='stars') {
    if(s.spawn<=0){s.spawn=0.65-s.level*0.055;s.items.push({x:30+rng()*840,y:-20,bad:rng()<0.18+s.level*0.03});}
    for(const p of s.items){p.y+=(170+s.level*35)*dt;if(p.y>475&&p.y<520&&Math.abs(p.x-s.x)<65){if(p.bad)hurt(s);else s.score++;p.y=600;}}
    s.items=s.items.filter(p=>p.y<570);
  }
  if(s.kind==='runner') {
    s.vy+=1500*dt;s.y=Math.min(440,s.y+s.vy*dt);if(s.y===440)s.vy=0;
    if(s.spawn<=0){s.spawn=1.65-s.level*0.1+rng()*0.35;s.items.push({x:940,w:26+rng()*20,h:35+rng()*25});}
    for(const p of s.items){p.x-=(260+s.level*35)*dt;if(p.x<192&&p.x+p.w>148&&s.y>450-p.h){hurt(s);p.hit=true;}
      if(p.x+p.w<140&&!p.passed){p.passed=true;if(!p.hit)s.score++;}}
    s.items=s.items.filter(p=>p.x>-60);
  }
  if(s.kind==='dodge') {
    if(s.spawn<=0){s.spawn=0.42-s.level*0.035;s.items.push({x:25+rng()*850,y:-30,r:14+rng()*15,vx:(rng()-0.5)*s.level*25});}
    for(const p of s.items){p.y+=(160+s.level*35)*dt;p.x+=p.vx*dt;if(near(p,s,p.r+17)){hurt(s);p.y=700;}}
    s.items=s.items.filter(p=>p.y<590);if(s.time>=s.limit)finish(s,true);
  }
  if(s.kind==='shooter') {
    if(s.spawn<=0){s.spawn=1.0-s.level*0.1;s.items.push({x:40+rng()*820,y:-20});}
    for(const shot of s.shots){shot.y-=600*dt;for(const enemy of s.items)if(!enemy.dead&&near(shot,enemy,27)){enemy.dead=true;shot.y=-100;s.score++;break;}}
    for(const p of s.items){p.y+=(80+s.level*25)*dt;if(!p.dead&&(p.y>535||near(p,{x:s.x,y:485},32))){hurt(s);p.dead=true;}}
    s.items=s.items.filter(p=>!p.dead);s.shots=s.shots.filter(p=>p.y>-20);
  }
  if(s.kind==='flappy') {
    s.vy+=740*dt;s.y+=s.vy*dt;
    if(s.spawn<=0){s.spawn=1.9;s.items.push({x:940,gap:155+rng()*210,passed:false});}
    const half=108-s.level*7;
    for(const p of s.items){p.x-=(170+s.level*22)*dt;if(p.x<s.x+16&&p.x+65>s.x-16&&(s.y-14<p.gap-half||s.y+14>p.gap+half)){finish(s,false);return;}if(p.x+65<s.x&&!p.passed){s.score++;p.passed=true;}}
    if(s.y<14||s.y>536)finish(s,false);s.items=s.items.filter(p=>p.x>-80);
  }
  if(s.kind==='race') {
    s.x=clamp(s.x,285,615);
    if(s.spawn<=0){s.spawn=1.2-s.level*0.1;s.items.push({x:[310,450,590][pick(rng,3)],y:-90});}
    for(const p of s.items){p.y+=(230+s.level*45)*dt;if(Math.abs(p.x-s.x)<49&&Math.abs(p.y-455)<70){hurt(s);p.y=700;}}
    s.items=s.items.filter(p=>p.y<650);if(s.time>=s.limit)finish(s,true);
  }
  if(!s.over&&s.score>=s.target)finish(s,true);
}
function updateBall(s,dt){
  if(s.serve>0){s.serve-=dt;return;}
  const oldY=s.by;s.bx+=s.vx*dt;s.by+=s.vy*dt;
  if(s.by<12){s.by=12;s.vy=Math.abs(s.vy);}
  if(s.kind==='pong'){
    const goal=clamp(s.by,55,495),speed=155+s.level*30;
    s.bot+=Math.sign(goal-s.bot)*Math.min(Math.abs(goal-s.bot),speed*dt);
    if(s.by>538){s.by=538;s.vy=-Math.abs(s.vy);}
    if(s.vx<0&&s.bx<49&&s.bx>15&&Math.abs(s.by-s.y)<65){s.bx=49;s.vx=Math.min(650,Math.abs(s.vx)*1.035);s.vy=(s.by-s.y)*6;}
    if(s.vx>0&&s.bx>851&&s.bx<885&&Math.abs(s.by-s.bot)<65){s.bx=851;s.vx=-Math.min(650,Math.abs(s.vx)*1.035);s.vy=(s.by-s.bot)*6;}
    if(s.bx<0||s.bx>900){if(s.bx>900)s.score++;else s.enemy++;s.vx=s.bx>900?-300:300;s.bx=450;s.by=275;s.vy=180;s.serve=0.6;}
    if(s.score>=7||s.enemy>=7)finish(s,s.score>=7);
  }else{
    if(s.bx<12||s.bx>888){s.bx=clamp(s.bx,12,888);s.vx*=-1;}
    const half=70-s.level*4;
    if(s.vy>0&&oldY<=478&&s.by>=478&&Math.abs(s.bx-s.x)<half+10){s.by=478;s.vy=-Math.abs(s.vy);s.vx=(s.bx-s.x)*6;}
    for(const b of s.bricks)if(b.hp>0&&s.bx>b.x-10&&s.bx<b.x+88&&s.by>b.y-10&&s.by<b.y+34){b.hp--;if(!b.hp)s.score++;s.vy*=-1;s.by=s.vy<0?b.y-11:b.y+35;break;}
    if(s.by>570){s.lives--;s.bx=s.x;s.by=440;s.vy=-230-s.level*20;s.serve=0.7;}
    if(s.lives<=0||s.score===s.target)finish(s,s.score===s.target);
  }
}
