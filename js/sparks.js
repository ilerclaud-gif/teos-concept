// Искры при «разломе» статуи: быстрые раскалённые штрихи разлетаются по экрану,
// медленные угольки всплывают вверх и гаснут. Симуляция идёт по времени,
// а интенсивность выброса задаётся снаружи (привязана к скроллу).

const MAX = 700;

// светящаяся точка-спрайт (рисуется один раз)
function makeSprite(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,248,230,1)');
  grad.addColorStop(0.25, 'rgba(255,200,120,0.85)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export class Sparks {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.p = [];
    this.sprite = makeSprite(64);
    this.dpr = 1;
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * this.dpr);
    const h = Math.round(this.canvas.clientHeight * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /**
   * n частиц из области тела: center [x, y] и radius — в px канваса
   */
  emit(n, center, radius) {
    const d = this.dpr;
    for (let k = 0; k < n && this.p.length < MAX; k++) {
      // точка рождения: эллипс вокруг груди, гуще к центру
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * radius;
      const x = center[0] + Math.cos(a) * rr * 0.8;
      const y = center[1] + Math.sin(a) * rr;
      // направление: от центра наружу с разбросом и подъёмом вверх
      const dir = a + (Math.random() - 0.5) * 1.2;
      const ember = Math.random() < 0.3;
      const speed = (ember ? 30 + Math.random() * 110 : 260 + Math.random() * 1100) * d;
      this.p.push({
        x, y, px: x, py: y,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed - (ember ? 40 : 160) * d,
        life: ember ? 1.6 + Math.random() * 1.6 : 0.6 + Math.random() * 0.9,
        age: 0,
        size: (ember ? 2.5 + Math.random() * 4 : 1.4 + Math.random() * 1.8) * d,
        ember,
        flicker: Math.random() * 6.28,
      });
    }
  }

  update(dt) {
    const d = this.dpr;
    const keep = [];
    for (const q of this.p) {
      q.age += dt;
      if (q.age >= q.life) continue;
      q.px = q.x; q.py = q.y;
      const drag = Math.exp(-(q.ember ? 0.9 : 1.7) * dt);
      q.vx *= drag; q.vy *= drag;
      // искры чуть проседают, угольки всплывают в тёплом воздухе
      q.vy += (q.ember ? -60 : 140) * d * dt;
      q.vx += (Math.random() - 0.5) * (q.ember ? 60 : 20) * d * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      keep.push(q);
    }
    this.p = keep;
  }

  draw(time) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.p.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const q of this.p) {
      const t = q.age / q.life;
      const fade = (1 - t) * (1 - t) * Math.min(q.age * 12, 1);
      const flick = 0.75 + 0.25 * Math.sin(time * 30 + q.flicker);
      const alpha = Math.min(fade * flick * 1.5, 1);
      if (!q.ember) {
        // раскалённый штрих: хвост по направлению движения
        const tx = q.x - q.vx * 0.035, ty = q.y - q.vy * 0.035;
        ctx.strokeStyle = `rgba(255, ${170 + 70 * (1 - t) | 0}, ${70 + 120 * (1 - t) | 0}, ${alpha})`;
        ctx.lineWidth = q.size;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      const s = q.size * (q.ember ? 5 : 4);
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.sprite, q.x - s / 2, q.y - s / 2, s, s);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  get active() { return this.p.length > 0; }
}
