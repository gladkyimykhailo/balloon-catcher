import { Application, Container, Graphics, Text } from 'pixi.js';
import { WORLD, FLOOR_Y, BALLOON, PLAYER_COLORS, skinAt, gloveAt, biomeAt, bucketSpots } from '../shared/constants.js';

const BAR_W = 360;
const BAR_H = 24;


export class Renderer {
  constructor() {
    this.app = new Application();
    this.stage = null;
    this.hands = new Map();   // id -> {view, angle, scale}
    this.particles = [];
    this.shake = 0;
  }

  async init(canvasParent) {
    await this.app.init({
      background: 0x8fd3f4,
      antialias: true,
      resizeTo: window,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    canvasParent.appendChild(this.app.canvas);

    // Уся гра малюється в логічних координатах WORLD, а цей контейнер її масштабує.
    this.stage = new Container();
    this.app.stage.addChild(this.stage);

    this.bg = new Container();
    this.weather = new Graphics();   // сніг узимку, зорі домальовані в тло
    this.clouds = new Container();
    this.balloonG = new Graphics();
    this.shine = new Graphics();
    this.gull = makeGullGraphic();
    this.gull.visible = false;
    this.spikesG = new Graphics();
    this.poopsG = new Graphics();
    this.shadowG = new Graphics();
    this.handLayer = new Container();
    this.fx = new Container();
    this.hud = new Container();
    this.stage.addChild(this.bg, this.clouds, this.weather, this.shadowG, this.spikesG, this.poopsG, this.balloonG, this.shine, this.gull, this.handLayer, this.fx, this.hud);

    // Відблиск малюємо один раз в одиничних координатах і далі лише
    // масштабуємо/повертаємо — так він виглядає як нахилений полиск, а не як цифра.
    this.shine.ellipse(0, 0, 1, 0.55).fill({ color: 0xffffff, alpha: 0.5 });
    this.shine.circle(-1.9, 1.5, 0.32).fill({ color: 0xffffff, alpha: 0.32 });

    this.bgG = new Graphics();
    this.bg.addChild(this.bgG);
    this.biome = null;          // який біом зараз намальовано
    this.flakes = [];
    this.setBiome(biomeAt(1));
    this.makeClouds();
    this.makeHud();

    this.app.renderer.on('resize', () => this.layout());
    this.layout();
    return this;
  }

  layout() {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const s = Math.min(sw / WORLD.w, sh / WORLD.h);
    this.scale = s;
    this.offX = (sw - WORLD.w * s) / 2;
    this.offY = (sh - WORLD.h * s) / 2;
    this.stage.scale.set(s);
    this.stage.position.set(this.offX, this.offY);
  }

  /** Екранні координати -> координати світу (для миші й дотиків). */
  toWorld(clientX, clientY) {
    const rect = this.app.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.offX) / this.scale,
      y: (clientY - rect.top - this.offY) / this.scale,
    };
  }

  // ------------------------------------------------------------- статика

  /**
   * Перемальовує світ під новий біом. Викликається лише коли біом справді
   * змінився — це десятки заповнень, і робити їх щокадру нема сенсу.
   */
  setBiome(b) {
    if (this.biome && this.biome.id === b.id) return;
    this.biome = b;
    this.drawBackground(b);
    // Поля обабіч світу (екран рідко тієї ж пропорції) теж мають бути в біомі,
    // інакше вночі гру обрамляють дві блакитні денні смуги.
    if (this.app.renderer) this.app.renderer.background.color = b.sky[0];
    for (const c of this.clouds.children) paintCloud(c, b);
    // Сніжинки живуть, лише поки біом сніжний.
    this.flakes = b.flakes
      ? Array.from({ length: 70 }, () => ({
          x: Math.random() * WORLD.w,
          y: Math.random() * FLOOR_Y,
          r: 2 + Math.random() * 3,
          vy: 25 + Math.random() * 45,
          drift: 12 + Math.random() * 26,
          ph: Math.random() * 6.3,
        }))
      : [];
    this.weather.clear();
  }

