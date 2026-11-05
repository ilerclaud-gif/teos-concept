// WebGL-рендер кадров Hero: два слоя (A, B) с собственными трансформациями
// и смешиванием. Используется и для межкадрового растворения, и для швов
// между клипами. Здесь же «дожим» чёрного фона до #030303 и мягкие края кадра.
// У кадров облёта есть альфа (герой вырезан из чёрного фона, tools/hero-matte.swift): за героем — живописный фон
// (setPaint), он двигается от мыши и гаснет по скроллу. Буквы TEOS первого экрана тоже рисует шейдер (setLetters):
// над фоном они белые, над героем — «исключение» (как mix-blend-mode: exclusion на чёрном в макете).

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;            // размер канваса, px
uniform sampler2D uTexA, uTexB;
uniform vec4 uRectA, uRectB;  // прямоугольник кадра на экране: x, y, w, h (px, y вниз)
uniform float uMix;           // 0 = A, 1 = B
uniform float uAlpha;         // общая видимость
uniform vec3 uBg;
uniform vec2 uToe;            // пороги дожима чёрного по яркости
uniform vec2 uTexel;          // 1 / размер кадра
// Проявление (интро): растворение от центра фигуры с шумовым краем
uniform float uReveal;        // 0..1
uniform float uTime;
uniform vec2 uCenter;         // центр проявления, px
uniform float uFlash;         // вспышка в момент проявления, 0..1
// Вспышка «разлома» при оживании: тёплая, под цвет свечения в клипе
uniform float uBurst;         // 0..1
uniform vec2 uBurstCenter;    // px
// Погружение в йогурт: закручивание текстуры и уход в белый
uniform float uSwirl;         // угол закрутки в центре, рад
uniform float uWhite;         // 0..1, 1 = чистый белый
uniform vec2 uSwirlCenter;    // px
uniform float uClamp;         // 1 = за краем кадра тянуть крайние пиксели, а не фон (погружение)
// живописный фон за героем
uniform sampler2D uPaint;
uniform vec4 uPaintRect;      // x, y, w, h (px, y вниз)
uniform float uPaintAmt;      // 0 — чёрный фон, 1 — картина
uniform float uPaintDim;      // общий тон картины
// буквы TEOS: атлас глифов, их текущие прямоугольники на экране и окна видимости
uniform sampler2D uLet;
uniform float uLetOn;
uniform vec4 uLetG[4];        // глиф на экране: x, y, w, h
uniform vec4 uLetW[4];        // окно: x0, y0, x1, y1
uniform vec4 uLetA[4];        // ячейка атласа: u0, v0, du, dv

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}

vec2 frameUv(vec4 rect, vec2 px) { return (px - rect.xy) / rect.zw; }

// Кадр: цвет (с дожимом чёрного), альфа героя и видимость кадра у его краёв.
// У кадров облёта, мостика и оживания альфа — маска героя (прямая, не умноженная: вне героя цвет кадра сохранён —
// чёрный фон и свечение при оживании); у остальных альфа = 1.
void sampleFrame(sampler2D tex, vec4 rect, vec2 px, out vec3 col, out float al, out float see) {
  vec2 uv = frameUv(rect, px);
  vec4 t = texture2D(tex, uv);
  col = t.rgb; al = t.a; see = 1.0;
  if (uClamp > 0.5) { al = 1.0; return; }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { col = uBg; al = 0.0; see = 0.0; return; }
  float l = dot(t.rgb, LUMA);
  col = mix(uBg, t.rgb, smoothstep(uToe.x, uToe.y, l));
  // мягкие края кадра, чтобы он растворялся в фоне страницы
  // только у тех краёв, которые реально видны на экране (край за экраном не гасим)
  vec4 vis = vec4(step(0.5, rect.x), step(0.5, uRes.x - rect.x - rect.z),
                  step(0.5, rect.y), step(0.5, uRes.y - rect.y - rect.w));
  // правый край: когда герой уходит влево (шаг 5), в кадре у самого края ещё стоит плечо — узкое затухание резало
  // его чёрной вертикалью. Ширина затухания растёт вместе с зазором между краем кадра и краем экрана (втрое быстрее,
  // до 14 % кадра): пока край за экраном, её нет; дальше плечо мягко уходит в темноту
  float fr = clamp((uRes.x - rect.x - rect.z) * 3.0 / rect.z, 0.0, 0.14);
  float ex = mix(1.0, smoothstep(0.0, 0.04, uv.x), vis.x) * (fr > 0.0005 ? smoothstep(0.0, fr, 1.0 - uv.x) : 1.0);
  float ey = mix(1.0, smoothstep(0.0, 0.03, uv.y), vis.z) * mix(1.0, smoothstep(0.0, 0.03, 1.0 - uv.y), vis.w);
  see = ex * ey;
}

