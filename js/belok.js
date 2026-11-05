// Блок 2 «Белок» (макет design/2 блок/02-belok). Обычный скролл, без закрепления.
//  - бегущая строка «грамм белка на 100 грамм продукта •» — по времени, бесконечно;
//    там, где она проходит через синюю 8, текст белый (копия строки, вырезанная по форме цифры);
//  - счётчик 0 → 8 — катушка цифр, проигрывается по времени каждый раз, когда блок появляется;
//  - «Protein» — целиком, с лёгким параллаксом;
//  - заголовки выплывают снизу по скроллу;
//  - аргументы — «барабан» как на measured.site: строка поворачивается вокруг вертикали
//    в зависимости от расстояния до центра экрана; точка перспективы — центр экрана, поэтому
//    ниже центра строка наклонена в одну сторону, выше — в другую; к краям экрана строка
//    сереет и растворяется в фоне; правая колонка закреплена (sticky, CSS).

const { gsap, ScrollTrigger } = window;
const SVGNS = 'http://www.w3.org/2000/svg';

// Координаты — в системе макета 1440 (viewBox рисунка)
const MARQUEE = { y: 542, speed: 42 };                // базовая линия строки; единиц в секунду
const EIGHT = { x: 720, baseline: 743, step: 560 };   // центр цифры, базовая линия (цифра макета — 317…749), шаг катушки
// как на measured.site: 28° на 17% высоты экрана; затухание от 12% до 42% высоты от центра
const DRUM = { degPerVh: 28 / 0.17, max: 100, fadeFrom: 0.12, fadeTo: 0.42 };

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
}

/** Одна фраза строки: «грамм белка» курсивом, «на 100 грамм продукта •» прямым */
function segment(text) {
  el('tspan', { 'font-style': 'italic' }, text).textContent = 'грамм белка';
  el('tspan', {}, text).textContent = ' на 100 грамм продукта • ';
}

function buildMarquee(groups) {
  // ширину фразы меряем на одном экземпляре
  const probe = el('text', { x: 0, y: MARQUEE.y }, groups[0]);
  segment(probe);
  const segW = probe.getComputedTextLength();
  probe.remove();
  const copies = Math.ceil(1440 / segW) + 2;
  for (const g of groups) {
    const t = el('text', { x: 0, y: MARQUEE.y }, g);
    for (let i = 0; i < copies; i++) segment(t);
  }
  gsap.fromTo(groups, { x: 0 }, { x: -segW, duration: segW / MARQUEE.speed, ease: 'none', repeat: -1 });
}

function buildReel(targets) {
  for (const g of targets) {
    for (let d = 0; d <= 8; d++) {
      el('text', { x: EIGHT.x, y: EIGHT.baseline + d * EIGHT.step, 'text-anchor': 'middle' }, g).textContent = d;
    }
  }
  // катушку двигаем атрибутом transform: у clipPath нет CSS-трансформаций
  const state = { y: 0 };
  const apply = () => targets.forEach(g => g.setAttribute('transform', `translate(0 ${state.y})`));
  apply();
  let tween;
  return {
    play() {
      tween?.kill();
      state.y = 0; apply();
      tween = gsap.to(state, { y: -8 * EIGHT.step, duration: 1.8, ease: 'power3.inOut', onUpdate: apply });
    },
    reset() { tween?.kill(); state.y = 0; apply(); },
  };
}

export async function initBelok() {
  const section = document.querySelector('.belok');
  if (!section) return;
  const art = section.querySelector('.belok__art');
  await document.fonts.load('700 100px "Bebas Neue Pro"');
  await document.fonts.load('42px "Times New Roman"').catch(() => {});

  // фон блока (белый с сеткой) и переход в синий — js/backgrounds.js

  // ---------- бегущая строка ----------
  buildMarquee([...art.querySelectorAll('.marquee')]);

  // ---------- счётчик 0 → 8 ----------
  const reel = buildReel([...art.querySelectorAll('.eight-reel')]);
  ScrollTrigger.create({
    trigger: art,
    start: 'top 65%',
    end: 'bottom top',
    onEnter: () => reel.play(),
    onEnterBack: () => reel.play(),
    onLeave: () => reel.reset(),
    onLeaveBack: () => reel.reset(),
  });

  // ---------- «Protein»: лёгкий параллакс — едет чуть медленнее контента ----------
  const PARALLAX = 520; // ход в единицах макета за весь проход блока через экран
  const atRest = () => innerHeight / (section.offsetHeight + innerHeight); // прогресс, когда верх блока у верха экрана
  gsap.fromTo(art.querySelector('.belok__protein'), { y: () => -PARALLAX * atRest() }, {
    y: () => PARALLAX * (1 - atRest()),
    ease: 'none',
    scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
  });

  // ---------- правая колонка: высота для закрепления у низа экрана ----------
  const aside = section.querySelector('.belok__aside');
  const setAsideH = () => section.style.setProperty('--aside-h', `${aside.offsetHeight}px`);
  setAsideH();
  window.addEventListener('resize', setAsideH);

  // ---------- заголовки выплывают снизу ----------
  const rise = (targets, trigger, start, end) => {
    gsap.set(targets, { y: () => innerHeight * 0.08, autoAlpha: 0 });
    gsap.to(targets, {
      y: 0, autoAlpha: 1, stagger: 0.15, ease: 'power3.out',
      scrollTrigger: { trigger, start, end, scrub: true, invalidateOnRefresh: true },
    });
  };
  rise(section.querySelectorAll('.belok__title .line > span'), section, 'top 85%', 'top 30%');
  rise([section.querySelector('.belok__note'), section.querySelector('.belok__heading')],
    section.querySelector('.belok__args'), 'top 90%', 'top 50%');

  // ---------- аргументы: «барабан» ----------
  const list = section.querySelector('.belok__list');
  const items = [...list.querySelectorAll('li')];
  const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  let active = false;
  ScrollTrigger.create({ trigger: section, start: 'top bottom', end: 'bottom top', onToggle: s => (active = s.isActive) });
  gsap.ticker.add(() => {
    if (!active) return;
    const vh = innerHeight;
    // точка перспективы — центр экрана (а не центр списка, который едет вместе со скроллом)
    list.style.perspectiveOrigin = `50% ${(vh / 2 - list.getBoundingClientRect().top).toFixed(1)}px`;
    for (const li of items) {
      const r = li.getBoundingClientRect();
      const offset = (r.top + r.height / 2 - vh / 2) / vh;
      const deg = Math.max(-DRUM.max, Math.min(DRUM.max, offset * DRUM.degPerVh));
      li.style.transform = `rotateY(${deg.toFixed(2)}deg)`;
      // 0 — у центра (полный цвет), 1 — у края экрана (серый, почти растворился в фоне)
      li.style.setProperty('--fade', smooth(DRUM.fadeFrom, DRUM.fadeTo, Math.abs(offset)).toFixed(3));
    }
  });

  // раскладка уже окончательная (шрифты, высоты блоков) — пересчитать позиции всех триггеров
  ScrollTrigger.refresh();
}
