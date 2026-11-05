import { Track, FrameStore } from './frames.js';
import { Renderer } from './renderer.js';
import { Sparks } from './sparks.js';
import { initBelok } from './belok.js';
import { initBackgrounds } from './backgrounds.js';
import { initVkusy } from './vkusy.js';
import { initLookbook } from './lookbook.js';
import { initRecepty, initAllButton } from './recepty.js';
import { initPriznanie } from './priznanie.js';
import { initFinal } from './final.js';

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

/* ------------------------------------------------------------------ */
/* Одна непрерывная лента кадров: облёт (rot1 + rot2 до 3,85 с + rot3b) */
/* → мостик → оживание → баночка (до 3,2 с) → наезд → погружение.       */
/* Кадры на стыках дублируют соседние клипы, поэтому пропускаются.      */
/* ------------------------------------------------------------------ */

const PARTS = [
  { seg: 'rot1', from: 0, to: 121 },
  { seg: 'rot2', from: 1, to: 92 },
  { seg: 'rot3b', from: 1, to: 121 },
  { seg: 'bridge', from: 1, to: 120 },
  { seg: 'awaken', from: 0, to: 122 },
  { seg: 'cup', from: 1, to: 77 },
  { seg: 'push', from: 1, to: 121 },
  { seg: 'dive', from: 1, to: 121 },
];
const film = new Track('hero', PARTS);

// индекс последнего кадра каждого куска ленты
const MARK = {};
PARTS.reduce((acc, p) => (MARK[p.seg] = acc + p.to - p.from - 1, acc + p.to - p.from), 0);

const FRAME_ASPECT = 1920 / 1067;   // кадры — из 4K-апскейла клипов (assets/video/4К для hero), 1920 px
// точка кадра, из которой проявляется герой (верх груди, под лицом)
const REVEAL_CENTER = [0.56, 0.45];

/* ------------------------------------------------------------------ */
/* Сценарий. Единица времени таймлайна = 1vh прокрутки.                 */
/* ------------------------------------------------------------------ */

const HERO_AUTOPLAY = 12;   // секунд на автопролистывание Hero кнопкой «Заглянуть глубже.»
const T = {
  total: 2000,
  exit: 10,          // уход TEOS, закорючки, «Тот самый»
  orbitStart: 60,    // облёт: кадры 0 → MARK.rot3b
  orbitEnd: 670,
  bridgeEnd: 810,    // мостик: камера отъезжает к общему плану
  awakenEnd: 1040,   // оживание
  plaqueIn: 290,     // плашка выплывает снизу
  plaqueOut: 565,    // и уходит вверх
  moveStart: 830,    // герой уходит вправо
  moveEnd: 1030,
  crackStart: 845,   // в клипе по статуе бегут трещины (≈1,0 с оживания)
  burstIn: 870,      // вспышка «разлома»: нарастает…
  burstPeak: 905,    // …пик совпадает с пиком свечения в клипе (≈2,3 с)
  burstOut: 975,     // …и гаснет вместе с ним (≈3,5 с)
  headlineIn: 940,   // «И ещё кое-что.»
  headlineOut: 1070,
  // шаг 4: баночка
  cupEnd: 1200,      // кадры баночки (вспышка в ладони, баночка ≈1165)
  cupTextIn: 1150,   // «Густой греческий йогурт.»
  cupTextOut: 1300,
  // шаг 5: наезд на руку
  pushStart: 1270,
  pushEnd: 1520,
  leftStart: 1300,   // герой уходит из положения справа в положение слева
  leftEnd: 1500,
  deeperIn: 1470,    // блок «Загляни глубже.»
  deeperOut: 1660,
  // шаг 6: погружение
  diveStart: 1620,   // кадры погружения
  diveEnd: 1880,
  diveFxStart: 1700, // шейдер: ускоряющийся зум, закрутка, уход в белый
  diveFxEnd: 1880,   // к 1880 экран чисто белый, на нём проявляется сетка блока «Белок»;
                     // последние 100 единиц на эту сцену наезжает сам блок
  uiOut: 1800,       // линии Hero гаснут, хедер перекрашивается в тёмный
};

// Точка «разлома» в кадре оживания (грудь) — центр вспышки и искр
const BURST_CENTER = [0.55, 0.56];

// Положение героя (масштаб и сдвиг в долях кадра) в конце оживания — макет 03
const POSE = {
  right: { s: 0.9, x: 0.168, y: 0.06 },   // макет 03–04: герой справа
  left: { s: 0.9, x: -0.076, y: 0.056 },  // макет 05: рука с баночкой слева
  center: { s: 1, x: 0, y: 0 },           // погружение: по центру
};

