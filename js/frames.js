// Хранилище кадров: сжатые AVIF лежат в памяти как Blob,
// в ImageBitmap декодируется только окно вокруг текущего кадра.

const MAX_BITMAPS = 36;
const MAX_DECODES = 4;
const FETCH_CONCURRENCY = 8;

export class Track {
  /**
   * @param {string} name
   * @param {{seg: string, from: number, to: number}[]} parts — куски сегментов (to не включительно)
   */
  constructor(name, parts) {
    this.name = name;
    this.urls = [];
    for (const p of parts) {
      for (let i = p.from; i < p.to; i++) {
        this.urls.push(`seq/${p.seg}/${String(i).padStart(4, '0')}.webp`);
      }
    }
    this.count = this.urls.length;
    this.blobs = new Array(this.count).fill(null);
  }
}

export class FrameStore {
  constructor() {
    this.bitmaps = new Map(); // key -> {bmp, used}
    this.pending = new Map(); // key -> Promise
    this.queue = [];
    this.decoding = 0;
    this.tick = 0;
  }

  /** Загружает сжатые кадры всех треков; onProgress(0..1) */
  load(tracks, onProgress) {
    const jobs = [];
    for (const t of tracks) for (let i = 0; i < t.count; i++) jobs.push([t, i]);
    return this.fetchJobs(jobs, onProgress);
  }

  /** Загружает кадры трека [from, to) — для фоновой догрузки хвоста ленты */
  loadRange(track, from, to, onProgress) {
    const jobs = [];
    for (let i = from; i < Math.min(to, track.count); i++) if (!track.blobs[i]) jobs.push([track, i]);
    return this.fetchJobs(jobs, onProgress);
  }

  async fetchJobs(jobs, onProgress) {
    let done = 0;
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const [t, i] = jobs[next++];
        const res = await fetch(t.urls[i]);
        if (!res.ok) throw new Error(`Кадр не найден: ${t.urls[i]}`);
        t.blobs[i] = await res.blob();
        done++;
        onProgress?.(done / jobs.length);
      }
    };
    await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
  }

  key(track, i) { return track.name + ':' + i; }

  /** Декодированный кадр или null; ставит декодирование в очередь */
  get(track, i) {
    const k = this.key(track, i);
    const e = this.bitmaps.get(k);
    if (e) { e.used = ++this.tick; return e.bmp; }
    this.request(track, i, true);
    return null;
  }

  /** Ближайший к i уже декодированный кадр (пока нужный декодируется) */
  nearest(track, i) {
    for (let d = 0; d < 24; d++) {
      for (const j of [i - d, i + d]) {
        if (j < 0 || j >= track.count) continue;
        const e = this.bitmaps.get(this.key(track, j));
        if (e) { e.used = ++this.tick; return { bmp: e.bmp, index: j }; }
      }
    }
    return null;
  }

  /** Декодирует кадр и ждёт результата */
  async decode(track, i) {
    this.request(track, i, true);
    await this.pending.get(this.key(track, i));
    return this.bitmaps.get(this.key(track, i))?.bmp ?? null;
  }

  request(track, i, urgent = false) {
    if (i < 0 || i >= track.count || !track.blobs[i]) return;
    const k = this.key(track, i);
    if (this.bitmaps.has(k) || this.pending.has(k)) return;
    let resolve;
    const p = new Promise(r => (resolve = r));
    this.pending.set(k, p);
    const job = { track, i, k, resolve };
    urgent ? this.queue.unshift(job) : this.queue.push(job);
    this.pump();
  }

  /** Сбрасывает ещё не начатые задачи (при быстром скролле они устаревают) */
  cancelQueued() {
    for (const job of this.queue) { this.pending.delete(job.k); job.resolve(); }
    this.queue.length = 0;
  }

  /** Предзагрузка окна вокруг кадра с учётом направления скролла */
  prefetch(track, i, dir) {
    const ahead = 14, behind = 4;
    for (let d = 1; d <= ahead; d++) this.request(track, i + d * (dir >= 0 ? 1 : -1));
    for (let d = 1; d <= behind; d++) this.request(track, i - d * (dir >= 0 ? 1 : -1));
  }

  pump() {
    while (this.decoding < MAX_DECODES && this.queue.length) {
      const job = this.queue.shift();
      this.decoding++;
      this.decodeBlob(job.track.blobs[job.i])
        .then(bmp => {
          this.bitmaps.set(job.k, { bmp, used: ++this.tick });
          this.evict();
        })
        .catch(err => console.warn('decode', job.k, err))
        .finally(() => {
          this.pending.delete(job.k);
          this.decoding--;
          job.resolve();
          this.pump();
        });
    }
  }

  /**
   * Chromium не декодирует AVIF от кодировщика Apple через createImageBitmap(blob),
   * хотя <img> с ними справляется. Тогда декодируем через Image.decode().
   */
  async decodeBlob(blob) {
    if (!this.viaImage) {
      // none: у части кадров Hero есть альфа (маска героя), цвет под ней не умножен — вне героя сохранён фон кадра
      try { return await createImageBitmap(blob, { premultiplyAlpha: 'none' }); } catch { this.viaImage = true; }
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img, { premultiplyAlpha: 'none' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  evict() {
    if (this.bitmaps.size <= MAX_BITMAPS) return;
    const entries = [...this.bitmaps.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let n = 0; n < entries.length - MAX_BITMAPS; n++) {
      const [k, e] = entries[n];
      if (this.pinned?.has(k)) continue;
      e.bmp.close?.();
      this.bitmaps.delete(k);
    }
  }
}
