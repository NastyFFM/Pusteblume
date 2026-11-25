/**
 * Pust-Erkennung über die Web Audio API.
 *
 * Pusten ins Mikrofon erzeugt breitbandiges Rauschen mit hohem Pegel. Wir
 * messen den RMS-Pegel, kalibrieren in der ersten Sekunde den Grundpegel der
 * Umgebung und leiten daraus eine Intensität 0..1 ab. Attack schnell, Release
 * etwas langsamer, damit die Blätter weich reagieren.
 */
export class BlowDetector {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private floorDb = -60;
  private calibrateUntil = 0;
  private smoothed = 0;
  private _level = 0;

  /** Aktuelle Pust-Intensität 0..1 (geglättet). */
  get intensity() {
    return this.smoothed;
  }

  /** Roher Pegel in dB (für Debug-Anzeigen). */
  get levelDb() {
    return this._level;
  }

  get active() {
    return this.analyser !== null;
  }

  static get supported() {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined";
  }

  async start() {
    if (this.active) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    this.ctx = new AudioContext();
    await this.ctx.resume();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    source.connect(this.analyser);
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.floorDb = -60;
    this.calibrateUntil = performance.now() + 900;
    this.smoothed = 0;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.buffer = null;
    this.smoothed = 0;
  }

  /** Pro Frame aufrufen. dt in Sekunden. */
  update(dt: number) {
    if (!this.analyser || !this.buffer) return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i]! * this.buffer[i]!;
    const rms = Math.sqrt(sum / this.buffer.length);
    const db = 20 * Math.log10(rms + 1e-8);
    this._level = db;

    const now = performance.now();
    if (now < this.calibrateUntil) {
      // Grundpegel der Umgebung bestimmen (Maximum der Ruhephase).
      this.floorDb = Math.max(this.floorDb, db);
      return;
    }
    // Grundpegel langsam nachführen, wenn es leise ist.
    if (db < this.floorDb) this.floorDb += (db - this.floorDb) * 0.02;

    // Ab ~6 dB über dem Grundpegel beginnt "Pusten", nach weiteren ~22 dB ist es "voll".
    const start = Math.max(this.floorDb + 6, -45);
    const raw = Math.max(0, Math.min(1, (db - start) / 22));

    const rate = raw > this.smoothed ? 14 : 5; // Attack / Release
    this.smoothed += (raw - this.smoothed) * Math.min(1, rate * dt);
  }
}

/**
 * Fallback ohne Mikrofon: Wischen oder Tippen erzeugt einen Windstoß, der
 * abklingt. Intensität ergibt sich aus der Wischgeschwindigkeit.
 */
export class GestureBlow {
  private gust = 0;
  private lastPoint: { x: number; y: number; t: number } | null = null;

  get intensity() {
    return this.gust;
  }

  attach(target: HTMLElement) {
    const onDown = (e: PointerEvent) => {
      this.lastPoint = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.gust = Math.max(this.gust, 0.45);
    };
    const onMove = (e: PointerEvent) => {
      if (!this.lastPoint) return;
      const now = performance.now();
      const dt = Math.max(1, now - this.lastPoint.t);
      const v = Math.hypot(e.clientX - this.lastPoint.x, e.clientY - this.lastPoint.y) / dt; // px/ms
      this.gust = Math.max(this.gust, Math.min(1, 0.3 + v * 0.6));
      this.lastPoint = { x: e.clientX, y: e.clientY, t: now };
    };
    const onUp = () => (this.lastPoint = null);
    target.addEventListener("pointerdown", onDown);
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
    target.addEventListener("pointerleave", onUp);
  }

  /** Künstlichen Windstoß auslösen (Tastatur, Tests). */
  pulse(strength: number) {
    this.gust = Math.max(this.gust, Math.min(1, strength));
  }

  update(dt: number) {
    this.gust = Math.max(0, this.gust - dt * 1.4);
  }
}
