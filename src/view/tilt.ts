import type { Camera } from "../rose/projection";

/**
 * Kamera aus der Handy-Neigung (DeviceOrientation) oder der Mausposition (Desktop).
 * Flach gehaltenes Handy = Blick von oben, aufrecht gehalten = von der Seite,
 * seitliches Kippen dreht die Rose. Die Werte werden pro Frame weich nachgeführt.
 */
export class TiltCamera {
  private target: Camera;
  private current: Camera;
  private hasOrientation = false;

  constructor(private readonly base: Camera, private readonly range = { elevation: [30, 80] as [number, number], azimuth: 35 }) {
    this.target = { ...base };
    this.current = { ...base };
  }

  get camera(): Camera {
    return this.current;
  }

  /** Auf iOS muss die Erlaubnis aus einer Nutzergeste heraus angefragt werden. */
  async requestPermission(): Promise<boolean> {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<"granted" | "denied"> } }).DeviceOrientationEvent;
    if (DOE?.requestPermission) {
      try {
        return (await DOE.requestPermission()) === "granted";
      } catch {
        return false;
      }
    }
    return true;
  }

  attach(target: HTMLElement) {
    window.addEventListener("deviceorientation", (e) => {
      if (e.beta === null || e.gamma === null) return;
      this.hasOrientation = true;
      // beta: 0 = flach (Display nach oben), 90 = aufrecht. gamma: seitliche Neigung.
      const elevation = clamp(88 - e.beta * 0.75, this.range.elevation[0], this.range.elevation[1]);
      const azimuth = clamp(e.gamma * 0.7, -this.range.azimuth, this.range.azimuth);
      this.target = { elevation, azimuth };
    });
    // Desktop: Maus über der Bühne
    target.addEventListener("pointermove", (e) => {
      if (this.hasOrientation || e.pointerType !== "mouse") return;
      const r = target.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      this.target = {
        elevation: clamp(this.base.elevation - ny * 22, this.range.elevation[0], this.range.elevation[1]),
        azimuth: clamp(nx * 25, -this.range.azimuth, this.range.azimuth),
      };
    });
  }

  /** Für Tests und Debugging direkt setzen. */
  set(camera: Camera) {
    this.target = { ...camera };
  }

  /** Pro Frame aufrufen; gibt true zurück, wenn sich die Kamera merklich bewegt hat. */
  update(dt: number): boolean {
    const k = Math.min(1, dt * 6);
    const e = this.current.elevation + (this.target.elevation - this.current.elevation) * k;
    const a = this.current.azimuth + (this.target.azimuth - this.current.azimuth) * k;
    const moved = Math.abs(e - this.current.elevation) > 0.02 || Math.abs(a - this.current.azimuth) > 0.02;
    this.current = { elevation: e, azimuth: a };
    return moved;
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
