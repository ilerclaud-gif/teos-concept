// Фон светлых/цветных блоков в одном WebGL-канвасе и переходы между ними «прожигом»,
// как на shopify.com/editions/winter2026: следующий фон проступает снизу вверх вместе со скроллом,
// граница — порог по высоте экрана + шум и мелкая «грязевая» фактура (рваный край),
// шум медленно ползёт во времени (край живой), а на самой кромке цвет пересвечен с мерцанием —
// кромка раскалена и «прожигает» предыдущий фон.
//
// Остановки (stops): DOM-блоки с прозрачным фоном; их фон рисует этот канвас.
//   { el, color: [r,g,b], grid: bool } — grid: поверх цвета тёмная сетка (img/grid-lines-dark.svg)

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uProgress;      // 0 — следующий фон ещё ниже экрана, 1 — дошёл до верха
uniform vec3 uFrom, uTo;
uniform float uFromGrid, uToGrid;
uniform sampler2D uGridIn;    // свои линии нового блока (белые), пока он въезжает: рисуются по всему новому фону
uniform float uToIn;          // их прозрачность (0 — нет)
uniform float uFromA;         // 1 — старый фон непрозрачный; 0 — прозрачный (прожиг поверх DOM-блока, слой-оверлей)
uniform sampler2D uGrid;      // сетка, вписанная в экран (cover), альфа = линии
uniform float uAmp, uFreq;    // размах и частота крупной волны края
uniform float uMud;           // размах мелкой рвани
uniform float uSeam;          // потолок фронта (uv.y): выше — всегда старый фон (оверлей: стык блоков); 10 — без потолка
uniform float uSpark;         // искры над кромкой (оверлей)
uniform sampler2D uProf;      // профиль кромки (оверлей): глубина под стыком по x, 0…1 → 0…0.5 экрана
uniform float uProfOn;        // 1 — кромка по профилю (им же JS обрезает контент нового блока)
uniform float uCut;           // 1 — без прожига: ровный стык по верху блока, обычный скролл

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }

