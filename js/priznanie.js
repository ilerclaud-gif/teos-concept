// Блок 5 «Признание элитой» (макеты design/5 блок/05-nagradi: start2, zal otkrit3, krupni plan, final).
// Всё — по скроллу (обратимо), кроме высекания надписи и строк текстов (по времени, при достижении точки):
//  0) на чёрном экране от руки пишется «Awards» (перо идёт по осевым линиям штрихов — js/priznanie-awards.js);
//  1) под надписью из точки вырастает проём-арка (форма автора — img/priznanie/arka.svg, без обводки), в нём — зал;
//  2) клип 1 «въезд в зал» (seq/pz1): камера едет к витрине, арка растёт до краёв экрана, «Awards» плавно гаснет;
//  3) без остановки — клип 2 «подход к витрине» (seq/pz2): скролл ведёт общий наезд камеры через оба клипа равномерно
//     (PZ_ZOOM1/2 — ln-масштаб по кадрам), скорость на стыке не меняется; на постаменте высекается «Достойно / Богов.»
//     (по времени: буквы проступают сверху вниз, как под резцом, с каменной крошкой) — слой img/priznanie/nadpis.webp
//     поверх видео, по движению постамента (js/priznanie-motion.js) — надпись держится на камне и уходит с ним вниз;
//  4) на крупном плане выкатываются строки «Подтверждено жюри.», подзаголовок и описание;
//  5) финал (макет final): тексты уходят, камера доезжает до медалей (×2.38), под медалями — подписи и звёздочка;
//     затем подписи уходят, камера отъезжает обратно — крупный план целиком, без текста;
//     для резкости поверх крупного плана лежит фрагмент с медалями в полном разрешении (medali.webp).
// Выход из блока — прожигом следующего блока (backgrounds.js, остановка #final, режим «lead»).
// Кадры клипов и неподвижные кадры — 16:9, масштаб как у текстов (кадр 1440×800 по --u), но не меньше экрана по высоте;
// на экранах шире 1440×800 по бокам — тот же кадр, размытый и затемнённый (поля незаметны). Тексты — сетка (--uw) и кадр 800 (--u).

import { Track, FrameStore } from './frames.js';
import { AWARDS_STROKES } from './priznanie-awards.js';
import { PZ2_MOTION, PZ_ZOOM1, PZ_ZOOM2, PZ_FLOW1, PZ_FLOW2 } from './priznanie-motion.js';

const { gsap, ScrollTrigger } = window;

