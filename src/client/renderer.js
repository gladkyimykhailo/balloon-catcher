import { FootballView } from './football-view.js';
import { SpectatorCamera } from './spectator-camera.js';
import { BASKETBALL, HOOPS, basketballTeam, basketballRoster } from '../shared/basketball.js';
import { Application, Container, FillGradient, Graphics, Text } from 'pixi.js';
import { WORLD, FLOOR_Y, CEIL_Y, BALLOON, STONE, TRAP, BUFFS, HOG, SKUNK, PLAYER_COLORS, skinAt, gloveAt, charAt, biomeAt, ladderAt, teamLadderAt, bucketSpots } from '../shared/constants.js';

const BAR_W = 360;
const BAR_H = 24;
const COURT = { id: 'basketball', sky: [0x15273e, 0x304e69], ground: 0xd99751,
  groundDark: 0xa76535, cloud: 0xffffff, cloudAlpha: 0, stars: false, flakes: false };


export class Renderer {
  constructor() {
    this.app = new Application();
    this.stage = null;
    this.hands = new Map();   // id -> {view, angle, scale}
    this.particles = [];
    this.shake = 0;
    this.materials = new Map();
    this.sceneTime = 0;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
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
    this.stonesG = new Graphics();
    // Пастки — під кулькою і під руками: у смолі кулька має грузнути, тобто
    // бути ВСЕРЕДИНІ хмари, а не перед нею.
    this.trapsG = new Graphics();
    // Їжачки — перед кулькою, як і камінці: момент удару має бути видно, а не
    // ховатись за оболонкою.
    this.hogsG = new Graphics();
    this.skunksG = new Graphics();
    // Газ — поверх усього, крім HUD: гравець має бачити, що він саме В хмарі,
    // а не поруч із нею.
    this.gasG = new Graphics();
    this.poopsG = new Graphics();
    this.shadowG = new Graphics();
    this.handLayer = new Container();
    this.fx = new Container();
    this.hud = new Container();
    // Камінці — над кулькою: вони падають на неї згори, і ховати їх за
    // оболонкою означало б втратити саме той кадр, у якому ще можна відвести.
    this.scene = new Container();
    this.stage.addChild(this.scene, this.hud);
    this.footballView = new FootballView();
    this.footballView.visible = false;
    this.stage.addChild(this.footballView);
    this.scene.addChild(this.bg, this.clouds, this.weather, this.shadowG, this.trapsG, this.spikesG, this.poopsG, this.balloonG, this.shine, this.stonesG, this.hogsG, this.skunksG, this.gull, this.handLayer, this.gasG, this.fx);

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

    this.bindSpectatorCamera();
    this.app.renderer.on('resize', () => this.layout());
    this.layout();
    return this;
  }

  bindSpectatorCamera() {
    this.camera = new SpectatorCamera();
    const canvas = this.app.canvas;
    canvas.addEventListener('pointerdown', e => {
      if (!this.spectating) return;
      this.cameraDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      const drag = this.cameraDrag;
      if (!this.spectating || drag?.id !== e.pointerId) return;
      this.camera.pan((e.clientX - drag.x) / this.scale, (e.clientY - drag.y) / this.scale);
      drag.x = e.clientX; drag.y = e.clientY;
      this.camera.apply(this.scene);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(event, () => { this.cameraDrag = null; });
    }
    canvas.addEventListener('wheel', e => {
      if (!this.spectating) return;
      e.preventDefault();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1);
      this.camera.magnify(delta);
      this.camera.apply(this.scene);
    }, { passive: false });
    canvas.addEventListener('dblclick', () => {
      if (this.spectating) { this.camera.reset(); this.camera.apply(this.scene); }
    });
  }

