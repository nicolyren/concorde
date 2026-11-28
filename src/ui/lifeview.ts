import { hexToPixel, pixelToHex } from '../core/hex';
import type { LifeState } from '../core/life';
import { TERRAIN_SHADES, tileHash } from './mapview';

const SIZE = 26;
const BUILDING_ICON: Record<string, string> = { maison: '🏠', supermarche: '🛒', travail: '💼', aeroport: '✈️', plage: '🏖️' };

export class LifeView {
  ctx: CanvasRenderingContext2D;
  ox = 0;
  oy = 0;
  z = 1.3;
  dpr = 1;
  w = 0;
  h = 0;
  private raf = 0;
  state: LifeState | null = null;
  walkerX = 0;
  walkerY = 0;
  driving = false;
  private walkBob = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(100, r.width);
    this.h = Math.max(100, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.requestDraw();
  }

  centerOnWorld(x: number, y: number) {
    this.ox = this.w / 2 - x * this.z;
    this.oy = this.h / 2 - y * this.z;
  }

  spawn(s: LifeState) {
    this.teleportTo(s, s.home);
  }

  teleportTo(s: LifeState, idx: number) {
    const p = hexToPixel(idx, s.W, SIZE);
    this.walkerX = p.x;
    this.walkerY = p.y;
    this.centerOnWorld(this.walkerX, this.walkerY);
    this.requestDraw();
  }

  pan(dx: number, dy: number) {
    this.ox += dx;
    this.oy += dy;
    this.requestDraw();
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const nz = Math.max(0.7, Math.min(2.4, this.z * factor));
    const k = nz / this.z;
    this.ox = sx - (sx - this.ox) * k;
    this.oy = sy - (sy - this.oy) * k;
    this.z = nz;
    this.requestDraw();
  }

  /**
   * Déplace le personnage en espace monde ; bloqué par l'eau, les montagnes et le bord de la carte.
   * En voiture, interdit aussi de quitter la route (sauf sur les bâtiments, pour pouvoir se garer).
   */
  stepWalker(dx: number, dy: number, s: LifeState, driving: boolean) {
    const passable = (x: number, y: number) => {
      const idx = pixelToHex(x, y, SIZE, s.W, s.H);
      if (idx < 0) return false;
      const t = s.tiles[idx];
      if (t.terrain === 'water' || t.terrain === 'mountain') return false;
      if (driving && !t.road && !t.building) return false;
      return true;
    };
    const nx = this.walkerX + dx;
    if (passable(nx, this.walkerY)) this.walkerX = nx;
    const ny = this.walkerY + dy;
    if (passable(this.walkerX, ny)) this.walkerY = ny;
    if (dx || dy) this.walkBob += Math.hypot(dx, dy) * 0.35;
  }

  /** Vrai si le personnage est entré dans le bâtiment (quasiment sur sa case), pas juste à proximité. */
  nearTile(s: LifeState, idx: number): boolean {
    const p = hexToPixel(idx, s.W, SIZE);
    return Math.hypot(p.x - this.walkerX, p.y - this.walkerY) < SIZE * 0.85;
  }

  requestDraw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private hexPath(cx: number, cy: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (60 * k - 30);
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  draw() {
    const s = this.state;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, this.h);
    sky.addColorStop(0, '#6ec6f1');
    sky.addColorStop(1, '#bfe9fb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.h);
    if (!s) return;
    const z = this.z;
    const r = SIZE * z;
    const margin = r * 2;
    const screen = (i: number) => {
      const p = hexToPixel(i, s.W, SIZE);
      return { x: p.x * z + this.ox, y: p.y * z + this.oy };
    };

    for (let i = 0; i < s.tiles.length; i++) {
      const sp = screen(i);
      if (sp.x < -margin || sp.y < -margin || sp.x > this.w + margin || sp.y > this.h + margin) continue;
      const t = s.tiles[i];
      const shades = TERRAIN_SHADES[t.terrain];
      // Petite ombre portée + vernis brillant, même traitement « bonbon » que la carte principale.
      this.hexPath(sp.x + r * 0.07, sp.y + r * 0.1, r * 1.005);
      ctx.fillStyle = 'rgba(20,60,40,.16)';
      ctx.fill();
      this.hexPath(sp.x, sp.y, r * 1.005);
      ctx.fillStyle = shades[Math.floor(tileHash(i) * shades.length)];
      ctx.fill();
      {
        const grad = ctx.createLinearGradient(sp.x - r, sp.y - r, sp.x + r, sp.y + r);
        if (t.terrain === 'water') {
          grad.addColorStop(0, 'rgba(255,255,255,.4)');
          grad.addColorStop(1, 'rgba(0,60,110,.14)');
        } else {
          grad.addColorStop(0, 'rgba(255,255,255,.32)');
          grad.addColorStop(1, 'rgba(0,0,0,.12)');
        }
        this.hexPath(sp.x, sp.y, r * 1.005);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      if (t.road) {
        this.hexPath(sp.x, sp.y, r * 0.58);
        ctx.fillStyle = 'rgba(214,201,173,.6)';
        ctx.fill();
      }
      if (t.terrain === 'mountain') {
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.font = `${r * 0.9}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⛰️', sp.x, sp.y);
      } else if (t.terrain === 'forest' && !t.building) {
        ctx.font = `${r * 0.8}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🌲', sp.x, sp.y);
      } else if (t.decor && !t.building) {
        ctx.font = `${r * 0.65}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.decor, sp.x, sp.y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = Math.max(1, r * 0.05);
      this.hexPath(sp.x, sp.y, r * 0.94);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(20,50,30,.18)';
      ctx.lineWidth = 1;
      this.hexPath(sp.x, sp.y, r);
      ctx.stroke();
      if (t.building) {
        this.hexPath(sp.x, sp.y, r * 0.8);
        ctx.fillStyle = 'rgba(255,255,255,.78)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.stroke();
        ctx.font = `${r}px "Apple Color Emoji","Segoe UI Emoji",system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(BUILDING_ICON[t.building], sp.x, sp.y + r * 0.04);
      }
    }

    // --- personnage
    const wx = this.walkerX * z + this.ox;
    const wy = this.walkerY * z + this.oy;
    const bob = Math.sin(this.walkBob) * r * 0.08;
    ctx.beginPath();
    ctx.ellipse(wx, wy + r * 0.55, r * 0.38, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fill();
    ctx.font = `${r * (this.driving ? 1.3 : 1.15)}px "Apple Color Emoji","Segoe UI Emoji",system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.driving ? '🚗' : '🧑', wx, wy + bob);
  }
}
