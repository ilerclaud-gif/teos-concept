// Блок 3 «Вкусы» — вступление (макеты design/3 блок/03-vkus и 03-vkus razlet).
// Голова статуи, в разрыве тесно от баночек. До скролла баночки чуть «толкаются» (по времени).
// По скроллу (обратимо): буквы «Семь / характеров.» и подзаголовка разлетаются по одной, все баночки вылетают
// из головы вверх и в стороны (6 из них проходят через положения макета «разлёт»); голова пустеет и
// «отклеивается», как наклейка (js/peel.js, механика trevornoah.com), открывая синий; дальше — следующая часть.
// Кадр выше экрана: сначала едет со страницей, затем стоит (sticky), пока идут разлёт и отклеивание.
//
// Все координаты — в единицах макета 1440 (1 ед. = innerWidth / 1440 px).

import { Peel } from './peel.js';

const { gsap, ScrollTrigger } = window;

// раскладка «сложены» — из tools/compose-golova.swift (холст 1800×1700) и перевод в макет:
// в макете композиция стоит с масштабом 0.6496 и сдвигом (136.4, 330.4)
const COMP = { k: 0.6496, x: 136.4, y: 330.4, jarW: 340 };
// f — номер файла img/vkusy/jar-N: 1 Натуральный, 2 Манго и чиа, 3 Грецкий орех и мёд, 4 Злаки, 5 Черника, 6 Вишня, 7 Клубника
const PILE = [
  { f: 1, x: 965, y: 552, r: 6, s: 1.1 },               // «Натуральный» на вершине
  { f: 6, x: 825, y: 625, r: -14 }, { f: 3, x: 1105, y: 627, r: 17 },
  { f: 7, x: 610, y: 728, r: 24 }, { f: 5, x: 855, y: 747, r: -8 }, { f: 2, x: 1085, y: 748, r: 11 }, { f: 4, x: 1290, y: 687, r: -22 },
  { f: 3, x: 560, y: 854, r: -18 }, { f: 6, x: 760, y: 822, r: 9 }, { f: 1, x: 960, y: 872, r: -5 }, { f: 7, x: 1160, y: 823, r: 14 }, { f: 2, x: 1335, y: 820, r: 27 },
];
// положения в макете «разлёт» (центр, угол) — через них проходят эти баночки (ключ — индекс в PILE)
const MID = {
  0: { x: 758, y: 514, r: 5 },     // Натуральный
  1: { x: 336, y: 453, r: -62 },   // Вишня
  3: { x: 509, y: 600, r: -25 },   // Клубника
  2: { x: 1023, y: 580, r: 30 },   // Грецкий орех
  5: { x: 1145, y: 448, r: 70 },   // Манго
  6: { x: 275, y: 733, r: -80 },   // Злаки
};
// баночка 720 px + поле 111 px под тень (tools/export-vkusy.swift)
const JAR_IMG = { w: 942, jar: 720 };

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/** Разбить текст на буквы (span.ch), сохранив <em> и <br> */
function split(root) {
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const word of child.textContent.split(/(\s+)/)) {
          if (!word) continue;
          if (/^\s+$/.test(word)) { frag.append(document.createTextNode(' ')); continue; }
          const w = document.createElement('span');
          w.style.whiteSpace = 'nowrap';
          for (const c of word) {
            const s = document.createElement('span');
            s.className = 'ch';
            s.textContent = c;
            w.append(s);
          }
          frag.append(w);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') walk(child);
    }
  };
  walk(root);
  return [...root.querySelectorAll('.ch')];
}