// Видимые параметры, которые анимирует таймлайн
const S = {
  reveal: 0,         // проявление героя (интро, шейдер)
  zoom: 1.1,         // лёгкий наезд-«оседание» кадра в интро
  flash: 0,          // вспышка в начале проявления
  burst: 0,          // вспышка «разлома» при оживании
  sparks: 0,         // интенсивность выброса искр
  frame: 0,          // кадр ленты (дробный)
  s: 1, x: 0, y: 0,  // положение героя
  front: 1,          // слой руки перед буквами
  draw: 0,           // рисование закорючки (интро)
  erase: 0,          // стирание закорючки (скролл)
  draw2: 0,          // закорючка над «Загляни глубже.»
  dive: 0,           // погружение в йогурт (шейдер)
};

/* ------------------------------------------------------------------ */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const store = new FrameStore();
const videoCanvas = $('.hero__video');
const frontCanvas = $('.hero__front');
const sparks = new Sparks($('.hero__sparks'));
let heroRect = [0, 0, 1, 1]; // где сейчас кадр героя на канвасе
let renderer;
let frontImage = null;

/* ---------- Закорючка: обводки-маски по центральной линии ---------- */

// Вторая копия (шаг 5) клонируется из первой до того, как у путей появятся
// инлайн-стили; у неё своя маска, иначе обе рисовались бы синхронно.
(() => {
  const copy = $('.squiggle').cloneNode(true);
  copy.classList.add('squiggle--deeper');
  copy.querySelector('mask').id = 'squiggle-mask-2';
  copy.querySelector('image').setAttribute('mask', 'url(#squiggle-mask-2)');
  $('.deeper').append(copy);
})();