vec3 layer(vec3 color, float grid, vec2 uv) {
  float line = texture2D(uGrid, vec2(uv.x, 1.0 - uv.y)).a * grid;
  return mix(color, vec3(0.0), line);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;                 // y вверх
  vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y);       // без растяжения по ширине

  // крупная волна края, ползёт во времени
  float n = fbm(p * uFreq + vec2(uTime * 0.035, -uTime * 0.05)) - 0.5;
  // «грязь»: мелкая рваная фактура
  float mud = (fbm(p * 13.0 + vec2(3.1, uTime * 0.02)) - 0.5) * 0.55 + (vnoise(p * 70.0) - 0.5) * 0.18;
  float thr = uv.y + n * uAmp + mud * uMud;
  // запас m — чтобы при любом размахе кромка начинала ниже экрана и заканчивала выше него (без скачка в начале и конце)
  float m = uAmp * 0.38;
  float edge = uProgress * (1.0 + 2.0 * m) - m - thr; // > 0 — уже следующий фон
  edge = min(edge, uSeam - 0.003 - uv.y);
  if (uProfOn > 0.5) edge = uSeam - texture2D(uProf, vec2(uv.x, 0.5)).r * 0.5 - uv.y;
  if (uCut > 0.5) edge = uProgress - uv.y;
  float fx = 1.0 - uCut;                             // эффекты кромки (у ровного стыка — нет)
  float aa = 1.2 / uRes.y;
  float blend = smoothstep(-aa, aa, edge);

  vec3 toCol = layer(uTo, uToGrid, uv);
  if (uToIn > 0.0) toCol = mix(toCol, vec3(1.0), texture2D(uGridIn, vec2(uv.x, 1.0 - uv.y)).a * uToIn);
  vec3 col = mix(layer(uFrom, uFromGrid, uv), toCol, blend);

  // раскалённая кромка (как фронт проявления в интро): тонкое тёплое ядро, мерцает вдоль края
  float flick = 0.5 + 0.5 * sin(uTime * 2.6 + uv.x * 38.0 + n * 24.0);
  float w = 0.007 + 0.006 * flick;
  float g = (1.0 - smoothstep(0.0, w, abs(edge))) * fx;
  col = mix(col, vec3(1.0, 0.97, 0.9), g);
  // свечение, расползающееся от кромки по новому фону (широкое, мягкое, с квадратичным спадом)
  float halo = 1.0 - smoothstep(0.0, 0.14, edge);
  halo *= halo * step(0.0, edge) * fx;
  // на тёмный новый фон (блок 5 → 6) светлое свечение выглядит дымкой — оставляем только кромку и искры
  float toL = dot(uTo, vec3(0.299, 0.587, 0.114));
  halo *= mix(0.12, 1.0, toL);
  col = mix(col, vec3(0.97, 0.97, 1.0), halo * 0.85 * (0.75 + 0.25 * flick));
  // дальняя мягкая подсветка нового фона над кромкой
  float bloom = (1.0 - smoothstep(0.0, 0.3, edge)) * step(0.0, edge) * fx * toL;
  col += vec3(0.25, 0.27, 0.3) * bloom * bloom * (0.8 + 0.2 * flick);
  col = min(col, vec3(1.0));
  // обугленная тень по старому фону сразу перед кромкой
  float scorch = (1.0 - smoothstep(0.0, 0.012, -edge)) * step(edge, 0.0) * fx;
  col *= 1.0 - scorch * 0.12;

  // альфа: новый фон и раскалённая кромка непрозрачны; у прозрачного старого фона — тёмная полоса «обугливания»
  float a = max(mix(uFromA, 1.0, blend), g);
  vec3 pm = col * a;
  a += scorch * 0.22 * (1.0 - uFromA) * (1.0 - a);
  // искры: редкие раскалённые точки над кромкой, мерцают
  float near = 1.0 - smoothstep(0.0, 0.08, -edge);
  float spark = step(0.9935, hash(floor(gl_FragCoord.xy / 3.0) + floor(uTime * 7.0) * 0.37)) * near * step(edge, 0.0) * uSpark;
  pm = mix(pm, vec3(1.0, 0.96, 0.88), spark);
  a = max(a, spark);
  gl_FragColor = vec4(pm, a);
}
`;

export class BgFX {
  /** overlay: true — прозрачный канвас поверх контента (прожиг из «ничего» в новый фон) */
  constructor(canvas, stops, { overlay = false } = {}) {
    this.canvas = canvas;
    this.stops = stops;
    this.overlay = overlay;
    const gl = canvas.getContext('webgl', { alpha: overlay, premultipliedAlpha: true, antialias: false });
    this.gl = gl;
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    gl.useProgram(prog);
    this.u = {};
    for (const n of ['uRes', 'uTime', 'uProgress', 'uFrom', 'uTo', 'uFromGrid', 'uToGrid', 'uGrid', 'uGridIn', 'uToIn', 'uFromA', 'uAmp', 'uFreq', 'uMud', 'uSeam', 'uSpark', 'uProf', 'uProfOn', 'uCut']) this.u[n] = gl.getUniformLocation(prog, n);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = unit => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.gridTex = tex(0);
    this.gridInTex = tex(2);
    gl.uniform1i(this.u.uGrid, 0);
    gl.uniform1i(this.u.uProf, 1);
    gl.uniform1i(this.u.uGridIn, 2);
  }

  /** Профиль кромки (оверлей): Uint8Array глубин под стыком, 255 = 0.5 экрана */
  setProfile(bytes) {
    const gl = this.gl;
    if (!this.profTex) {
      this.profTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.profTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.profTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, bytes.length, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
  }

  async loadGrid(src) {
    this.gridImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    this.resize();
  }
  /** Линии блока, которые фон рисует сам, пока блок въезжает (stop.gridIn — их прозрачность) */
  async loadGridIn(src) {
    this.gridInImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    this.resize();
  }

  /** Сетка в экранный размер с тем же вписыванием, что и <img object-fit: cover> в DOM */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    this.canvas.width = W;
    this.canvas.height = H;
    this.gl.viewport(0, 0, W, H);
    const gl = this.gl;
    for (const [img, t, unit] of [[this.gridImg, this.gridTex, 0], [this.gridInImg, this.gridInTex, 2]]) {
      if (!img) continue;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const k = Math.max(W / iw, H / ih);
      ctx.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    }
  }

  /** Какие два фона сейчас на экране и насколько следующий «прожёг» предыдущий */
  state() {
    const vh = innerHeight;
    let from = this.stops[0], to = this.stops[0], progress = 0;
    for (let i = 0; i < this.stops.length; i++) {
      const top = this.stops[i].el.getBoundingClientRect().top;
      if (top <= 0) { from = to = this.stops[i]; progress = 0; }
      else if (top < vh && i > 0) {
        from = this.stops[i - 1];
        to = this.stops[i];
        progress = (vh - top) / vh;
        break;
      }
    }
    return { from, to, progress };
  }

  draw(time) {
    const { from, to, progress } = this.state();
    this.drawState(time, from, to, progress, { cut: to.cut, ...to.edge });
  }

  /** from === null — старый фон прозрачный (оверлей); edge — форма кромки { amp, freq, mud, seam, spark, prof, cut } */
  drawState(time, from, to, progress, edge = {}) {
    const gl = this.gl;
    const fromA = from ? 1 : 0;
    from = from || { color: to.color, grid: false };
    gl.uniform1f(this.u.uFromA, fromA);
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uTime, time);
    gl.uniform1f(this.u.uProgress, progress);
    gl.uniform1f(this.u.uAmp, edge.amp ?? 0.16);
    gl.uniform1f(this.u.uFreq, edge.freq ?? 2.6);
    gl.uniform1f(this.u.uMud, edge.mud ?? 0.05);
    gl.uniform1f(this.u.uSeam, edge.seam ?? 10);
    gl.uniform1f(this.u.uSpark, edge.spark ?? 0);
    gl.uniform1f(this.u.uProfOn, edge.prof && this.profTex ? 1 : 0);
    gl.uniform1f(this.u.uCut, edge.cut ? 1 : 0);
    gl.uniform3fv(this.u.uFrom, from.color);
    gl.uniform3fv(this.u.uTo, to.color);
    // прозрачность линий (13%) уже заложена в самом SVG (<g opacity="0.13">) — второй раз не умножаем
    gl.uniform1f(this.u.uFromGrid, from.grid ? 1 : 0);
    gl.uniform1f(this.u.uToGrid, to.grid ? 1 : 0);
    gl.uniform1f(this.u.uToIn, to !== from && to.gridIn && this.gridInImg ? to.gridIn : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gridTex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
