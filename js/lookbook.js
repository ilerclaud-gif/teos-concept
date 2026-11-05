// Блок 3 «Вкусы» — лукбук «Семь характеров» (макеты design/3 блок/03-<вкус>, механика forgeautomotive.co.uk).
// Экран пополам: слева панель цвета вкуса с текстом (карточки по 100vh, обычный скролл), справа фото богини.
// Фото лежат стопкой в фиксированном слое; фото вкуса открывается шторкой снизу вверх ровно по верхнему краю
// его карточки (общая граница через весь экран), внутри — лёгкий отъезд масштаба 1.12 → 1.
// Фраза-характер стоит по центру экрана (на линии раздела) и сменяется побуквенным «перекатом»
// (как буквы кнопки ENTER на референсе): буквы старой фразы уезжают вверх, новой — выезжают снизу, по скроллу.
// «КБЖУ» дорисовывается (маска из штрихов), когда карточка встала. «Купить.» — без ссылки (концепт), эффект при наведении.

const { gsap } = window;

const FLAVORS = [
  { color: '#002BFF', goddess: 'Богиня Гера. Классика.', name: ['Натуральный.'], phrase: ['Из её молока,', 'говорят, разлился', 'Млечный Путь.'],
    facts: ['8,0 г в 100 г', '140 г', '2%', '66,8 ккал в 100 г'], fit: { z: 1, fx: 0, fy: 0 } },
  { color: '#FF8000', goddess: 'Богиня Эос. Солнце.', name: ['Манго и чиа.'], phrase: ['Богиня', 'зари встаёт', 'раньше всех.'],
    facts: ['7,0 г в 100 г', '140 г', '2%', '91,2 ккал в 100 г'], fit: { z: 1, fx: 0, fy: 0.003 } },
  { color: '#DFB75E', goddess: 'Богиня Мелисса. Золото.', name: ['Грецкий орех', 'и мёд.'], phrase: ['Она', 'кормила мёдом', 'самого Зевса.'],
    facts: ['7,0 г в 100 г', '140 г', '2%', '91,2 ккал в 100 г'], fit: { z: 1, fx: 0, fy: 0.003 } },
  { color: '#BC9162', goddess: 'Богиня Деметра. Опора.', name: ['Злаки', 'клетчатка льна.'], phrase: ['Богиня', 'урожая знает цену', 'зерну.'],
    facts: ['7,0 г в 100 г', '140 г', '2%', '91,2 ккал в 100 г'], fit: { z: 1.12, fx: -0.001, fy: 0.0923 } },
  { color: '#4C0083', goddess: 'Богиня Нюкта. Ночь.', name: ['Черника.'], phrase: ['Даже сам', 'Зевс побаивался', 'Ночи.'],
    facts: ['7,0 г в 100 г', '140 г', '2%', '91,2 ккал в 100 г'], fit: { z: 1, fx: 0, fy: 0.0389 } },
  { color: '#520229', goddess: 'Богиня Персефона. Страсть.', name: ['Вишня.'], phrase: ['Один сладкий плод', 'и она возвращается,', 'снова и снова.'],
    facts: ['7,0 г в 100 г', '140 г', '2%', '91,2 ккал в 100 г'], fit: { z: 1, fx: 0, fy: 0.003 } },
  { color: '#B10101', goddess: 'Богиня Афродита. Лето.', name: ['Клубника.'], phrase: ['Рождённая', 'из пены знает толк', 'в сливочном.'],
    facts: ['7,0 г в 100 г', '140 г', '2%', '91,2 ккал в 100 г'], fit: { z: 1.2, fx: -0.0324, fy: 0.1232 } },
];
const LABELS = ['Белок', 'Вес', 'Жирность', 'Калорийность'];
const PHOTO = { w: 1440, h: 1787 };
// штрихи «КБЖУ» по центральным линиям (viewBox 93×87 исходного SVG), в порядке письма
export const KBZHU_STROKES = [
  'M8.1 45 L9 76', 'M1 64.4 L14 85', 'M10 68.8 L27.3 69.8',
  'M18.8 43.8 L31.3 33.1', 'M17.5 45 L46.9 78.1', 'M31.3 57.5 C33 49 38 44.5 42 44.5 C46 44.5 47 50 47.2 56 L47.3 78',
  'M47 46.9 L86 47.5', 'M71.9 33.8 L71.9 66.3', 'M63.8 40 L78.8 50.6', 'M65 50 L77 40',
  'M68.1 18.8 L91.9 20', 'M85.6 0.6 L89 86.5',
];

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = t => t * t * (3 - 2 * t);
const pad = n => String(n).padStart(2, '0');

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/** Строка из букв для «переката»: каждая буква — окно, внутри она сама (и копия для «Купить.») */
function rollLine(text, copy = false) {
  const line = el('span', 'roll');
  [...text].forEach((ch, i) => {
    if (ch === ' ') { line.append(document.createTextNode(' ')); return; }
    const w = el('span', 'roll__ch');
    w.style.setProperty('--i', i);
    const a = el('span', 'roll__a'); a.textContent = ch; w.append(a);
    if (copy) { const b = el('span', 'roll__b'); b.textContent = ch; w.append(b); }
    line.append(w);
  });
  return line;
}