function makeSquiggle(svg) {
  const paths = [...svg.querySelectorAll('mask path')].map(el => {
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len} ${len + 2}`;
    el.style.strokeDashoffset = len;
    el.style.visibility = 'hidden';
    return { el, len };
  });
  return { paths, total: paths.reduce((a, p) => a + p.len, 0), last: -1 };
}

function setSquiggle(sq, p) {
  if (Math.abs(p - sq.last) < 1e-4) return;
  sq.last = p;
  let acc = 0;
  const target = p * sq.total;
  for (const { el, len } of sq.paths) {
    const local = Math.min(Math.max((target - acc) / len, 0), 1);
    el.style.strokeDashoffset = len * (1 - local);
    el.style.visibility = local > 0 ? 'visible' : 'hidden';
    acc += len;
  }
}

const squiggleHero = makeSquiggle($('.squiggle:not(.squiggle--deeper)'));
const squiggleDeeper = makeSquiggle($('.squiggle--deeper'));

function renderSquiggle() {
  setSquiggle(squiggleHero, S.draw * (1 - S.erase));
  setSquiggle(squiggleDeeper, S.draw2);
}

/* ---------- Передний слой: рука перед буквами ---------- */

// Выключено по решению автора: E лежит поверх руки с exclusion, как в макете.
// true — рука снова перекрывает букву (вырезка по яркости и маске ARM_REGION).
const ARM_IN_FRONT = false;

// Область руки на первом кадре (доли кадра); фон отсекается по яркости
const ARM_REGION = [
  [0.12, 0.31], [0.25, 0.31], [0.32, 0.41], [0.385, 0.54], [0.43, 0.65],
  [0.445, 0.79], [0.395, 0.82], [0.33, 0.67], [0.27, 0.56], [0.12, 0.52],
];

function buildFront(bmp) {
  const w = bmp.width, h = bmp.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);

  const m = document.createElement('canvas');
  m.width = w; m.height = h;
  const mctx = m.getContext('2d', { willReadFrequently: true });
  mctx.filter = `blur(${Math.round(w * 0.008)}px)`;
  mctx.fillStyle = '#fff';
  mctx.beginPath();
  ARM_REGION.forEach(([x, y], i) => (i ? mctx.lineTo(x * w, y * h) : mctx.moveTo(x * w, y * h)));
  mctx.closePath();
  mctx.fill();
  const mask = mctx.getImageData(0, 0, w, h).data;

  const d = img.data;
  const lo = 0.06, hi = 0.2;
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    let k = Math.min(Math.max((l - lo) / (hi - lo), 0), 1);
    k = k * k * (3 - 2 * k);
    d[i + 3] = Math.round(255 * k * (mask[i] / 255));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function drawFront() {
  if (!frontImage || !renderer) return;
  const ctx = frontCanvas.getContext('2d');
  frontCanvas.width = videoCanvas.width;
  frontCanvas.height = videoCanvas.height;
  const [x, y, w, h] = renderer.rect({ s: S.s, x: S.x, y: S.y });
  ctx.clearRect(0, 0, frontCanvas.width, frontCanvas.height);
  if (DEBUG && params.has('front')) {
    ctx.globalAlpha = 1;
    ctx.drawImage(frontImage, x, y, w, h);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,0,0,.45)';
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.drawImage(frontImage, x, y, w, h);
  }
}

/* ---------- «Операторская» камера ---------- */

// Во время облёта и оживания кадр медленно плавает (влево-вправо, вверх-вниз,
// лёгкое дыхание масштаба) — как будто оператор ведёт камеру за статуей.
// Движение привязано к скроллу (обратимо), плюс небольшая инерция от скорости.
// Запас масштаба (base) больше суммарного сдвига по Y, чтобы не открывался низ кадра.
const CAM = { base: 0.045, breathe: 0.01, swayX: 0.022, swayX2: 0.009, swayY: 0.008, inertia: 0.008 };
const cam = { s: 1, x: 0, y: 0, vel: 0 };
let scrollST, lenisRef;

function updateCamera() {
  const u = scrollST ? scrollST.progress * T.total : 0;
  let amp = Math.min(Math.max((u - T.orbitStart) / 140, 0), 1);
  amp = amp * amp * (3 - 2 * amp);
  cam.vel += ((lenisRef?.velocity || 0) - cam.vel) * 0.06;
  const inertia = Math.max(-CAM.inertia, Math.min(CAM.inertia, -cam.vel * 0.0005)) * amp;
  cam.s = 1 + amp * (CAM.base + CAM.breathe * Math.sin(u * 0.008 + 0.4));
  cam.x = amp * (CAM.swayX * Math.sin(u * 0.011) + CAM.swayX2 * Math.sin(u * 0.027 + 1.3));
  cam.y = amp * CAM.swayY * Math.sin(u * 0.015 + 0.6) + inertia;
}

/* ---------- Живописный фон за героем и буквы TEOS (шейдер) ---------- */

// Картина видна от старта до оживания и мягко гаснет в чёрный в момент вспышки-«разлома» (T.burstIn…burstPeak и чуть
// дальше); у кадров облёта, мостика и оживания есть маска героя.
// От мыши картина сдвигается (как сцена блока 6), герой — чуть-чуть (глубина).
// В макете 01-start2 картина стоит ровно по экрану (cover) и не затемнена; запас масштаба 1.09 — под движение от мыши.
const PAINT = { src: 'img/hero/fon.webp', dim: 1, zoom: 1.09, mx: 0.04, my: 0.04, hero: 0.012, out: [868, 940] };
const mouse = { tx: 0, ty: 0, x: 0, y: 0, t: 0 };
window.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return;
  mouse.tx = (e.clientX / innerWidth) * 2 - 1;
  mouse.ty = (e.clientY / innerHeight) * 2 - 1;
}, { passive: true });

function paintAmount() {
  const u = scrollST ? scrollST.progress * T.total : 0;
  const t = Math.min(Math.max((u - PAINT.out[0]) / (PAINT.out[1] - PAINT.out[0]), 0), 1);
  return 1 - t * t * (3 - 2 * t);
}
function paintRect() {
  const W = videoCanvas.width, H = videoCanvas.height, p = renderer.paint;
  const k = Math.max(W / p.w, H / p.h) * PAINT.zoom, w = p.w * k, h = p.h * k;
  const x = (W - w) / 2 + mouse.x * PAINT.mx * W, y = (H - h) / 2 + mouse.y * PAINT.my * H;
  return [Math.min(0, Math.max(W - w, x)), Math.min(0, Math.max(H - h, y)), w, h];
}

// Буквы: вёрстка и анимация остаются в DOM (.title__l — окно, внутри span с буквой), но рисует их шейдер —
// DOM-буквы прозрачны (класс is-gl). Атлас: глиф каждой буквы в своей ячейке; каждый кадр шейдеру передаются
// текущие прямоугольники span-ов и окон.
const letters = { els: [], wins: [], pad: [], g: new Float32Array(16), w: new Float32Array(16), ready: false };
function buildLetters() {
  const title = $('.title');
  const spans = $$('.title__l > span');
  if (!title || spans.length !== 4 || !renderer) return;
  const dpr = renderer.dpr;
  const cs = getComputedStyle(title);
  const size = parseFloat(cs.fontSize);
  const padX = size * 0.03, padY = size * 0.07;
  const cells = spans.map(el => {
    const r = el.getBoundingClientRect();
    const probe = document.createElement('i');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    el.append(probe);
    const base = probe.getBoundingClientRect().top - r.top;
    probe.remove();
    return { ch: el.textContent, w: r.width + 2 * padX, h: r.height + 2 * padY, base };
  });
  const atlas = document.createElement('canvas');
  atlas.width = Math.ceil(cells.reduce((s, c) => s + c.w, 0) * dpr) + 8;
  atlas.height = Math.ceil(Math.max(...cells.map(c => c.h)) * dpr) + 2;
  const ctx = atlas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${cs.fontWeight} ${size * dpr}px ${cs.fontFamily}`;
  let x = 0;
  const uv = cells.map(c => {
    ctx.fillText(c.ch, (x + padX) * dpr, (padY + c.base) * dpr);
    const cell = [x * dpr / atlas.width, 0, c.w * dpr / atlas.width, c.h * dpr / atlas.height];
    x += c.w + 2 / dpr;
    return cell;
  });
  renderer.setLetters(atlas, uv);
  letters.els = spans;
  letters.wins = spans.map(el => el.parentElement);
  letters.pad = [padX, padY];
  letters.ready = true;
  title.classList.add('is-gl');
}
/** текущие прямоугольники букв и их окон → letters.g / letters.w (px канваса); возвращает подпись состояния */
function measureLetters() {
  const dpr = renderer.dpr, [px, py] = letters.pad;
  let sig = '';
  letters.els.forEach((el, i) => {
    const r = el.getBoundingClientRect(), w = letters.wins[i].getBoundingClientRect();
    letters.g.set([(r.left - px) * dpr, (r.top - py) * dpr, (r.width + 2 * px) * dpr, (r.height + 2 * py) * dpr], i * 4);
    letters.w.set([w.left * dpr, w.top * dpr, w.right * dpr, w.bottom * dpr], i * 4);
    sig += `${r.top.toFixed(1)},${w.top.toFixed(1)};`;
  });
  return sig;
}

/* ---------- Отрисовка видео ---------- */

let lastState = '';
let lastFrame = 0;
let incomplete = true;

function layer(i, t) {
  let bmp = store.get(film, i);
  let index = i;
  if (!bmp) {
    const n = store.nearest(film, i);
    if (!n) return null;
    bmp = n.bmp; index = n.index;
    incomplete = true;
  }
  return { key: store.key(film, index), bmp, t, exact: index === i };
}

/**
 * Покачивание камеры не должно открывать край кадра: если край был за экраном,
 * сдвиг ограничивается так, чтобы он там и остался.
 */
function cameraClamp(t, dx, dy) {
  const [x, y, w, h] = renderer.rect(t);
  const W = videoCanvas.width, H = videoCanvas.height;
  const range = (pos, size, view) => {
    let lo = -Infinity, hi = Infinity;
    if (pos <= 0.5) hi = -pos;                    // левый/верхний край за экраном
    if (pos + size >= view - 0.5) lo = view - pos - size; // правый/нижний край за экраном
    return lo > hi ? [0, 0] : [lo, hi];
  };
  const [xl, xh] = range(x, w, W);
  const [yl, yh] = range(y, h, H);
  const px = Math.min(Math.max(dx * w, xl), xh);
  const py = Math.min(Math.max(dy * h, yl), yh);
  const b = renderer.base;
  return { s: t.s, x: t.x + px / (H * FRAME_ASPECT * b), y: t.y + py / (H * b) };
}

function renderVideo() {
  // картина и мышь; буквы — пока первый экран не уехал
  const now = performance.now();
  const dtm = Math.min((now - (mouse.t || now)) / 1000, 0.05);
  mouse.t = now;
  mouse.x += (mouse.tx - mouse.x) * (1 - Math.exp(-dtm * 3.2));
  mouse.y += (mouse.ty - mouse.y) * (1 - Math.exp(-dtm * 3.2));
  const amt = renderer.paint ? paintAmount() : 0;
  const u = scrollST ? scrollST.progress * T.total : 0;
  const showLetters = letters.ready && u < 130 && !document.body.classList.contains('is-loading');
  const sig = showLetters ? measureLetters() : '';
  const state = `${cam.s}|${cam.x}|${cam.y}|${S.burst}|${S.dive}|${S.reveal}|${S.zoom}|${S.flash}|${S.frame}|${S.s}|${S.x}|${S.y}|${amt > 0 ? `${amt.toFixed(3)}|${mouse.x.toFixed(4)}|${mouse.y.toFixed(4)}` : ''}|${sig}`;
  // во время проявления шум анимируется, поэтому рисуем каждый кадр
  if (state === lastState && !incomplete && S.reveal >= 1) return;
  lastState = state;
  incomplete = false;

  // погружение: ускоряющийся зум к центру
  const d = S.dive;
  const diveZoom = 1 + 1.7 * Math.pow(d, 2.4);
  const t = cameraClamp({ s: S.s * S.zoom * cam.s * diveZoom, x: S.x, y: S.y }, cam.x * (1 - d) + mouse.x * PAINT.hero * amt, cam.y * (1 - d));
  const fx = { reveal: S.reveal, flash: S.flash, time: performance.now() / 1000, center: REVEAL_CENTER,
    burst: S.burst, burstCenter: BURST_CENTER,
    swirl: 2.6 * Math.pow(d, 1.6), white: Math.min(Math.max((d - 0.55) / 0.45, 0), 1), clamp: d > 0,
    paint: amt > 0 ? { rect: paintRect(), amt, dim: PAINT.dim } : null,
    letters: showLetters ? letters : null };
  heroRect = renderer.rect(t);

  const f = Math.min(Math.max(S.frame, 0), film.count - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, film.count - 1);
  store.cancelQueued();
  store.prefetch(film, i0, Math.sign(f - lastFrame) || 1);
  lastFrame = f;

  const a = layer(i0, t);
  const b = i1 !== i0 ? layer(i1, t) : null;
  if (!a) { incomplete = true; return; }
  // межкадровое растворение сглаживает скраб между кадрами 24 fps
  const mix = b && a.exact && b.exact ? f - i0 : 0;
  renderer.draw(a, b, mix, fx);
}

/* ---------- Искры ---------- */

let sparkCarry = 0, lastBurst = 0, lastTime = performance.now();

function renderSparks() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const [x, y, w, h] = heroRect;
  const center = [x + BURST_CENTER[0] * w, y + BURST_CENTER[1] * h];
  const radius = h * 0.2;
  // поток искр, пока идёт «разлом»
  sparkCarry += S.sparks * 650 * dt;
  const n = Math.floor(sparkCarry);
  sparkCarry -= n;
  if (n) sparks.emit(n, center, radius);
  // залп в момент вспышки (только при скролле вперёд)
  if (lastBurst < 0.6 && S.burst >= 0.6) sparks.emit(260, center, radius * 0.8);
  lastBurst = S.burst;
  if (!sparks.active) { if (sparks.dirty) { sparks.draw(now / 1000); sparks.dirty = false; } return; }
  sparks.update(dt);
  sparks.draw(now / 1000);
  sparks.dirty = true;
}