  drawBackground(b) {
    const g = this.bgG;
    g.clear();
    // Небо градієнтом зі смуг — дешево і без текстур.
    const bands = 48;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const c = lerpColor(b.sky[0], b.sky[1], t * t);
      g.rect(0, (FLOOR_Y * i) / bands - 1, WORLD.w, FLOOR_Y / bands + 2).fill(c);
    }
    // Зорі малюємо просто в тло: вони нерухомі, тож анімувати нічого.
    // Координати беремо з детермінованої «шумілки», щоб небо не мерехтіло
    // новим візерунком щоразу, коли гравець повертається в цей біом.
    if (b.stars) {
      for (let i = 0; i < 90; i++) {
        const x = ((i * 7919) % 1193) + 4;
        const y = ((i * 104729) % 560) + 10;
        const r = 1 + ((i * 31) % 5) * 0.4;
        g.circle(x, y, r).fill({ color: 0xffffff, alpha: 0.35 + ((i * 17) % 10) / 16 });
      }
    }
    // Підлога.
    g.rect(0, FLOOR_Y, WORLD.w, WORLD.h - FLOOR_Y).fill(b.ground);
    g.rect(0, FLOOR_Y, WORLD.w, 8).fill(b.groundDark);
    for (let x = 0; x < WORLD.w; x += 26) {
      const h = 10 + ((x * 7919) % 11);
      g.moveTo(x, FLOOR_Y).lineTo(x + 5, FLOOR_Y - h).lineTo(x + 10, FLOOR_Y);
      g.fill(b.groundDark);
    }
    // Відра стоять на місці й не залежать від біома, тож ідуть у те саме тло.
    for (const p of bucketSpots()) drawBucket(g, p.x, p.y);
  }

  /** Купки в польоті — перемальовуємо щокадру, їх одиниці. */
  drawPoops(poops) {
    const g = this.poopsG;
    g.clear();
    if (!poops || !poops.length) return;
    for (const p of poops) {
      g.ellipse(p.x, p.y + 9, 13, 6).fill({ color: 0x000000, alpha: 0.12 });
      g.circle(p.x, p.y + 4, 11).fill(0x8a6134);
      g.circle(p.x - 3, p.y - 4, 8).fill(0xa3743f);
      g.circle(p.x + 2, p.y - 9, 5).fill(0xb98a52);
      g.circle(p.x - 4, p.y - 6, 2).fill({ color: 0xffffff, alpha: 0.5 });
    }
  }

  /** Сніг: єдиний шар, перемальовується щокадру — 70 кружечків це дешево. */
  updateWeather(dt) {
    const g = this.weather;
    if (!this.flakes.length) return;
    g.clear();
    for (const f of this.flakes) {
      f.y += f.vy * dt;
      f.ph += dt;
      if (f.y > FLOOR_Y) { f.y = -6; f.x = Math.random() * WORLD.w; }
      const x = f.x + Math.sin(f.ph) * f.drift;
      g.circle(x, f.y, f.r).fill({ color: 0xffffff, alpha: 0.75 });
    }
  }

  makeClouds() {
    for (let i = 0; i < 5; i++) {
      const g = new Graphics();
      g.scale.set(0.6 + Math.random() * 0.8);
      g.x = Math.random() * WORLD.w;
      g.y = 60 + Math.random() * 320;
      g.speed = 6 + Math.random() * 12;
      paintCloud(g, this.biome);
      this.clouds.addChild(g);
    }
  }

  makeHud() {
    const style = { fontFamily: 'Nunito, Comic Sans MS, system-ui, sans-serif', fontSize: 40, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x1b4b6b, width: 7, join: 'round' } };
    this.scoreText = new Text({ text: '0', style: { ...style, fontSize: 46 } });
    this.scoreText.anchor.set(0.5, 0);
    this.scoreText.position.set(WORLD.w / 2, 4);

    // Смуга прогресу рівня. Тримаємо її в контейнері, щоб на новому рівні
    // можна було пульсонути всім блоком одразу.
    this.levelBar = new Container();
    this.levelBar.position.set(WORLD.w / 2, 74);
    this.barBg = new Graphics();
    this.barBg.roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, BAR_H / 2)
      .fill({ color: 0x0d3b54, alpha: 0.3 })
      .stroke({ width: 3, color: 0xffffff, alpha: 0.55 });
    this.barFill = new Graphics();
    this.levelText = new Text({ text: '', style: { ...style, fontSize: 26 } });
    this.levelText.anchor.set(1, 0.5);
    this.levelText.x = -BAR_W / 2 - 16;
    this.progText = new Text({ text: '', style: { ...style, fontSize: 26 } });
    this.progText.anchor.set(0, 0.5);
    this.progText.x = BAR_W / 2 + 16;
    this.levelBar.addChild(this.barBg, this.barFill, this.levelText, this.progText);
    this.barPulse = 0;

    this.hearts = new Container();
    this.hearts.position.set(24, 22);

    this.msg = new Text({ text: '', style: { ...style, fontSize: 44, align: 'center' } });
    this.msg.anchor.set(0.5);
    this.msg.position.set(WORLD.w / 2, WORLD.h / 2 - 40);

    this.hud.addChild(this.scoreText, this.levelBar, this.hearts, this.msg);
  }

  setHearts(n, max) {
    this.hearts.removeChildren();
    for (let i = 0; i < max; i++) {
      const g = new Graphics();
      heartPath(g, 0, 0, 17);
      g.fill(i < n ? 0xff4d6d : 0x2b4a5e);
      g.alpha = i < n ? 1 : 0.35;
      g.x = i * 44;
      this.hearts.addChild(g);
    }
  }

  // -------------------------------------------------------------- долоні

  ensureHand(id, player, isSelf, glove = 0) {
    let h = this.hands.get(id);
    // Перчатку можна змінити прямо в грі, тож графіку перемальовуємо, щойно
    // скін іншим — інакше гравець бачив би стару руку до кінця партії.
    if (h && h.glove === glove) return h;
    if (h) h.view.destroy({ children: true });
    const view = makeHandGraphic(PLAYER_COLORS[player % PLAYER_COLORS.length], isSelf, glove);
    this.handLayer.addChild(view);
    h = { view, angle: h?.angle ?? 0, pop: 0, lx: h?.lx ?? null, ly: h?.ly ?? null, svx: 0, svy: 0, glove, base: gloveScale(glove) };
    this.hands.set(id, h);
    return h;
  }

  pruneHands(aliveIds) {
    for (const [id, h] of this.hands) {
      if (!aliveIds.has(id)) {
        h.view.destroy({ children: true });
        this.hands.delete(id);
      }
    }
  }

  // -------------------------------------------------------------- кадр

  draw(view, dt) {
    // Біом — чиста функція від рівня, тож клієнту досить рахунку зі снапшота.
    this.setBiome(biomeAt(view.level?.level ?? 1));
    this.updateWeather(dt);
    for (const c of this.clouds.children) {
      c.x += c.speed * dt;
      if (c.x > WORLD.w + 140) c.x = -140;
    }

    this.drawBalloon(view.points, view.state, view.deflate > 0, skinAt(view.skin ?? 0));
    this.drawShadow(view.points);
    this.drawGull(view.gull);
    this.drawSpikes(view.spikes, dt);
    this.drawPoops(view.poops);

    const alive = new Set();
    for (const hd of view.hands) {
      alive.add(hd.id);
      const h = this.ensureHand(hd.id, hd.player, hd.self, hd.glove ?? 0);
      if (h.lx === null) { h.lx = hd.x; h.ly = hd.y; h.view.position.set(hd.x, hd.y); }
      const vx = hd.x - h.lx;
      const vy = hd.y - h.ly;
      h.lx = hd.x; h.ly = hd.y;
      // Швидкість згладжуємо: миттєва (Δpos/dt) стрибає на нерівних кадрах
      // і смикала б долоню.
      const kv = Math.min(1, dt * 10);
      const inv = 1 / Math.max(dt, 1e-3);
      h.svx += (vx * inv - h.svx) * kv;
      h.svy += (vy * inv - h.svy) * kv;
      const sp = Math.hypot(h.svx, h.svy);
      // Долоня "дивиться" туди, куди летить; у спокої повертається долонею вгору.
      const want = sp > 260 ? Math.atan2(h.svy, h.svx) + Math.PI / 2 : 0;
      h.angle += angleDelta(h.angle, want) * Math.min(1, dt * 12);
      if (hd.flash > 0) h.pop = Math.max(h.pop, hd.flash);
      h.pop = Math.max(0, h.pop - dt * 3.2);
      h.view.position.set(hd.x, hd.y);
      h.view.rotation = h.angle;
      const s = (1 + h.pop * 0.22) * h.base;
      h.view.scale.set(s, s * (1 - h.pop * 0.12));
      // Поки долоня обважніла після удару, вона бліда — видно, чому не встигає.
      h.view.alpha = hd.slow > 0 ? 0.6 : 1;
      // Брудну руку видно одразу: бурі плями просто на перчатці.
      if (hd.dirty) {
        if (!h.mud) {
          h.mud = new Graphics();
          h.mud.circle(-16, -8, 13).circle(10, 4, 10).circle(4, -22, 8).fill(0x8a6134);
          h.mud.circle(-10, -14, 5).fill({ color: 0x5f3f1e, alpha: 0.8 });
          h.view.addChild(h.mud);
        }
        h.mud.visible = true;
      } else if (h.mud) {
        h.mud.visible = false;
      }
      // Шалений режим видно здалеку: перчатка пульсує вогняним кільцем.
      if (hd.rage > 0) {
        if (!h.ring) { h.ring = new Graphics(); h.view.addChildAt(h.ring, 0); }
        const p = 0.5 + 0.5 * Math.sin((this.spikeT ?? 0) * 14);
        h.ring.clear();
        h.ring.circle(0, 0, 74 + p * 10).stroke({ width: 6, color: 0xff7a1a, alpha: 0.45 + 0.4 * p });
        h.ring.circle(0, 0, 60).stroke({ width: 3, color: 0xffd23f, alpha: 0.5 });
      } else if (h.ring) {
        h.ring.destroy(); h.ring = null;
      }
    }
    this.pruneHands(alive);

    this.updateParticles(dt);

    this.hud.visible = view.hud !== false;
    this.scoreText.text = String(view.score);

    const li = view.level;
    const frac = Math.max(0, Math.min(1, li.progress / li.target));
    this.barFill.clear();
    if (frac > 0.002) {
      const w = (BAR_W - 6) * frac;
      this.barFill.roundRect(-BAR_W / 2 + 3, -BAR_H / 2 + 3, w, BAR_H - 6, (BAR_H - 6) / 2).fill(0xffd23f);
      // Верхній блик робить смугу «об'ємною».
      this.barFill.roundRect(-BAR_W / 2 + 6, -BAR_H / 2 + 5, Math.max(0, w - 6), 5, 2.5)
        .fill({ color: 0xffffff, alpha: 0.45 });
    }
    this.levelText.text = 'Рівень ' + li.level + (view.spikesOn ? ' ⚠' : '');
    this.progText.text = li.progress + ' / ' + li.target;
    this.barPulse = Math.max(0, this.barPulse - dt * 2);
    this.levelBar.scale.set(1 + this.barPulse * 0.18);
    if (this._lives !== view.lives) { this._lives = view.lives; this.setHearts(view.lives, view.maxLives); }
    this.msg.text = view.message || '';
    this.msg.visible = !!view.message;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3);
      const k = this.shake * 14;
      this.stage.position.set(this.offX + (Math.random() - 0.5) * k, this.offY + (Math.random() - 0.5) * k);
    } else {
      this.stage.position.set(this.offX, this.offY);
    }
  }

  drawSpikes(spikes, dt) {
    const g = this.spikesG;
    g.clear();
    if (!spikes || !spikes.length) return;
    this.spikeT = (this.spikeT ?? 0) + dt;
    const pulse = 0.55 + 0.45 * Math.sin(this.spikeT * 16);

    for (const s of spikes) {
      if (!s.flying) {
        // Попередження: земля тріскається і блимає саме там, де вилетить шип.
        g.ellipse(s.x, FLOOR_Y + 6, 26, 9).fill({ color: 0x3b2a1a, alpha: 0.35 });
        g.moveTo(s.x - 13, FLOOR_Y + 4).lineTo(s.x, FLOOR_Y - 16).lineTo(s.x + 13, FLOOR_Y + 4).closePath();
        g.fill({ color: 0xff4d4d, alpha: pulse });
        g.circle(s.x, FLOOR_Y - 2, 20 + pulse * 12)
          .stroke({ width: 3, color: 0xff4d4d, alpha: 0.5 * pulse });
        continue;
      }
      // Відбитий шип летить назад у землю — малюємо його перевернутим і
      // блідим, щоб з першого погляду було видно: цей уже не страшний.
      const d = s.dead ? -1 : 1;
      const al = s.dead ? 0.55 : 1;
      // Слід у повітрі — видно траєкторію навіть на швидкому польоті.
      if (!s.dead) g.rect(s.x - 4, s.y + 60, 8, 90).fill({ color: 0xffffff, alpha: 0.18 });
      // Вістря і тіло.
      g.moveTo(s.x, s.y).lineTo(s.x - 15, s.y + 34 * d).lineTo(s.x - 10, s.y + 66 * d)
        .lineTo(s.x + 10, s.y + 66 * d).lineTo(s.x + 15, s.y + 34 * d).closePath();
      g.fill({ color: 0x4a5560, alpha: al }).stroke({ width: 3, color: 0x2b333b, alpha: al });
      g.moveTo(s.x - 2, s.y + 6 * d).lineTo(s.x - 9, s.y + 34 * d).lineTo(s.x - 6, s.y + 60 * d).lineTo(s.x - 2, s.y + 34 * d).closePath();
      g.fill({ color: 0xc6d2dc, alpha: 0.75 * al });
    }
  }

  drawGull(g) {
    this.gull.visible = !!g;
    if (!g) return;
    this.gull.position.set(g.x, g.y);
    this.gull.scale.x = g.dir < 0 ? -1 : 1;
    // Махи крилами: одне вгору, друге вниз — у протифазі.
    const f = Math.sin(g.flap);
    this.gull.wings[0].rotation = -0.35 - f * 0.75;
    this.gull.wings[1].rotation = 0.30 + f * 0.75;
  }

  drawBalloon(pts, state, deflated, skin) {
    const g = this.balloonG;
    g.clear();
    const n = pts.length;
    if (!n) return;

    // Гладкий замкнений контур: квадратичні криві через середини ребер.
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    let m = mid(pts[n - 1], pts[0]);
    g.moveTo(m.x, m.y);
    for (let i = 0; i < n; i++) {
      const next = mid(pts[i], pts[(i + 1) % n]);
      g.quadraticCurveTo(pts[i].x, pts[i].y, next.x, next.y);
    }
    g.closePath();

    let cx = 0, cy = 0, minY = Infinity, maxY = -Infinity;
    for (const p of pts) { cx += p.x; cy += p.y; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    cx /= n; cy /= n;

    // Здута кулька помітно тьмяніша — видно з першого погляду, що щось не так.
    // Тьмяність рахуємо від кольору скіна, а не беремо готовою: інакше кожен
    // новий скін вимагав би ще однієї константи.
    const fill = deflated ? lerpColor(skin.color, 0x9aa4ab, 0.45) : skin.color;
    g.fill(state === 'over' ? 0x9aa4ab : fill);
    g.stroke({ width: 5, color: state === 'over' ? 0x6d767c : skin.dark, alignment: 0.5 });

    // Вузлик і мотузка знизу.
    const bx = cx, by = maxY;
    g.moveTo(bx - 11, by - 4).lineTo(bx + 11, by - 4).lineTo(bx + 5, by + 15).lineTo(bx - 5, by + 15).closePath();
    g.fill(skin.dark);
    g.moveTo(bx, by + 14).quadraticCurveTo(bx + 26, by + 46, bx - 6, by + 78);
    g.stroke({ width: 3, color: 0xffffff, alpha: 0.75 });

    // Відблиск — світло завжди зверху-зліва, тому він не крутиться разом з кулькою.
    let minX = Infinity, maxX = -Infinity;
    for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
    const rx = (maxX - minX) / 2;
    const ry = (maxY - minY) / 2;
    this.shine.visible = state !== 'over';
    this.shine.position.set(cx - rx * 0.40, cy - ry * 0.40);
    this.shine.scale.set(rx * 0.30, ry * 0.30);
    this.shine.rotation = -0.55;
  }

  drawShadow(pts) {
    const g = this.shadowG;
    g.clear();
    if (!pts.length) return;
    let cx = 0, maxY = -Infinity;
    for (const p of pts) { cx += p.x; if (p.y > maxY) maxY = p.y; }
    cx /= pts.length;
    // Що ближче до підлоги, то менша й темніша тінь — дітям легше оцінити висоту.
    const t = Math.max(0, Math.min(1, (maxY + 200) / (FLOOR_Y + 200)));
    g.ellipse(cx, FLOOR_Y + 14, BALLOON.radius * (0.55 + 0.55 * t), 16 * (0.5 + 0.7 * t))
      .fill({ color: 0x2f5d1e, alpha: 0.1 + 0.25 * t });
  }

  // ------------------------------------------------------------ ефекти

  burst(x, y, color, power = 1) {
    const count = 6 + Math.round(power * 8);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 320 * (0.5 + power);
      const g = new Graphics();
      g.star(0, 0, 4, 9 + Math.random() * 6, 4).fill(color);
      g.position.set(x, y);
      this.fx.addChild(g);
      this.particles.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.5 + Math.random() * 0.3, max: 0.8 });
    }
    this.shake = Math.min(1, this.shake + 0.25 * power);
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { p.g.destroy(); this.particles.splice(i, 1); continue; }
      p.vy += 900 * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.rotation += dt * 6;
      p.g.alpha = Math.min(1, p.life / 0.4);
      p.g.scale.set(Math.min(1, p.life / 0.3));
    }
  }
}

