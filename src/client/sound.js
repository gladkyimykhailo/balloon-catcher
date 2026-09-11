// Маленькі звуки на WebAudio — без файлів і без затримки завантаження.
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(v) { muted = v; }
export function isMuted() { return muted; }

function blip({ freq = 440, to = freq, dur = 0.12, type = 'sine', gain = 0.2 }) {
  if (muted) return;
  const a = ac();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, to), a.currentTime + dur);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur + 0.02);
}

export const sfx = {
  // Пружний "поп" — частота стрибає вгору й одразу гасне.
  hit(power = 0.5) { blip({ freq: 300 + power * 420, to: 700 + power * 900, dur: 0.09, type: 'triangle', gain: 0.12 + power * 0.12 }); },
  // Крик чайки — два різкі висхідні писки.
  gull() {
    [0, 170].forEach((d) => setTimeout(() => blip({ freq: 900, to: 1500, dur: 0.13, type: 'sawtooth', gain: 0.09 }), d));
  },
  // Укус і довге шипіння повітря, що виходить.
  peck() {
    blip({ freq: 1600, to: 500, dur: 0.08, type: 'square', gain: 0.14 });
    setTimeout(() => blip({ freq: 700, to: 90, dur: 0.9, type: 'sawtooth', gain: 0.1 }), 70);
  },
  // Земля тріскається перед пострілом.
  spikeWarn() { blip({ freq: 130, to: 190, dur: 0.22, type: 'square', gain: 0.09 }); },
  // Свист шипа вгору.
  spikeUp() { blip({ freq: 240, to: 1500, dur: 0.3, type: 'sawtooth', gain: 0.11 }); },
  // Влучання: різкий тріск і низький удар.
  spikeHit() {
    blip({ freq: 1800, to: 200, dur: 0.16, type: 'square', gain: 0.2 });
    setTimeout(() => blip({ freq: 220, to: 50, dur: 0.6, type: 'sawtooth', gain: 0.17 }), 90);
  },
  // Відбитий шип — металевий «дзинь».
  parry() {
    blip({ freq: 1200, to: 2400, dur: 0.08, type: 'square', gain: 0.14 });
    setTimeout(() => blip({ freq: 2000, to: 900, dur: 0.22, type: 'triangle', gain: 0.1 }), 60);
  },
  // Аптечка — м'яке висхідне «плюс серце».
  heal() {
    [660, 880].forEach((f, i) => setTimeout(() => blip({ freq: f, to: f * 1.5, dur: 0.2, type: 'sine', gain: 0.15 }), i * 110));
  },
  // Шал: три низькі удари гонга — «понеслось».
  rage() {
    [0, 90, 180].forEach((d, i) =>
      setTimeout(() => blip({ freq: 180 + i * 60, to: 90 + i * 40, dur: 0.28, type: 'square', gain: 0.16 }), d));
  },
  // Чайка какнула — короткий низхідний свист.
  poop() { blip({ freq: 900, to: 260, dur: 0.35, type: 'sine', gain: 0.09 }); },
  // Влучило в долоню — плескіт.
  splat() {
    blip({ freq: 260, to: 90, dur: 0.18, type: 'square', gain: 0.16 });
    setTimeout(() => blip({ freq: 150, to: 60, dur: 0.25, type: 'sawtooth', gain: 0.1 }), 60);
  },
  // Помили руку — булькіт води.
  wash() {
    [0, 80, 150].forEach((d, i) =>
      setTimeout(() => blip({ freq: 500 + i * 220, to: 900 + i * 260, dur: 0.14, type: 'sine', gain: 0.12 }), d));
  },
  // Камінь висить угорі — низький тривожний гул, не такий, як тріск землі
  // перед шипом: гравець має на слух розрізняти, звідки прилетить.
  stoneWarn() { blip({ freq: 90, to: 150, dur: 0.4, type: 'triangle', gain: 0.1 }); },
  // Камінь об підлогу — короткий глухий удар.
  thud() { blip({ freq: 150, to: 45, dur: 0.22, type: 'square', gain: 0.13 }); },
  // Камінь влучив у кульку — важкий тріск.
  stoneHit() {
    blip({ freq: 300, to: 60, dur: 0.3, type: 'square', gain: 0.2 });
    setTimeout(() => blip({ freq: 140, to: 40, dur: 0.5, type: 'sawtooth', gain: 0.16 }), 60);
  },
  // Газ пішов — довге шипіння.
  gas() { blip({ freq: 1100, to: 260, dur: 0.7, type: 'sawtooth', gain: 0.09 }); },
  // Задихаєшся — двійко коротких кашлів.
  choke() {
    [0, 160].forEach((d) => setTimeout(() => blip({ freq: 300, to: 120, dur: 0.13, type: 'square', gain: 0.14 }), d));
  },
  // Їжачок вибіг — квапливе пирхання.
  hog() {
    [0, 110, 220].forEach((d) => setTimeout(() => blip({ freq: 340, to: 240, dur: 0.07, type: 'square', gain: 0.09 }), d));
  },
  // Влучив: глухий удар і свист кульки, що полетіла додолу.
  hogHit() {
    blip({ freq: 260, to: 80, dur: 0.2, type: 'square', gain: 0.18 });
    setTimeout(() => blip({ freq: 700, to: 200, dur: 0.4, type: 'sine', gain: 0.1 }), 70);
  },
  // Пас: короткий висхідний «дзинь», і що довша серія, то вище — на слух чути,
  // як росте комбо, не дивлячись на лічильник.
  pass(k = 0) { blip({ freq: 520 + k * 520, to: 780 + k * 700, dur: 0.09, type: 'sine', gain: 0.1 }); },
  // Пастка з'явилась — глухе «тук», щоб озирнутись.
  trap() { blip({ freq: 200, to: 120, dur: 0.25, type: 'triangle', gain: 0.1 }); },
  // Влип у павутину — липке низхідне.
  web() {
    blip({ freq: 700, to: 160, dur: 0.3, type: 'triangle', gain: 0.14 });
    setTimeout(() => blip({ freq: 300, to: 120, dur: 0.3, type: 'sine', gain: 0.08 }), 90);
  },
  drop() { blip({ freq: 320, to: 70, dur: 0.45, type: 'sawtooth', gain: 0.18 }); },
  over() { blip({ freq: 400, to: 60, dur: 0.9, type: 'square', gain: 0.14 }); },
  // Новий рівень — коротке висхідне арпеджіо.
  level() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => blip({ freq: f, to: f * 1.02, dur: 0.16, type: 'triangle', gain: 0.16 }), i * 90));
  },
  start() { blip({ freq: 520, to: 900, dur: 0.18, type: 'sine', gain: 0.16 }); },
  unlock() { ac(); },
};
