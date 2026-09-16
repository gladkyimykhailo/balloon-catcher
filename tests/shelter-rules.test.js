import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addHand, step, restart } from '../src/shared/physics.js';
import { FOOTBALL as F, setFootballInput } from '../src/shared/football.js';
import { basketballHand, HOOPS, BASKETBALL } from '../src/shared/basketball.js';

function match(rough = false) {
  const w = createWorld('football');
  addHand(w, 'a', 0); addHand(w, 'b', 1); restart(w);
  w.football.noRules = rough;
  return w;
}
function nearby(w, x=500) {
  const [a,b] = w.hands;
  Object.assign(a,{x,tx:x,y:420,ty:420,tripCooldown:0});
  Object.assign(b,{x:x+40,tx:x+40,y:420,ty:420});
  w.football.owner=b.id;w.football.protect=0;
}
test('whole ball must cross goal line before a goal counts', () => {
  const w=createWorld('football');
  Object.assign(w.football.ball,{x:F.right-1,y:420,vx:800,vy:0});
  step(w,1/120);assert.equal(w.score,0);
  step(w,1/60);assert.equal(w.score,1);
});
test('last touch selects corner versus goal kick',()=>{
  for(const lastTouch of [0,1]) {
    const w=match();w.football.owner=null;w.football.lastTouch=lastTouch;
    Object.assign(w.football.ball,{x:F.right+F.radius-1,y:200,vx:800,vy:0});
    step(w,1/120);
    assert.equal(w.football.notice,lastTouch===1?'Кутовий':'Удар від воріт');
    assert.equal(w.football.owner,lastTouch===1?'a':'b');
    assert.equal(w.score,0);
  }
});
test('trips give a free kick and two yellow cards send a player off',()=>{
  const w=match();
  for(let i=1;i<=2;i++){
    w.football.whistle=0;nearby(w);
    setFootballInput(w,'a',{trip:true});step(w,1/120);
    assert.equal(w.hands[0].cards,i);
    assert.match(w.football.notice,/Штрафний/);
  }
  assert.equal(w.hands[0].out,true);
  restart(w);assert.equal(w.hands[0].out,false);assert.equal(w.hands[0].cards,0);
});
test('trip inside defending penalty area awards a penalty',()=>{
  const w=match();nearby(w,100);setFootballInput(w,'a',{trip:true});step(w,1/120);
  assert.match(w.football.notice,/Пенальті/);assert.equal(w.football.ball.x,180);
});
test('rough football trips stun and release possession without cards, persists on restart',()=>{
  const w=match(true);nearby(w);setFootballInput(w,'a',{trip:true});step(w,1/120);
  assert.ok(w.hands[1].stun>0);assert.notEqual(w.football.owner,'b');
  assert.equal(w.hands[0].cards,0);assert.equal(w.football.whistle,0);
  restart(w);assert.equal(w.football.noRules,true);
});
test('offside is determined at the pass and penalized when receiver touches the ball',()=>{
  const w=match();const receiver=addHand(w,'c',2),defender=addHand(w,'d',3);
  const a=w.hands[0],b=w.hands[1];
  Object.assign(a,{x:700,tx:700,y:420,ty:420});
  Object.assign(b,{x:850,tx:850,y:200,ty:200});
  Object.assign(defender,{x:1000,tx:1000,y:200,ty:200});
  Object.assign(receiver,{x:940,tx:940,y:420,ty:420});
  w.football.owner='a';
  setFootballInput(w,'a',{kick:true,aimX:1100,aimY:420});
  step(w,1/120);assert.ok(w.football.offside.includes('c'));
  for(let i=0;i<50 && !w.football.notice;i++)step(w,1/120);
  assert.match(w.football.notice,/Офсайд/);assert.equal(w.score,0);
});
test('basketball hand cannot tunnel through either net horizontally or vertically',()=>{
  const r=BASKETBALL.handRadius;
  for(const x of [HOOPS.left,HOOPS.right]){
    let h=basketballHand(x,550,x,150,1,0,1000,true);
    assert.ok(h.y>=HOOPS.y+65+r);
    h=basketballHand(x-140,350,x+140,350,1,0,1000,true);
    assert.ok(h.x<=x-HOOPS.half-r);
    h=basketballHand(x,150,x,550,1,0,1000,true);
    assert.ok(h.y<=HOOPS.y-7-r);
  }
});