/** Відро з водою: у нього вмочають брудну долоню. */
function drawBucket(g, x, y) {
  g.ellipse(x, y + 42, 40, 9).fill({ color: 0x000000, alpha: 0.15 });
  // Дужка.
  g.moveTo(x - 30, y - 4).quadraticCurveTo(x, y - 44, x + 30, y - 4)
    .stroke({ width: 5, color: 0x8b98a3 });
  // Саме відро — трапеція.
  g.moveTo(x - 34, y - 6).lineTo(x + 34, y - 6).lineTo(x + 26, y + 42).lineTo(x - 26, y + 42).closePath();
  g.fill(0xb9c6d1).stroke({ width: 4, color: 0x7d8b97 });
  // Вода.
  g.ellipse(x, y - 6, 33, 9).fill(0x4dc9f6);
  g.ellipse(x - 10, y - 8, 8, 3).fill({ color: 0xffffff, alpha: 0.6 });
}

/** Хмара тим кольором, який личить біому: вночі сіро-синя, у пустелі піщана. */
function paintCloud(g, b) {
  g.clear();
  g.ellipse(0, 0, 70, 34).ellipse(52, -12, 52, 30).ellipse(-52, -6, 46, 26)
    .fill({ color: b.cloud, alpha: b.cloudAlpha });
}

