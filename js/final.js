// Блок 6 «Финал» (макеты design/6 блок/финал/06-final1…4; движение — как первый экран shopify.com/editions/winter2026).
// Сцена — фиксированный WebGL-канвас поверх блока 5: небо, терраса, статуя с баночкой, грек с ложкой (слои-текстуры),
// белые линии сетки. Сценарий (S — экраны после того, как верх блока дошёл до верха экрана):
//   вход    S < 0        — сцена проступает прожигом снизу (та же кромка, что у остальных прожигов), фигуры вплывают с краёв;
//   фраза   −0.42…0.12   — рамка прорисовывается, строки фразы выкатываются (по скроллу); 0.45…0.72 — уходят (по скроллу);
//   замах   0.45…1.25    — фигуры расходятся к краям и отклоняются назад (макет final2);
//   бросок  1.25…1.95    — летят навстречу, палец грека у баночки (макет final3), в точке касания — искра;
//   вспышка 2.0…2.9      — белый шар → кольцо с рваной светящейся кромкой расходится в стороны, сцена под кромкой
//                          обесцвечивается; внутри — белый экран (макет final4) сразу с текстами по центру (они открываются
//                          вместе с белым), затем по очереди — карточка автора (рамка, портрет, подпись от руки, печать) и ссылка.
// Фигуры не жёсткие: вырезка натянута на сетку и гнётся в суставах (final-rig.js) — на замахе руки сгибаются, головы
// поднимаются, в полёте ткань и ноги отстают; к касанию всё возвращается в позу вырезки. Привязано только к скроллу.
// Мышь: вся сцена тянется за курсором с инерцией — как в референсе, сдвигается вся картина (фон тоже) примерно на ±5 %
// ширины и высоты экрана, ближние слои чуть сильнее (небо < терраса < фигуры); фигуры «парят».
// Отладка: ?t=1990&fn=<0…1>, __final.seek(p), __final.state, __final.frame() (кадр без rAF).

import { OVER_LEAD, OVER_EDGE } from './backgrounds.js';
import { initAllButton } from './recepty.js';
import { RIGS, Rig } from './final-rig.js';

const { gsap } = window;

const PIN_S = 3.4;                 // экранов прокрутки после закрепления (.fin = (1 + PIN_S) × 100vh)
const T = {
  enter: [-0.9, 0],                // фигуры вплывают, пока идёт прожиг
  phraseIn: [-0.42, 0.12],         // рамка прорисовывается, строки фразы выкатываются — по скроллу
  phraseOut: [0.45, 0.72],         // фраза и рамка уходят — по скроллу, вместе с началом замаха
  wind: [0.45, 1.25],              // замах
  lunge: [1.25, 1.95],             // бросок навстречу
  spark: [1.8, 2.05],              // искра в точке касания
  flash: [2.0, 2.9],               // вспышка
  white: 2.84,                     // белое дошло до углов: карточка автора и ссылка (по очереди, по времени)
};

// Фигуры (картинки и «скелет» — final-rig.js): размер вырезки в единицах макета 1440×800 и позы — центр (x, y), поворот (градусы, по часовой), масштаб.
// p1 / p2 / p3 — по макетам final1 / final2 / final3 (tools/final-place.swift); p0 — до входа; наклон на замахе усилен.
const FIG = {
  statue: { w: 670.7, h: 571.7, depth: 1,
    pose: [[353, 412, -9, 1.02], [413, 400, -6.5, 1], [283, 400, -11.5, 1.035], [426, 400, 0, 1]] },
  grek: { w: 596.7, h: 492.6, depth: 0.9,
    pose: [[1118, 408, 6, 1.02], [1060.5, 395.5, 3.5, 1], [1140.5, 425.5, 8.5, 1.035], [1026.5, 385.5, 3.5, 1]] },
};
const TOUCH = [745, 290];          // точка почти-касания (палец и баночка) в макете final3
const BG = { w: 4000, h: 2232 };   // пропорции фона
// размах движения от мыши (доли ширины / высоты экрана) и запас масштаба слоёв фона под него.
// Замер референса (shopify.com/editions/winter2026): мышь от края до края — вся сцена едет на ≈ 10 % ширины и ≈ 11 % высоты,
// фон почти так же, как фигуры (разница слоёв — около десятой доли).
// «камера»: на замахе вся сцена (фон и фигуры) приближается, к касанию возвращается — как в референсе
const CAM_ZOOM = 0.075;
const PAR = { sky: [0.042, 0.044, 1.115], ter: [0.048, 0.05, 1.13], fig: [0.055, 0.056] };

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const smooth = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - (1 - t) ** 3;
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const mix = (a, b, t) => a + (b - a) * t;

