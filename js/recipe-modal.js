// Окно рецепта — вариант 1 «Карточка экспоната» (идея Claude, одобрена и зафиксирована автором 2026-10-09; все 6 рецептов сетки).
// Слева на всю высоту — фото рецепта (вырастает из карточки сетки), справа — белая панель по колонкам 4–6 сетки макета:
// сверху «Экспонат № 03 / 06» и «Закрыть», линия, ниже — рамка (как белая рамка в лукбуке, здесь чёрная) с текстом:
// название (Bebas), подпись как у картины (курсив), «Состав» строками с отточием до граммовки,
// «Приготовление» с римскими номерами шагов (две равные половины рамки), под ними на всю ширину — КБЖУ тем же блоком,
// что в лукбуке; рукописное «КБЖУ» — его заголовок.
// Фоновые линии сайта — верхним слоем на всё окно (и на фото), режим «разница»: на белом тёмные, на фото светлые.
// Открытие: фото летит из ячейки на левую половину экрана, панель открывается справа, строки выкатываются снизу.
// Закрытие: «Закрыть», Esc или клик по фото — всё обратно, фото садится в свою ячейку.
// Данные — только из content/recipes.md (ничего не придумываем).

import { KBZHU_STROKES } from './lookbook.js';

const { gsap } = window;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const KB_LABELS = ['Калорийность', 'Белки', 'Жиры', 'Углеводы'];

// id — номер рецепта (как data-recipe у карточки); caption — строки подписи (вручную, без висящих слов);
// focus — кадрирование фото на левой половине (object-position, %): сосуд целиком и логотип TEOS на баночке
const Y = ['Йогурт TEOS «Натуральный 2 %»', '140 г'];
const RECIPES = {
  1: {
    name: 'Яблочное суфле.',
    caption: ['Греческий йогурт TEOS', 'и белёвская яблочная пастила.'],
    img: 'img/recepty/full/r-1.webp',
    focus: [71, 50],
    ingredients: [Y, ['Белёвская яблочная пастила', '40 г']],
    steps: ['Нарезать пастилу небольшими кусочками.', 'Добавить в йогурт.', 'Перемешать.', 'Оставить на 15–20 минут до размягчения пастилы.'],
    kbzhu: ['217 ккал', '12,4 г', '2,8 г', '35,5 г'],
  },
  2: {
    name: 'Лимонный крем.',
    caption: ['Греческий йогурт TEOS, лимонная цедра,', 'ваниль и сахарозаменитель.'],
    img: 'img/recepty/full/r-2.webp',
    focus: [86, 50],
    ingredients: [Y, ['Цедра лимона', '5 г'], ['Ванильный экстракт', '1–2 капли'], ['Сахарозаменитель', 'по вкусу']],
    steps: ['Натереть цедру лимона.', 'Добавить в йогурт.', 'Добавить сахарозаменитель и ванильный экстракт.', 'Перемешать.'],
    kbzhu: ['95 ккал', '11,3 г', '2,8 г', '6,4 г'],
  },
  3: {
    name: 'Сникерс.',
    caption: ['Греческий йогурт TEOS, какао, банан,', 'арахисовая паста и арахис.'],   // строки — вручную, без висящего слова
    img: 'img/recepty/full/r-3.webp',
    focus: [71, 50],
    ingredients: [Y, ['Какао', '10 г'], ['Банан', '70 г'], ['Арахисовая паста', '15 г'], ['Арахис', '10 г']],
    steps: ['Размять банан.', 'Смешать с йогуртом и какао.', 'Добавить арахисовую пасту.', 'Посыпать измельчённым арахисом.'],
    kbzhu: ['324 ккал', '20,3 г', '16,8 г', '32,2 г'],
  },
  4: {
    name: 'Рафаэлло.',
    caption: ['Греческий йогурт TEOS, кокосовая стружка,', 'миндаль и сахарозаменитель.'],
    img: 'img/recepty/full/r-4.webp',
    focus: [85, 50],
    ingredients: [Y, ['Кокосовая стружка', '15 г'], ['Миндаль', '10 г'], ['Сахарозаменитель', 'по вкусу']],
    steps: ['Смешать йогурт с кокосовой стружкой и сахарозаменителем.', 'Измельчить миндаль.', 'Добавить сверху.'],
    kbzhu: ['250 ккал', '14,3 г', '17,5 г', '11,6 г'],
  },
  5: {
    name: 'Тирамису.',
    caption: ['Греческий йогурт TEOS, кофе, финики,', 'миндаль и какао.'],
    img: 'img/recepty/full/r-5.webp',
    focus: [83, 50],
    ingredients: [Y, ['Какао', '5 г'], ['Кофе', '20 мл'], ['Финики', '20 г'], ['Миндаль', '10 г']],
    steps: ['Смешать йогурт с кофе.', 'Нарезать финики.', 'Добавить финики и миндаль.', 'Посыпать какао.'],
    kbzhu: ['219 ккал', '14,8 г', '8,6 г', '25,9 г'],
  },
  6: {
    name: 'Ягодный пломбир.',
    caption: ['Греческий йогурт TEOS, малина,', 'черника и мёд.'],
    img: 'img/recepty/full/r-6.webp',
    focus: [56, 50],
    ingredients: [Y, ['Малина', '70 г'], ['Черника', '50 г'], ['Мёд', '10 г']],
    steps: ['Смешать йогурт с ягодами и мёдом.', 'Переложить в форму.', 'Заморозить на 2–3 часа.'],
    kbzhu: ['189 ккал', '12,4 г', '3,4 г', '29,7 г'],
  },
};
const TOTAL = 6;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** строка, выкатывающаяся снизу: окно + содержимое */
const line = (html, cls = '') => `<span class="rm__ln ${cls}"><span class="rm__in">${html}</span></span>`;

