import type { Camera } from "../rose/projection";

/**
 * Kamera aus der Handy-Lage (DeviceOrientation) oder der Mausposition (Desktop).
 * - Neigung nach vorn/hinten (beta): flach gehalten = Blick von oben, aufrecht = von der Seite
 * - Drehung um die Hochachse (alpha, Kompass): die Rose dreht sich entgegen, als stünde sie
 *   fest im Raum; Ausgangsrichtung ist die Lage beim Start, volle 360° möglich
 * - seitliches Kippen (gamma): lehnt die Ansicht zusätzlich leicht
 * Die Werte werden pro Frame weich nachgeführt, der Drehwinkel über den kürzesten Weg.
 */
export class TiltCamera {
  private target: Camera;
  private current: Camera;
  private hasOrientation = false;
  /** Kompasswinkel beim Start; null = noch nicht kalibriert */
  private alpha0: number | null = null;

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
      // beta: 0 = flach (Display nach oben), 90 = aufrecht.
      const elevation = clamp(88 - e.beta * 0.75, this.range.elevation[0], this.range.elevation[1]);
      // alpha: Drehung um die Hochachse (gegen den Uhrzeigersinn positiv). Die Kamera kreist
      // mit dem Handy um die Rose, also erscheint die Rose entgegengesetzt gedreht.
      let yaw = 0;
      if (e.alpha !== null) {
        if (this.alpha0 === null) this.alpha0 = e.alpha;
        yaw = -wrapDeg(e.alpha - this.alpha0);
      }
      // gamma: seitliches Kippen lehnt die Ansicht leicht
      const lean = clamp(e.gamma * 0.3, -15, 15);
      this.target = { elevation, azimuth: wrapDeg(yaw + lean) };
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

  /** Ausgangsrichtung neu setzen (z. B. bei "Noch einmal"). */
  recalibrate() {
    this.alpha0 = null;
  }

  /** Pro Frame aufrufen; gibt true zurück, wenn sich die Kamera merklich bewegt hat. */
  update(dt: number): boolean {
    const k = Math.min(1, dt * 6);
    const e = this.current.elevation + (this.target.elevation - this.current.elevation) * k;
    const a = wrapDeg(this.current.azimuth + wrapDeg(this.target.azimuth - this.current.azimuth) * k);
    const moved = Math.abs(e - this.current.elevation) > 0.02 || Math.abs(wrapDeg(a - this.current.azimuth)) > 0.02;
    this.current = { elevation: e, azimuth: a };
    return moved;
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Winkel auf -180..180 bringen. */
function wrapDeg(deg: number) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}