function render() {
  updateCamera();
  renderVideo();
  renderSparks();
  renderSquiggle();
  // рука поверх букв включается, только когда герой полностью проявился
  frontCanvas.style.opacity = S.front * Math.min(Math.max((S.reveal - 0.9) / 0.1, 0), 1);
  if (DEBUG) hud();
}

/* ---------- Таймлайн скролла ---------- */

/**
 * Текстовый блок «проплывает» через экран вместе со скроллом:
 * выезжает снизу и проявляется, медленно дрейфует вверх, пока читается,
 * затем уходит вверх и растворяется. Строки догоняют блок каскадом.
 */
const FLOAT = { travel: 0.36, drift: 0.035, enter: 80, exit: 80, line: 0.07 };

function floatThrough(tl, block, lines, tIn, tOut) {
  const vh = k => () => innerHeight * k;
  tl.fromTo(block, { y: vh(FLOAT.travel), autoAlpha: 0 },
      { y: vh(FLOAT.drift), autoAlpha: 1, duration: FLOAT.enter, ease: 'power3.out' }, tIn)
    .fromTo(lines, { y: vh(FLOAT.line), autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: FLOAT.enter * 0.75, stagger: 8, ease: 'power3.out' }, tIn + 8)
    .to(block, { y: vh(-FLOAT.drift), duration: tOut - tIn - FLOAT.enter }, tIn + FLOAT.enter)
    .to(lines, { y: vh(-FLOAT.line * 0.6), duration: FLOAT.exit * 0.8, stagger: 6, ease: 'power2.in' }, tOut)
    .to(block, { y: vh(-FLOAT.travel), autoAlpha: 0, duration: FLOAT.exit, ease: 'power2.in' }, tOut);
}

