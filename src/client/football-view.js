import { Container, Graphics, Text } from 'pixi.js';
import { FOOTBALL as F } from '../shared/football.js';

export class FootballView extends Container {
  constructor() {
    super();
    this.pitch = new Container();
    this.field = new Graphics();
    this.players = new Graphics();
    this.pixelField = new Graphics();
    this.celebration = new Graphics();
    this.lastRound = 0; this.goalUntil = 0;
    this.pitch.addChild(this.field, this.pixelField, this.players, this.celebration);
    this.title = new Text({ text: '', style: { fontFamily: 'system-ui', fontSize: 30, fontWeight: 'bold', fill: 0xffffff } });
    this.title.anchor.set(0.5); this.title.position.set(600, 45);
    this.help = new Text({ text: '', style: { fontFamily: 'system-ui', fontSize: 17, fill: 0xffffff, align: 'center' } });
    this.help.anchor.set(0.5); this.help.position.set(600, 765);
    this.addChild(this.pitch, this.title, this.help);
    const g = this.field;
    g.rect(0, 0, 1200, 800).fill(0x123d2c);
    g.roundRect(36, 94, 1128, 650, 18).fill(0x1b573a);
    for (let i = 0; i < 12; i++) g.rect(F.left + i * 90, F.top, 90, F.bottom - F.top).fill(i % 2 ? 0x31884c : 0x389755);
    const line = { color: 0xe5ffe6, width: 3, alpha: 0.8 };
    g.rect(F.left, F.top, F.right - F.left, F.bottom - F.top).stroke(line);
    g.moveTo(600, F.top).lineTo(600, F.bottom).stroke(line);
    g.circle(600, 420, 83).stroke(line).circle(600, 420, 5).fill(0xffffff);
    for (const x of [F.left, F.right - 165]) g.rect(x, 265, 165, 310).stroke(line);
    for (const x of [F.left, F.right - 70]) g.rect(x, F.goalTop - 20, 70, 260).stroke(line);
    for (const x of [20, F.right]) {
      g.rect(x, F.goalTop, 40, F.goalBottom - F.goalTop).fill(0x173c32).stroke({ color: 0xffffff, width: 4 });
      for (let y = F.goalTop + 10; y < F.goalBottom; y += 15) g.moveTo(x, y).lineTo(x + 40, y).stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
      for (let dx = 10; dx < 40; dx += 10) g.moveTo(x + dx, F.goalTop).lineTo(x + dx, F.goalBottom).stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
    }
  }
  draw(view, time) {
    const m = view.football, g = this.players;
    g.clear();
    this.field.visible = !m.noRules;
    const pg = this.pixelField; pg.clear();
    if (m.noRules) {
      pg.rect(0,0,1200,800).fill(0x102e24);
      for(let x=60;x<1140;x+=40) for(let y=115;y<725;y+=40) pg.rect(x,y,40,Math.min(40,725-y)).fill(((x+y)%80) ? 0x34864b : 0x307a45);
      pg.rect(60,115,1080,610).stroke({color:0xffffff,width:4});
      pg.rect(598,115,4,610).fill(0xffffff);
      for(const x of [20,1140]) pg.rect(x,310,40,220).stroke({color:0xffffff,width:4});
    }
    if (m.round !== this.lastRound) { if(m.round>this.lastRound) this.goalUntil=time+1.5; this.lastRound=m.round; }
    const fx=this.celebration; fx.clear();
    if(time<this.goalUntil) {
      const age=1.5-(this.goalUntil-time), color=m.goalSide ? 0x4ba9ff : 0xffa338;
      for(let i=0;i<70;i++) {
        const a=i*2.399, speed=100+(i%7)*45, x=600+Math.cos(a)*speed*age, y=380+Math.sin(a)*speed*age+100*age*age;
        if(m.noRules) fx.rect(Math.round(x/4)*4,Math.round(y/4)*4,8,8).fill(color);
        else fx.circle(x,y,4+i%4).fill({color,alpha:Math.max(0,1-age/1.5)});
      }
    }
    this.title.text = `ПОМАРАНЧЕВІ   ${m.score[0]} : ${m.score[1]}   СИНІ  ·  до ${m.target}`;
    const own = view.hands.find(h => h.self);
    this.help.text = (m.noticeTime > 0 ? m.notice : '') || view.message || (view.state === 'respawn' ? 'ГОООЛ! Розіграш із центру…'
      : m.owner === own?.id ? 'М’яч твій! Прицілься → клік / пробіл / відпусти палець — удар'
      : 'WASD / стрілки / вказівник — рух · підійди до м’яча, щоб забрати');
    for (const h of view.hands) {
      if(h.out) continue;
      if(m.noRules) {
        const x=Math.round(h.x/4)*4,y=Math.round(h.y/4)*4, color=h.player%2 ? 0x4ba9ff : 0xffa338;
        if(h.self) g.rect(x-28,y-28,56,60).stroke({color:0xffffff,width:4});
        if(h.stun>0) { g.rect(x-24,y,48,12).fill(color); g.rect(x+20,y-4,16,16).fill(0xf3c69e); }
        else { g.rect(x-16,y-8,32,28).fill(color);g.rect(x-12,y-24,24,20).fill(0xf3c69e);g.rect(x-12,y+20,8,12).fill(0x182136);g.rect(x+4,y+20,8,12).fill(0x182136); }
        continue;
      }
      const color = h.player % 2 ? 0x4ba9ff : 0xffa338;
      if(h.cards) g.rect(h.x+23,h.y-40,10,15).fill(0xffdc40);
      const phase = Math.sin(time * 12 + h.player) * 4;
      g.ellipse(h.x + 3, h.y + 8, 23, 18).fill({ color: 0x082b20, alpha: 0.4 });
      if (h.self) g.circle(h.x, h.y, 31).stroke({ color: 0xffffff, width: 3 });
      if (m.owner === h.id) g.circle(h.x, h.y, 28).stroke({ color: 0xffe178, width: 3 });
      g.roundRect(h.x - 13, h.y + 9 + phase, 10, 17, 4).fill(0x16243e);
      g.roundRect(h.x + 3, h.y + 9 - phase, 10, 17, 4).fill(0x16243e);
      g.roundRect(h.x - 25, h.y - 5 - phase, 9, 20, 4).fill(0xe6b38a);
      g.roundRect(h.x + 16, h.y - 5 + phase, 9, 20, 4).fill(0xe6b38a);
      g.roundRect(h.x - 17, h.y - 12, 34, 32, 9).fill(color).stroke({ color: 0x17352f, width: 2 });
      g.rect(h.x - 3, h.y + 3, 6, 12).fill(0xffffff);
      g.circle(h.x, h.y - 10, 12).fill(0xf3c69e);
      g.ellipse(h.x, h.y - 16, 11, 6).fill(0x47352e);
      if (!h.bot) g.circle(h.x, h.y - 40, 4).fill(0xffffff);
    }
    const b = m.ball;
    if(m.noRules) { g.rect(Math.round(b.x/4)*4-12,Math.round(b.y/4)*4-12,24,24).fill(0xffffff);g.rect(Math.round(b.x/4)*4-4,Math.round(b.y/4)*4-4,8,8).fill(0x182136); return; }
    if (own && m.owner === own.id && view.aim) {
      const angle = Math.atan2(view.aim.y - own.y, view.aim.x - own.x);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      for (let d = 45; d < 225; d += 22) g.circle(own.x + dx * d, own.y + dy * d, 3).fill(0xffed90);
      const x = own.x + dx * 235, y = own.y + dy * 235;
      g.moveTo(x - dx * 16 - dy * 9, y - dy * 16 + dx * 9).lineTo(x, y)
        .lineTo(x - dx * 16 + dy * 9, y - dy * 16 - dx * 9).stroke({ color: 0xffed90, width: 4 });
    }
    g.ellipse(b.x + 3, b.y + 6, 13, 10).fill({ color: 0x082b20, alpha: 0.5 });
    g.circle(b.x, b.y, F.radius).fill(0xffffff).stroke({ color: 0x243643, width: 2 });
    g.poly([b.x, b.y - 6, b.x + 6, b.y - 2, b.x + 4, b.y + 5, b.x - 4, b.y + 5, b.x - 6, b.y - 2]).fill(0x243643);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      g.circle(b.x + Math.cos(a) * 10, b.y + Math.sin(a) * 10, 2).fill(0x243643);
    }
  }
}