const IMG_AR = 16 / 9;
// арка на старте: 70 % от макета start (174×251 → 121.8×175.7), центр (720, 401.5) кадра 1440×800
const ARCH = { w: 121.8, h: 175.7, cy: 401.5, r: 60.79 };
// крупный план (16:9, доли кадра): фрагмент с медалями в полном разрешении; финал — точка между медалями (qx, qy)
// встаёт в (tx, ty) кадра 1440×800, масштаб ×z к cover (замеры по макету final)
const MEDALI = { x: 0.29032, y: 0.57975, w: 0.42036, h: 0.42025 };
const FINAL = { qx: 0.50459, qy: 0.76747, tx: 734.1, ty: 361.1, z: 2.381 };
// высеченная надпись на неподвижном общем кадре (3840×2160): слой и рамки букв [x0, x1, верх, низ]
const NADPIS = { x: 1483, y: 1626, w: 874, h: 475 };
const LETTERS = [
  [1513.4, 1639.1, 1666.6, 1867.4], [1639.1, 1736.7, 1666.6, 1867.4], [1736.7, 1831.1, 1666.6, 1867.4], [1831.1, 1923.4, 1666.6, 1867.4],
  [1923.4, 2020.9, 1666.6, 1867.4], [2020.9, 2125.5, 1666.6, 1867.4], [2125.5, 2229, 1666.6, 1867.4], [2229, 2326.6, 1666.6, 1867.4],
  [1656, 1758.4, 1860.1, 2060.9], [1758.4, 1856, 1860.1, 2060.9], [1856, 1932.9, 1860.1, 2060.9], [1932.9, 2029.9, 1860.1, 2060.9],
  [2029.9, 2131.9, 1860.1, 2060.9], [2131.9, 2184, 1860.1, 2060.9],
];
const CARVE = { step: 0.085, dur: 0.32 };
// «Awards» (design/5 блок/Group 1437255993.svg, 1410×771): положение в кадре 1440×800 (макет start2)
const AWARDS = { x: 15.6, y: 11.3, w: 1410, h: 771 };
// сценарий: S — экраны от «верх блока у низа экрана», s = S − 1 — экраны после закрепления (.pz__pin = (1 + PIN_S) × 100vh)
const PIN_S = 8.6;
const T = {
  write: [-0.65, 0.35],          // «Awards» пишется по скроллу: блок въезжает → чуть после закрепления
  appear: [0.35, 0.7],           // арка вырастает из точки
  move: [0.7, 4.4],              // камера: клип 1 → клип 2 (общий наезд, плавный старт и финиш); стык и рост арки — из него
  awardsOut: [0.9, 2.2],
  close: 4.45, closeOut: 5.15, final: [5.2, 6.1], captions: 5.95,
  capsOut: 6.95,                 // подписи наград уходят
  back: [7.0, 7.9],              // отъезд от медалей: крупный план целиком, без текста — и переход в блок 6
};

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
// общий наезд: L ∈ [0, L1 + L2]; стык клипов — при L = L1. Скорость камеры по скроллу: плавный старт и финиш,
// а у стыка — плавное замедление до 30 % (не остановка): постамент с высекаемой надписью дольше в кадре.
const L1 = PZ_ZOOM1[PZ_ZOOM1.length - 1], L2 = PZ_ZOOM2[PZ_ZOOM2.length - 1];
const MOVE = (() => {
  const N = 2000, uJ = L1 / (L1 + L2), xs = [0];
  const v = u => {
    const ends = Math.min(1, 0.15 + Math.min(u, 1 - u) / 0.1);                    // разгон / торможение у краёв
    const dip = 1 - 0.7 * Math.exp(-(((u - uJ) / 0.07) ** 2));                     // замедление у стыка
    return ends * dip;
  };
  for (let i = 1; i <= N; i++) xs.push(xs[i - 1] + 1 / N / v((i - 0.5) / N));
  return xs.map(x => x / xs[N]);                                                     // доля скролла для u = i / N
})();
const moveL = s => {
  const x = clamp((s - T.move[0]) / (T.move[1] - T.move[0]));
  let lo = 0, hi = MOVE.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (MOVE[m] < x) lo = m; else hi = m; }
  const u = (lo + (x - MOVE[lo]) / Math.max(MOVE[hi] - MOVE[lo], 1e-9)) / (MOVE.length - 1);
  return (L1 + L2) * u;
};
/** индекс кадра (дробный) по ln-наезду в монотонной таблице */
function frameAt(zoom, L) {
  if (L <= zoom[0]) return 0;
  for (let i = 1; i < zoom.length; i++) if (zoom[i] >= L) return i - 1 + (L - zoom[i - 1]) / Math.max(zoom[i] - zoom[i - 1], 1e-6);
  return zoom.length - 1;
}
const S_JOIN = (() => { let lo = T.move[0], hi = T.move[1]; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (moveL(m) < L1) lo = m; else hi = m; } return hi; })();
const seg = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** строка, выкатывающаяся снизу (как в окнах рецептов) */
const line = html => `<span class="pz__ln"><span class="pz__in">${html}</span></span>`;