/** Блок «Загляни глубже.»: рамка прорисовывается по кругу, строки поднимаются из масок */
function deeperBlock(tl, tIn, tOut) {
  const vh = k => () => innerHeight * k;
  tl.set('.deeper', { autoAlpha: 1 }, tIn)
    .fromTo('.deeper__veil', { autoAlpha: 0 }, { autoAlpha: 1, duration: 40 }, tIn)
    .fromTo('.deeper__edge--t', { scaleX: 0 }, { scaleX: 1, duration: 22, ease: 'power2.in' }, tIn)
    .fromTo('.deeper__edge--r', { scaleY: 0 }, { scaleY: 1, duration: 22, ease: 'none' }, tIn + 22)
    .fromTo('.deeper__edge--b', { scaleX: 0 }, { scaleX: 1, duration: 22, ease: 'none' }, tIn + 44)
    .fromTo('.deeper__edge--l', { scaleY: 0 }, { scaleY: 1, duration: 22, ease: 'power2.out' }, tIn + 66)
    .fromTo('.deeper__title .line > span', { yPercent: 110 }, { yPercent: 0, duration: 40, stagger: 8, ease: 'power3.out' }, tIn + 14)
    .fromTo('.deeper__sub .line > span', { yPercent: 110 }, { yPercent: 0, duration: 35, stagger: 5, ease: 'power3.out' }, tIn + 34)
    .fromTo('.deeper__menu a > *', { yPercent: 110 }, { yPercent: 0, duration: 35, stagger: 3, ease: 'power3.out' }, tIn + 44)
    .fromTo('.deeper__hint', { autoAlpha: 0 }, { autoAlpha: 1, duration: 30 }, tIn + 60)
    .fromTo(S, { draw2: 0 }, { draw2: 1, duration: 80, ease: 'power1.inOut', immediateRender: false }, tIn + 30)
    // пока читается — лёгкий дрейф вверх, затем уходит вверх и гаснет
    .fromTo('.deeper', { y: 0 }, { y: vh(-0.025), duration: tOut - tIn }, tIn)
    .to(S, { draw2: 0, duration: 40, ease: 'power1.in' }, tOut - 10)
    .to('.deeper', { y: vh(-0.2), autoAlpha: 0, duration: 60, ease: 'power2.in' }, tOut);
}