export async function initVkusy() {
  const section = document.querySelector('#vkusy');
  if (!section) return;
  const intro = section.querySelector('.vkusy__intro');
  const frame = section.querySelector('.vkusy__frame');
  const jarsBox = section.querySelector('.vkusy__jars');
  const heads = [...section.querySelectorAll('.vkusy__head')];
  const peelCanvas = section.querySelector('.vkusy__peel');

  await document.fonts.load('700 100px "Bebas Neue Pro"');

  // ---------- буквы ----------
  const letters = [...section.querySelectorAll('.vkusy__word')].flatMap(split);
  const subLetters = split(section.querySelector('.vkusy__sub'));

  // ---------- баночки ----------
  const jars = PILE.map((p, i) => {
    const el = document.createElement('div');
    el.className = 'vk-jar';
    const img = document.createElement('img');
    img.src = `img/vkusy/jar-${p.f}.webp`;
    img.alt = '';
    img.decoding = 'async';
    el.append(img);
    jarsBox.append(el);
    const x = COMP.x + p.x * COMP.k, y = COMP.y + p.y * COMP.k;
    const w = COMP.jarW * COMP.k * (p.s || 1);         // ширина самой баночки, ед.
    el.style.left = `calc(var(--uw) * ${x.toFixed(1)})`;
    el.style.top = `calc(var(--uw) * ${y.toFixed(1)})`;
    // в картинке поле под тень
    const imgW = w * JAR_IMG.w / JAR_IMG.jar;
    img.style.width = `calc(var(--uw) * ${imgW.toFixed(1)})`;
    gsap.set(el, { rotation: p.r });
    return { el, img, p, x, y, w, i, phase: rnd(0, Math.PI * 2), freq: rnd(0.7, 1.3), live: 1 };
  });

  // ---------- отклеивание головы ----------
  // текстура — задний слой головы (это и есть вся голова: изнанка + лицо); баночек к этому моменту нет
  const headImg = heads[0];
  // decode() во фоновой вкладке может не завершиться — не ждём дольше 1.5 с (картинка уже загружена)
  if (!headImg.complete) await new Promise(r => headImg.addEventListener('load', r, { once: true }));
  await Promise.race([headImg.decode().catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
  const peel = new Peel(peelCanvas, headImg);
  const HEAD = { x: 405.3, y: 801.4, w: 631.4, h: 633.4 };   // как .vkusy__head в CSS (ед.)
  const peelState = { p: 0 };
  let peelOn = false;
  const setPeel = on => {
    if (on === peelOn) return;
    peelOn = on;
    peelCanvas.style.visibility = on ? 'visible' : 'hidden';
    heads.forEach(h => (h.style.visibility = on ? 'hidden' : ''));
  };

  // ---------- «толкание» до скролла: каждая баночка чуть покачивается и подпрыгивает ----------
  // live (1 → 0) гасит его, когда баночка начинает лететь
  gsap.ticker.add(time => {
    const uw = innerWidth / 1440;
    for (const j of jars) {
      if (j.live <= 0.001) { j.img.style.transform = ''; continue; }
      const t = time * j.freq + j.phase;
      // толчки: основная волна + короткие «пинки» соседей
      const kick = Math.max(0, Math.sin(t * 2.3)) ** 6;
      const dx = (Math.sin(t) * 1.6 + kick * 2.2) * uw * j.live;
      const dy = (Math.sin(t * 1.7 + 1) * 1.8 - kick * 3.5) * uw * j.live;
      const rot = (Math.sin(t * 1.3 + 2) * 1.6 + kick * 1.4) * j.live;
      j.img.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
    }
  });

  // ---------- сценарий по скроллу ----------
  let tl;
  function build() {
    const progress = tl?.scrollTrigger?.progress ?? 0;
    if (tl) { tl.scrollTrigger?.kill(); tl.progress(0).kill(); }

    const uw = innerWidth / 1440;
    const vhU = innerHeight / uw;               // высота экрана в единицах макета
    // 1-я остановка (разлёт): на экране «характеров.», баночки и как можно больше головы —
    //   низ головы (1435) у низа экрана, но верх «характеров.» (456) не уходит за верх экрана
    const S = Math.max(0, Math.min(1455 - vhU, 440));
    // 2-я остановка (отклеивание): голова на экране целиком — низ головы (1435) в 25 ед. от низа экрана
    //   (на невысоких экранах верх головы может зайти под хедер — низ важнее)
    const S2 = Math.max(S, 1435 + 25 - vhU);
    const P = 1.2 * vhU;                         // масштаб разлёта: от него считаются старты и длительности
    const R0 = S * 0.8;                          // разлёт начинается чуть раньше, чем кадр встал
    const Pp = 1.15 * vhU;                       // отклеивание (кадр стоит)
    // шкала — в единицах прокрутки (1 ед. времени = 1 ед. макета скролла); длина L известна после разлёта
    const at = u => u;
    let L = 0;
    const top = S;                               // верх экрана в координатах кадра во время разлёта

    // холст отклеивания: на весь экран во время 2-й остановки
    const view = { x: 0, y: S2, w: 1440, h: vhU };
    peelCanvas.style.top = `calc(var(--uw) * ${view.y.toFixed(1)})`;
    peelCanvas.style.height = `calc(var(--uw) * ${view.h.toFixed(1)})`;
    peel.layout(HEAD, view, uw);
    peel.draw(peelState.p);

    tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: intro, start: 'top top', end: () => `+=${L * uw}`, scrub: true,
        // «толкание» гаснет к моменту, когда баночка срывается с места
        onUpdate: () => { const t = tl.time(); for (const j of jars) j.live = Math.max(0, 1 - t / Math.max(0.001, j.launch)); },
      },
    });

    // кадр: едет со скоростью прокрутки до 1-й остановки (разлёт)
    tl.fromTo(frame, { y: 0 }, { y: -S * uw, duration: at(S) }, 0);

    // буквы заголовка: каждая в свою сторону, вверх, с вращением, чуть крупнее (как баночки)
    const all = [...letters.map(el => ({ el, sub: false })), ...subLetters.map(el => ({ el, sub: true }))];
    const sRect = frame.getBoundingClientRect();
    for (const { el, sub } of all) {
      const r = el.getBoundingClientRect();
      const cx = (r.left + r.width / 2 - sRect.left) / uw, cy = (r.top + r.height / 2 - sRect.top) / uw;
      const dirX = (cx - 720) / 720;                        // −1…1 от центра
      const tx = dirX * rnd(380, 820) + rnd(-140, 140);
      const ty = (top - rnd(350, 700)) - cy;               // заканчивают выше экрана
      const start = R0 + (sub ? rnd(0, 0.14) : rnd(0.02, 0.2)) * P;
      const dur = rnd(0.2, 0.3) * P;
      tl.fromTo(el, { x: 0, y: 0, rotation: 0, scale: 1 }, {
        x: tx * uw, y: ty * uw, rotation: rnd(40, 160) * pick([-1, 1]), scale: sub ? rnd(1, 1.4) : rnd(1.05, 1.5),
        ease: 'power1.in', duration: at(dur),
      }, at(start));
    }

    // баночки: каскадом, верхние раньше; 6 проходят через положения макета «разлёт»
    const order = [...jars].sort((a, b) => a.y - b.y);
    let lastEnd = 0;
    order.forEach((j, n) => {
      const start = R0 + n * P * 0.016;
      j.launch = start + P * 0.02;
      const dur = rnd(0.26, 0.34) * P;
      lastEnd = Math.max(lastEnd, start + dur);
      const side = j.x < 720 ? -1 : 1;
      // финиш: выше экрана или за боковым краем
      const end = Math.random() < 0.55
        ? { x: 720 + side * rnd(150, 760) - j.x, y: rnd(top - 650, top - 260) - j.y }
        : { x: (side < 0 ? rnd(-420, -260) : rnd(1700, 1860)) - j.x, y: rnd(top - 100, top + vhU * 0.4) - j.y };
      const rotEnd = j.p.r + side * rnd(140, 300);
      const scaleEnd = rnd(1.15, 1.6);
      const mid = MID[j.i];
      const to = { x: end.x * uw, y: end.y * uw, rotation: rotEnd, scale: scaleEnd };
      tl.fromTo(j.el, { x: 0, y: 0, rotation: j.p.r, scale: 1 }, mid
        ? { keyframes: [{ x: (mid.x - j.x) * uw, y: (mid.y - j.y) * uw, rotation: mid.r, scale: 1.04, ease: 'power1.out' }, { ...to, ease: 'power1.in' }], duration: at(dur) }
        : { ...to, ease: 'power1.in', duration: at(dur) }, at(start));
    });

    // момент, когда последняя баночка и последняя буква ушли с экрана: прогоняем разлёт по шкале и смотрим
    // (экран — sticky .vkusy__stage: считаем относительно него, страница может быть прокручена куда угодно)
    const targets = [...jars.map(j => j.img), ...letters, ...subLetters];
    const off = section.querySelector('.vkusy__stage').getBoundingClientRect().top;
    let rise = R0;
    for (let t = R0; t <= lastEnd + 1; t += 4) {
      tl.time(t, true);
      const vis = targets.some(el => { const r = el.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.bottom > off && r.top < off + innerHeight; });
      if (vis) rise = t;
    }
    tl.time(0, true);

    // как только улетела последняя баночка — кадр едет, пока голова не встанет на экран целиком
    if (S2 > S) tl.to(frame, { y: -S2 * uw, duration: at(S2 - S) }, at(rise));

    // голова пустая и встала на экран целиком — отклеивается с верхнего левого угла, переворачивается и уходит вправо
    const pStart = rise + (S2 - S), pEnd = pStart + Pp * 0.92;
    L = pStart + Pp;
    intro.style.height = `${(L * uw + innerHeight).toFixed(0)}px`;
    tl.call(() => setPeel(false), [], at(pStart) - 0.01);
    tl.call(() => setPeel(true), [], at(pStart) + 0.01);
    tl.fromTo(peelState, { p: 0 }, { p: 1, ease: 'power1.inOut', duration: at(pEnd - pStart), onUpdate: () => peel.draw(peelState.p) }, at(pStart));
    tl.set({}, {}, L);                           // длина шкалы = длина сценария

    tl.scrollTrigger.refresh();
    tl.progress(progress);
    setPeel(tl.time() > pStart);
  }

  build();
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(build, 200); });

  window.__vkusy = {
    build, tl: () => tl,
    /** перейти к точке вступления: p — 0…1 */
    seek(p) {
      window.__hero?.lenis?.resize();
      const st = tl.scrollTrigger;
      window.__hero?.lenis?.scrollTo(st.start + (st.end - st.start) * p, { immediate: true });
    },
  };
}
