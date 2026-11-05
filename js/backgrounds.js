// Фоны блоков после Hero и переходы «прожигом» между ними (общий модуль для всех блоков).
// Остановки — DOM-блоки с прозрачным фоном: { el, color: [r,g,b], grid, cut?, overlay? } (см. bgfx.js):
// cut — без прожига (ровный стык по верху блока); edge — форма кромки прожига { amp, freq, mud };
// overlay — прожиг поверх DOM предыдущего блока на отдельном канвасе с опережением стыка (сейчас не используется:
// так входит блок 6, но его прожиг рисует сам блок — final.js, те же OVER_LEAD / OVER_EDGE).
// Новый блок: добавить остановку в STOPS и (если нужно) цвет хедера в THEMES.

import { BgFX } from './bgfx.js';

const { gsap, ScrollTrigger } = window;

// Прожиг-оверлей (stop.overlay): предыдущий блок закрыт DOM (фото), поэтому новый фон прожигает его поверх —
// отдельный прозрачный канвас над предыдущим блоком и под новым. Кромка идёт ВПЕРЕДИ стыка на OVER_LEAD экрана
// (новый фон съедает низ предыдущего блока, как прожиг 2 → 3), размах крупный — как shopify.com/editions/winter2026.
export const OVER_LEAD = 0.25;
export const OVER_EDGE = { amp: 0.6, freq: 1.35, mud: 0.1, spark: 0 };   // без искр — как прожиг 2 → 3

const STOPS = [
  { sel: '#belok', color: [1, 1, 1], grid: true },       // белый с тёмной сеткой
  // синий (свои линии — слоем поверх контента блока); вход — прожиг с тем же размахом кромки, что на входе в блок 6,
  // но в фоне: контент «Белка» он не перекрывает и идёт вровень со стыком блоков (без пустого синего под кромкой)
  // gridIn: пока блок въезжает, его белые линии (20 %) рисует фон — по всему синему, без стыка; когда блок встал —
  // включаются свои линии блока на том же месте (.vkusy__lines скрыты, пока у блока класс is-entering)
  { sel: '#vkusy', color: [0, 43 / 255, 1], grid: false, gridIn: 0.2, edge: { amp: OVER_EDGE.amp, freq: OVER_EDGE.freq, mud: OVER_EDGE.mud } },
  { sel: '#recepty', color: [1, 1, 1], grid: true, cut: true },  // белый с сеткой; без прожига — ровный стык, обычный скролл (решение автора)
  { sel: '#priznanie', color: [0, 0, 0], grid: false, cut: true }, // чёрный (у блока свой фон и свои светлые линии), ровный стык
  // блок 6 рисует свой фон сам (js/final.js: сцена на фиксированном канвасе, вход — тем же прожигом, что OVER_EDGE ниже);
  // здесь — только остановка для цвета под ним (без оверлея)
  { sel: '#final', color: [0, 0, 0], grid: false, cut: true },
];
// цвет хедера на блоке: true — тёмный (на светлом фоне), false — белый
const THEMES = [
  { sel: '#belok', dark: true },
  { sel: '#vkusy', dark: false },
  { sel: '#recepty', dark: true },
  { sel: '#priznanie', dark: false },
  { sel: '#final', dark: () => (window.__final?.white ?? 0) > 0.5 },   // сцена — белый хедер, белый экран после вспышки — тёмный
];

export async function initBackgrounds() {
  const canvas = document.querySelector('.bgfx');
  const stops = STOPS.map(s => ({ ...s, el: document.querySelector(s.sel) })).filter(s => s.el);
  if (!canvas || !stops.length) return;

  const bg = new BgFX(canvas, stops);
  await bg.loadGrid('img/grid-lines-dark.svg?v=3');
  await bg.loadGridIn('img/vkusy/lines.svg');
  window.addEventListener('resize', () => bg.resize());

  // включается, когда верх первого блока дошёл до верха экрана: в этот момент под ним
  // белая сцена Hero с той же сеткой, поэтому подмена незаметна.
  // Проверка по положению каждый кадр (не ScrollTrigger с end: 'max' — тот считался по короткой
  // странице, пока блоки ниже ещё не выросли, и после прожига канвас выключался → чёрный фон).
  let on = false;
  gsap.ticker.add(t => {
    const now = stops[0].el.getBoundingClientRect().top <= 0;
    if (now !== on) { on = now; canvas.classList.toggle('is-on', on); }
    for (const s of stops) if (s.gridIn) s.el.classList.toggle('is-entering', s.el.getBoundingClientRect().top > 0);
    if (on) bg.draw(t);
  });

  // прожиг поверх контента (режим «lead»): кромка впереди стыка; пока верх нового блока ниже экрана на OVER_LEAD —
  // кромка уже входит снизу; когда верх дошёл до верха экрана — экран целиком новый, оверлей выключается
  const overlayStops = stops.filter(s => s.overlay);
  if (overlayStops.length) {
    const oc = document.createElement('canvas');
    oc.className = 'bgfx bgfx--over';
    overlayStops[0].el.before(oc);   // в потоке перед новым блоком: поверх предыдущего блока, под новым (у блоков одинаковый z-index)
    const ov = new BgFX(oc, overlayStops, { overlay: true });
    await ov.loadGrid('img/grid-lines-dark.svg?v=3');
    window.addEventListener('resize', () => ov.resize());
    let ovOn = false;
    window.__bgOver = { ov, oc };   // отладка
    gsap.ticker.add(t => {
      const vh = innerHeight;
      let cur = null, p = 0;
      for (const s of overlayStops) {
        const top = s.el.getBoundingClientRect().top;
        if (top > 0 && top < vh * (1 + OVER_LEAD)) { cur = s; p = (vh - top) / vh + OVER_LEAD; }
      }
      if (!!cur !== ovOn) { ovOn = !!cur; oc.classList.toggle('is-on', ovOn); }
      if (cur) ov.drawState(t, null, cur, p, OVER_EDGE);
    });
  }

  // хедер: цвет по блоку, верх которого уже прошёл середину хедера (когда фронт прожига проходит хедер).
  // Проверяется каждый кадр по фактическому значению: скраб Hero (тёмный хедер с 1800) при пересчёте
  // раскладки или прыжке скролла может перекрасить хедер обратно — тогда цвет просто восстанавливается.
  const hdr = document.querySelector('.hdr');
  const zones = THEMES.map(t => ({ ...t, el: document.querySelector(t.sel) })).filter(t => t.el);
  let tween = null;
  gsap.ticker.add(() => {
    if (!hdr || !zones.length) return;
    let want = null;
    for (const z of zones) if (z.el.getBoundingClientRect().top <= 44 + (z.lead ? innerHeight * (OVER_LEAD + 0.2) : 0)) want = typeof z.dark === 'function' ? z.dark() : z.dark;
    if (want === null) return;                        // выше первого такого блока цвет ведёт Hero
    const ink = want ? '#030303' : '#ffffff';
    if (tween?.isActive() || hdr.style.getPropertyValue('--ink').trim() === ink) return;
    tween = gsap.to(hdr, { '--ink': ink, '--inv': want ? 1 : 0, duration: 0.35, ease: 'power1.out' });
  });
}