function buildScrollTimeline() {
  const hero = $('#hero');
  hero.style.height = `${T.total + 100}vh`;

  const tl = gsap.timeline({ defaults: { ease: 'none' } });

  // Шаг 1 → уход заголовка
  tl.to(['.scroll-hint', '.hero__more'], { autoAlpha: 0, duration: 20 }, 0)
    .to('.title__l', { yPercent: 112, duration: 55, stagger: 7, ease: 'power2.in' }, T.exit)
    // плашка лежит на перекладине T и уходит вместе с буквой, иначе T «двоится»
    .to('.tag', { y: () => $('.title__l').offsetHeight * 1.12, duration: 55, ease: 'power2.in' }, T.exit)
    .to(S, { erase: 1, duration: 50, ease: 'power1.in' }, T.exit - 4)
    .to(S, { front: 0, duration: 14 }, T.orbitStart);

  // Шаг 2: облёт → мостик → оживание (одна лента кадров)
  tl.to(S, { frame: MARK.rot3b, duration: T.orbitEnd - T.orbitStart }, T.orbitStart)
    .to(S, { frame: MARK.bridge, duration: T.bridgeEnd - T.orbitEnd }, T.orbitEnd)
    .to(S, { frame: MARK.awaken, duration: T.awakenEnd - T.bridgeEnd }, T.bridgeEnd);

  floatThrough(tl, '.plaque', '.plaque .line > span', T.plaqueIn, T.plaqueOut);

  // «Разлом»: трещины → вспышка и залп искр → свечение гаснет
  tl.to(S, { sparks: 0.25, duration: T.burstIn - T.crackStart }, T.crackStart)
    .to(S, { sparks: 1, duration: T.burstPeak - T.burstIn, ease: 'power2.in' }, T.burstIn)
    .to(S, { sparks: 0, duration: T.burstOut - T.burstPeak + 15, ease: 'power1.out' }, T.burstPeak)
    .to(S, { burst: 1, duration: T.burstPeak - T.burstIn, ease: 'power2.in' }, T.burstIn)
    .to(S, { burst: 0, duration: T.burstOut - T.burstPeak, ease: 'power2.out' }, T.burstPeak);

  // Шаг 3: герой уходит вправо
  tl.to(S, { s: POSE.right.s, x: POSE.right.x, y: POSE.right.y,
    duration: T.moveEnd - T.moveStart, ease: 'power2.inOut' }, T.moveStart);

  floatThrough(tl, '.headline--awaken', '.headline--awaken .line > span', T.headlineIn, T.headlineOut);

  // Шаг 4: баночка появляется в ладони
  tl.to(S, { frame: MARK.cup, duration: T.cupEnd - T.awakenEnd }, T.awakenEnd);
  floatThrough(tl, '.headline--cup', '.headline--cup .line > span', T.cupTextIn, T.cupTextOut);

  // Шаг 5: наезд на руку, герой уходит влево, справа — блок в рамке
  tl.to(S, { frame: MARK.push, duration: T.pushEnd - T.pushStart }, T.pushStart)
    .fromTo(S, { s: POSE.right.s, x: POSE.right.x, y: POSE.right.y },
      { s: POSE.left.s, x: POSE.left.x, y: POSE.left.y, duration: T.leftEnd - T.leftStart, ease: 'sine.inOut',
        immediateRender: false }, T.leftStart);
  deeperBlock(tl, T.deeperIn, T.deeperOut);

  // Шаг 6: погружение в йогурт → белый экран
  tl.to(S, { frame: MARK.dive, duration: T.diveEnd - T.diveStart }, T.diveStart)
    .to(S, { s: POSE.center.s, x: POSE.center.x, y: POSE.center.y, duration: 110, ease: 'sine.inOut' }, T.diveStart)
    .to(S, { dive: 1, duration: T.diveFxEnd - T.diveFxStart, ease: 'power2.in' }, T.diveFxStart)
    .to('.hero__grid', { autoAlpha: 0, duration: 70, ease: 'power1.in' }, T.uiOut)
    .fromTo('.hero__grid-dark', { autoAlpha: 0 }, { autoAlpha: 1, duration: 45, ease: 'power1.out' }, T.diveFxEnd - 35)
    // экран уходит в белый — общий хедер перекрашивается в тёмный (дальше белый блок «Белок»)
    .fromTo('.hdr', { '--ink': '#ffffff', '--inv': 0 }, { '--ink': '#030303', '--inv': 1, duration: 70, ease: 'power1.inOut' }, T.uiOut);

  tl.set({}, {}, T.total);

  scrollST = ScrollTrigger.create({
    trigger: hero,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    animation: tl,
    invalidateOnRefresh: true, // пересчёт пиксельных сдвигов при ресайзе
  });
  return tl;
}