const VERT = `attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform sampler2D uSky, uTer, uSt, uGr, uGrid;
uniform vec4 uSkyR, uTerR;          // слой фона: x, y, w, h на экране (px, y вниз)
uniform vec4 uStP, uGrP;            // фигура: центр x, y (px), cos, sin поворота
uniform vec2 uStS, uGrS;            // фигура: размер на экране (px)
uniform float uBurn;                // вход прожигом: 0 — ничего, ≥ 1.25 — сцена целиком
uniform float uAmp, uFreq, uMud;    // форма кромки прожига (как в bgfx.js)
uniform vec2 uC;                    // точка касания (px, y вниз)
uniform float uSpark;               // искра в точке касания 0…1
uniform float uFlash;               // вспышка 0…1
uniform float uRmax;                // радиус, закрывающий экран (в высотах экрана)

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }

vec4 bgLayer(sampler2D t, vec4 r, vec2 p) {
  vec2 uv = (p - r.xy) / r.zw;
  return texture2D(t, clamp(uv, 0.0, 1.0));
}
vec4 figure(sampler2D t, vec4 P, vec2 S, vec2 p) {
  vec2 d = p - P.xy;
  vec2 uv = vec2(P.z * d.x + P.w * d.y, -P.w * d.x + P.z * d.y) / S + 0.5;
  vec4 c = texture2D(t, clamp(uv, 0.0, 1.0));
  vec2 in01 = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return c * in01.x * in01.y;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);   // y вниз, как в вёрстке
  vec2 uv = gl_FragCoord.xy / uRes;                           // y вверх

  float grid = texture2D(uGrid, vec2(uv.x, 1.0 - uv.y)).a;
  // белый экран целиком: только белый с серой сеткой (сцену и шум не считаем)
  if (uFlash >= 0.999) { gl_FragColor = vec4(mix(vec3(1.0), vec3(0.0), grid), 1.0); return; }

  // ---------- сцена: слои снизу вверх (текстуры с премультиплицированной альфой) ----------
  vec3 col = bgLayer(uSky, uSkyR, px).rgb;
  vec4 c = bgLayer(uTer, uTerR, px);  col = c.rgb + col * (1.0 - c.a);
  c = figure(uSt, uStP, uStS, px);    col = c.rgb + col * (1.0 - c.a);
  c = figure(uGr, uGrP, uGrS, px);    col = c.rgb + col * (1.0 - c.a);
  col = mix(col, vec3(1.0), grid);

  vec2 q = (px - uC) / uRes.y;                                // от точки касания, в высотах экрана
  float d = length(q);

  // ---------- искра: четырёхлучевая звёздочка, мерцает ----------
  if (uSpark > 0.001) {
    float r = 0.006 + 0.016 * uSpark;
    float tw = 0.85 + 0.15 * sin(uTime * 9.0);
    float core = exp(-d * d / (r * r));
    vec2 a = abs(q);
    float rays = exp(-a.x / (r * 5.0)) * exp(-a.y / (r * 0.22)) + exp(-a.y / (r * 5.0)) * exp(-a.x / (r * 0.22));
    col += vec3(1.0, 0.98, 0.94) * (core * 1.4 + rays * 0.9) * uSpark * tw;
  }

  // ---------- вспышка: шар → кольцо с рваной кромкой, внутри — белый экран ----------
  float white = 0.0;
  if (uFlash > 0.0) {
    float ball = smooth(clamp(uFlash / 0.1, 0.0, 1.0));
    float sg = 0.035 + 0.11 * clamp(uFlash / 0.22, 0.0, 1.0);
    col += vec3(1.0) * ball * (exp(-d * d / (sg * sg)) * 1.6 + exp(-d / (sg * 2.6)) * 0.35) * (1.0 - smoothstep(0.35, 0.8, uFlash));

    float g = clamp((uFlash - 0.1) / 0.9, 0.0, 1.0);
    float R = uRmax * pow(g, 1.7);
    vec2 np = q * 2.3 + vec2(uTime * 0.04, -uTime * 0.03);
    float n = fbm(np) - 0.5;
    float mud = (fbm(q * 14.0 + vec2(3.1, uTime * 0.03)) - 0.5) * 0.5 + (vnoise(q * 80.0) - 0.5) * 0.15;
    float rag = min(1.0, 0.18 + R * 1.4);                    // маленькое кольцо — ровнее, большое — облаком
    float edge = R - (d + n * 0.55 * rag + mud * 0.12 * rag);  // > 0 — внутри
    float aa = 1.5 / uRes.y;
    white = smoothstep(-aa, aa, edge) * step(0.0001, g);

    // сцена перед кромкой выцветает и светлеет («призрачная»)
    float ghost = (1.0 - smoothstep(0.0, 0.42, -edge)) * step(0.0001, g);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum) * 1.12 + 0.2, ghost * 0.9);
    // свечение наружу от кромки
    float halo = (1.0 - smoothstep(0.0, 0.11, -edge)) * step(0.0001, g);
    col = mix(col, vec3(1.0), halo * halo * 0.92);
    // блёстки у кромки: редкие мерцающие звёздочки
    vec2 cell = floor(px / (uRes.y * 0.022));
    float rnd = hash(cell);
    vec2 cp = (fract(px / (uRes.y * 0.022)) - 0.5) + (vec2(hash(cell + 3.7), hash(cell + 9.1)) - 0.5) * 0.6;
    float tw = 0.5 + 0.5 * sin(uTime * (4.0 + rnd * 7.0) + rnd * 40.0);
    float star = exp(-dot(cp, cp) * 55.0) + exp(-abs(cp.x) * 30.0) * exp(-abs(cp.y) * 3.5) * 0.6 + exp(-abs(cp.y) * 30.0) * exp(-abs(cp.x) * 3.5) * 0.6;
    float near = (1.0 - smoothstep(0.0, 0.26, -edge)) * step(0.0001, g);
    col += vec3(1.0) * star * step(0.86, rnd) * tw * near * 1.2;
  }
  col = min(col, vec3(1.0));
  // белый экран: белый с серой сеткой (как у светлых блоков)
  col = mix(col, mix(vec3(1.0), vec3(0.0), grid), white);

  // ---------- вход: прожиг снизу вверх (формула кромки — как в bgfx.js) ----------
  float a = 1.0;
  if (uBurn < 1.3) {
    vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y);
    float n = fbm(p * uFreq + vec2(uTime * 0.035, -uTime * 0.05)) - 0.5;
    float mud = (fbm(p * 13.0 + vec2(3.1, uTime * 0.02)) - 0.5) * 0.55 + (vnoise(p * 70.0) - 0.5) * 0.18;
    float edge = uBurn * 1.12 - 0.06 - (uv.y + n * uAmp + mud * uMud);
    float aa = 1.2 / uRes.y;
    float blend = smoothstep(-aa, aa, edge);
    float flick = 0.5 + 0.5 * sin(uTime * 2.6 + uv.x * 38.0 + n * 24.0);
    float w = 0.007 + 0.006 * flick;
    float hot = 1.0 - smoothstep(0.0, w, abs(edge));
    col = mix(col, vec3(1.0, 0.97, 0.9), hot);
    float halo = 1.0 - smoothstep(0.0, 0.14, edge);
    halo *= halo * step(0.0, edge);
    col = mix(col, vec3(1.0, 0.98, 0.95), halo * 0.3 * (0.75 + 0.25 * flick));
    float scorch = (1.0 - smoothstep(0.0, 0.012, -edge)) * step(edge, 0.0);
    a = max(blend, hot);
    col *= a;
    a += scorch * 0.22 * (1.0 - a);
    gl_FragColor = vec4(col, a);
    return;
  }
  gl_FragColor = vec4(col, 1.0);
}
`.replace(/smooth\(/g, 'smoothstep(0.0, 1.0, ');

// фигура на сетке → своя текстура (поле PAD вокруг вырезки — деформация может выйти за её рамку)
const PAD = 0.14;
const MESH_VERT = `
attribute vec2 aP;       // вершина после деформации, доли вырезки (y вниз)
attribute vec2 aUV;
uniform float uPad;
varying vec2 vUV;
void main() { vUV = aUV; gl_Position = vec4((aP + uPad) / (1.0 + 2.0 * uPad) * 2.0 - 1.0, 0.0, 1.0); }
`;
const MESH_FRAG = `precision mediump float; uniform sampler2D uTex; varying vec2 vUV; void main() { gl_FragColor = texture2D(uTex, vUV); }`;

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });

