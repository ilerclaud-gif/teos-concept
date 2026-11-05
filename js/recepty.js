// Блок 4 «Рецепты» (макеты design/4 блок/04-recepty 1–4). Механика — trionn.com, блок «Design in motion»
// (разобрана в их бандле): та же винтовая линия, камера, скорость ленты, направляющие и посадка карточек.
//  1) блок въезжает снизу обычным скроллом (ровный стык, без прожига); с первого пикселя строки заголовка — чёткие,
//     без проявления — едут бегущей строкой навстречу
//     друг другу (верхняя — слева направо, нижняя — справа налево) из-за краёв экрана и дальше — за противоположный край;
//  2) лента из 9 карточек вылетает снизу слева, по винтовой линии (2 витка) проходит крупно перед камерой —
//     поверх текста — и улетает вверх; вдоль неё бегут тонкие направляющие; наведение — карточка ×1.12;
//  3) 6 карточек по очереди прилетают в сетку: верхний ряд — сверху, нижний — снизу, крайние колонки — из углов;
//     при посадке по карточке проходит волна (по времени, не по скроллу); подзаголовок растворяется;
//  4) ряд 2 опускается, проявляются названия и подсказка; дальше блок уезжает.
// Мир — как у trionn (единицы three.js): камера в (0, 0, 22), fov 52°, винтовая линия радиуса 12, подъём 28 за 2 витка.
// Экран — кадр 1440×800 (1 ед. = --u = min(vw/1440, vh/800)), по центру; в плоскости z = 0 1 ед. мира = S0 ед. кадра.

import { initRecipeModal } from './recipe-modal.js';

const { gsap, ScrollTrigger } = window;

const RECIPES = [
  { name: 'Яблочное суфле.' }, { name: 'Лимонный крем.' }, { name: 'Сникерс.' }, { name: 'Рафаэлло.' },
  { name: 'Тирамису.' }, { name: 'Ягодный пломбир.' }, { name: 'Халва.' }, { name: 'Солёная карамель.' }, { name: 'Морковный торт.' },
];
// сетка рецептов (макеты 3–4): по колонкам модульной сетки макета — 6 колонок на ширину экрана (поля 20, колонка 220,
// шаг 236 — в --uw, как хедер), карточка = колонка, высота по пропорции картинки 3:2; по вертикали — от центральной
// линии экрана (в --u): верхний ряд кончается на 11.3 выше неё, нижний начинается на 4 ниже и опускается под названия
const GRID = { margin: 20, step: 236, w: 220, aspect: 1.5, row1Gap: 11.3, row2Top: 404 };
const CELLS = [
  { i: 0, col: 1, row: 1 }, { i: 1, col: 1, row: 2 }, { i: 2, col: 2, row: 2 },
  { i: 3, col: 3, row: 1 }, { i: 4, col: 4, row: 1 }, { i: 5, col: 4, row: 2 },
];
const ROW2_DROP = 50;
// порядок посадки (как у trionn): верхний ряд слева направо, затем нижний; side: 0 — крайняя левая, 2 — крайняя правая
const ORDER = [...CELLS].sort((a, b) => a.row - b.row || a.col - b.col)
  .map(c => ({ ...c, side: c.col === 1 ? 0 : c.col === 4 ? 2 : 1 }));
// раскладка в ед. кадра (пересчёт на resize): k = --uw / --u (на экранах шире 1440×800 колонки крупнее кадра)
const geo = { k: 1, w: GRID.w, h: GRID.w / GRID.aspect };
const cellX = c => 720 + geo.k * (GRID.margin + GRID.step * c.col - 720);
const cellY = c => (c.row === 1 ? 400 - GRID.row1Gap - geo.h : GRID.row2Top);