/* ---------- Прелоадер ---------- */

// Пока грузятся кадры: прорисовываются линии сетки, а контур рамки в центре
// показывает прогресс. Прогресс не быстрее LOADER_MIN, чтобы линии успели нарисоваться.
const LOADER_MIN = 2.8;

function runLoader(load) {
  const rect = $('.loader__rect rect');
  const count = $('.loader__count');
  const started = performance.now();
  let actual = 0, shown = 0, done = false;

  gsap.from(['.loader__word', '.loader__count'], { autoAlpha: 0, y: 8, duration: 0.9, stagger: 0.1, ease: 'power2.out', delay: 0.15 });
  requestAnimationFrame(() => $('.hero__grid').classList.add('is-drawn'));

  return new Promise((resolve, reject) => {
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000;
      const target = Math.min(actual, elapsed / LOADER_MIN);
      shown += (target - shown) * 0.07;
      if (target >= 1 && shown > 0.996) shown = 1;
      rect.style.strokeDashoffset = 1 - shown;
      count.textContent = String(Math.round(shown * 100)).padStart(3, '0');
      if (shown === 1 && done) { gsap.ticker.remove(tick); resolve(); }
    };
    gsap.ticker.add(tick);
    load(p => (actual = p)).then(() => { actual = 1; done = true; }, reject);
  });
}

/* ---------- Интро: проявление героя и UI ---------- */

function intro() {
  gsap.set('.title__l > span', { yPercent: 115 });
  gsap.set('.tag__in', { yPercent: 101 });
  gsap.set('.hdr__rule', { scaleX: 0 });
  gsap.set(['.hdr__logo', '.hdr__kind', '.hdr__vol', '.hdr__badges', '.hdr__menu', '.scroll-hint', '.hero__more'], { autoAlpha: 0 });
  document.body.classList.remove('is-loading');

  const tl = gsap.timeline();
  tl.to(['.loader__word', '.loader__count'], { autoAlpha: 0, y: -8, duration: 0.5, stagger: 0.05, ease: 'power2.in' }, 0)
    .to('.loader__rect', { autoAlpha: 0, duration: 0.6, ease: 'power2.out' }, 0.25)
    .set('.loader', { autoAlpha: 0 }, 0.9)
    // герой проявляется от груди к краям: контуры → светящийся фронт → кадр
    .to(S, { reveal: 1, duration: 2.6, ease: 'power1.inOut' }, 0.3)
    .to(S, { zoom: 1, duration: 3.4, ease: 'power3.out' }, 0.3)
    .to(S, { flash: 1, duration: 0.35, ease: 'power2.out' }, 0.45)
    .to(S, { flash: 0, duration: 1.5, ease: 'power2.inOut' }, 0.8)
    .to('.hdr__rule', { scaleX: 1, duration: 1.4, stagger: 0.12, ease: 'expo.inOut' }, 1.3)
    .to(['.hdr__logo', '.hdr__kind', '.hdr__vol', '.hdr__badges', '.hdr__menu'],
      { autoAlpha: 1, duration: 0.8, stagger: 0.06, ease: 'power2.out' }, 1.9)
    .to('.title__l > span', { yPercent: 0, duration: 1.5, stagger: 0.09, ease: 'expo.out' }, 1.7)
    .to('.tag__in', { yPercent: 0, duration: 0.9, ease: 'expo.out' }, 1.95)
    .to(S, { draw: 1, duration: 2.6, ease: 'power2.inOut' }, 2.4)
    .to(['.scroll-hint', '.hero__more'], { autoAlpha: 1, duration: 0.8, stagger: 0.15 }, 3.8);
  return tl;
}

/* ---------- Отладка ---------- */

let hudEl;
function hud() {
  if (!hudEl) {
    hudEl = document.createElement('div');
    hudEl.className = 'debug-hud';
    document.body.append(hudEl);
  }
  const st = ScrollTrigger.getAll()[0];
  const unit = st ? st.progress * T.total : 0;
  hudEl.textContent =
    `t ${unit.toFixed(1)}\nframe ${S.frame.toFixed(2)} / ${film.count}\ncam x ${(cam.x * 100).toFixed(1)}% s ${cam.s.toFixed(3)}\nbitmaps ${store.bitmaps.size}`;
}

