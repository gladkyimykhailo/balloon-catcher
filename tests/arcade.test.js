import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCADE_GAMES, createArcade, updateArcade, arcadeAction, arcadeDirection, cardRect, holePoint } from '../src/shared/arcade.js';
const tick=(s,n=1,input={},rng=()=>0.4)=>{for(let i=0;i<n;i++)updateArcade(s,1/60,input,rng);};
function seeded(seed=17){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};}

test('all 1023 games have twenty finite, independent playable level states',()=>{
  assert.equal(Object.keys(ARCADE_GAMES).length,1023);
  for(const kind of Object.keys(ARCADE_GAMES))for(let level=1;level<=40;level++){
    const s=createArcade(kind,level,seeded());
    tick(s,180,{dx:1,action:kind==='shooter'},seeded());
    for(const [key,value] of Object.entries(s))if(typeof value==='number')assert.ok(Number.isFinite(value),`${kind}/${level}/${key}`);
    const fresh=createArcade(kind,level,seeded());assert.ok(fresh.score>=0 && fresh.score<fresh.target);assert.equal(fresh.over,false);
    assert.equal(fresh.level,level);
  }
  assert.equal(createArcade('pong',Infinity).level,40);
  assert.throws(()=>createArcade('missing'));
});
test('memory: mismatches close, duplicate taps do not count, every level can be completed',()=>{
  for(let level=1;level<=40;level++){
    const s=createArcade('memory',level,seeded());
    const click=i=>{const r=cardRect(s,i);arcadeAction(s,r.x+5,r.y+5);};
    const first=0,other=s.cards.findIndex(c=>c.value!==s.cards[0].value);
    click(first);click(first);assert.equal(s.open.length,1);
    click(other);assert.equal(s.open.length,2);tick(s,46);assert.deepEqual(s.open,[]);
    for(let value=0;value<s.target;value++)for(let i=0;i<s.cards.length;i++)if(s.cards[i].value===value)click(i);
    assert.equal(s.won,true);assert.equal(s.score,s.target);
  }
});
test('snake turns, eats, grows, rejects reversal and loses against a wall',()=>{
  const s=createArcade('snake');s.food={x:6,y:7};tick(s,13);assert.equal(s.score,1);assert.equal(s.body.length,4);
  arcadeDirection(s,-1,0);assert.deepEqual(s.pending,{x:1,y:0});
  arcadeDirection(s,0,-1);tick(s,13);assert.equal(s.body[0].y,6);
  tick(s,200);assert.equal(s.over,true);assert.equal(s.won,false);
});
test('every generated maze has reachable keys and exit and can be won using movement',()=>{
  for(let level=1;level<=40;level++){
    const s=createArcade('maze',level,seeded(level));
    for(const goal of [...s.keys,s.exit]){
      const queue=[{...s.cell,path:[]}],seen=new Set([`${s.cell.x},${s.cell.y}`]);let path;
      for(let i=0;i<queue.length;i++){
        const p=queue[i];if(p.x===goal.x&&p.y===goal.y){path=p.path;break;}
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy,k=`${x},${y}`;if(s.grid[y]?.[x]===0&&!seen.has(k)){seen.add(k);queue.push({x,y,path:[...p.path,[dx,dy]]});}}
      }
      assert.ok(path,`level ${level} unreachable goal`);
      for(const [dx,dy] of path){s.clock=0;tick(s,1,{dx,dy});}
    }
    assert.equal(s.won,true);assert.equal(s.keys.length,0);
  }
});
test('mole and target count actual hits; hazards and misses cost resources',()=>{
  const mole=createArcade('mole');mole.holes[0]={time:1,bad:true};const p=holePoint(0);arcadeAction(mole,p.x,p.y);assert.equal(mole.lives,2);
  mole.holes[0]={time:1,bad:false};arcadeAction(mole,p.x,p.y);assert.equal(mole.score,1);arcadeAction(mole,p.x,p.y);assert.equal(mole.score,1);
  const target=createArcade('target',1,seeded());arcadeAction(target,0,0);assert.equal(target.limit,34);
  while(!target.over)arcadeAction(target,target.mark.x,target.mark.y,seeded());assert.equal(target.won,true);
});
test('runner jumps only from ground and passed obstacles count once',()=>{
  const s=createArcade('runner');arcadeAction(s);tick(s,8);const vy=s.vy;arcadeAction(s);assert.equal(s.vy,vy);
  s.items=[{x:100,w:30,h:40}];tick(s);assert.equal(s.score,1);tick(s);assert.equal(s.score,1);
  tick(s,70);assert.ok(s.y<=440);
});
test('shooter enforces cooldown and projectiles destroy enemies',()=>{
  const s=createArcade('shooter');s.items=[{x:s.x,y:440}];arcadeAction(s);arcadeAction(s);assert.equal(s.shots.length,1);
  tick(s,3);assert.equal(s.score,1);assert.equal(s.items.length,0);
  tick(s,15);arcadeAction(s);assert.equal(s.shots.length,1);
});
test('flappy awards cleared gates once and collisions end the run',()=>{
  const s=createArcade('flappy');s.items=[{x:90,gap:250,passed:false}];tick(s);assert.equal(s.score,1);tick(s);assert.equal(s.score,1);
  arcadeAction(s);assert.ok(s.vy<0);
  s.items=[{x:175,gap:100,passed:false}];s.y=350;tick(s);assert.equal(s.over,true);assert.equal(s.won,false);
});
test('race and dodge can finish on time and repeated collisions eventually lose',()=>{
  for(const kind of ['race','dodge']){
    const s=createArcade(kind);s.time=s.limit-0.01;s.spawn=5;tick(s);assert.equal(s.won,true);
    const lose=createArcade(kind);
    for(let i=0;i<3;i++){lose.invincible=0;lose.items=[{x:lose.x,y:kind==='race'?455:lose.y,r:20,vx:0}];tick(lose);}
    assert.equal(lose.over,true);assert.equal(lose.won,false);
  }
});
test('stars, pong and bricks retain victory conditions with level-specific layouts',()=>{
  const stars=createArcade('stars',3);stars.score=stars.target-1;stars.items=[{x:stars.x,y:480,bad:false}];tick(stars);assert.equal(stars.won,true);
  const pong=createArcade('pong');pong.serve=0;pong.score=6;pong.bx=901;tick(pong);assert.equal(pong.won,true);
  const bricks=createArcade('bricks',5);assert.ok(bricks.bricks.some(b=>b.hp===2));bricks.serve=0;
  for(const b of bricks.bricks)b.hp=0;const b=bricks.bricks[0];b.hp=1;bricks.score=bricks.target-1;bricks.bx=b.x+20;bricks.by=b.y+12;tick(bricks);assert.equal(bricks.won,true);
});
test('finished games freeze and timed puzzles can fail',()=>{
  for(const kind of ['memory','mole','target']){const s=createArcade(kind);s.time=s.limit;tick(s);assert.equal(s.over,true);assert.equal(s.won,false);const frozen=structuredClone(s);tick(s,60,{action:true});arcadeAction(s);assert.deepEqual(s,frozen);}
});

test('reduced catalog keeps every mechanic and base game and removes retired variants', () => {
  const entries = Object.entries(ARCADE_GAMES);
  assert.equal(entries.filter(([, info]) => info.anthology).length, 1000);
  assert.equal(entries.filter(([, info]) => !info.anthology).length, 23);
  assert.equal(entries.filter(([, info]) => info.base).length, 0);
  assert.ok(ARCADE_GAMES.fighter);
  for (const id of ['stars-turbo', 'bricks-endurance', ...['budget', 'rival', 'energy', 'overtime', 'pairs'].map(c => `discovery-arithmetic-0-${c}`)]) {
    assert.throws(() => createArcade(id), /Unknown arcade game/);
  }
});

test('target is winnable at all twenty levels and freezes on victory', () => {
  for (let level = 1; level <= 40; level++) {
    const s = createArcade('target', level, seeded());
    for (let hit = 0; hit < s.target; hit++) arcadeAction(s, s.mark.x, s.mark.y, seeded());
    assert.equal(s.won, true, `target/${level}`);
    const frozen = structuredClone(s);
    updateArcade(s, 0.04, { action: true });
    assert.deepEqual(s, frozen);
  }
});