class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { alpha: true, premultipliedAlpha: true, antialias: false };
    const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
    this.gl = gl;
    this.gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    const program = (vs, fs) => {
      const pr = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        gl.attachShader(pr, sh);
      }
      gl.linkProgram(pr);
      return pr;
    };
    // программа сетки фигур
    const mesh = program(MESH_VERT, MESH_FRAG);
    this.mesh = { prog: mesh, aP: gl.getAttribLocation(mesh, 'aP'), aUV: gl.getAttribLocation(mesh, 'aUV'),
      uPad: gl.getUniformLocation(mesh, 'uPad'), uTex: gl.getUniformLocation(mesh, 'uTex') };
    this.figs = {};
    const prog = program(VERT, FRAG);
    this.prog = prog;
    gl.useProgram(prog);
    this.u = {};
    for (const n of ['uRes', 'uTime', 'uSky', 'uTer', 'uSt', 'uGr', 'uGrid', 'uSkyR', 'uTerR', 'uStP', 'uGrP', 'uStS', 'uGrS', 'uBurn', 'uAmp', 'uFreq', 'uMud', 'uC', 'uSpark', 'uFlash', 'uRmax']) this.u[n] = gl.getUniformLocation(prog, n);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.quad = buf;
    this.aPos = gl.getAttribLocation(prog, 'aPos');
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.tex = {};
    // uSt / uGr — текстуры, в которые каждый кадр рисуются фигуры на сетке; исходные вырезки — srcSt / srcGr
    ['uSky', 'uTer', 'uSt', 'uGr', 'uGrid'].forEach((n, i) => { gl.uniform1i(this.u[n], i); this.tex[n] = this.makeTex(i); });
    this.srcUnit = 5;
    gl.uniform1f(this.u.uAmp, OVER_EDGE.amp);
    gl.uniform1f(this.u.uFreq, OVER_EDGE.freq);
    gl.uniform1f(this.u.uMud, OVER_EDGE.mud);
  }
  makeTex(unit) {
    const gl = this.gl, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { t, unit };
  }
  /** mip: уменьшенные копии (WebGL 2) — фигуры и фон не «звенят» на маленьких экранах */
  setTex(name, source, mip = true) {
    const gl = this.gl, { t, unit } = this.tex[name];
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (mip && this.gl2) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
  }
  /** фигура на сетке: листы [{ rig, img }] (снизу вверх; rig — final-rig.js), текстура-цель dst */
  addFigure(name, layers, dst) {
    const gl = this.gl;
    const f = { dst: this.tex[dst], w: 0, h: 0, fbo: gl.createFramebuffer(), layers: [] };
    for (const { rig, img } of layers) {
      const key = `src${this.srcUnit}`;
      this.tex[key] = this.makeTex(this.srcUnit++);
      this.setTex(key, img);
      const l = { rig, src: this.tex[key] };
      l.pos = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, l.pos);
      gl.bufferData(gl.ARRAY_BUFFER, rig.pos, gl.DYNAMIC_DRAW);
      l.uv = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, l.uv);
      gl.bufferData(gl.ARRAY_BUFFER, rig.uv, gl.STATIC_DRAW);
      l.index = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, l.index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, rig.index, gl.STATIC_DRAW);
      f.layers.push(l);
    }
    this.figs[name] = f;
  }
  /** фигура в свою текстуру: размер — как на экране (w × h px, с полем), поза — wind / fly */
  drawFigure(name, w, h, wind, fly) {
    const gl = this.gl, f = this.figs[name], m = this.mesh;
    w = Math.min(4096, Math.ceil(w / 16) * 16); h = Math.min(4096, Math.ceil(h / 16) * 16);
    gl.activeTexture(gl.TEXTURE0 + f.dst.unit);
    if (w !== f.w || h !== f.h) {
      f.w = w; f.h = h;
      gl.bindTexture(gl.TEXTURE_2D, f.dst.t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.dst.t, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(m.prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(m.uPad, PAD);
    gl.enableVertexAttribArray(m.aP);
    gl.enableVertexAttribArray(m.aUV);
    for (const l of f.layers) {
      gl.uniform1i(m.uTex, l.src.unit);
      gl.bindBuffer(gl.ARRAY_BUFFER, l.pos);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, l.rig.pose(wind, fly));
      gl.vertexAttribPointer(m.aP, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, l.uv);
      gl.vertexAttribPointer(m.aUV, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, l.index);
      gl.drawElements(gl.TRIANGLES, l.rig.index.length, gl.UNSIGNED_SHORT, 0);
    }
    gl.disableVertexAttribArray(m.aUV);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  resize(gridImg) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    this.dpr = dpr;
    this.canvas.width = W;
    this.canvas.height = H;
    this.gl.viewport(0, 0, W, H);
    if (!gridImg) return;
    // сетка в экранный размер, вписана как <img object-fit: cover> у остальных блоков
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const iw = gridImg.naturalWidth, ih = gridImg.naturalHeight, k = Math.max(W / iw, H / ih);
    ctx.drawImage(gridImg, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
    this.setTex('uGrid', c, false);
  }
  draw(time, st) {
    const gl = this.gl, u = this.u, k = this.dpr;
    // 1) фигуры — на сетке в свои текстуры (размер — под наибольший масштаб на экране)
    for (const [name, f] of [['statue', st.statue], ['grek', st.grek]]) {
      this.drawFigure(name, f.w0 * k * 1.12 * (1 + 2 * PAD), f.h0 * k * 1.12 * (1 + 2 * PAD), st.wind, st.fly);
    }
    // 2) вся сцена — одним прямоугольником
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, time);
    gl.uniform4f(u.uSkyR, ...st.sky.map(v => v * k));
    gl.uniform4f(u.uTerR, ...st.ter.map(v => v * k));
    for (const [P, S, f] of [[u.uStP, u.uStS, st.statue], [u.uGrP, u.uGrS, st.grek]]) {
      gl.uniform4f(P, f.x * k, f.y * k, Math.cos(f.rot), Math.sin(f.rot));
      gl.uniform2f(S, f.w * k * (1 + 2 * PAD), f.h * k * (1 + 2 * PAD));
    }
    gl.uniform1f(u.uBurn, st.burn);
    gl.uniform2f(u.uC, st.cx * k, st.cy * k);
    gl.uniform1f(u.uSpark, st.spark);
    gl.uniform1f(u.uFlash, st.flash);
    gl.uniform1f(u.uRmax, st.rmax);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/** строка, выкатывающаяся снизу (как в блоках 4 и 5) */
const line = html => `<span class="fin__ln"><span class="fin__in">${html}</span></span>`;

// подпись «Ershov.»: осевые линии штрихов (нарисованы по форме подписи, viewBox 158×139) — маска «письма пером»
const SIGN = [
  'M1 133L21.7 86.7L37.5 36.7Q43.7 20 44.7 22.5Q45 30 33.3 55L21.7 86.7L18.7 121.7Q19.7 125.5 23.3 122.5L49.2 86.3',
  'M49.2 86.3L52 127.5',
  'M50.8 90L72.5 77.8',
  'M85 87.3L63 91.3Q78.3 97.5 94.3 100L53.7 137.5',
  'M93.8 67.5L104.2 126.7',
  'M100.8 93.3Q106.7 85 111.7 93.3L114.7 112.5',
  'M115 57.5Q108 58 108.3 71.7Q109 88 120 90.8Q127 80 126.7 66.7Q125 53 113 54.5',
  'M115 57.5L149.2 79.7L130.8 1.7',
  'M154.6 70.6L155.6 72.6',
];

export async function initFinal() {
  const section = document.querySelector('#final');
  if (!section) return;
  const stage = section.querySelector('.fin__stage');
  const canvas = section.querySelector('.fin__gl');
  const frame = section.querySelector('.fin__frame');
  const white = section.querySelector('.fin__white');
  const card = section.querySelector('.fin__card');
  section.style.height = `${(1 + PIN_S) * 100}vh`;

  for (const el of section.querySelectorAll('[data-lines]')) el.innerHTML = el.dataset.lines.split('|').map(line).join('');
  const phraseLines = [...frame.querySelectorAll('.fin__in')];
  const boxRect = frame.querySelector('.fin__box rect');
  const center = white.querySelector('.fin__center');
  const cardRect = card.querySelector('.fin__card-rect rect');
  const tags = [...card.querySelectorAll('.fin__tag')];
  const photo = card.querySelector('.fin__photo img');
  const seal = card.querySelector('.fin__seal');
  const author = white.querySelector('.fin__author');
  initAllButton(author, { prefix: 'fin__author', link: true });   // наведение — как у «Все рецепты.»

  // подпись: растр под маской, перо идёт по осевым линиям
  const sign = card.querySelector('.fin__sign');
  sign.innerHTML = `<defs><mask id="fin-sign" maskUnits="userSpaceOnUse" x="-10" y="-10" width="178" height="159">${
    SIGN.map(d => `<path d="${d}" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`).join('')
  }</mask></defs><image href="img/final/podpis.webp" width="158" height="139" mask="url(#fin-sign)"/>`;
  const pens = [...sign.querySelectorAll('mask path')];
  const penLen = pens.map(p => p.getTotalLength());

  // ---------- исходные состояния; фраза в рамке — по скроллу, белый экран — по времени ----------
  // Фраза: одна «лента» — появление (0…PHRASE_IN: линия обходит контур рамки и набирает прозрачность, строки выкатываются снизу)
  // и уход (PHRASE_IN…конец: строки уезжают вверх, рамка гаснет). Положение на ленте задаёт скролл (frameFn).
  gsap.set(phraseLines, { yPercent: 140 });
  gsap.set(boxRect, { strokeDashoffset: 1, opacity: 0 });
  const phraseTl = gsap.timeline({ paused: true })
    .to(boxRect, { opacity: 1, duration: 0.4, ease: 'sine.out' }, 0)
    .to(boxRect, { strokeDashoffset: 0, duration: 1, ease: 'sine.inOut', autoRound: false }, 0)   // без autoRound GSAP округляет px до целых — линия появлялась скачком
    .to(phraseLines, { yPercent: 0, duration: 0.5, ease: 'power3.out', stagger: 0.09 }, 0.3);
  const PHRASE_IN = phraseTl.duration();
  phraseTl
    .to(phraseLines, { yPercent: -140, duration: 0.5, ease: 'power2.in', stagger: 0.07 }, PHRASE_IN)
    .to(boxRect, { opacity: 0, duration: 0.6, ease: 'sine.in' }, PHRASE_IN + 0.1);
  const PHRASE_ALL = phraseTl.duration();

  const whiteTl = gsap.timeline({ paused: true });
  const resetWhite = () => {
    gsap.set(cardRect, { strokeDashoffset: 1, opacity: 0 });
    gsap.set(tags, { autoAlpha: 0, y: 6 });
    gsap.set(photo, { yPercent: 101 });
    gsap.set(pens, { strokeDashoffset: 1, opacity: 0 });   // скрыты до своей очереди: у штриха с круглым концом «нулевой» отрезок виден точкой
    gsap.set(seal, { autoAlpha: 0, scale: 1.6, rotate: -18 });
    gsap.set(author, { autoAlpha: 0, y: 16 });
  };
  resetWhite();
  const penTotal = penLen.reduce((a, b) => a + b, 0);
  whiteTl
    .to(cardRect, { opacity: 1, duration: 0.7, ease: 'sine.out' }, 0)
    .to(cardRect, { strokeDashoffset: 0, duration: 1.6, ease: 'sine.inOut', autoRound: false }, 0)
    .to(photo, { yPercent: 0, duration: 1.1, ease: 'power3.out' }, 0.5)
    .to(tags, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.1 }, 1.0)
    // ссылка появляется целиком (её части двигает анимация наведения — их не трогаем)
    .to(author, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out' }, 0.7);
  // подпись: штрихи по очереди, время — по длине штриха
  let at = 1.3;
  pens.forEach((p, i) => {
    const dur = Math.max(0.08, 1.7 * penLen[i] / penTotal);
    whiteTl.set(p, { opacity: 1 }, at);
    whiteTl.to(p, { strokeDashoffset: 0, duration: dur, ease: i === 0 ? 'power1.inOut' : 'none', autoRound: false }, at);
    at += dur + 0.03;
  });
  whiteTl.to(seal, { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.45, ease: 'back.out(2.2)' }, at + 0.05);

  // ---------- сцена ----------
  let scene = null, ready = false, loading = false;
  let gridImg = null;
  const load = async () => {
    if (loading) return;
    loading = true;
    try {
      scene = new Scene(canvas);
      const figLayers = name => Promise.all(RIGS[name].layers.map(async l => ({ rig: new Rig(RIGS[name], l), img: await loadImg(l.src) })));
      const [sky, ter, grid, st, gr] = await Promise.all([...['img/final/nebo.webp', 'img/final/terrasa.webp', 'img/grid-lines-light.svg'].map(loadImg), figLayers('statue'), figLayers('grek')]);
      scene.setTex('uSky', sky);
      scene.setTex('uTer', ter);
      scene.addFigure('statue', st, 'uSt');
      scene.addFigure('grek', gr, 'uGr');
      gridImg = grid;
      scene.resize(gridImg);
      ready = true;
    } catch (err) { console.error('final', err); }
  };
  window.addEventListener('resize', () => scene?.resize(gridImg));

  // мышь: −1…1 от центра экрана, сглаживается в кадре
  const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    mouse.tx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  const state = { S: -9, Ss: -9, on: false, phraseT: -1, white: false, live: false, full: false, flash: 0 };
  // отладка скелета: __final.bend = { wind: 1, fly: 0 } — зафиксировать позу; null — по скроллу
  const api = { white: 0, bend: null, RIGS, state, T, FIG, seek(p) {
    const lenis = window.__hero?.lenis;
    lenis?.resize();
    const top = section.getBoundingClientRect().top + scrollY;
    const y = top + (-(1 + OVER_LEAD) + p * (1 + OVER_LEAD + PIN_S)) * innerHeight;
    if (lenis) lenis.scrollTo(y, { immediate: true }); else scrollTo(0, y);
  } };
  window.__final = api;

  /** поза фигуры на сценарии s: p0 → p1 (вход) → p2 (замах) → p3 (бросок) */
  const poseAt = (fig, s) => {
    const P = fig.pose;
    const a = easeOut(seg(s, ...T.enter)), b = easeInOut(seg(s, ...T.wind));
    // бросок: медленный отрыв, разгон и мягкая посадка
    const c = easeInOut(seg(s, ...T.lunge) ** 1.15);
    return P[0].map((v, i) => mix(mix(mix(v, P[1][i], a), P[2][i], b), P[3][i], c));
  };

  function frameFn(time, dt) {
    const vh = innerHeight, vw = innerWidth;
    const top = section.getBoundingClientRect().top;
    const S = -top / vh;
    state.S = S;
    const near = S > -(1 + OVER_LEAD) - 3;                    // за три экрана до входа — грузим слои
    if (near && !loading) load();
    const on = S > -(1 + OVER_LEAD) && ready;
    if (on !== state.on) { state.on = on; stage.classList.toggle('is-on', on); }
    if (!on) { if (state.white) setWhite(false); if (state.live) { state.live = false; white.classList.remove('is-live'); } return; }

    // сглаженный сценарий: фигуры идут за скроллом с лёгкой инерцией (при прыжке — сразу)
    if (Math.abs(S - state.Ss) > 1.2) state.Ss = S;
    state.Ss += (S - state.Ss) * (1 - Math.exp(-dt * 9));
    const s = state.Ss;
    mouse.x += (mouse.tx - mouse.x) * (1 - Math.exp(-dt * 3.2));
    mouse.y += (mouse.ty - mouse.y) * (1 - Math.exp(-dt * 3.2));

    const u = Math.min(vw / 1440, vh / 800);
    // наезд камеры: от центра экрана, только на замахе (к касанию — 1: кадр как в макете final3)
    const lu = seg(s, ...T.lunge);
    const windK = easeInOut(seg(s, ...T.wind)) * (1 - easeInOut(lu));
    const cam = 1 + CAM_ZOOM * (api.bend?.cam ?? windK);
    const X = x => vw / 2 + (x - 720) * u * cam, Y = y => vh / 2 + (y - 400) * u * cam;

    // фон: cover с запасом под движение; при обрезке по высоте режется в основном небо (низ с балюстрадой остаётся)
    // (сдвиг не выходит за запас: край картинки никогда не заходит в экран)
    const bg = ([ax, ay, zoom]) => {
      const k = Math.max(vw / BG.w, vh / BG.h) * zoom * cam, w = BG.w * k, h = BG.h * k;
      const x = (vw - w) / 2 + mouse.x * ax * vw, y = (vh - h) * 0.58 + mouse.y * ay * vh;
      return [clamp(x, vw - w, 0), clamp(y, vh - h, 0), w, h];
    };
    // «парение»: медленное покачивание; к касанию затихает, чтобы палец пришёл точно к баночке
    const calm = 1 - 0.85 * smooth(seg(s, T.lunge[0] + 0.25, T.lunge[1]));
    const fig = (f, ph) => {
      const [x, y, rot, sc] = poseAt(f, s);
      const bx = Math.sin(time * 0.52 + ph) * 3.2 * calm, by = Math.sin(time * 0.83 + ph * 1.7) * 6.5 * calm;
      const br = Math.sin(time * 0.61 + ph * 2.3) * 0.7 * calm;
      return {
        x: X(x + bx) + mouse.x * PAR.fig[0] * vw * f.depth,
        y: Y(y + by) + mouse.y * PAR.fig[1] * vh * f.depth,
        rot: (rot + br) * Math.PI / 180, w: f.w * u * sc * cam, h: f.h * u * sc * cam, w0: f.w * u, h0: f.h * u,
      };
    };
    // «скелет»: замах (0 → 1 → 0 к касанию) и полёт (горб в середине броска + влёт в кадр) — только от скролла
    const en = 1 - easeOut(seg(s, ...T.enter));
    const wind = api.bend?.wind ?? windK + 0.45 * en;
    const fly = api.bend?.fly ?? Math.sin(Math.PI * lu) ** 1.2 + 0.8 * en;
    const flash = seg(s, ...T.flash);
    state.flash = flash;
    api.white = flash > 0.72 ? 1 : 0;                         // хедер темнеет, когда белое дошло до него
    const cx = X(TOUCH[0]) + mouse.x * PAR.fig[0] * vw * 0.95, cy = Y(TOUCH[1]) + mouse.y * PAR.fig[1] * vh * 0.95;
    const rmax = Math.max(Math.hypot(cx, cy), Math.hypot(vw - cx, cy), Math.hypot(cx, vh - cy), Math.hypot(vw - cx, vh - cy)) / vh + 0.5;
    const sp = seg(s, ...T.spark);
    scene.draw(time, {
      sky: bg(PAR.sky), ter: bg(PAR.ter), statue: fig(FIG.statue, 0), grek: fig(FIG.grek, 2.1),
      burn: S >= 0 ? 10 : (vh - top) / vh + OVER_LEAD, wind, fly,
      cx, cy, rmax, flash,
      spark: smooth(sp) * (1 - smooth(seg(flash, 0, 0.12))),
    });

    // тексты по центру открываются вместе с белым: круглая маска чуть меньше белого облака (кромка у него рваная, ±0.3 экрана)
    const R = rmax * clamp((flash - 0.1) / 0.9) ** 1.7;
    const live = flash > 0.1;
    if (live !== state.live) { state.live = live; white.classList.toggle('is-live', live); }
    if (live) {
      const full = flash >= 1;
      if (full !== state.full) { state.full = full; center.classList.toggle('is-full', full); }
      if (!full) {
        const b = center.getBoundingClientRect();
        center.style.setProperty('--fx', `${(cx - b.left).toFixed(1)}px`);
        center.style.setProperty('--fy', `${(cy - b.top).toFixed(1)}px`);
        center.style.setProperty('--r0', `${(Math.max(0, R - 0.52) * vh).toFixed(1)}px`);
        center.style.setProperty('--r1', `${(Math.max(0, R - 0.3) * vh).toFixed(1)}px`);
      }
    }

    // фраза в рамке — по скроллу (со сглаженным s: без рывков при резкой прокрутке)
    const pIn = seg(s, ...T.phraseIn), pOut = seg(s, ...T.phraseOut);
    const pt = pOut > 0 ? PHRASE_IN + pOut * (PHRASE_ALL - PHRASE_IN) : pIn * PHRASE_IN;
    if (pt !== state.phraseT) { state.phraseT = pt; phraseTl.time(pt); }
    setWhite(S > T.white);
  }

  function setWhite(v) {
    if (v === state.white) return;
    state.white = v;
    white.classList.toggle('is-on', v);
    if (v) whiteTl.timeScale(1).play();
    else whiteTl.timeScale(3).reverse();
  }

  let last = 0;
  gsap.ticker.add(t => { const dt = Math.min(0.05, last ? t - last : 1 / 60); last = t; frameFn(t, dt); });
  api.frame = (dt = 1 / 60) => frameFn(performance.now() / 1000, dt);
  api.scene = () => scene;
  api.tl = { phraseTl, whiteTl };   // отладка: __final.tl.whiteTl.progress(1)
}