export function initRecipeModal(section) {
  const root = document.createElement('div');
  root.className = 'rm';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="rm__photo"><img alt=""></div>
    <div class="rm__panel"><div class="rm__box"></div></div>
    <img class="rm__lines" src="img/grid-lines-dark.svg?v=3" alt="" aria-hidden="true">`;
  document.body.append(root);
  const photo = root.querySelector('.rm__photo');
  const img = photo.querySelector('img');
  const panel = root.querySelector('.rm__panel');
  const box = root.querySelector('.rm__box');
  const gridLines = root.querySelector('.rm__lines');

  let tl = null, state = 'closed', src = null, lastFocus = null, kb = null;

  function fill(id, r) {
    const n = String(id).padStart(2, '0');
    box.innerHTML = `
      <div class="rm__top">
        ${line(`Экспонат № ${n} / ${String(TOTAL).padStart(2, '0')}`, 'rm__num')}
        <button class="rm__close" type="button">${line('Закрыть')}<span class="rm__x" aria-hidden="true"></span></button>
      </div>
      <span class="rm__rule" aria-hidden="true"></span>
      <div class="rm__frame">
      <h2 class="rm__name" id="rm-title">${line(esc(r.name))}</h2>
      <p class="rm__caption">${r.caption.map(t => line(esc(t))).join('')}</p>
      <div class="rm__col rm__col--a">
        <h3 class="rm__head">${line('Состав')}</h3>
        <ul class="rm__list">${r.ingredients.map(([t, v]) =>
          `<li>${line(`<span class="rm__lab">${esc(t)}</span><span class="rm__dots" aria-hidden="true"></span><span class="rm__amt">${esc(v)}</span>`, 'rm__row')}</li>`).join('')}</ul>
      </div>
      <div class="rm__col rm__col--b">
        <h3 class="rm__head">${line('Приготовление')}</h3>
        <ol class="rm__steps">${r.steps.map((t, i) =>
          `<li>${line(`<span class="rm__rn">${ROMAN[i]}.</span><span>${esc(t)}</span>`, 'rm__step')}</li>`).join('')}</ol>
      </div>
      <div class="rm__kb">
        <svg class="rm__kbzhu" viewBox="0 0 93 87" aria-label="КБЖУ">
          <defs><mask id="rm-kbm" maskUnits="userSpaceOnUse" x="-5" y="-5" width="103" height="97">
            ${KBZHU_STROKES.map(d => `<path d="${d}" pathLength="1"/>`).join('')}
          </mask></defs>
          <image href="img/vkusy/lb/kbzhu.webp" width="93" height="87" mask="url(#rm-kbm)"/>
        </svg>
        <ul class="rm__facts">${r.kbzhu.map((v, k) =>
          `<li>${line(`<span class="rm__val">${esc(v)}</span><span class="rm__dots" aria-hidden="true"></span><span class="rm__klab">${KB_LABELS[k]}</span>`, 'rm__fact')}</li>`).join('')}</ul>
        <p class="rm__note">${line('КБЖУ — примерно, на весь рецепт.')}</p>
      </div>
      </div>`;
    root.setAttribute('aria-labelledby', 'rm-title');
    box.querySelector('.rm__close').addEventListener('click', close);
    // «КБЖУ»: штрихи маски дорисовываются по очереди (как в лукбуке)
    const kbImg = box.querySelector('.rm__kbzhu image');
    const strokes = [...box.querySelectorAll('.rm__kbzhu mask path')];
    gsap.set(strokes, { strokeDasharray: 1, strokeDashoffset: 1 });
    kb = gsap.timeline({ paused: true, onComplete: () => kbImg.removeAttribute('mask') })
      .to(strokes, { strokeDashoffset: 0, duration: 0.16, ease: 'power1.inOut', stagger: 0.11, autoRound: false });   // без autoRound GSAP округляет px до целых — штрих не рисуется, а появляется скачком
  }

  // КБЖУ — под более длинной из колонок (длинные шаги переносятся на 2 строки), но не выше 420 (как в утверждённой пробе).
  // Если до низа рамки не хватает места — сначала меньше воздух над КБЖУ (28 → 18), затем строки КБЖУ плотнее (39 → не меньше 33).
  const INNER_BOTTOM = 662, FACT_H = 39;   // низ рамки изнутри (666) с запасом под выносные элементы сноски
  function placeKb() {
    const u = Math.min(innerWidth / 1440, innerHeight / 800);
    const kbEl = box.querySelector('.rm__kb');
    kbEl.style.removeProperty('--fact-h');
    const top = box.querySelector('.rm__frame').getBoundingClientRect().top;
    const cols = Math.max(...[...box.querySelectorAll('.rm__col')].map(c => c.getBoundingClientRect().bottom - top)) / u;
    const kbH = kbEl.offsetHeight / u;
    let kbTop = Math.max(420, cols + 28);
    let over = kbTop + kbH - INNER_BOTTOM;
    if (over > 0) { kbTop = Math.max(420, cols + 18); over = kbTop + kbH - INNER_BOTTOM; }
    if (over > 0) kbEl.style.setProperty('--fact-h', Math.max(33, FACT_H - Math.ceil(over / 4)));
    kbEl.style.top = `calc(var(--u) * ${kbTop.toFixed(1)})`;
  }

  function open(id) {
    const r = RECIPES[id];
    if (!r || state !== 'closed') return;
    src = section.querySelector(`.rc__open[data-recipe="${id}"]`);
    if (!src) return;
    state = 'open';
    lastFocus = document.activeElement;
    fill(id, r);
    placeKb();
    window.__hero?.lenis?.stop();

    const a = src.getBoundingClientRect();
    img.src = r.img;
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    src.style.visibility = 'hidden';

    const lines = [...box.querySelectorAll('.rm__in')];
    const focus = { x: 50, y: 50 };
    const setFocus = () => { img.style.objectPosition = `${focus.x}% ${focus.y}%`; };
    setFocus();
    tl = gsap.timeline({
      defaults: { ease: 'expo.inOut' },
      onReverseComplete: cleanup,
    })
      // фото: из ячейки — на левую половину экрана (кадрирование плавно смещается к точке рецепта)
      .fromTo(photo, { left: a.left, top: a.top, width: a.width, height: a.height },
        { left: 0, top: 0, width: '50vw', height: '100vh', duration: 1.1 }, 0)
      .to(focus, { x: r.focus[0], y: r.focus[1], duration: 1.1, onUpdate: setFocus }, 0)
      .fromTo(img, { scale: 1.08 }, { scale: 1, duration: 1.6, ease: 'power2.out' }, 0.1)
      // панель: открывается справа налево
      .fromTo(panel, { clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)', duration: 1.0 }, 0.12)
      // рамка прорисовывается, фоновые линии проявляются поверх всего окна
      .fromTo(box.querySelector('.rm__frame'), { clipPath: 'inset(0 100% 100% 0)' }, { clipPath: 'inset(0 0% 0% 0)', duration: 1.0, ease: 'power3.inOut' }, 0.45)
      .fromTo(gridLines, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power1.out' }, 0.5)
      // строки выкатываются снизу (как фразы лукбука)
      .fromTo(lines, { yPercent: 115 }, { yPercent: 0, duration: 0.8, ease: 'power3.out', stagger: 0.035 }, 0.62)
      .add(() => { if (!tl.reversed()) kb.restart(); }, 1.05);
    setTimeout(() => box.querySelector('.rm__close')?.focus({ preventScroll: true }), 700);
  }

  function close() {
    if (state !== 'open' || !tl) return;
    state = 'closing';
    // обратно тем же путём, чуть быстрее; страница под окном стоит (Lenis остановлен) — ячейка на прежнем месте
    tl.timeScale(1.35).reverse();
  }

  function cleanup() {
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    if (src) src.style.visibility = '';
    box.innerHTML = '';
    img.removeAttribute('src');
    tl?.kill();
    tl = null;
    state = 'closed';
    window.__hero?.lenis?.start();
    lastFocus?.focus?.({ preventScroll: true });
  }

  photo.addEventListener('click', close);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  section.addEventListener('recipe:open', e => open(e.detail.id));
  window.__recipeModal = { open, close, _reset: cleanup };   // _reset — отладка: закрыть без анимации
}