export function initLookbook() {
  const root = document.querySelector('.lb');
  if (!root) return;
  const photosBox = root.querySelector('.lb__photos');
  const phrasesBox = root.querySelector('.lb__phrases');
  const cardsBox = root.querySelector('.lb__cards');

  const items = FLAVORS.map((f, i) => {
    const n = i + 1;
    // фото
    const ph = el('div', 'lb__photo');
    const img = el('img');
    img.src = `img/vkusy/lb/photo-${n}.webp`;
    img.alt = '';
    img.decoding = 'async';
    ph.append(img);
    photosBox.append(ph);

    // фраза (по центру экрана)
    const phrase = el('p', 'lb__phrase');
    phrase.setAttribute('aria-hidden', 'true');
    f.phrase.forEach(t => { const ln = el('span', 'lb__pline'); ln.append(rollLine(t)); phrase.append(ln); });
    phrasesBox.append(phrase);
    const letters = [...phrase.querySelectorAll('.roll__a')];

    // карточка
    const card = el('article', 'lb__card');
    card.style.setProperty('--c', f.color);
    card.innerHTML = `
      <div class="lb__panel"><div class="lb__box">
        <div class="lb__head">
          <p class="lb__num">${pad(n)} / 07.</p>
          <p class="lb__goddess">${f.goddess}</p>
          <h3 class="lb__name">${f.name.join('<br>')}</h3>
        </div>
        <p class="lb__sr">${f.phrase.join(' ')}</p>
        <div class="lb__frame">
          <a class="lb__buy" href="#" role="button" aria-label="Купить: ${f.name.join(' ').replace(/\.$/, '')}">
            <img class="lb__jar" src="img/vkusy/lb/jar-${n}.webp" alt="">
          </a>
          <svg class="lb__kbzhu" viewBox="0 0 93 87" aria-label="КБЖУ">
            <defs><mask id="kbm-${n}" maskUnits="userSpaceOnUse" x="-5" y="-5" width="103" height="97">
              ${KBZHU_STROKES.map(d => `<path d="${d}" pathLength="1"/>`).join('')}
            </mask></defs>
            <image href="img/vkusy/lb/kbzhu.webp" width="93" height="87" mask="url(#kbm-${n})"/>
          </svg>
          <ul class="lb__facts">
            ${f.facts.map((v, k) => `<li class="lb__fact"><span class="lb__val">${v}</span><span class="lb__dots" aria-hidden="true"></span><span class="lb__lab">${LABELS[k]}</span></li>`).join('')}
          </ul>
        </div>
      </div></div>`;
    const buy = card.querySelector('.lb__buy');
    buy.append(rollLine('Купить.', true));
    buy.addEventListener('click', e => e.preventDefault());
    cardsBox.append(card);

    // «КБЖУ»: штрихи маски дорисовываются по очереди, в конце маска снимается (рисунок целиком)
    const kb = card.querySelector('.lb__kbzhu');
    const kbImg = kb.querySelector('image');
    const strokes = [...kb.querySelectorAll('mask path')];
    gsap.set(strokes, { strokeDasharray: 1, strokeDashoffset: 1 });
    const draw = gsap.timeline({ paused: true, onComplete: () => kbImg.removeAttribute('mask') })
      .to(strokes, { strokeDashoffset: 0, duration: 0.16, ease: 'power1.inOut', stagger: 0.11, autoRound: false });   // без autoRound GSAP округляет px до целых — штрих не рисуется, а появляется скачком
    const kbzhu = {
      shown: false,
      play() { if (this.shown) return; this.shown = true; kbImg.setAttribute('mask', `url(#kbm-${n})`); draw.restart(); },
      reset() { if (!this.shown) return; this.shown = false; draw.pause(0); kbImg.setAttribute('mask', `url(#kbm-${n})`); },
    };

    return { f, ph, img, phrase, letters, card, content: card.querySelector('.lb__box'), kbzhu };
  });

  // ---------- кадрирование фото (снято с макетов: z — увеличение к cover, fx/fy — сдвиг центра) ----------
  function layoutPhotos() {
    const W = innerWidth / 2, H = innerHeight;
    for (const it of items) {
      const { z, fx, fy } = it.f.fit;
      const s = Math.max(W / PHOTO.w, H / PHOTO.h) * z;
      const w = PHOTO.w * s, h = PHOTO.h * s;
      let cx = W / 2 + fx * w, cy = H / 2 + fy * h;
      cx = clamp(cx, W - w / 2, w / 2);
      cy = clamp(cy, H - h / 2, h / 2);
      Object.assign(it.img.style, { width: `${w}px`, height: `${h}px`, left: `${cx - w / 2}px`, top: `${cy - h / 2}px` });
    }
  }
  layoutPhotos();
  window.addEventListener('resize', layoutPhotos);

  // ---------- каждый кадр: шторки фото, перекат фраз, проявление/гашение текста, «КБЖУ» ----------
  const rollState = items.map(() => -1);
  function setRoll(it, idx, inP, outP) {
    // inP: 0 → 1 буквы выезжают снизу; outP: 0 → 1 уезжают вверх
    const key = `${inP.toFixed(3)}|${outP.toFixed(3)}`;
    if (rollState[idx] === key) return;
    rollState[idx] = key;
    const N = it.letters.length, spread = 0.55;
    it.letters.forEach((l, j) => {
      const d = (j / Math.max(1, N - 1)) * spread;
      const a = ease(clamp((inP - d) / (1 - spread)));
      const b = ease(clamp((outP - d) / (1 - spread)));
      // сдвиг 170 % — буква целиком за окном (у окна запас сверху/снизу под «ё», «й», «у»);
      // ещё не выехавшие и уже уехавшие буквы скрыты совсем — никаких следов
      l.style.transform = `translateY(${((1 - a) * 170 - b * 170).toFixed(1)}%)`;
      l.style.visibility = a <= 0 || b >= 1 ? 'hidden' : '';
    });
    it.phrase.style.visibility = inP <= 0 || outP >= 1 ? 'hidden' : 'visible';
  }

  let active = false;
  const tick = () => {
    const vh = innerHeight;
    const lbr = root.getBoundingClientRect();
    const near = lbr.top < vh * 1.05 && lbr.bottom > -vh * 0.05;
    if (!near) {
      if (active) {
        active = false;
        root.classList.remove('is-on');
        items.forEach((it, i) => { it.phrase.style.visibility = 'hidden'; rollState[i] = -1; });
      }
      return;
    }
    if (!active) { active = true; root.classList.add('is-on'); }
    const bottomInset = clamp(vh - lbr.bottom, 0, vh);
    const tops = items.map(it => it.card.getBoundingClientRect().top);
    items.forEach((it, i) => {
      const top = tops[i];
      // шторка фото снизу вверх по верхнему краю карточки; снизу — конец лукбука
      it.ph.style.clipPath = `inset(${clamp(top, 0, vh).toFixed(1)}px 0 ${bottomInset.toFixed(1)}px 0)`;
      it.img.style.transform = `scale(${(1 + 0.12 * clamp(top / vh)).toFixed(4)})`;
      // фраза: пока поднимается следующая карточка, сначала старая укатывается вверх (первая половина подъёма),
      // затем новая выкатывается снизу (вторая половина) — буквы не накладываются; у последней — конец лукбука
      const rise = t => (vh - t) / vh;            // 0 — карточка под экраном, 1 — встала
      const inP = clamp((rise(top) - 0.5) / 0.42);
      const nextTop = i + 1 < items.length ? tops[i + 1] : lbr.bottom;
      const outP = clamp((rise(nextTop) - 0.06) / 0.42);
      setRoll(it, i, inP, outP);
      // текст карточки гаснет, уходя вверх (как на референсе: от «центр на 30 %» до «низ у верха»)
      it.content.style.opacity = (1 - clamp((-0.2 * vh - top) / (0.8 * vh))).toFixed(3);
      // «КБЖУ»: рисуется, когда карточка встала; сбрасывается, когда снова ушла вниз
      if (top < vh * 0.25) it.kbzhu.play();
      else if (top > vh * 0.75) it.kbzhu.reset();
    });
  };
  gsap.ticker.add(tick);
  tick();
}