// ---------- мир trionn ----------
const CAM = 22;
const FOC = 400 / Math.tan((52 / 2) * Math.PI / 180);   // фокус, ед. кадра (fov 52° на высоту 800)
const S0 = FOC / CAM;
const TAU = Math.PI * 2;
const HB = 28 / (2 * TAU);                               // подъём винтовой линии на радиан
const ARC_K = Math.sqrt(144 + HB * HB);                  // длина дуги на радиан
const HELIX_LEN = 2 * TAU * ARC_K;
const CW = 5.8, CH = 5.8 * 1342 / 2000, STEP = 6.2;      // карточка ленты (по дуге × поперёк), шаг карточек
const RIB_LEN = (RECIPES.length - 1) * STEP + CW;
const RADIUS = 8 / S0;                                   // скругление карточек ленты (макет 2)
const HOVER = 1.12;
const GUIDE_N = 600, GUIDE_K = 86;                       // направляющие: точек на 2 витка, длина бегущего отрезка
// сценарий: s — экраны скролла после закрепления. Лента и сетка — как у trionn: фаза g = s / 5,
// лента P = g / (2/3), сетка H — с g = GRID_G; строки — от «верх блока у низа экрана» (S = 0) за WORDS_S экрана
const RIBBON_S = 5;
const GRID_G = (0.5 * HELIX_LEN + RIB_LEN + 10) / (HELIX_LEN + RIB_LEN) * (400 / 600);
const PIN_S = 5.5;                                       // длина закрепления — в CSS: .rc__pin = (1 + PIN_S) × 100vh
const WORDS_S = 3.6;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);

/** точка винтовой линии и «верх» карточки (как у trionn: нормаль к касательной и радиусу, наклон +0.6 по y) */
function helix(r) {
  const c = Math.cos(r), u = Math.sin(r), d = (r - TAU) / 2, f = 2.5 * Math.exp(-d * d);
  let g = -12 * u, w = HB + d * f, v = 12 * c;
  let l = Math.hypot(g, w, v); g /= l; w /= l; v /= l;
  let M = w * u, S = v * c - g * u, P = -w * c;
  l = Math.hypot(M, S, P) || 1; M /= l; S /= l; P /= l;
  S += 0.6;
  l = Math.hypot(M, S, P) || 1;
  return { p: [12 * c, -16 + r * HB - f, 12 * u], up: [M / l, S / l, P / l] };
}
/** мир → кадр (ед.) */
const project = ([x, y, z]) => [720 + x * FOC / (CAM - z), 400 - y * FOC / (CAM - z)];