export function initPriznanie() {
  const section = document.querySelector('#priznanie');
  if (!section) return;
  const pin = section.querySelector('.pz__pin');
  const scene = section.querySelector('.pz__scene');
  const canvas = section.querySelector('.pz__canvas');
  const cx = canvas.getContext('2d');
  const frame = section.querySelector('.pz__frame');
  const caps = section.querySelector('.pz__caps');

  // тексты крупного плана и финала — строками
  for (const el of frame.querySelectorAll('[data-lines]')) {
    el.innerHTML = el.dataset.lines.split('|').map(t => line(t)).join('');
  }
  const lines = [...frame.querySelectorAll('.pz__texts .pz__in')];
  const capLines = [...frame.querySelectorAll('.pz__caps .pz__in')];
  gsap.set([...lines, ...capLines], { yPercent: 115 });

  // «Awards»: растровая надпись под маской — перо идёт по осевым линиям штрихов (письмо от руки; прогресс — скролл)
  const NS = 'http://www.w3.org/2000/svg';
  const aw = document.createElementNS(NS, 'svg');
  aw.setAttribute('class', 'pz__awards');
  aw.setAttribute('viewBox', `0 0 ${AWARDS.w} ${AWARDS.h}`);
  aw.setAttribute('aria-hidden', 'true');
  aw.innerHTML = `<defs><mask id="pz-aw" maskUnits="userSpaceOnUse" x="-40" y="-40" width="${AWARDS.w + 80}" height="${AWARDS.h + 80}">${
    AWARDS_STROKES.map(st => `<path d="${st.d}" fill="none" stroke="#fff" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`).join('')
  }</mask></defs><image href="img/priznanie/awards.webp" width="${AWARDS.w}" height="${AWARDS.h}" mask="url(#pz-aw)"/>`;
  frame.before(aw);
  const pens = [...aw.querySelectorAll('mask path')];
  // доли общего пути пера на каждый штрих (с короткими «переносами» пера между штрихами)
  const GAP = 40;
  const span = AWARDS_STROKES.reduce((sum, st) => sum + st.len + GAP, -GAP);
  let acc = 0;
  const penRange = AWARDS_STROKES.map(st => { const r = [acc / span, (acc + st.len) / span]; acc += st.len + GAP; return r; });
  const lastPen = pens.map(() => -1);

  // ---------- кадры ----------
  const store = new FrameStore();
  const clips = [new Track('pz1', [{ seg: 'pz1', from: 0, to: 121 }]), new Track('pz2', [{ seg: 'pz2', from: 0, to: 121 }])];
  const img = {};
  const state = { S: 0, dirty: true, dir: 1 };
  let loading = null;
  function preload() {
    if (loading) return;
    loading = Promise.all([
      ...['wide', 'close', 'medali', 'nadpis'].map(n => loadImg(`img/priznanie/${n}.webp`).then(i => { img[n] = i; state.dirty = true; })),
      store.load(clips).then(() => { state.dirty = true; }),
    ]).catch(err => console.error('priznanie', err));
  }

  // ---------- раскладка ----------
  const view = { u: 1, vw: 0, vh: 0, dpr: 1, aMax: 1 };
  function layout() {
    view.vw = innerWidth; view.vh = innerHeight;
    view.u = Math.min(view.vw / 1440, view.vh / 800);
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.vw * view.dpr);
    canvas.height = Math.round(view.vh * view.dpr);
    // масштаб арки, при котором она закрывает весь экран (бока и низ — за краем, углы экрана — внутри полукруга)
    const u = view.u, hw = view.vw / 2, top = -view.vh / 2, bot = view.vh / 2;
    const cyOff = (ARCH.cy - 400) * u;
    let lo = 1, hi = 400;
    for (let i = 0; i < 50; i++) {
      const a = (lo + hi) / 2;
      const r = ARCH.r * a * u, arcCy = cyOff - (ARCH.h / 2) * a * u + r, bottom = cyOff + (ARCH.h / 2) * a * u;
      const ok = r >= hw && bottom >= bot && (arcCy <= top || Math.hypot(hw, arcCy - top) <= r);
      if (ok) hi = a; else lo = a;
    }
    view.aMax = hi * 1.02;
    state.dirty = true;
  }
  /** прямоугольник кадра 16:9 (px канваса): ширина как у кадра текстов (1440 --u), но не меньше экрана по высоте;
   *  на широких экранах по бокам остаются поля (их заполняет drawLayer) */
  function cover() {
    const W = canvas.width, H = canvas.height;
    const w = Math.max(1440 * view.u * view.dpr, H * IMG_AR), h = w / IMG_AR;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  // поля по бокам: тот же кадр, уменьшенный до 192×108 и растянутый (размытие), затемнённый; к краям кадра — мягкий переход
  const small = document.createElement('canvas'); small.width = 192; small.height = 108;
  const sx = small.getContext('2d');
  const mixC = document.createElement('canvas'); mixC.width = 1920; mixC.height = 1080;   // сведение двух соседних кадров клипа
  const mx = mixC.getContext('2d');
  const band = document.createElement('canvas');
  const bx = band.getContext('2d');
  function drawLayer(src, r) {
    const W = canvas.width, H = canvas.height;
    if (r.x > 0.5 && r.x + r.w < W - 0.5) {
      sx.drawImage(src, 0, 0, 192, 108);
      const fw = Math.max(W, H * IMG_AR), fh = fw / IMG_AR, fx = (W - fw) / 2, fy = (H - fh) / 2;
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(small, fx, fy, fw, fh);
      cx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      cx.fillRect(0, 0, W, H);
      cx.drawImage(src, r.x, r.y, r.w, r.h);
      // мягкий край кадра: поверх полосы у края — размытый слой с затуханием внутрь
      const F = Math.round(r.w * 0.1);
      if (F > 2) {
        band.width = F; band.height = H;
        for (const [ex, dir] of [[r.x, 1], [r.x + r.w - F, -1]]) {
          bx.globalCompositeOperation = 'source-over';
          bx.clearRect(0, 0, F, H);
          bx.drawImage(small, fx - ex, fy, fw, fh);
          bx.fillStyle = 'rgba(0, 0, 0, 0.3)'; bx.fillRect(0, 0, F, H);
          bx.globalCompositeOperation = 'destination-in';
          const g = bx.createLinearGradient(dir > 0 ? 0 : F, 0, dir > 0 ? F : 0, 0);
          g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          bx.fillStyle = g; bx.fillRect(0, 0, F, H);
          cx.drawImage(band, ex, 0);
        }
      }
    } else cx.drawImage(src, r.x, r.y, r.w, r.h);
  }

  // ---------- высекание надписи: буквы по очереди проступают сверху вниз, из-под «резца» летит каменная пыль ----------
  // M — отображение координат неподвижного кадра 3840×2160 на канвас: X = ox + x·k, Y = oy + y·k
  const carve = { on: false, t0: 0 };
  const dust = [];
  function drawEngraving(M, now, dt) {
    if (!img.nadpis || !carve.on) return;
    const { k } = M;
    const R = { x: M.ox, y: M.oy };
    const t = (now - carve.t0) / 1000;
    const o = { x: R.x + NADPIS.x * k, y: R.y + NADPIS.y * k, w: NADPIS.w * k, h: NADPIS.h * k };
    LETTERS.forEach(([x0, x1, top, bottom], i) => {
      const p = clamp((t - i * CARVE.step) / CARVE.dur);
      if (p <= 0) return;
      const pe = 1 - (1 - p) ** 2;
      // буква с запасом по краям (тень и блик выходят за контур)
      const lx = R.x + (x0 - 6) * k, rx = R.x + (x1 + 6) * k, ty = R.y + (top - 14) * k;
      const by = ty + (bottom - top + 28) * pe * k;
      cx.save();
      cx.beginPath(); cx.rect(lx, ty, rx - lx, by - ty); cx.clip();
      cx.drawImage(img.nadpis, o.x, o.y, o.w, o.h);
      cx.restore();
      // пыль у кромки резца
      if (p < 1 && dt > 0) {
        const n = Math.random() < 4 * dt * 60 * (1 - p) / 3 ? 1 + Math.floor(Math.random() * 3) : 0;   // редкие крошки
        for (let j = 0; j < n; j++) {
          dust.push({ x: lx + Math.random() * (rx - lx), y: by, vx: (Math.random() - 0.5) * 480 * k, vy: (-Math.random() * 360 - 80) * k,
            life: 0.35 + Math.random() * 0.45, age: 0, r: (0.6 + Math.random() * 1.1) * view.dpr });
        }
      }
    });
    // частицы: разлетаются вверх-в стороны и падают, гаснут
    const g = 3600 * k;
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.age += dt; d.vy += g * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.age >= d.life) { dust.splice(i, 1); continue; }
      cx.fillStyle = `rgba(232, 226, 214, ${((1 - d.age / d.life) * 0.75).toFixed(3)})`;
      cx.beginPath(); cx.arc(d.x, d.y, d.r, 0, Math.PI * 2); cx.fill();
    }
  }

  // ---------- сценарий ----------
  const st = ScrollTrigger.create({
    trigger: pin, start: 'top bottom', end: 'bottom bottom',
    onUpdate: t => { state.S = t.progress * (1 + PIN_S); state.dir = t.direction; state.dirty = true; },
  });
  let closeIn = false, capsIn = false, lastMask = '';
  const dbg = {};

  function frameFn(now, dt) {
    const S = state.S, s = S - 1;
    let busy = false;
    // 0) «Awards» пишется по скроллу
    const wp = seg(s, ...T.write);
    pens.forEach((pen, i) => {
      const [f0, f1] = penRange[i];
      const v = +(1 - clamp((wp - f0) / (f1 - f0))).toFixed(4);
      if (v !== lastPen[i]) { lastPen[i] = v; pen.setAttribute('stroke-dashoffset', v); }
    });
    aw.style.opacity = (1 - ease(seg(s, ...T.awardsOut))).toFixed(3);

    // 1–2) арка: вырастает из точки, затем растёт до краёв экрана (логарифмически — рост выглядит равномерным)
    const ap = 1 - (1 - seg(s, ...T.appear)) ** 3;
    const ta = easeInOut(seg(s, T.move[0], S_JOIN));
    const a = Math.max(0.001, ap) * Math.exp(Math.log(view.aMax) * ta);
    const u = view.u;
    scene.style.opacity = ap.toFixed(3);
    let mask = 'none';
    if (ta < 1) {
      const W = ARCH.w * a * u, H = ARCH.h * a * u;
      const x = view.vw / 2 - W / 2, y = view.vh / 2 + (ARCH.cy - 400) * u - H / 2;
      mask = `${W.toFixed(1)}px ${H.toFixed(1)}px|${x.toFixed(1)}px ${y.toFixed(1)}px`;
    }
    if (mask !== lastMask) {
      lastMask = mask;
      if (mask === 'none') { scene.style.maskImage = scene.style.webkitMaskImage = 'none'; }
      else {
        const [size, pos] = mask.split('|');
        scene.style.maskImage = scene.style.webkitMaskImage = 'url(img/priznanie/arka.svg)';
        scene.style.maskSize = scene.style.webkitMaskSize = size;
        scene.style.maskPosition = scene.style.webkitMaskPosition = pos;
      }
    }

    // 3) высекание — по времени, со стыка клипов; назад — сбрасывается
    if (!carve.on && s > S_JOIN) { carve.on = true; carve.t0 = now; dust.length = 0; }
    else if (carve.on && s < S_JOIN - 0.15) { carve.on = false; dust.length = 0; }

    const R = cover();
    cx.fillStyle = '#000';
    cx.fillRect(0, 0, canvas.width, canvas.height);
    // Кадр клипа с дробным номером f: кадр i «доезжает» до i+1 по замеренному движению камеры (flow: [k, dx, dy]) и
    // плавно сменяется им — камера идёт ровно при любой скорости скролла, без шагов по кадрам. Возвращает [i, t].
    const drawFrame = (track, flow, f, fallback) => {
      const i = Math.min(Math.floor(f), flow.length), t = Math.min(1, f - i);
      const A = store.get(track, i), B = t > 0.004 && i < flow.length ? store.get(track, i + 1) : null;
      store.prefetch(track, i, state.dir);
      if (i < flow.length) store.request(track, i + 1);
      const [k, dx, dy] = flow[Math.min(i, flow.length - 1)];
      const cxm = R.x + R.w / 2, cym = R.y + R.h / 2;
      if (A && t <= 0.004) drawLayer(A, R);
      else if (A) {
        // оба кадра сводятся на отдельном холсте размером с кадр, и на экран идёт уже готовый кадр — края кадра
        // (и размытые поля по бокам на широких экранах) стоят на месте, без швов
        const W = mixC.width, H = mixC.height, sA = Math.max(1, k ** t);
        mx.globalAlpha = 1;
        mx.drawImage(A, W / 2 * (1 - sA) + t * dx * W, H / 2 - W / 2 * sA * (H / W) + t * dy * W, W * sA, H * sA);
        if (B) {
          const sB = k ** (t - 1);
          mx.globalAlpha = t;
          mx.drawImage(B, W / 2 - (W / 2 + dx * W) * sB + t * dx * W, H / 2 - (H / 2 + dy * W) * sB + t * dy * W, W * sB, H * sB);
        } else if (i < flow.length) busy = true;
        drawLayer(mixC, R);
      } else {
        const bmp = store.nearest(track, i)?.bmp || fallback;
        if (bmp) drawLayer(bmp, R);
        busy = true;                                     // кадр ещё декодируется — перерисовать на следующих тиках
      }
      return [i, t];
    };
    const L = moveL(s);
    Object.assign(dbg, { s, L, join: S_JOIN, carve: carve.on });
    if (s < T.move[1] && L < L1) {
      drawFrame(clips[0], PZ_FLOW1, frameAt(PZ_ZOOM1, L), img.wide);
      // начало клипа 2 — заранее в память (иначе на стыке мелькнёт другой кадр)
      if (L > L1 * 0.6) for (let i = 0; i < 16; i++) store.request(clips[1], i);
      dbg.clip = 1; dbg.f = frameAt(PZ_ZOOM1, L);
    } else if (s < T.move[1]) {
      const f = frameAt(PZ_ZOOM2, L - L1);
      dbg.clip = 2; dbg.f = f;
      const [i, t] = drawFrame(clips[1], PZ_FLOW2, f, f < 60 ? img.wide : img.close);
      // надпись идёт за постаментом так же плавно — между замерами соседних кадров
      const m0 = PZ2_MOTION[i], m1 = PZ2_MOTION[Math.min(i + 1, PZ2_MOTION.length - 1)];
      const m = m0.map((v, q) => v + (m1[q] - v) * t);
      const kf = R.w / 1920;
      drawEngraving({ ox: R.x + m[1] * kf, oy: R.y + m[2] * kf, k: m[0] * 0.5 * kf }, now, dt);
      if (carve.on && ((now - carve.t0) / 1000 < LETTERS.length * CARVE.step + CARVE.dur || dust.length)) busy = true;
    } else if (img.close) {
      // 5) финал: точка между медалями — из своего места в целевую точку кадра, масштаб растёт до FINAL.z
      const tf = easeInOut(seg(s, ...T.final)) * (1 - easeInOut(seg(s, ...T.back)));
      const z = Math.exp(Math.log(FINAL.z) * tf);
      const qx = R.x + FINAL.qx * R.w, qy = R.y + FINAL.qy * R.h;
      const tx = canvas.width / 2 + (FINAL.tx - 720) * u * view.dpr, ty = canvas.height / 2 + (FINAL.ty - 400) * u * view.dpr;
      const px = qx + (tx - qx) * tf, py = qy + (ty - qy) * tf;
      const Z = { x: px - FINAL.qx * R.w * z, y: py - FINAL.qy * R.h * z, w: R.w * z, h: R.h * z };
      drawLayer(img.close, Z);
      if (img.medali && z > 1.02) cx.drawImage(img.medali, Z.x + MEDALI.x * Z.w, Z.y + MEDALI.y * Z.h, MEDALI.w * Z.w, MEDALI.h * Z.h);
    }

    // 4) тексты крупного плана — по времени (строки выкатываются снизу); уход вверх — ещё и прозрачностью
    const wantClose = s > T.close && s < T.closeOut;
    if (wantClose && !closeIn) { closeIn = true; gsap.to(lines, { yPercent: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.04, overwrite: true }); }
    else if (!wantClose && closeIn && (s < T.close - 0.15 || s > T.closeOut)) { closeIn = false; const up = s > T.closeOut; gsap.to(lines, { yPercent: up ? -115 : 115, opacity: up ? 0 : 1, duration: 0.45, ease: 'power2.in', stagger: 0.015, overwrite: true }); }
    // подписи под медалями — когда камера доехала
    if (!capsIn && s > T.captions && s < T.capsOut) { capsIn = true; gsap.to(capLines, { yPercent: 0, duration: 0.8, ease: 'power3.out', stagger: 0.05, overwrite: true }); caps.classList.add('is-in'); }
    else if (capsIn && (s < T.captions - 0.15 || s > T.capsOut)) { capsIn = false; gsap.to(capLines, { yPercent: s > T.capsOut ? -115 : 115, duration: 0.4, ease: 'power2.in', stagger: 0.015, overwrite: true }); caps.classList.remove('is-in'); }
    return busy;
  }

  let active = false, busy = false, last = 0;
  gsap.ticker.add(() => {
    const r = section.getBoundingClientRect();
    if (r.top < innerHeight * 3 && r.bottom > -innerHeight) preload();
    const on = r.top < innerHeight && r.bottom > 0;
    if (on !== active) { active = on; section.classList.toggle('is-on', on); state.dirty = true; }
    const now = performance.now();
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (active && (state.dirty || busy)) { state.dirty = false; busy = frameFn(now, dt); }
  });
  layout();
  window.addEventListener('resize', layout);
  window.__priznanie = { st, store, dbg, state, preload, frame: () => frameFn(performance.now(), 1 / 60), canvas, seek(p) { window.__hero?.lenis?.resize(); window.__hero?.lenis?.scrollTo(st.start + (st.end - st.start) * p, { immediate: true }); } };
}