float letterMask(vec2 px) {
  float m = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 g = uLetG[i], w = uLetW[i];
    vec2 q = (px - g.xy) / g.zw;
    if (q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0 && px.x >= w.x && px.x <= w.z && px.y >= w.y && px.y <= w.w)
      m = max(m, texture2D(uLet, uLetA[i].xy + q * uLetA[i].zw).a);
  }
  return m;
}

// контуры кадра (градиент яркости) — «эскиз», который бежит перед фронтом
float sketch(sampler2D tex, vec2 uv) {
  vec2 o = uTexel * 1.5;
  float gx = dot(texture2D(tex, uv + vec2(o.x, 0.0)).rgb - texture2D(tex, uv - vec2(o.x, 0.0)).rgb, LUMA);
  float gy = dot(texture2D(tex, uv + vec2(0.0, o.y)).rgb - texture2D(tex, uv - vec2(0.0, o.y)).rgb, LUMA);
  return clamp(length(vec2(gx, gy)) * 5.0, 0.0, 1.0);
}

vec2 swirlPx(vec2 px) {
  vec2 d = px - uSwirlCenter;
  float r = length(d) / uRes.y;
  float ang = uSwirl * exp(-r * r * 2.2);
  float cs = cos(ang), sn = sin(ang);
  return uSwirlCenter + mat2(cs, sn, -sn, cs) * d;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  if (uSwirl != 0.0) px = swirlPx(px);
  vec3 cA; float aA, eA;
  sampleFrame(uTexA, uRectA, px, cA, aA, eA);
  vec3 fc = cA;                 // цвет героя
  float fa = aA, fe = eA;       // его покрытие; видимость кадра
  // «своё» за героем — то, что в кадре вне маски (чёрный фон, свечение); у самого края героя — фон страницы
  vec3 own = mix(cA, uBg, smoothstep(0.0, 0.06, aA));
  if (uMix > 0.0) {
    vec3 cB; float aB, eB;
    sampleFrame(uTexB, uRectB, px, cB, aB, eB);
    float ma = mix(aA, aB, uMix);
    fc = ma > 0.004 ? mix(cA * aA, cB * aB, uMix) / ma : mix(cA, cB, uMix);
    // там, где силуэты соседних кадров не совпадают, простое смешение дало бы полупрозрачный «призрак» по краю героя
    // (на картине он заметен): покрытие там — порог от смешанного, силуэт остаётся цельным
    fa = mix(ma, smoothstep(0.38, 0.62, ma), abs(aA - aB));
    fe = mix(eA, eB, uMix);
    own = mix(own, mix(cB, uBg, smoothstep(0.0, 0.06, aB)), uMix);
  }
  // за героем: «своё» кадра или картина (тон — как в макете 01-start2: без затемнения); за краями кадра — фон или картина
  vec3 back = own, outer = uBg;
  if (uPaintAmt > 0.0) {
    vec3 p = texture2D(uPaint, clamp((px - uPaintRect.xy) / uPaintRect.zw, 0.0, 1.0)).rgb * uPaintDim;
    back = mix(own, p, uPaintAmt);
    outer = mix(uBg, p, uPaintAmt);
  }
  vec3 a = mix(outer, mix(back, fc, fa), fe);
  float hero = fa * fe;         // покрытие героя — для букв

  if (uReveal < 1.0) {
    vec2 uv = frameUv(uRectA, px);
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    // расстояние от центра в высотах экрана + рваный край из шума
    float d = length((px - uCenter) / uRes.y);
    float n = fbm(px / uRes.y * 3.2 + vec2(0.0, uTime * 0.12)) - 0.5;
    float thr = d * 0.78 + n * 0.32;
    float p = uReveal * 1.45 - 0.25;
    float edge = p - thr;
    float blend = smoothstep(-0.015, 0.015, edge);
    // перед фронтом — проступающие контуры фигуры
    float sk = sketch(uTexA, uv) * inside * smoothstep(-0.28, 0.0, edge) * (1.0 - blend);
    vec3 pre = uBg + vec3(sk) * 0.55;
    // фронт светится: сильная вспышка в начале, к концу мягче
    float g = 1.0 - smoothstep(0.0, 0.12, abs(edge));
    g *= g;
    float k = mix(5.5, 1.0, smoothstep(0.0, 0.55, uReveal));
    vec3 light = vec3(1.0, 0.985, 0.96);
    vec3 c = mix(pre, a, blend);
    // вспышка: кадр на миг пересвечен, из центра расходится световое облако
    c *= 1.0 + g * k + uFlash * 0.7 * blend;
    c += light * g * 0.12 * (1.0 - uReveal * 0.6) * inside;
    c += light * uFlash * exp(-d * d * 5.0) * 0.45;
    a = min(c, vec3(1.0));
  }

  vec3 c = a;

  if (uLetOn > 0.5) {
    float m = letterMask(px);
    // над фоном буква белая, над героем — «исключение» с белым (1 − цвет), как в макете
    if (m > 0.0) c = mix(c, mix(vec3(1.0), vec3(1.0) - c, hero), m);
  }

  if (uBurst > 0.0) {
    float bd = length((px - uBurstCenter) / uRes.y);
    c *= 1.0 + uBurst * 0.4;
    c += vec3(1.0, 0.8, 0.52) * uBurst * exp(-bd * bd * 4.0) * 0.45;
    c = min(c, vec3(1.0));
  }

  if (uWhite > 0.0) {
    // белый растекается из центра погружения и к концу заливает весь экран
    float r = length((px - uSwirlCenter) / uRes.y);
    float w = smoothstep(0.0, 1.0, uWhite * 1.5 - r * 0.6 * (1.0 - uWhite));
    c = mix(c, vec3(1.0), w);
  }

  gl_FragColor = vec4(mix(uBg, c, uAlpha), 1.0);
}
`;

export class Renderer {
  constructor(canvas, aspect) {
    this.canvas = canvas;
    this.aspect = aspect; // ширина/высота кадра
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL недоступен');
    this.gl = gl;

    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(prog, s);
    }
    gl.linkProgram(prog);
    gl.useProgram(prog);
    this.u = {};
    for (const n of ['uRes', 'uTexA', 'uTexB', 'uRectA', 'uRectB', 'uMix', 'uAlpha', 'uBg', 'uToe', 'uTexel', 'uReveal', 'uTime', 'uCenter', 'uFlash', 'uBurst', 'uBurstCenter', 'uSwirl', 'uWhite', 'uSwirlCenter', 'uClamp', 'uPaint', 'uPaintRect', 'uPaintAmt', 'uPaintDim', 'uLet', 'uLetOn', 'uLetG', 'uLetW', 'uLetA']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // пул текстур: ключ кадра -> текстура
    this.pool = [];
    for (let i = 0; i < 4; i++) this.pool.push({ tex: this.makeTex(), key: null, used: 0 });
    this.tick = 0;

    gl.uniform1i(this.u.uTexA, 0);
    gl.uniform1i(this.u.uTexB, 1);
    gl.uniform1i(this.u.uPaint, 2);
    gl.uniform1i(this.u.uLet, 3);
    this.paintTex = this.makeTex();
    this.letTex = this.makeTex();
    this.paint = null;      // { w, h } картины
    this.letters = null;    // ячейки атласа букв
    gl.uniform3f(this.u.uBg, 3 / 255, 3 / 255, 3 / 255);
    gl.uniform2f(this.u.uToe, 0.035, 0.11);
    gl.uniform1f(this.u.uReveal, 1);

    this.resize();
  }

  makeTex() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([3, 3, 3, 255]));
    return t;
  }

  /** Живописный фон за героем (HTMLImageElement) */
  setPaint(img) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.paintTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.activeTexture(gl.TEXTURE0);
    this.paint = { w: img.naturalWidth, h: img.naturalHeight };
  }
  /** Атлас букв (канвас: белые глифы на прозрачном) и ячейки [u0, v0, du, dv] × 4 */
  setLetters(canvas, cells) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.letTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform4fv(this.u.uLetA, new Float32Array(cells.flat()));
    this.letters = cells;
  }

  /** Текстура для кадра: загружает bitmap, если такого ключа нет в пуле */
  texFor(key, bmp, protect) {
    let slot = this.pool.find(s => s.key === key);
    if (!slot) {
      slot = this.pool.filter(s => s !== protect).sort((a, b) => a.used - b.used)[0];
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, slot.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
      slot.key = key;
    }
    slot.used = ++this.tick;
    return slot;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.gl.viewport(0, 0, w, h);
  }

  /**
   * Базовый масштаб: кадр по высоте экрана, а на экранах шире кадра — по ширине,
   * чтобы боковые края кадра не попадали в поле зрения.
   */
  get base() {
    return Math.max(1, this.canvas.width / this.canvas.height / this.aspect);
  }

  /**
   * Прямоугольник кадра на экране (px канваса); t = {s, x, y}: масштаб и сдвиг в долях кадра.
   * Когда кадр выше экрана (широкий экран), лишнее срезается в основном снизу:
   * сверху голова, снизу фигура и так уходит за кадр.
   */
  rect(t) {
    const W = this.canvas.width, H = this.canvas.height;
    const b = this.base;
    const fh = H * t.s * b, fw = fh * this.aspect;
    const cx = W / 2 + t.x * H * this.aspect * b;
    const cy = H / 2 + t.y * H * b + (b - 1) * H * 0.3;
    return [cx - fw / 2, cy - fh / 2, fw, fh];
  }

  /**
   * layerA/B: {key, bmp, t}; mix: 0..1
   * fx: {reveal 0..1, time с, center [x, y] в долях кадра A}
   */
  draw(layerA, layerB, mix, fx = {}) {
    const gl = this.gl;
    const sa = this.texFor(layerA.key, layerA.bmp);
    const sb = layerB && mix > 0 ? this.texFor(layerB.key, layerB.bmp, sa) : sa;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sa.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sb.tex);
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform4fv(this.u.uRectA, this.rect(layerA.t));
    gl.uniform4fv(this.u.uRectB, this.rect((layerB || layerA).t));
    gl.uniform1f(this.u.uMix, layerB ? mix : 0);
    gl.uniform1f(this.u.uAlpha, fx.alpha ?? 1);
    // картина за героем: fx.paint = { rect: [x, y, w, h] px, amt, dim }
    const paint = this.paint && fx.paint && fx.paint.amt > 0 ? fx.paint : null;
    gl.uniform1f(this.u.uPaintAmt, paint ? paint.amt : 0);
    if (paint) {
      gl.uniform4fv(this.u.uPaintRect, paint.rect);
      gl.uniform1f(this.u.uPaintDim, paint.dim ?? 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.paintTex);
    }
    // буквы: fx.letters = { g: Float32Array(16), w: Float32Array(16) } — глифы и окна на экране (px канваса)
    const let_ = this.letters && fx.letters ? fx.letters : null;
    gl.uniform1f(this.u.uLetOn, let_ ? 1 : 0);
    if (let_) {
      gl.uniform4fv(this.u.uLetG, let_.g);
      gl.uniform4fv(this.u.uLetW, let_.w);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.letTex);
    }
    gl.uniform2f(this.u.uTexel, 1 / layerA.bmp.width, 1 / layerA.bmp.height);
    const reveal = fx.reveal ?? 1;
    gl.uniform1f(this.u.uReveal, reveal);
    const swirl = fx.swirl || 0, white = fx.white || 0;
    gl.uniform1f(this.u.uSwirl, swirl);
    gl.uniform1f(this.u.uWhite, white);
    gl.uniform1f(this.u.uClamp, fx.clamp ? 1 : 0);
    if (swirl || white) {
      const [x, y, w, h] = this.rect(layerA.t);
      gl.uniform2f(this.u.uSwirlCenter, x + 0.5 * w, y + 0.48 * h);
    }
    const burst = fx.burst || 0;
    gl.uniform1f(this.u.uBurst, burst);
    if (burst > 0) {
      const [x, y, w, h] = this.rect(layerA.t);
      const [cx, cy] = fx.burstCenter || [0.5, 0.5];
      gl.uniform2f(this.u.uBurstCenter, x + cx * w, y + cy * h);
    }
    if (reveal < 1) {
      const [x, y, w, h] = this.rect(layerA.t);
      const [cx, cy] = fx.center || [0.5, 0.5];
      gl.uniform2f(this.u.uCenter, x + cx * w, y + cy * h);
      gl.uniform1f(this.u.uTime, fx.time || 0);
      gl.uniform1f(this.u.uFlash, fx.flash || 0);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