  setSpectating(enabled) {
    this.spectating = enabled;
    this.cameraDrag = null;
    this.camera.reset(enabled ? 1.25 : 1);
    this.camera.apply(this.scene);
    this.app.canvas.style.cursor = enabled ? 'grab' : '';
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
    if (b.id === 'basketball' || b.id === 'hoops') { this.drawCourt(g, b.id === 'hoops'); return; }
    // Reuse GPU gradient textures across biome changes and animation frames.
    g.rect(0, 0, WORLD.w, FLOOR_Y).fill(this.gradient(`sky-${b.id}`, [b.sky[0], b.sky[1]]));
    const night = b.stars;
    const light = night ? 0xe1eaff : 0xfff4cb;
    const sunX = WORLD.w * 0.81, sunY = 145;
    for (let i = 8; i > 0; i--) {
      g.circle(sunX, sunY, 34 + i * 10).fill({ color: light, alpha: 0.012 });
    }
    g.circle(sunX, sunY, night ? 30 : 38).fill({ color: light, alpha: 0.92 });
    if (night) {
      for (let i = 0; i < 4; i++) {
        g.circle(sunX - 12 + i * 7, sunY - 12 + (i % 2) * 22, 4 + i)
          .fill({ color: b.sky[1], alpha: 0.18 });
      }
    }
    if (b.id === 'meadow') {
      // A faint rainbow stays behind the action and the landscape.
      [0xff9aa8, 0xffcc92, 0xffedab, 0xa7e4be, 0x9cceee].forEach((color, i) => {
        g.beginPath().arc(280, FLOOR_Y - 32, 240 - i * 12, Math.PI, Math.PI * 2)
          .stroke({ color, width: 12, alpha: 0.2 });
      });
    }
    if (b.id === 'space') {
      const x = 235, y = 190;
      g.ellipse(x, y, 106, 24).stroke({ color: 0xc5b1ff, width: 12, alpha: 0.23 });
      g.circle(x, y, 55).fill(this.gradient('planet', [0xf8c7ef, 0xa68be0, 0x54418e]));
      g.moveTo(x - 100, y + 5).bezierCurveTo(x - 45, y + 38, x + 60, y + 38, x + 100, y + 5)
        .stroke({ color: 0xdfc9ff, width: 9, alpha: 0.72 });
      g.circle(x - 20, y - 22, 10).fill({ color: 0xffffff, alpha: 0.14 });
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
    // Low-contrast scenery leaves the playable silhouettes easy to read.
    for (let layer = 0; layer < 3; layer++) {
      const base = FLOOR_Y - 100 + layer * 43;
      const tint = lerpColor(b.sky[1], b.groundDark, 0.22 + layer * 0.18);
      g.moveTo(0, FLOOR_Y).lineTo(0, base);
      for (let x = 0; x < WORLD.w; x += 240) {
        const peak = base - 55 - Math.sin(x * 0.009 + layer * 2) * 35;
        if (b.flakes) {
          g.lineTo(x + 120, peak - 55).lineTo(x + 240, base);
        } else {
          g.bezierCurveTo(x + 80, peak, x + 150, peak, x + 240, base);
        }
      }
      g.lineTo(WORLD.w, FLOOR_Y).closePath().fill(tint);
    }
    if (b.id === 'meadow' || b.id === 'night' || b.flakes) {
      for (let i = 0; i < 14; i++) {
        const x = i * 94 + 19, y = FLOOR_Y - 14;
        const h = 28 + (i * 17 % 32);
        const tint = lerpColor(b.groundDark, b.sky[1], 0.35);
        g.rect(x - 3, y - h, 6, h).fill(tint);
        g.moveTo(x, y - h - 30).lineTo(x - 22, y - 15).lineTo(x + 22, y - 15)
          .closePath().fill(tint);
        if (b.flakes) g.moveTo(x, y - h - 30).lineTo(x - 13, y - h + 1)
          .lineTo(x + 13, y - h + 1).closePath().fill(0xf2f7fb);
      }
    }
    if (b.id === 'desert') {
      for (let i = 0; i < 7; i++) {
        const x = 60 + i * 180, y = FLOOR_Y - 8, h = 38 + i % 3 * 11;
        const color = lerpColor(b.groundDark, 0x567d69, 0.45);
        g.roundRect(x - 7, y - h, 14, h, 7).fill(color);
        g.moveTo(x - 5, y - 17).lineTo(x - 22, y - 17).lineTo(x - 22, y - 38)
          .stroke({ color, width: 10, cap: 'round', join: 'round' });
        g.moveTo(x + 5, y - 26).lineTo(x + 20, y - 26).lineTo(x + 20, y - 47)
          .stroke({ color, width: 9, cap: 'round', join: 'round' });
        g.moveTo(x - 2, y - h + 8).lineTo(x - 2, y - 5)
          .stroke({ color: 0xffecc5, alpha: 0.3, width: 2 });
      }
    }
    g.rect(0, FLOOR_Y, WORLD.w, WORLD.h - FLOOR_Y)
      .fill(this.gradient(`ground-${b.id}`, [b.ground, b.groundDark]));
    g.rect(0, FLOOR_Y, WORLD.w, 4).fill({ color: 0xffffff, alpha: 0.32 });
    for (let i = 0; i < 95; i++) {
      const x = (i * 137) % WORLD.w;
      const y = FLOOR_Y + 12 + (i * 31) % Math.max(1, WORLD.h - FLOOR_Y - 18);
      g.ellipse(x, y, 2 + i % 4, 1).fill({ color: b.groundDark, alpha: 0.3 });
      if (b.id === 'meadow' && i % 5 === 0) {
        g.moveTo(x, FLOOR_Y + 2).quadraticCurveTo(x - 4, FLOOR_Y - 8, x - 8, FLOOR_Y - 10)
          .stroke({ color: b.groundDark, width: 2 });
        g.circle(x - 8, FLOOR_Y - 10, 2.5).fill(i % 2 ? 0xffe6a0 : 0xffc4dc);
      }
    }
    // Відра стоять на місці й не залежать від біома, тож ідуть у те саме тло.
    for (const p of bucketSpots()) drawBucket(g, p.x, p.y);
  }

  drawCourt(g, hoops = false) {
    g.rect(0, 0, WORLD.w, WORLD.h).fill(this.gradient('arena', COURT.sky));
    // Tiered stands and warm arena lights, kept behind the playing field.
    for (let row = 0; row < 5; row++) {
      const y = 160 + row * 42;
      g.rect(0, y + 25, WORLD.w, 10).fill({ color: 0x0b1a2e, alpha: 0.3 });
      for (let x = 22; x < WORLD.w; x += 46) {
        g.roundRect(x, y, 29, 20, 5).fill({ color: x < WORLD.w / 2 ? 0xd89152 : 0x579bc0, alpha: 0.2 });
      }
    }
    for (const x of [150, 420, 780, 1050]) {
      g.moveTo(x - 20, 112).lineTo(x + 20, 112).lineTo(x + 150, FLOOR_Y).lineTo(x - 150, FLOOR_Y)
        .closePath().fill({ color: 0xffffff, alpha: 0.025 });
      g.roundRect(x - 26, 100, 52, 7, 3).fill(0xffefc4);
    }
    g.rect(0, FLOOR_Y, WORLD.w, WORLD.h - FLOOR_Y).fill(this.gradient('court-wood', [0xe7b776, 0xb97742]));
    for (let x = 0; x < WORLD.w; x += 65) {
      g.moveTo(x, FLOOR_Y).lineTo(x - 25, WORLD.h).stroke({ color: 0x865126, width: 1, alpha: 0.3 });
    }
    g.rect(0, FLOOR_Y - 6, WORLD.w / 2, 6).fill(0xffb05b);
    g.rect(WORLD.w / 2, FLOOR_Y - 6, WORLD.w / 2, 6).fill(0x69c8ff);
    g.roundRect(30, FLOOR_Y + 12, WORLD.w - 60, 48, 8).stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
    g.ellipse(WORLD.w / 2, FLOOR_Y + 36, 95, 24).stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
    if (hoops) {
      for (const [side, x] of [HOOPS.left, HOOPS.right].entries()) {
        const y = HOOPS.y, half = HOOPS.half;
        const boardX = x + (side === 0 ? -1 : 1) * (half + 12);
        g.rect(boardX - 5, y - 130, 10, 150).fill(0xe4efff);
        g.moveTo(boardX, y + 20).lineTo(boardX, FLOOR_Y).stroke({ color: 0x7387a0, width: 8 });
        for (let i = 0; i <= 6; i++) {
          const offset = -half + i * half / 3;
          g.moveTo(x + offset, y).lineTo(x + offset * 0.65, y + 65)
            .stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
        }
        for (let i = 1; i <= 3; i++) {
          const width = half * (1 - i * 0.35 / 3);
          g.moveTo(x - width, y + i * 65 / 3).lineTo(x + width, y + i * 65 / 3)
            .stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
        }
        g.ellipse(x, y, half, 7).stroke({ color: 0xff7e32, width: 6 });
      }
      return;
    }
    const { netX: x, netTop: y, netHalf } = BASKETBALL;
    g.rect(x - netHalf, y, netHalf * 2, FLOOR_Y - y).fill({ color: 0xffffff, alpha: 0.22 });
    for (let at = y + 8; at < FLOOR_Y; at += 16) {
      g.moveTo(x - netHalf, at).lineTo(x + netHalf, at)
        .stroke({ color: 0xffffff, width: 1.5, alpha: 0.65 });
    }
    g.moveTo(x - netHalf, y).lineTo(x - netHalf, FLOOR_Y)
      .moveTo(x + netHalf, y).lineTo(x + netHalf, FLOOR_Y)
      .stroke({ color: 0xe3effb, width: 3 });
    g.roundRect(x - netHalf - 4, y - 4, netHalf * 2 + 8, 8, 4).fill(0xffffff);
  }

  drawBasketball(pts, match, skin = 0) {
    const g = this.balloonG;
    g.clear();
    const x = pts.reduce((n, p) => n + p.x, 0) / pts.length;
    const y = pts.reduce((n, p) => n + p.y, 0) / pts.length;
    const r = BASKETBALL.radius;
    g.position.set(x, y);
    g.rotation = match.angle;
    const colors = skin ? [0xffffff, skinAt(skin).color, skinAt(skin).dark]
      : match.kind === 'hoops' ? [0xffd080, 0xf18a26, 0xb84b15] : [0xffffff, 0xf5e094, 0x729cce];
    g.circle(0, 0, r).fill(this.gradient(`sport-${match.kind}-${skin}`, colors))
      .stroke({ color: 0x542d1b, width: 3 });
    g.moveTo(-r, 0).lineTo(r, 0).moveTo(0, -r).lineTo(0, r)
      .stroke({ color: 0x683416, width: 2 });
    g.moveTo(-r * 0.7, -r * 0.7).bezierCurveTo(r * 0.25, -r * 0.35, r * 0.25, r * 0.35, -r * 0.7, r * 0.7)
      .stroke({ color: 0x683416, width: 2 });
    g.moveTo(r * 0.7, -r * 0.7).bezierCurveTo(-r * 0.25, -r * 0.35, -r * 0.25, r * 0.35, r * 0.7, r * 0.7)
      .stroke({ color: 0x683416, width: 2 });
    this.shine.visible = false;
  }

  gradient(key, colors) {
    if (!this.materials.has(key)) {
      this.materials.set(key, new FillGradient({
        type: 'linear', start: { x: 0, y: 0 }, end: { x: 0.7, y: 1 },
        colorStops: colors.map((color, i) => ({ offset: i / (colors.length - 1), color })),
      }));
    }
    return this.materials.get(key);
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

  /** Ambient details share one small layer, always behind gameplay objects. */
  updateWeather(dt) {
    const g = this.weather;
    this.sceneTime += this.reducedMotion ? 0 : dt;
    const time = this.sceneTime;
    g.clear();
    if (this.biome.stars) {
      for (let i = 0; i < 18; i++) {
        const x = 24 + (i * 173) % (WORLD.w - 48), y = 110 + (i * 97) % 330;
        const pulse = 0.25 + 0.35 * (1 + Math.sin(time * 1.5 + i * 2)) / 2;
        g.star(x, y, 4, 3 + pulse * 3, 1).fill({ color: 0xece6ff, alpha: pulse });
      }
    }
    if (this.biome.id === 'night' || this.biome.id === 'meadow') {
      const night = this.biome.id === 'night';
      for (let i = 0; i < 20; i++) {
        const x = 20 + ((i * 193 + time * (4 + i % 4)) % (WORLD.w - 40));
        const y = FLOOR_Y - 32 - (i * 47 % 130) + Math.sin(time + i) * 9;
        const alpha = (night ? 0.5 : 0.28) * (0.65 + Math.sin(time * 2 + i) * 0.35);
        if (night) g.circle(x, y, 7).fill({ color: 0xd6ffa2, alpha: alpha * 0.1 });
        g.circle(x, y, night ? 2 : 1.5).fill({ color: night ? 0xe8ffb1 : 0xffffff, alpha });
      }
    }
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

    // Тім-ап: серця особисті, тож один ряд їх не вмістить — у кожного свій,
    // підписаний кольором гравця.
    this.team = new Container();
    this.team.position.set(24, 16);
    this.comboText = new Text({ text: '', style: { ...style, fontSize: 30 } });
    this.comboText.anchor.set(0.5, 0);
    this.comboText.position.set(WORLD.w / 2, 108);

    this.msg = new Text({ text: '', style: { ...style, fontSize: 44, align: 'center' } });
    this.msg.anchor.set(0.5);
    this.msg.position.set(WORLD.w / 2, WORLD.h / 2 - 40);

    this.matchText = new Text({ text: '', style: { ...style, fontSize: 22, align: 'center' } });
    this.matchText.anchor.set(0.5, 0);
    this.matchText.position.set(WORLD.w / 2, 66);
    this.hud.addChild(this.matchText);
    this.hud.addChild(this.scoreText, this.levelBar, this.hearts, this.team, this.comboText, this.msg);
  }

  /**
   * Рядок серць на кожного гравця. Перемальовуємо лише коли щось змінилось:
   * інакше це десяток нових Graphics щокадру заради нерухомої картинки.
   */
  setTeamHearts(hands, max) {
    const key = hands.map((h) => h.player + ':' + h.lives + '/' + (h.maxLives ?? max) + (h.out ? 'x' : '')).join('|');
    if (key === this._teamKey) return;
    this._teamKey = key;
    this.team.removeChildren();
    const sorted = [...hands].sort((a, b) => a.player - b.player);
    sorted.forEach((h, row) => {
      const line = new Container();
      line.y = row * 34;
      const dot = new Graphics();
      dot.circle(9, 9, 9).fill(PLAYER_COLORS[h.player % PLAYER_COLORS.length])
        .stroke({ width: 3, color: 0x1b4b6b, alpha: 0.6 });
      line.addChild(dot);
      for (let i = 0; i < (h.maxLives ?? max ?? 3); i++) {
        const g = new Graphics();
        heartPath(g, 0, 0, 12);
        g.fill(h.out ? 0x2b4a5e : i < h.lives ? 0xff4d6d : 0x2b4a5e);
        g.alpha = h.out ? 0.25 : i < h.lives ? 1 : 0.35;
        g.position.set(34 + i * 30, 10);
        line.addChild(g);
      }
      line.alpha = h.out ? 0.45 : 1;
      this.team.addChild(line);
    });
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

  ensureHand(id, player, isSelf, glove = 0, char = 0, hardcore = false) {
    let h = this.hands.get(id);
    // І перчатку, і персонажа можна змінити прямо в грі, тож графіку
    // перемальовуємо, щойно вибір інший — інакше гравець бачив би стару руку
    // до кінця партії. Ключ один на обидва режими.
    const key = (hardcore ? 'c' + char : 'g' + glove) + ':' + player + ':' + !!isSelf;
    if (h && h.key === key) return h;
    if (h) h.view.destroy({ children: true });
    const color = PLAYER_COLORS[player % PLAYER_COLORS.length];
    const view = hardcore ? makeCharGraphic(color, isSelf, char) : makeHandGraphic(color, isSelf, glove);
    this.handLayer.addChild(view);
    h = {
      view, key, hardcore, angle: h?.angle ?? 0, pop: 0,
      lx: h?.lx ?? null, ly: h?.ly ?? null, svx: 0, svy: 0,
      base: hardcore ? charAt(char).sizeMul : gloveScale(glove),
    };
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
    this.footballView.visible = !!view.football;
    this.scene.visible = this.hud.visible = !view.football;
    if (view.football) {
      this.sceneTime += dt;
      this.app.renderer.background.color = 0x123d2c;
      this.stage.position.set(this.offX, this.offY);
      this.camera.apply(this.footballView.pitch);
      this.footballView.draw(view, this.sceneTime);
      return;
    }
    if (this.biome) this.app.renderer.background.color = this.biome.sky[0];
    // Біом — чиста функція від рівня, тож клієнту досить рахунку зі снапшота.
    this.setBiome(view.basketball ? (view.basketball.kind === 'hoops' ? { ...COURT, id: 'hoops' } : COURT) : biomeAt(view.level?.level ?? 1));
    this.clouds.visible = !view.basketball;
    this.updateWeather(dt);
    for (const c of this.clouds.children) {
      c.x += c.speed * dt;
      if (c.x > WORLD.w + 140) c.x = -140;
    }

    if (view.basketball) this.drawBasketball(view.points, view.basketball, view.skin ?? 0);
    else {
      this.balloonG.position.set(0, 0); this.balloonG.rotation = 0;
      this.drawBalloon(view.points, view.state, view.deflate > 0, skinAt(view.skin ?? 0));
    }
    this.drawShadow(view.points, view.basketball ? BASKETBALL.radius : BALLOON.radius);
    this.drawGull(view.gull);
    this.drawSpikes(view.spikes, dt);
    this.drawStones(view.stones, dt);
    this.drawTraps(view.traps, dt);
    this.drawHogs(view.hogs, dt);
    this.drawSkunks(view.skunks, view.gas, dt);
    this.drawPoops(view.poops);

    const alive = new Set();
    for (const hd of view.hands) {
      // Вибулий гравець зникає з поля: його руки в грі більше немає.
      if (hd.out) continue;
      alive.add(hd.id);
      const h = this.ensureHand(hd.id, view.basketball ? basketballTeam(hd.player) : hd.player, hd.self, hd.glove ?? 0, hd.char ?? 0, !!view.hardcore);
      if (hd.bot && !h.botLabel) {
        h.botLabel = new Text({ text: 'БОТ', style: { fontFamily: 'sans-serif', fontSize: 18, fontWeight: 'bold', fill: 0xffffff } });
        h.botLabel.anchor.set(0.5); h.botLabel.y = 66;
        h.view.addChild(h.botLabel);
      }
      if (h.botLabel) h.botLabel.visible = !!hd.bot;
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
      // Долоня «дивиться» туди, куди летить, а персонажа так крутити не можна:
      // морда догори ногами читається як помилка, а не як замах. Тому йому
      // лишаємо лише легкий нахил у бік руху.
      h.view.rotation = h.hardcore ? h.angle * 0.3 : h.angle;
      const s = (1 + h.pop * 0.22) * (view.basketball ? 1 : h.base) * (view.team && view.buff?.size > 0 ? BUFFS[1].sizeMul : 1) * (view.basketball ? BASKETBALL.handRadius / 54 : 1);
      h.view.scale.set(s, s * (1 - h.pop * 0.12));
      // Поки долоня обважніла після удару, вона бліда — видно, чому не встигає.
      h.view.alpha = hd.slow > 0 ? 0.6 : 1;
      // Тім-ап: той, хто щойно тапнув, безтілесний, поки не зачепить хтось
      // інший, — і має виглядати саме так, привидом. Це головна підказка
      // режиму: видно, чия зараз черга.
      if (hd.locked) {
        h.view.alpha = 0.32;
        if (!h.lockRing) { h.lockRing = new Graphics(); h.view.addChildAt(h.lockRing, 0); }
        h.lockRing.clear();
        // Пунктир темний, а не білий: небо світле, і біле кільце на ньому
        // просто губилось — на скріншоті його було ледве видно.
        for (let i = 0; i < 10; i++) {
          const a0 = (i / 10) * Math.PI * 2;
          const a1 = a0 + 0.34;
          h.lockRing.moveTo(Math.cos(a0) * 76, Math.sin(a0) * 76)
            .lineTo(Math.cos(a1) * 76, Math.sin(a1) * 76)
            .stroke({ width: 7, color: 0x1b4b6b, alpha: 0.85 });
        }
        h.lockRing.visible = true;
      } else if (h.lockRing) {
        h.lockRing.visible = false;
      }
      // Вдягнена рукавичка — зелене кільце: видно, що газ цьому персонажу
      // вже не страшний.
      if (hd.gloveOn > 0) {
        if (!h.gloveRing) { h.gloveRing = new Graphics(); h.view.addChildAt(h.gloveRing, 0); }
        h.gloveRing.clear();
        h.gloveRing.circle(0, 0, 86).fill({ color: 0x9ad36b, alpha: 0.12 })
          .stroke({ width: 5, color: 0x3ec46d, alpha: 0.75 });
        h.gloveRing.visible = true;
      } else if (h.gloveRing) {
        h.gloveRing.visible = false;
      }
      // Щит — рівне блакитне кільце, щоб не плутати з пульсуючим шалом.
      if (hd.shield > 0) {
        if (!h.shieldRing) { h.shieldRing = new Graphics(); h.view.addChildAt(h.shieldRing, 0); }
        h.shieldRing.clear();
        h.shieldRing.circle(0, 0, 80).fill({ color: 0x7fd8ff, alpha: 0.14 })
          .stroke({ width: 5, color: 0x7fd8ff, alpha: 0.8 });
        h.shieldRing.visible = true;
      } else if (h.shieldRing) {
        h.shieldRing.visible = false;
      }
      // Цілий панцир — тепла дуга ЗНИЗУ, а не кільце: рятує саме спина, і
      // видно має бути те місце, від якого кулька відскочить.
      if (hd.shell > 0) {
        if (!h.shellArc) { h.shellArc = new Graphics(); h.view.addChildAt(h.shellArc, 0); }
        h.shellArc.clear();
        h.shellArc.arc(0, 0, 74, 0.15 * Math.PI, 0.85 * Math.PI)
          .stroke({ width: 7, color: 0xe0b070, alpha: 0.85 });
        h.shellArc.visible = true;
      } else if (h.shellArc) {
        h.shellArc.visible = false;
      }
      // Павутина: липкі нитки просто поверх персонажа — видно, що він застряг
      // і що до нього треба бігти.
      if (hd.web > 0) {
        if (!h.webG) { h.webG = new Graphics(); h.view.addChild(h.webG); }
        h.webG.clear();
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          h.webG.moveTo(Math.cos(a) * 82, Math.sin(a) * 82).lineTo(-Math.cos(a) * 24, -Math.sin(a) * 24)
            .stroke({ width: 3, color: 0xffffff, alpha: 0.85 });
        }
        h.webG.circle(0, 0, 40).circle(0, 0, 64).stroke({ width: 2.5, color: 0xffffff, alpha: 0.7 });
        h.webG.visible = true;
      } else if (h.webG) {
        h.webG.visible = false;
      }
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
    // У хардкорі загрози однакові на всіх рівнях, тож значки там нічого не
    // повідомляють — їхнє місце займає череп самого режиму. У класиці ж
    // значки — це коротка пам'ятка, що саме вже прокинулось на цьому рівні.
    const icons = view.hardcore ? '' : (view.team ? teamLadderAt(li.level) : ladderAt(li.level)).icons;
    this.levelText.text = (view.hardcore ? '☠ ' : '') + 'Рівень ' + li.level
      + (icons ? ' ' + icons : '');
    this.progText.text = li.progress + ' / ' + li.target;
    this.barPulse = Math.max(0, this.barPulse - dt * 2);
    this.levelBar.scale.set(1 + this.barPulse * 0.18);
    // Команда або спільні серця — але не обидва одразу.
    this.hearts.visible = !view.team;
    this.team.visible = !!view.team;
    if (view.team) {
      this.setTeamHearts(view.hands, view.maxLives);
      const b = [];
      if (view.buff?.speed > 0) b.push(BUFFS[0].emoji);
      if (view.buff?.size > 0) b.push(BUFFS[1].emoji);
      if (view.hands.some((h) => h.self !== false && h.shield > 0)) b.push(BUFFS[2].emoji);
      this.comboText.text = view.combo > 0 ? 'Пас ×' + view.combo + (b.length ? '  ' + b.join(' ') : '') : '';
      this.comboText.visible = !!this.comboText.text;
    } else {
      this.comboText.visible = false;
      if (this._lives !== view.lives) { this._lives = view.lives; this.setHearts(view.lives, view.maxLives); }
    }
    this.matchText.visible = !!view.basketball;
    this.levelBar.visible = !view.basketball;
    if (view.basketball) {
      this.hearts.visible = false;
      this.team.visible = false;
      this.scoreText.text = view.basketball.score.join(' : ');
      const counts = basketballRoster(view.hands.map(h => h.player));
      this.matchText.text = '🟠 ' + counts[0] + '/' + BASKETBALL.teamSize + '   ·   до ' + (view.basketball.target ?? BASKETBALL.target) + ' очок   ·   ' + counts[1] + '/' + BASKETBALL.teamSize + ' 🔵';
    }
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

  /**
   * Камінці. Поки камінь висить угорі (фаза warn), під ним світиться стовп на
   * всю висоту поля: гравець має бачити не сам камінь, а саме колонку, куди
   * той упаде, — інакше «відвести кульку вбік» було б грою в здогадки.
   */
  drawStones(stones, dt) {
    const g = this.stonesG;
    g.clear();
    if (!stones || !stones.length) return;
    this.stoneT = (this.stoneT ?? 0) + dt;
    const pulse = 0.55 + 0.45 * Math.sin(this.stoneT * 14);

    for (const s of stones) {
      if (!s.flying) {
        g.rect(s.x - 30, CEIL_Y, 60, FLOOR_Y - CEIL_Y).fill({ color: 0xff4d4d, alpha: 0.06 + 0.07 * pulse });
        g.moveTo(s.x - 20, CEIL_Y + 6).lineTo(s.x + 20, CEIL_Y + 6).lineTo(s.x, CEIL_Y + 40).closePath()
          .fill({ color: 0xff4d4d, alpha: 0.35 + 0.45 * pulse });
        drawRock(g, s.x, CEIL_Y + 16, STONE.r * 0.8, s.id, this.stoneT * 0.6, 0.55);
        continue;
      }
      // Збитий камінь блідне — одразу видно, що він уже нікого не зачепить.
      if (!s.dead) g.rect(s.x - 5, s.y - 74, 10, 70).fill({ color: 0xffffff, alpha: 0.14 });
      drawRock(g, s.x, s.y, STONE.r, s.id, s.spin ?? 0, s.dead ? 0.45 : 1);
    }
  }

  /**
   * Пастки. Павутина ловить гравця, смола — кульку, тож і малюються вони
   * по-різному: павутина світла й «сітчаста», смола — темна пляма, крізь яку
   * кульку видно, але видно й те, що вона в ній загрузла.
   */
  drawTraps(traps, dt) {
    const g = this.trapsG;
    g.clear();
    if (!traps || !traps.length) return;
    this.trapT = (this.trapT ?? 0) + dt;

    for (const t of traps) {
      // Пастка, якій лишилось менше секунди, блимає — видно, що зараз зникне.
      const fade = t.life < 1 ? 0.35 + 0.65 * Math.abs(Math.sin(this.trapT * 12)) : 1;
      if (t.type === 'tar') {
        const r = TRAP.tar.r;
        for (let i = 0; i < 3; i++) {
          const k = 1 - i * 0.22;
          g.circle(t.x, t.y, r * k).fill({ color: 0x2a2330, alpha: (0.16 + i * 0.07) * fade });
        }
        // Бульбашки, щоб смола читалась як в'язка, а не як просто тінь.
        for (let i = 0; i < 6; i++) {
          const a = this.trapT * 0.6 + i * 1.05;
          g.circle(t.x + Math.cos(a) * r * 0.55, t.y + Math.sin(a * 1.3) * r * 0.45, 7 + (i % 3) * 3)
            .fill({ color: 0x4a3f55, alpha: 0.45 * fade });
        }
        continue;
      }
      const r = TRAP.web.r;
      g.circle(t.x, t.y, r).fill({ color: 0xffffff, alpha: 0.16 * fade });
      // Промені й кільця — класична павутина, усього кілька ліній.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(t.x, t.y).lineTo(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r)
          .stroke({ width: 2.5, color: 0xffffff, alpha: 0.85 * fade });
      }
      for (let k = 1; k <= 3; k++) {
        g.circle(t.x, t.y, (r * k) / 3.2).stroke({ width: 2, color: 0xffffff, alpha: 0.6 * fade });
      }
    }
  }

  /**
   * Їжачки. Малюємо колючий клубок із мордою, і клубок котиться: кут береться
   * з пройденого шляху, тож голки крутяться рівно тоді, коли він біжить.
   * У стрибку додаємо легкий нахил уперед — видно, що це вже не біг.
   */
  drawHogs(hogs, dt) {
    const g = this.hogsG;
    g.clear();
    if (!hogs || !hogs.length) return;
    this.hogT = (this.hogT ?? 0) + dt;

    for (const h of hogs) {
      const jumping = h.phase === 'jump';
      const lean = jumping ? h.dir * 0.35 : Math.sin(this.hogT * 12) * 0.06;
      const r = HOG.r;

      // Тінь на підлозі — по ній видно, під ким саме він зараз стоїть.
      const t = Math.max(0, Math.min(1, 1 - (FLOOR_Y - h.y) / 260));
      g.ellipse(h.x, FLOOR_Y + 8, r * (0.7 + 0.5 * t), 8 * (0.5 + 0.6 * t))
        .fill({ color: 0x000000, alpha: 0.1 + 0.18 * t });

      // Голки по верхньому півколу, повернуті разом із клубком.
      for (let i = 0; i < 11; i++) {
        const a = Math.PI + lean + (i / 10) * Math.PI + h.spin * 0.35;
        const inner = r * 0.62, outer = r * (1.5 + (i % 2) * 0.22);
        const wdt = 0.13;
        g.moveTo(h.x + Math.cos(a - wdt) * inner, h.y + Math.sin(a - wdt) * inner)
          .lineTo(h.x + Math.cos(a) * outer, h.y + Math.sin(a) * outer)
          .lineTo(h.x + Math.cos(a + wdt) * inner, h.y + Math.sin(a + wdt) * inner)
          .closePath()
          .fill(i % 2 ? 0x6b4a2f : 0x4e3520);
      }
      g.circle(h.x, h.y, r * 0.95).fill(0xd7a86e).stroke({ width: 4, color: 0x8a6134 });
      // Морда дивиться туди, куди біжить.
      const f = h.dir;
      g.ellipse(h.x + f * r * 0.55, h.y + r * 0.25, r * 0.42, r * 0.3).fill(0xf0d3ae);
      g.circle(h.x + f * r * 0.92, h.y + r * 0.3, r * 0.16).fill(0x2b2b2b);
      g.circle(h.x + f * r * 0.3, h.y - r * 0.1, r * 0.13).fill(0x2b2b2b);
      g.circle(h.x + f * r * 0.26, h.y - r * 0.14, r * 0.05).fill(0xffffff);
      // Лапки — лише коли біжить по землі.
      if (!jumping) {
        const step = Math.sin(this.hogT * 16) * r * 0.22;
        g.ellipse(h.x - r * 0.35 + step, h.y + r * 0.92, r * 0.2, r * 0.12).fill(0x8a6134);
        g.ellipse(h.x + r * 0.35 - step, h.y + r * 0.92, r * 0.2, r * 0.12).fill(0x8a6134);
      }
    }
  }

  /**
   * Скунси й газ. Хмару малюємо високою і вузькою — рівно такою, якою її
   * бачить фізика (`SKUNK.gasW/gasH`), інакше гравець ухилявся б від картинки,
   * а труївся від чогось іншого.
   */
  drawSkunks(skunks, gas, dt) {
    const sg = this.skunksG;
    const gg = this.gasG;
    sg.clear();
    gg.clear();
    this.skunkT = (this.skunkT ?? 0) + dt;

    for (const g of gas ?? []) {
      const fade = g.life < 1.2 ? g.life / 1.2 : 1;
      const cy = FLOOR_Y - SKUNK.gasH / 2;
      gg.ellipse(g.x, cy, SKUNK.gasW, SKUNK.gasH / 2).fill({ color: 0x9ad36b, alpha: 0.22 * fade });
      gg.ellipse(g.x, cy, SKUNK.gasW * 0.7, SKUNK.gasH * 0.42).fill({ color: 0xb6e08c, alpha: 0.18 * fade });
      // Клуби, що поволі підіймаються, — видно, що хмара жива.
      for (let i = 0; i < 9; i++) {
        const ph = this.skunkT * 0.5 + i * 0.7;
        const up = ((ph % 1) + 1) % 1;
        const r = 16 + (i % 3) * 9;
        gg.circle(
          g.x + Math.sin(ph * 2 + i) * SKUNK.gasW * 0.55,
          FLOOR_Y - up * SKUNK.gasH,
          r,
        ).fill({ color: 0xcdeca8, alpha: 0.2 * (1 - up) * fade });
      }
    }

    for (const s of skunks ?? []) {
      const y = FLOOR_Y;
      const hissing = s.phase === 'hiss';
      // Поки сичить — тремтить і задирає хвіст: це і є попередження.
      const shake = hissing ? Math.sin(this.skunkT * 30) * 3 : 0;
      const x = s.x + shake;
      const f = s.dir;
      const r = SKUNK.r;
      // Тіло сидить НА лінії підлоги, а не по центру на ній: інакше половина
      // звіра ховається в траві й на екрані лишається чорна пляма.
      const by = y - r * 0.62;
      sg.ellipse(x, y + 4, r * 0.95, 8).fill({ color: 0x000000, alpha: 0.18 });
      // Хвіст: у спокої лежить, у сичанні стоїть трубою.
      const tailUp = hissing ? 1 : 0.4;
      sg.ellipse(x - f * r * 0.95, by - r * tailUp * 1.15, r * 0.34, r * (0.6 + tailUp * 0.55))
        .fill(0x1d1d22).stroke({ width: 3, color: 0x000000 });
      sg.ellipse(x - f * r * 0.95, by - r * tailUp * 1.5, r * 0.17, r * 0.38).fill(0xf3f3ef);
      // Тіло й біла смуга вздовж спини.
      sg.ellipse(x, by, r * 0.92, r * 0.62).fill(0x1d1d22).stroke({ width: 3, color: 0x000000 });
      sg.ellipse(x, by - r * 0.42, r * 0.46, r * 0.2).fill(0xf3f3ef);
      // Морда.
      sg.circle(x + f * r * 0.78, by - r * 0.06, r * 0.42).fill(0x1d1d22).stroke({ width: 3, color: 0x000000 });
      sg.moveTo(x + f * r * 0.78, by - r * 0.42).lineTo(x + f * r * 1.18, by - r * 0.02)
        .lineTo(x + f * r * 0.78, by + r * 0.3).closePath().fill(0x1d1d22);
      sg.circle(x + f * r * 1.14, by - r * 0.04, r * 0.11).fill(0xff8fb1);
      sg.circle(x + f * r * 0.72, by - r * 0.24, r * 0.1).fill(0xffffff);
      sg.circle(x + f * r * 0.74, by - r * 0.24, r * 0.05).fill(0x1d1d22);
      // Лапки в русі.
      if (!hissing) {
        const step = Math.sin(this.skunkT * 15) * r * 0.2;
        sg.ellipse(x - r * 0.35 + step, y - r * 0.08, r * 0.19, r * 0.13).fill(0x1d1d22);
        sg.ellipse(x + r * 0.35 - step, y - r * 0.08, r * 0.19, r * 0.13).fill(0x1d1d22);
      }
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
    const body = state === 'over' ? 0x9aa4ab : fill;
    g.fill(this.gradient(`balloon-${body}-${skin.dark}`, [
      lerpColor(body, 0xffffff, 0.62), body, lerpColor(body, skin.dark, 0.72),
    ]));
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

  drawShadow(pts, radius = BALLOON.radius) {
    const g = this.shadowG;
    g.clear();
    if (!pts.length) return;
    let cx = 0, maxY = -Infinity;
    for (const p of pts) { cx += p.x; if (p.y > maxY) maxY = p.y; }
    cx /= pts.length;
    // Що ближче до підлоги, то менша й темніша тінь — дітям легше оцінити висоту.
    const t = Math.max(0, Math.min(1, (maxY + 200) / (FLOOR_Y + 200)));
    for (let i = 5; i > 0; i--) {
      const spread = 1 + i * 0.15;
      g.ellipse(cx, FLOOR_Y + 14, radius * (1.25 - 0.55 * t) * spread,
        (10 + 6 * (1 - t)) * spread)
        .fill({ color: 0x172638, alpha: (0.025 + 0.035 * t) });
    }
  }

  // ------------------------------------------------------------ ефекти

  burst(x, y, color, power = 1) {
    // Bound simultaneous effects when several players hit at once.
    if (this.particles.length > 220) return;
    if (!this.reducedMotion) {
      const g = new Graphics();
      g.circle(0, 0, 20).stroke({ color: 0xffffff, width: 2.5, alpha: 0.85 });
      g.circle(0, 0, 24).stroke({ color, width: 4, alpha: 0.4 });
      g.position.set(x, y);
      this.fx.addChild(g);
      this.particles.push({ g, ring: true, life: 0.35, max: 0.35, power });
    }
    const count = 6 + Math.round(power * 8);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 320 * (0.5 + power);
      const g = new Graphics();
      g.circle(0, 0, 15).fill({ color, alpha: 0.1 });
      g.star(0, 0, 4, 9 + Math.random() * 6, 4).fill(color);
      g.star(0, 0, 4, 4, 1.5).fill({ color: 0xffffff, alpha: 0.85 });
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
      if (p.ring) {
        const age = 1 - p.life / p.max;
        p.g.scale.set(0.6 + age * (1.8 + p.power));
        p.g.alpha = (1 - age) ** 2;
        continue;
      }
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
  g.ellipse(0, 8, 76, 27).ellipse(49, 0, 49, 25).ellipse(-49, 3, 47, 23)
    .fill({ color: lerpColor(b.cloud, b.sky[0], 0.35), alpha: b.cloudAlpha * 0.65 });
  g.ellipse(0, -6, 65, 32).ellipse(47, -13, 46, 27).ellipse(-48, -8, 43, 24)
    .fill({ color: b.cloud, alpha: b.cloudAlpha });
  g.ellipse(-15, -22, 32, 12).fill({ color: 0xffffff, alpha: b.cloudAlpha * 0.22 });
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

// --------------------------------------------------- малювання камінця

/**
 * Камінь. Малюємо многокутник з нерівними вершинами, повернутий на `spin`:
 * вершини рахуємо вручну, бо вся купа камінців живе в одному Graphics, який
 * щокадру перемальовується (їх одиниці, це дешевше за контейнер на камінь).
 * Форма береться з `id`, тож конкретний камінь не міняє силует у польоті.
 */
function drawRock(g, x, y, r, id, spin, alpha) {
  const n = 7;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2;
    // Детермінована «шумілка» від id та номера вершини — без масиву випадкових
    // чисел, які довелося б везти в снапшоті.
    const k = 0.74 + (((id * 37 + i * 101) % 53) / 53) * 0.46;
    pts.push({ x: x + Math.cos(a) * r * k, y: y + Math.sin(a) * r * k });
  }
  g.ellipse(x, y + r * 0.9, r * 0.9, r * 0.3).fill({ color: 0x000000, alpha: 0.12 * alpha });
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fill({ color: 0x7b7166, alpha }).stroke({ width: 4, color: 0x463f38, alpha });
  // Скол і блик — щоб камінь не читався як сірий м'яч.
  g.moveTo(x - r * 0.45, y - r * 0.15).lineTo(x - r * 0.05, y - r * 0.55).lineTo(x + r * 0.2, y - r * 0.1)
    .lineTo(x - r * 0.2, y + r * 0.2).closePath().fill({ color: 0x9a9086, alpha: 0.85 * alpha });
  g.circle(x - r * 0.3, y - r * 0.35, r * 0.13).fill({ color: 0xd8d2c9, alpha: 0.7 * alpha });
}

// ------------------------------------------------- малювання персонажа

/**
 * Хардкор-персонаж. На відміну від перчатки, це морда, тож її не можна крутити
 * за напрямком руху (див. `draw`) — упізнаваність тримається силуетом: вуха,
 * ніс, колючки. Колір гравця виведено в нашийник і підкладку, як у манжеті
 * долоні: у кімнаті до чотирьох гравців, і всі можуть бути тим самим звіром.
 */
function makeCharGraphic(color, isSelf, charIndex = 0) {
  const ch = charAt(charIndex);
  const c = new Container();
  const g = new Graphics();
  const dark = shade(color, -0.35);

  // Підкладка кольором гравця: видно, чий це звір, навіть коли він за кулькою.
  g.circle(0, 4, 56).fill({ color, alpha: 0.28 });

  if (ch.id === 'hedgehog') {
    // Колючки — по верхньому півколу, вістрями назовні.
    for (let i = 0; i < 13; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      const inner = 30, outer = 60 + (i % 2) * 8;
      const w = 0.11;
      g.moveTo(Math.cos(a - w) * inner, Math.sin(a - w) * inner)
        .lineTo(Math.cos(a) * outer, Math.sin(a) * outer)
        .lineTo(Math.cos(a + w) * inner, Math.sin(a + w) * inner).closePath()
        .fill(i % 2 ? 0x6b4a2f : 0x4e3520);
    }
    g.circle(0, 6, 36).fill(0xd7a86e).stroke({ width: 4, color: 0x8a6134 });
    g.ellipse(0, 20, 17, 13).fill(0xf0d3ae);
    g.circle(0, 27, 7).fill(0x2b2b2b);
    g.circle(-13, 2, 5).circle(13, 2, 5).fill(0x2b2b2b);
    g.circle(-15, 0, 2).circle(11, 0, 2).fill(0xffffff);
  } else if (ch.id === 'skunk') {
    // Ванючка — чорна з білою смугою вздовж морди, плюс хмарка смороду.
    g.circle(-34, -30, 14).circle(34, -30, 14).fill(0x1d1d22).stroke({ width: 3, color: 0x000000 });
    g.circle(0, 0, 46).fill(0x1d1d22).stroke({ width: 4, color: 0x000000 });
    g.moveTo(-9, -46).lineTo(9, -46).lineTo(6, 34).lineTo(-6, 34).closePath().fill(0xf3f3ef);
    g.ellipse(0, 26, 19, 14).fill(0xf3f3ef);
    g.circle(0, 30, 7).fill(0xff8fb1);
    g.circle(-17, -4, 6).circle(17, -4, 6).fill(0xffffff);
    g.circle(-16, -3, 3).circle(18, -3, 3).fill(0x1d1d22);
    for (let i = 0; i < 3; i++) {
      g.circle(-46 - i * 9, -44 - i * 11, 10 - i * 2).fill({ color: 0x9ad36b, alpha: 0.4 - i * 0.1 });
    }
  } else if (ch.id === 'armadillo') {
    // Броненосця впізнають по смугах панцира, тож вони тут головні: поперек
    // усієї спини, з розхилом до країв. Морда й лапи навмисно стирчать з-під
    // панцира — без них силует читався б як камінь, а камінь у цій грі ворог.
    g.ellipse(0, 2, 56, 46).fill(0xa8875c).stroke({ width: 4, color: 0x6b5334 });
    for (let i = -2; i <= 2; i++) {
      g.moveTo(i * 18, -42).lineTo(i * 23, 46).stroke({ width: 5, color: 0x6b5334, alpha: 0.9 });
    }
    g.ellipse(0, -26, 34, 13).fill({ color: 0xe3c79c, alpha: 0.45 });
    g.ellipse(-54, 18, 22, 15).fill(0xd8bb92).stroke({ width: 3, color: 0x6b5334 });
    g.moveTo(-68, 10).lineTo(-80, 15).lineTo(-68, 21).closePath().fill(0xd8bb92);
    g.circle(-50, 12, 4.5).fill(0x2b2b2b);
    g.circle(-51, 11, 1.8).fill(0xffffff);
    for (const fx of [-28, 0, 28]) {
      g.roundRect(fx - 7, 40, 14, 17, 6).fill(0x6b5334);
    }
  } else if (ch.id === 'rat') {
    // Пацюк — вуха більші за голову: маленького персонажа видно саме по них.
    g.circle(-28, -28, 20).circle(28, -28, 20).fill(0x8d8d94).stroke({ width: 3, color: 0x5a5a61 });
    g.circle(-28, -28, 11).circle(28, -28, 11).fill(0xffb3c7);
    g.circle(0, 0, 34).fill(0x9a9aa2).stroke({ width: 4, color: 0x5a5a61 });
    g.moveTo(-13, 12).lineTo(13, 12).lineTo(0, 40).closePath().fill(0xb7b7bd);
    g.circle(0, 36, 6).fill(0xff8fb1);
    g.circle(-13, -2, 5).circle(13, -2, 5).fill(0x23232a);
    g.circle(-14, -3, 2).circle(12, -3, 2).fill(0xffffff);
    for (const s of [-1, 1]) {
      g.moveTo(s * 10, 26).lineTo(s * 46, 18).moveTo(s * 10, 30).lineTo(s * 48, 34)
        .stroke({ width: 2.5, color: 0x5a5a61 });
    }
  } else {
    // Єнот — маска на очах і смугастий силует: базовий, але не безликий.
    g.moveTo(-42, -24).lineTo(-20, -52).lineTo(-6, -28).closePath()
      .moveTo(42, -24).lineTo(20, -52).lineTo(6, -28).closePath()
      .fill(0x6f7a85).stroke({ width: 3, color: 0x3f4952 });
    g.circle(0, 0, 44).fill(0x9aa6b2).stroke({ width: 4, color: 0x3f4952 });
    g.roundRect(-40, -14, 80, 26, 13).fill(0x2f3942);
    g.circle(-16, -1, 7).circle(16, -1, 7).fill(0xffffff);
    g.circle(-15, -1, 3.5).circle(17, -1, 3.5).fill(0x1d232a);
    g.ellipse(0, 24, 21, 15).fill(0xe8eef3);
    g.circle(0, 20, 7).fill(0x2f3942);
  }

  // Нашийник у кольорі гравця — той самий прийом, що й манжет у долоні.
  g.roundRect(-40, 40, 80, 22, 11).fill(color).stroke({ width: 4, color: dark });
  c.addChild(g);

  if (isSelf) {
    const ring = new Graphics();
    ring.circle(0, 0, 70).stroke({ width: 4, color: 0xffffff, alpha: 0.55 });
    c.addChildAt(ring, 0);
  }
  return c;
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