/* ---------- Запуск ---------- */

async function init() {
  const skipIntro = params.has('t');
  // прелоадер ждёт только облёт (≈ треть веса), хвост ленты догружается в фоне
  const HEAD = MARK.rot3b + 1;
  if (skipIntro) await store.loadRange(film, 0, film.count);
  else await runLoader(onProgress => store.loadRange(film, 0, HEAD, onProgress));
  store.loadRange(film, HEAD, film.count).catch(err => console.warn(err));

  renderer = new Renderer(videoCanvas, FRAME_ASPECT);
  // картина за героем: ждём её до интро (иначе появится рывком); если не загрузилась — остаётся чёрный фон
  await new Promise(res => { const im = new Image(); im.onload = () => { renderer.setPaint(im); res(); }; im.onerror = res; im.src = PAINT.src; });
  const first = await store.decode(film, 0);
  await store.decode(film, 1);
  store.pinned = new Set([store.key(film, 0)]);
  if (ARM_IN_FRONT) {
    frontImage = buildFront(first);
    drawFront();
  }

  try { await document.fonts.ready; } catch {}
  try { await document.fonts.load('400 100px "Bebas Neue Pro"'); } catch {}
  buildLetters();

  const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  lenisRef = lenis;
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  buildScrollTimeline();
  gsap.ticker.add(render);
  // кнопка первого экрана «Заглянуть глубже.»: сама, не спеша, пролистывает весь Hero до блока «Белок»
  // (колесо, тачпад или касание в любой момент перехватывают скролл); наведение — как у «Все рецепты.»
  const more = $('.hero__more');
  if (more) {
    initAllButton(more, { prefix: 'hero__more', link: true });
    more.addEventListener('click', e => {
      e.preventDefault();
      lenis.resize();
      const target = $('#belok').getBoundingClientRect().top + window.scrollY;
      lenis.scrollTo(target, { duration: HERO_AUTOPLAY, easing: t => 0.5 - Math.cos(Math.PI * t) / 2 });
    });
  }
  // блоки после Hero — после него, чтобы их триггеры считались от уже удлинённой страницы
  initBackgrounds().catch(err => console.error('backgrounds', err));
  initBelok()
    .then(() => initVkusy())
    .then(() => initLookbook())
    .then(() => initRecepty())
    .then(() => initPriznanie())
    .then(() => initFinal())
    .then(() => {
      ScrollTrigger.refresh();
      // ?vk=<0…1> — сразу в точку вступления блока «Вкусы» (для отладки)
      if (params.has('vk')) requestAnimationFrame(() => { lenis.resize(); window.__vkusy?.seek(Number(params.get('vk'))); });
      // ?rc=<0…1> — сразу в точку блока «Рецепты»
      if (params.has('rc')) requestAnimationFrame(() => { lenis.resize(); window.__recepty?.seek(Number(params.get('rc'))); });
      // ?pz=<0…1> — сразу в точку блока «Признание элитой»
      if (params.has('pz')) requestAnimationFrame(() => { lenis.resize(); window.__priznanie?.seek(Number(params.get('pz'))); });
      // ?fn=<0…1> — сразу в точку блока «Финал»
      if (params.has('fn')) requestAnimationFrame(() => { lenis.resize(); window.__final?.seek(Number(params.get('fn'))); });
    })
    .catch(err => console.error('blocks', err));

  sparks.resize();
  window.addEventListener('resize', () => {
    renderer.resize();
    buildLetters();
    sparks.resize();
    drawFront();
    incomplete = true;
  });

  // ?t=<единица сценария> — сразу перейти в нужную точку (для отладки)
  if (skipIntro) {
    document.body.classList.remove('is-loading');
    S.draw = 1; S.reveal = 1; S.zoom = 1;
    gsap.set('.loader', { autoAlpha: 0 });
    $('.hero__grid').classList.add('is-drawn');
    // после снятия is-loading раскладка меняется: пересчитать триггер и только потом прыгать
    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
      lenis.resize(); // Lenis мог запомнить высоту страницы до удлинения Hero
      const st = ScrollTrigger.getAll()[0];
      lenis.scrollTo(st.start + (st.end - st.start) * (Number(params.get('t')) / T.total), { immediate: true });
    });
  } else {
    lenis.stop();
    intro();
    // прокрутку можно начать чуть раньше, не дожидаясь конца закорючки
    gsap.delayedCall(3.2, () => lenis.start());
  }

  window.__hero = { S, T, POSE, MARK, cam, sparks, lenis, store, renderer, seek(u) {
    lenis.resize();
    const st = ScrollTrigger.getAll()[0];
    lenis.scrollTo(st.start + (st.end - st.start) * (u / T.total), { immediate: true });
  } };
}

init().catch(err => {
  console.error(err);
  $('.loader__word').textContent = 'Ошибка';
});
