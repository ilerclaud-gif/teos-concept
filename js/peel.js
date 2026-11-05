// «Отклеивание» наклейки (как голова на trevornoah.com): картинка — плоская сетка, вершины за линией сгиба
// заворачиваются вокруг цилиндра радиуса 1/k к зрителю и ложатся обратно поверх (лист перегибается),
// оборотная сторона — бумага. Линия сгиба по прогрессу проходит по диагонали от угла (верхний левый) через всю наклейку,
// дальше перевёрнутый лист уезжает (на каждую единицу хода линии — на две).
// Тень: тот же лист, смещённый пропорционально высоте над поверхностью, тёмный и полупрозрачный.
//
// Координаты — единицы макета: x вправо, y вниз, z к зрителю; холст покрывает прямоугольник view.

const VERT = `
attribute vec2 aUv;
uniform vec4 uRect;      // наклейка: x, y, w, h (ед.)
uniform vec4 uView;      // холст: x, y, w, h (ед.)
uniform vec2 uOrigin;    // точка на линии сгиба
uniform vec2 uAxis;      // направление, в котором лежит отгибаемая часть (единичный)
uniform float uK;        // кривизна сгиба (1/радиус)
uniform float uShadow;   // 1 — проход тени
varying vec2 vUv;
varying float vBend;
varying float vLift;

const float PI = 3.14159265;

void main() {
  vec3 p = vec3(uRect.xy + aUv * uRect.zw, 0.0);
  float d = dot(p.xy - uOrigin, uAxis);
  float bend = 0.0;
  if (d > 0.0) {
    float r = 1.0 / uK;
    vec2 perp = p.xy - uOrigin - uAxis * d;
    float th = min(d * uK, PI);
    float excess = max(0.0, d - PI * r);
    p.xy = uOrigin + perp + uAxis * (sin(th) * r - excess);
    p.z = (1.0 - cos(th)) * r;
    bend = th / PI;
  }
  vLift = p.z;
  // тень: смещение вниз-вправо пропорционально высоте
  if (uShadow > 0.5) p.xy += vec2(0.18, 0.32) * p.z;
  // перспектива вокруг центра холста
  vec2 c = uView.xy + uView.zw * 0.5;
  float f = 2400.0;
  float s = f / (f - p.z);
  vec2 q = c + (p.xy - c) * s;
  vec2 ndc = (q - uView.xy) / uView.zw * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, -p.z / 4000.0 * (1.0 - uShadow) + uShadow * 0.9, 1.0);
  vUv = aUv;
  vBend = bend;
}
`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform float uShadow;
uniform float uDepthOnly;  // 1 — проход глубины: только плотная часть листа (без полупрозрачной кромки)
varying vec2 vUv;
varying float vBend;
varying float vLift;

void main() {
  vec4 t = texture2D(uTex, vUv);
  if (t.a < (uDepthOnly > 0.5 ? 0.6 : 0.01)) discard;
  if (uShadow > 0.5) {
    float a = t.a * 0.2 * smoothstep(0.0, 40.0, vLift) * (1.0 - smoothstep(100.0, 240.0, vLift) * 0.7);
    gl_FragColor = vec4(0.0, 0.02, 0.16, 1.0) * a;
    return;
  }
  // освещение изгиба: на «спине» цилиндра светлее, у основания — тень
  float shade = 1.0 - 0.28 * sin(vBend * 3.14159) * (1.0 - vBend) - 0.12 * smoothstep(0.0, 0.15, vBend) * (1.0 - smoothstep(0.15, 0.5, vBend));
  if (gl_FrontFacing) {
    gl_FragColor = vec4(t.rgb * shade, t.a);
  } else {
    // оборот наклейки — бумага (чуть тёплая), с лёгкой фактурой
    float n = fract(sin(dot(floor(vUv * 900.0), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 paper = vec3(0.94, 0.93, 0.9) * (0.97 + 0.03 * n) * (0.82 + 0.18 * shade);
    gl_FragColor = vec4(paper * t.a, t.a);
  }
}
`;

export class Peel {
  constructor(canvas, image) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, depth: true });
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
    for (const n of ['uRect', 'uView', 'uOrigin', 'uAxis', 'uK', 'uShadow', 'uDepthOnly', 'uTex']) this.u[n] = gl.getUniformLocation(prog, n);

    // сетка N×N
    const N = 140;
    const uv = [], idx = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) uv.push(i / N, j / N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aUv');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    this.count = idx.length;

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uTex, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** rect — наклейка, view — что покрывает холст (оба в ед.), uw — px на ед. */
  layout(rect, view, uw) {
    this.rect = rect;
    this.view = view;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(view.w * uw * dpr);
    this.canvas.height = Math.round(view.h * uw * dpr);
    // ось: отгибается верхний левый угол (низ головы за краем экрана), лист переворачивается и уходит вправо
    const ax = -1, ay = -0.38;
    const l = Math.hypot(ax, ay);
    this.axis = [ax / l, ay / l];
    // полуразмер наклейки вдоль оси
    this.reach = (Math.abs(this.axis[0]) * rect.w + Math.abs(this.axis[1]) * rect.h) / 2;
  }

  /** p: 0 — лежит, 1 — отклеена и улетела */
  draw(p) {
    const gl = this.gl, r = this.rect, v = this.view;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    // линия сгиба: от угла (сам угол прямоугольника прозрачный — голова круглая, поэтому старт ближе: −0.5·reach)
    // за противоположный край и дальше, пока перевёрнутый лист не уйдёт с экрана
    const s0 = -this.reach * 0.5, s1 = this.reach + 300;
    const s = s0 + p * (s1 - s0);
    const o = [cx + this.axis[0] * -s, cy + this.axis[1] * -s];
    gl.uniform4f(this.u.uRect, r.x, r.y, r.w, r.h);
    gl.uniform4f(this.u.uView, v.x, v.y, v.w, v.h);
    gl.uniform2f(this.u.uOrigin, o[0], o[1]);
    gl.uniform2f(this.u.uAxis, this.axis[0], this.axis[1]);
    gl.uniform1f(this.u.uK, 1 / 115);

    // тень (без глубины)
    gl.disable(gl.DEPTH_TEST);
    gl.uniform1f(this.u.uDepthOnly, 0);
    gl.uniform1f(this.u.uShadow, 1);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    // глубина — только по плотной части листа: полупрозрачная рваная кромка перевёрнутой части
    // не должна «вырезать» лежащий под ней лист (иначе по краю просвечивает фон)
    gl.uniform1f(this.u.uShadow, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.colorMask(false, false, false, false);
    gl.uniform1f(this.u.uDepthOnly, 1);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    // цвет — без записи глубины
    gl.colorMask(true, true, true, true);
    gl.depthMask(false);
    gl.uniform1f(this.u.uDepthOnly, 0);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
  }
}