function makeGullGraphic() {
  const c = new Container();
  const line = 0x8fa3b0;
  const wing = (fill) => {
    const g = new Graphics();
    // Крило намальоване вліво від початку координат, тож обертається «від плеча».
    g.ellipse(-24, 0, 24, 8).fill(fill).stroke({ width: 3, color: line });
    return g;
  };
  const back = wing(0xdce7ee);
  const body = new Graphics();
  body.moveTo(-22, 2).lineTo(-46, 12).lineTo(-22, 11).closePath().fill(0xdce7ee).stroke({ width: 3, color: line });
  body.ellipse(0, 0, 27, 16).fill(0xffffff).stroke({ width: 3, color: line });
  body.circle(21, -12, 12).fill(0xffffff).stroke({ width: 3, color: line });
  body.moveTo(31, -13).lineTo(48, -8).lineTo(31, -4).closePath().fill(0xffa62b).stroke({ width: 2, color: 0xd07d10 });
  body.circle(24, -15, 2.8).fill(0x2b3a45);
  const front = wing(0xffffff);

  c.addChild(back, body, front);
  c.wings = [back, front];
  return c;
}

// ------------------------------------------------------------- малювання руки

function makeHandGraphic(color, isSelf, gloveIndex = 0) {
  const glove = gloveAt(gloveIndex);
  const c = new Container();
  const g = new Graphics();
  const dark = shade(color, -0.35);
  const skin = 0xffd9b0;

  if (glove.id === 'boxing') {
    // Боксерська — суцільна рукавиця без пальців: великий кулак, окремий
    // великий палець збоку і шнурівка, щоб вона читалась з першого погляду.
    const red = 0xe23b3b;
    const redDark = 0x9c1f1f;
    g.roundRect(-46, -46, 92, 82, 34).fill(red).stroke({ width: 4, color: redDark });
    g.roundRect(28, -12, 34, 30, 15).fill(red).stroke({ width: 4, color: redDark });
    for (let i = 0; i < 3; i++) {
      g.moveTo(-14, -30 + i * 15).lineTo(14, -30 + i * 15).stroke({ width: 3, color: 0xffe9c9, alpha: 0.9 });
    }
    g.roundRect(-46, 30, 92, 26, 13).fill(color).stroke({ width: 4, color: dark });
    c.addChild(g);
    if (isSelf) {
      const ring = new Graphics();
      ring.circle(0, 0, 66).stroke({ width: 4, color: 0xffffff, alpha: 0.55 });
      c.addChildAt(ring, 0);
    }
    return c;
  }

  // Пальці (чотири) — заокруглені прямокутники, що стирчать угору з долоні.
  const fx = [-30, -10, 10, 30];
  const fh = [46, 54, 50, 40];
  for (let i = 0; i < 4; i++) {
    g.roundRect(fx[i] - 9, -34 - fh[i], 18, fh[i] + 24, 9).fill(skin).stroke({ width: 3, color: dark });
  }
  // Великий палець збоку.
  g.roundRect(30, -18, 34, 18, 9).fill(skin).stroke({ width: 3, color: dark });
  // Долоня.
  g.roundRect(-42, -36, 84, 74, 22).fill(skin).stroke({ width: 4, color: dark });
  // Манжет у кольорі гравця — щоб діти одразу бачили, чия рука.
  g.roundRect(-46, 26, 92, 26, 13).fill(color).stroke({ width: 4, color: dark });

  g.pivot.set(0, 0);
  c.addChild(g);

  if (isSelf) {
    const ring = new Graphics();
    ring.circle(0, 0, 66).stroke({ width: 4, color: 0xffffff, alpha: 0.55 });
    c.addChildAt(ring, 0);
  }
  return c;
}

/**
 * Базовий масштаб перчатки. Воротарська більша рівно на стільки, на скільки
 * більший її радіус у фізиці, тож видима рука і рука, якою б'єш, — це те саме.
 */
function gloveScale(i) {
  const g = gloveAt(i);
  return g.sizeMul * (g.id === 'light' ? 0.92 : 1);
}

// --------------------------------------------------------------- утиліти

function heartPath(g, x, y, s) {
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.6, y - s * 0.35, x - s * 0.55, y - s * 1.15, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.55, y - s * 1.15, x + s * 1.6, y - s * 0.35, x, y + s * 0.9);
  g.closePath();
}

function lerpColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
}

function shade(c, amt) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