// ---------- WebGL ----------
const HEAD = `
const float CAM = ${CAM.toFixed(1)};
const float FOC = ${FOC.toFixed(4)};
uniform vec2 uView;        // канвас, px
uniform float uUnit;       // px канваса на ед. кадра
vec4 toClip(vec3 P) {
  float w = CAM - P.z;
  vec2 fr = vec2(P.x, -P.y) * FOC / w * uUnit / (uView * 0.5);
  return vec4(fr.x * w, -fr.y * w, (500.1 / 499.9) * w - 100.0 / 499.9, w);
}`;
const VERT = `
attribute vec2 aUv;        // x — вдоль карточки, y — поперёк (0 — нижний край)
${HEAD}
uniform float uMode;       // 0 — лента, 1 — карточка сетки
uniform float uArc0, uLen, uHgt;
uniform vec2 uPos, uSize;  // сетка: центр и размер (мир, плоскость z = 0)
uniform float uWave, uWaveT, uCol, uRow;
varying vec2 vUv;
void main() {
  vec3 P;
  if (uMode < 0.5) {
    float r = (uArc0 + aUv.x * uLen) / ${ARC_K.toFixed(6)};
    float c = cos(r), u = sin(r), d = (r - 6.2831853) * 0.5, f = 2.5 * exp(-d * d);
    vec3 h = vec3(12.0 * c, -16.0 + r * ${HB.toFixed(6)} - f, 12.0 * u);
    vec3 tg = normalize(vec3(-12.0 * u, ${HB.toFixed(6)} + d * f, 12.0 * c));
    vec3 up = normalize(vec3(tg.y * u, tg.z * c - tg.x * u, -tg.y * c));
    up.y += 0.6;
    up = normalize(up);
    P = h + up * (aUv.y - 0.5) * uHgt;
  } else {
    // волна при посадке (trionn): смещение к камере, нарастает от угла/края, откуда карточка прилетела
    float ex = aUv.x, tt = 1.0 - aUv.y, n;
    if (uCol > 0.5 && uCol < 1.5) n = tt;
    else if (uCol < 0.5) n = (uRow < 0.5 ? ex + tt : ex + 1.0 - tt) * 0.5;
    else n = (uRow < 0.5 ? 1.0 - ex + tt : 2.0 - ex - tt) * 0.5;
    float dz = uWave * n * sin(n * 3.14159265 * 0.9 - 2.0 * uWaveT) * uSize.x * 0.12;
    P = vec3(uPos + (aUv - 0.5) * uSize, dz);
  }
  gl_Position = toClip(P);
  vUv = aUv;
}`;
const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform float uMode, uLen, uHgt, uRadius, uFlip;
varying vec2 vUv;
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);           // строка 0 картинки — верх
  float a = 1.0;
  if (uMode < 0.5) {
    if (gl_FrontFacing == (uFlip > 0.5)) uv.x = 1.0 - uv.x;   // обе стороны ленты — читаемая картинка
    vec2 sz = vec2(uLen, uHgt);
    vec2 q = abs(vUv - 0.5) * sz - (sz * 0.5 - uRadius);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
    a = 1.0 - smoothstep(-0.012, 0.012, d);
    if (a <= 0.0) discard;
  }
  gl_FragColor = vec4(texture2D(uTex, uv).rgb * a, a);
}`;
const LVERT = `
attribute vec3 aP;
${HEAD}
void main() { gl_Position = toClip(aP); }`;
const LFRAG = `
precision mediump float;
void main() { gl_FragColor = vec4(vec3(158.0 / 255.0), 1.0); }`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

/** Направляющие (trionn): линии чуть снаружи краёв ленты по всей винтовой линии, задом наперёд (от верха);
 *  нижняя продлена прямой до верха экрана. Рисуется бегущий отрезок из GUIDE_K точек. */
function buildGuides() {
  const off = 0.5 * CH + 4 / S0 + 0.12 * CH;
  const U = [], L = [];
  for (let i = 0; i <= GUIDE_N; i++) {
    const { p, up } = helix(i / GUIDE_N * 2 * TAU);
    U.push(p.map((v, k) => v + up[k] * off));
    L.push(p.map((v, k) => v - up[k] * off));
  }
  U.reverse(); L.reverse();
  const [t, r] = L, dir = t.map((v, k) => v - r[k]);
  const dl = Math.hypot(...dir), du = dir.map(v => v / dl);
  const h = (Math.tan(26 * Math.PI / 180) * CAM - t[1]) / du[1];
  const ext = [];
  for (let e = 20; e >= 1; e--) ext.push(t.map((v, k) => v + du[k] * e / 20 * h));
  L.unshift(...ext);
  return [U, L].map(a => new Float32Array(a.flat()));
}

class Scene {
  constructor(canvas, images) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, depth: true });
    this.gl = gl;
    this.card = program(gl, VERT, FRAG);
    this.line = program(gl, LVERT, LFRAG);
    const mesh = (nx, ny) => {
      const uv = [], idx = [];
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) uv.push(i / nx, j / ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + nx + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const ub = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, ub);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
      return { ub, ib, count: idx.length };
    };
    this.ribbonMesh = mesh(116, 1);
    this.gridMesh = mesh(20, 12);
    this.guides = buildGuides().map(data => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return { b, n: data.length / 3 };
    });
    this.tex = images.map(img => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    });
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    this.unit = Math.min(innerWidth / 1440, innerHeight / 800) * dpr;
  }
  /** ribbon: [{ tex, arc0, len, hgt }], grid: [{ tex, x, y, w, h, wave, waveT, col, row }], guides: [[start, count] × 2] */
  draw(ribbon, grid, guides) {
    const gl = this.gl, W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!ribbon.length && !grid.length && !guides.some(g => g[1] > 1)) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);

    const { p, u } = this.card;
    gl.useProgram(p);
    gl.uniform2f(u.uView, W, H);
    gl.uniform1f(u.uUnit, this.unit);
    gl.uniform1i(u.uTex, 0);
    gl.uniform1f(u.uRadius, RADIUS);
    gl.uniform1f(u.uFlip, 1);
    gl.activeTexture(gl.TEXTURE0);
    const loc = gl.getAttribLocation(p, 'aUv');
    gl.enableVertexAttribArray(loc);
    const use = m => {
      gl.bindBuffer(gl.ARRAY_BUFFER, m.ub);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
    };
    use(this.ribbonMesh);
    gl.uniform1f(u.uMode, 0);
    for (const c of ribbon) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex[c.tex]);
      gl.uniform1f(u.uArc0, c.arc0);
      gl.uniform1f(u.uLen, c.len);
      gl.uniform1f(u.uHgt, c.hgt);
      gl.drawElements(gl.TRIANGLES, this.ribbonMesh.count, gl.UNSIGNED_SHORT, 0);
    }
    use(this.gridMesh);
    gl.uniform1f(u.uMode, 1);
    for (const c of grid) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex[c.tex]);
      gl.uniform2f(u.uPos, c.x, c.y);
      gl.uniform2f(u.uSize, c.w, c.h);
      gl.uniform1f(u.uWave, c.wave);
      gl.uniform1f(u.uWaveT, c.waveT);
      gl.uniform1f(u.uCol, c.col);
      gl.uniform1f(u.uRow, c.row);
      gl.drawElements(gl.TRIANGLES, this.gridMesh.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.disableVertexAttribArray(loc);

    // направляющие — после карточек, с проверкой глубины (карточки перед ними их закрывают)
    const L = this.line;
    gl.useProgram(L.p);
    gl.uniform2f(L.u.uView, W, H);
    gl.uniform1f(L.u.uUnit, this.unit);
    gl.depthMask(false);
    const ll = gl.getAttribLocation(L.p, 'aP');
    gl.enableVertexAttribArray(ll);
    this.guides.forEach((g, i) => {
      const [start, count] = guides[i];
      if (count < 2) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, g.b);
      gl.vertexAttribPointer(ll, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINE_STRIP, start, Math.min(count, g.n - start));
    });
    gl.disableVertexAttribArray(ll);
    gl.depthMask(true);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Буквы для переката (как «Купить.» в лукбуке) */
function rollWord(text) {
  const frag = document.createDocumentFragment();
  [...text].forEach((ch, i) => {
    if (ch === ' ') { frag.append(document.createTextNode(' ')); return; }
    const w = document.createElement('span');
    w.className = 'roll__ch';
    w.style.setProperty('--i', i);
    const a = document.createElement('span'); a.className = 'roll__a'; a.textContent = ch;
    const b = document.createElement('span'); b.className = 'roll__b'; b.textContent = ch;
    w.append(a, b);
    frag.append(w);
  });
  return frag;
}

/** «Все рецепты.» — анимация кнопки trionn.com (разобрана в их бандле).
 *  Та же кнопка — ссылка автора в блоке 6: prefix — класс блока кнопки (его -word, -arrow--right / --left, -line--right / --left),
 *  слов (строк) может быть несколько — уезжают вместе; link — настоящая ссылка (клик не отменяется). */
export function initAllButton(btn, { prefix = 'rc__all', link = false } = {}) {
  const words = [...btn.querySelectorAll(`.${prefix}-word`)];
  const lines = words.map(word => {
    const text = word.textContent;
    word.textContent = '';
    return [...text].map(c => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c === ' ' ? '\u00a0' : c;
      word.append(s);
      return s;
    });
  });
  const arR = btn.querySelector(`.${prefix}-arrow--right`);
  const arL = btn.querySelector(`.${prefix}-arrow--left`);
  const lnR = btn.querySelector(`.${prefix}-line--right`);
  const lnL = btn.querySelector(`.${prefix}-line--left`);
  const STEP = 30, BASE = 300, DSTEP = 30;
  const n = Math.max(...lines.map(l => l.length));
  const setup = dir => {
    // «in»: правый край самого длинного слова — к правому краю кнопки; последняя буква уходит первой
    const right = Math.max(...words.map(w => w.getBoundingClientRect().right));
    const move = dir === 'in' ? Math.max(0, btn.getBoundingClientRect().right - right) : 0;
    for (const chars of lines) {
      chars.forEach((c, i) => {
        const o = dir === 'in' ? chars.length - i - 1 : i;
        if (dir === 'in') c.style.setProperty('--move', `${move}px`);
        c.style.setProperty('--delay', `${o * STEP}ms`);
        c.style.setProperty('--dur', `${BASE + o * DSTEP}ms`);
      });
    }
    return Math.max(120, Math.round(((n - 1) * STEP + BASE + (n - 1) * DSTEP) * 0.75));
  };
  const slide = (el, x, opacity, duration, delay = 0) => {
    const cs = getComputedStyle(el);
    const from = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform).m41;
    el.getAnimations().forEach(a => a.cancel());
    const a = el.animate([{ transform: `translateX(${from}px)`, opacity: +cs.opacity }, { transform: `translateX(${x})`, opacity }],
      { duration, delay, easing: 'ease', fill: 'forwards' });
    a.onfinish = () => { el.style.transform = `translateX(${x})`; el.style.opacity = String(opacity); };
  };
  const scale = (el, to, duration) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
    const from = Math.hypot(m.m11, m.m12);
    el.getAnimations().forEach(a => a.cancel());
    const a = el.animate([{ transform: `scaleX(${from})` }, { transform: `scaleX(${to})` }], { duration, easing: 'ease', fill: 'forwards' });
    a.onfinish = () => { el.style.transform = `scaleX(${to})`; };
  };
  let timer;
  const enter = () => {
    clearTimeout(timer);
    const s = setup('in');
    void btn.offsetWidth;
    btn.classList.add('is-hovered');
    slide(arR, '28px', 0, 260);
    slide(arL, '0px', 1, 420, s);
    scale(lnR, 0, 1900);
    timer = setTimeout(() => scale(lnL, 1, 900), s);
  };
  const leave = () => {
    clearTimeout(timer);
    const s = setup('out');
    void btn.offsetWidth;
    btn.classList.remove('is-hovered');
    slide(arL, '-28px', 0, 260);
    slide(arR, '0px', 1, 420, s);
    scale(lnL, 0, 1900);
    timer = setTimeout(() => scale(lnR, 1, 900), s);
  };
  btn.addEventListener('mouseenter', enter);
  btn.addEventListener('mouseleave', leave);
  btn.addEventListener('focus', enter);
  btn.addEventListener('blur', leave);
  if (!link) btn.addEventListener('click', e => e.preventDefault());   // концепт: без ссылки
}

export async function initRecepty() {
  const section = document.querySelector('#recepty');
  if (!section) return;
  const pin = section.querySelector('.rc__pin');
  const lines = [...section.querySelectorAll('.rc__line')];
  const sub = section.querySelector('.rc__sub');
  const all = section.querySelector('.rc__all');
  const hint = section.querySelector('.rc__hint');
  const grid = section.querySelector('.rc__grid');

  await document.fonts.load('700 100px "Bebas Neue Pro"');
  const images = await Promise.all(RECIPES.map((_, i) => loadImage(`img/recepty/r-${i + 1}.webp`)));

  // строки: слово внутри (его ширина — для бегущей строки)
  const words = lines.map(l => {
    const w = document.createElement('span');
    w.className = 'rc__word';
    w.textContent = l.textContent;
    l.textContent = '';
    l.append(w);
    return w;
  });

  // ---------- сетка (DOM): для наведения и клика; появляется, когда карточки GL сели и волна улеглась ----------
  const cards = CELLS.map(c => {
    const li = document.createElement('li');
    li.className = 'rc__card';
    const name = document.createElement('p');
    name.className = 'rc__name';
    name.append(rollWord(RECIPES[c.i].name));
    const btn = document.createElement('button');
    btn.className = 'rc__open';
    btn.type = 'button';
    btn.dataset.recipe = String(c.i + 1);
    btn.setAttribute('aria-label', `Рецепт: ${RECIPES[c.i].name.replace(/\.$/, '')}`);
    btn.append(images[c.i].cloneNode());
    btn.addEventListener('click', () => section.dispatchEvent(new CustomEvent('recipe:open', { detail: { id: c.i + 1 } })));
    li.append(name, btn);
    grid.append(li);
    return { ...c, li, name, shown: 0 };
  });

  initAllButton(all);

  // ---------- WebGL: одна сцена поверх заголовка (как у trionn) ----------
  const scene = new Scene(section.querySelector('.rc__gl'), images);
  const view = { u: 1, hw: 0, hh: 0, off: [0, 0] };
  const resize = () => {
    scene.resize();
    view.u = Math.min(innerWidth / 1440, innerHeight / 800);
    view.hw = innerWidth / 2 / view.u;          // полуширина экрана, ед. кадра
    view.hh = innerHeight / 2 / view.u;
    // бегущая строка: от «правый край слова у левого края экрана» до «левый край у правого»
    view.off = words.map(w => view.hw + w.offsetWidth / view.u / 2);
    // сетка рецептов — по колонкам ширины экрана
    geo.k = innerWidth / 1440 / view.u;
    geo.w = GRID.w * geo.k;
    geo.h = geo.w / GRID.aspect;
    cards.forEach(c => {
      c.li.style.left = `calc(var(--u) * ${cellX(c).toFixed(2)})`;
      c.li.style.width = `calc(var(--u) * ${geo.w.toFixed(2)})`;
      c.li.style.height = `calc(var(--u) * ${geo.h.toFixed(2)})`;
    });
    hint.style.left = `calc(var(--u) * ${cellX({ col: 3 }).toFixed(2)})`;
  };

  // ---------- сценарий ----------
  // S — экраны от «верх блока у низа экрана»; закрепление с S = 1 (s = S − 1)
  const state = { S: 0 };
  const st = ScrollTrigger.create({
    trigger: pin, start: 'top bottom', end: 'bottom bottom',
    onUpdate: t => { state.S = t.progress * (1 + PIN_S); },
  });
  const ribbonHover = RECIPES.map(() => 1);
  const NAME_IN = 0.7, NAME_GAP = 0.09;   // появление названия, с; пауза между соседними
  let nameClock = 0;
  const land = ORDER.map(() => ({ wave: 0, waveT: 0 }));
  const pointer = { on: false, x: 0, y: 0 };
  window.addEventListener('pointermove', e => {
    pointer.on = true;
    pointer.x = 720 + (e.clientX - innerWidth / 2) / view.u;
    pointer.y = 400 + (e.clientY - innerHeight / 2) / view.u;
  });
  document.addEventListener('pointerleave', () => { pointer.on = false; });

  /** карточка ленты под курсором (передняя из попавших): контур по 13 точкам каждого края */
  function hitRibbon(list) {
    let best = -1, bestZ = -Infinity;
    for (const c of list) {
      const top = [], bot = [];
      let z = 0;
      for (let k = 0; k <= 12; k++) {
        const { p, up } = helix((c.arc0 + c.len * k / 12) / ARC_K);
        top.push(project(p.map((v, j) => v + up[j] * c.hgt / 2)));
        bot.push(project(p.map((v, j) => v - up[j] * c.hgt / 2)));
        z += p[2];
      }
      const poly = top.concat(bot.reverse());
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > pointer.y) !== (yj > pointer.y) && pointer.x < (xj - xi) * (pointer.y - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside && z > bestZ) { bestZ = z; best = c.e; }
    }
    return best;
  }

  let uiIn = false;
  function frame(dt) {
    const S = state.S, s = S - 1;
    // описание и кнопка — по времени (как FadeInOnScroll у trionn), с запасом от дрожания на границе
    if (!uiIn && S > 0.15) uiIn = true; else if (uiIn && S < 0.05) uiIn = false;
    section.classList.toggle('is-in', uiIn);

    // 1) строки — бегущая строка по скроллу, без остановки в центре
    const m = clamp(S / WORDS_S);
    lines.forEach((l, i) => {
      const x = (i ? 1 : -1) * view.off[i] * (1 - 2 * m);
      l.style.transform = `translateX(calc(var(--u) * ${x.toFixed(2)}))`;
    });

    // 2) лента
    const g = clamp(s / RIBBON_S);
    const P = Math.min(1, g / (400 / 600));
    const H = clamp((g - GRID_G) / (1 - GRID_G));
    const base = P * (HELIX_LEN + RIB_LEN) - RIB_LEN + 25;
    const ribbon = [];
    for (let e = 0; e < RECIPES.length; e++) {
      const t = base + STEP * e;
      if (!(P < 1 && t > 0 && t < HELIX_LEN)) continue;
      const hs = ribbonHover[e];
      const len = CW * hs;
      ribbon.push({ e, tex: RECIPES.length - 1 - e, arc0: Math.min(t, HELIX_LEN - 0.001) + 2.9 - 0.5 * len, len, hgt: CH * hs });
    }
    const hit = pointer.on && ribbon.length ? hitRibbon(ribbon) : -1;
    const kH = 1 - Math.pow(0.001, dt);
    ribbonHover.forEach((h, e) => { ribbonHover[e] = h + ((e === hit ? HOVER : 1) - h) * kH; });
    const guides = [[601, 0], [621, 0]].map(([n]) => {
      const c = Math.floor(P * (n + GUIDE_K)), from = Math.max(0, c - GUIDE_K);
      return [from, Math.max(0, Math.min(c, n) - from + 1)];
    });

    // подзаголовок гаснет с началом сетки (как у trionn: только прозрачность)
    sub.style.opacity = Math.max(0, 1 - 4 * H).toFixed(3);

    // 3) сетка: прилёт по очереди (каждая карточка — 0.4 фазы, сдвиг 0.08), волна по времени
    const drop = ROW2_DROP * ease(seg(s, 4.55, 4.95));
    const A = geo.w / S0, Wd = geo.h / S0;
    const gridCards = [];
    let settled = true;
    ORDER.forEach((c, k) => {
      const r = clamp((H - 0.08 * k) / 0.4);
      const L = land[k];
      if (r < 1 || L.wave > 0) settled = false;
      if (r <= 0 && L.wave <= 0) return;
      L.waveT += 1.08 * dt;
      L.wave = r < 1 ? Math.min(1, L.wave + 1.8 * dt) : Math.max(0, L.wave - 0.72 * dt);
      const n = 1 - (1 - r) ** 3;
      const tx = (cellX(c) + geo.w / 2 - 720) / S0;
      const ty = (400 - (cellY(c) + (c.row === 2 ? drop : 0) + geo.h / 2)) / S0;
      const hw = view.hw / S0, hh = view.hh / S0;
      const sx = c.side === 0 ? -hw - 2 * A : c.side === 2 ? hw + 2 * A : tx;
      const sy = c.row === 1 ? hh + 2 * Wd : -hh - 2 * Wd;
      gridCards.push({ tex: c.i, x: sx + (tx - sx) * n, y: sy + (ty - sy) * n, w: A, h: Wd, wave: L.wave, waveT: L.waveT, col: c.side, row: c.row - 1 });
    });

    // 4) когда все сели и волна улеглась — GL-сетку прячем, видна DOM-сетка (тот же кадр)
    section.classList.toggle('is-grid', settled);
    // названия: по скроллу, но не раньше, чем сетка «села» (до этого DOM-карточки скрыты, и при быстром скролле
    // названия появлялись разом, скачком), по очереди и не быстрее NAME_IN секунд каждое
    nameClock = settled ? nameClock + dt : 0;
    cards.forEach((c, j) => {
      c.li.style.top = `calc(var(--u) * ${(cellY(c) + (c.row === 2 ? drop : 0)).toFixed(2)})`;
      const want = settled && nameClock > j * NAME_GAP ? ease(seg(s, 4.65 + j * 0.06, 5.0 + j * 0.06)) : 0;
      c.shown = settled ? c.shown + Math.max(-dt / 0.25, Math.min(dt / NAME_IN, want - c.shown)) : 0;
      const t = c.shown * c.shown * (3 - 2 * c.shown);
      c.name.style.opacity = t.toFixed(3);
      c.name.style.translate = `0 calc(var(--u) * ${(14 * (1 - t)).toFixed(2)})`;
    });
    const h = ease(seg(s, 5.0, 5.4));
    hint.style.opacity = h.toFixed(3);
    hint.style.translate = `0 ${(10 * (1 - h)).toFixed(1)}px`;

    scene.draw(ribbon, settled ? [] : gridCards, guides);
  }

  let active = false;
  gsap.ticker.add((time, deltaTime) => {
    const r = section.getBoundingClientRect();
    const on = r.top < innerHeight && r.bottom > 0;
    if (on !== active) { active = on; section.classList.toggle('is-on', on); }
    if (active) frame(Math.min(deltaTime / 1000, 0.05));
  });
  resize();
  window.addEventListener('resize', resize);
  frame(1 / 60);
  initRecipeModal(section);
  window.__recepty = { st, _debug: { state, frame, canvas: scene.canvas }, seek(p) { window.__hero?.lenis?.resize(); window.__hero?.lenis?.scrollTo(st.start + (st.end - st.start) * p, { immediate: true }); } };
}
