import { B } from '../core/content';
import { ZONE_COLOR } from '../core/actions';
import { hexToPixel, neighborsOf, pixelToHex, SQ3 } from '../core/hex';
import { roadNetwork } from '../core/sim';
import { inTerritory } from '../core/state';
import type { GameState, Terrain } from '../core/types';

export type Overlay = 'normal' | 'zones' | 'districts' | 'serve' | 'pollution';

/** Quelques nuances par terrain (au lieu d'un aplat unique) pour casser l'effet « damier » trop régulier. */
const TERRAIN_SHADES: Record<Terrain, string[]> = {
  water: ['#4a98ca', '#4f9fd1', '#56a7d8'],
  plain: ['#a3ca74', '#a9cf7c', '#b2d587'],
  forest: ['#468f55', '#4f9d5d', '#5aa366'],
  hill: ['#c7b07c', '#cdb784', '#d4c090'],
  mountain: ['#878992', '#8e9096', '#95979d'],
};
/** Hachage déterministe (0..1) d'un index de tuile, pour varier le rendu sans état ni aléa de jeu. */
const tileHash = (i: number): number => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const DISTRICT_FILL = ['#ffffff', '#e57373', '#ffb74d', '#fff176', '#81c784', '#4fc3f7', '#ba68c8'];
const SIZE = 22;

/**
 * Rendu des bâtiments : au lieu d'une pastille unique avec une icône, on dessine 1 à 3
 * exemplaires de l'icône du bâtiment, répartis sur la case — plus parlant pour les
 * constructions qui représentent plusieurs petites unités (maisons, champs, commerces…).
 * Les grands équipements singuliers (hôpital, université, centrale…) restent à 1 exemplaire,
 * mais sans la pastille, pour un rendu plus net.
 */
const CLUSTER_PTS: [number, number][][] = [
  [[0, 0]],
  [[-0.24, -0.12], [0.24, 0.14]],
  [[-0.3, -0.18], [0.3, -0.06], [-0.02, 0.32]],
];
const CLUSTER_SIZE = [0.95, 0.7, 0.6];
const BUILDING_COUNT: Record<string, number> = {
  pavillons: 3, immeubles: 2, ecoquartier: 3, tours: 2,
  ferme: 3, bio: 3, atelier: 2, commerces: 3, usine: 1, bureaux: 1, innovation: 1,
  solaire: 3, eolien: 3, gaz: 1, geothermie: 1, nucleaire: 1,
  ecole: 1, college: 1, univ: 1,
  clinique: 1, hopital: 1,
  commissariat: 1, pompiers: 1,
  biblio: 1, stade: 1, theatre: 1,
  parc: 3, epuration: 1,
  banque_locale: 1, banque_coop: 1, banque_centrale: 1,
  depot: 1, gare: 1, aeroport: 1,
  // Mode Parc d'attraction
  maneges_enfants: 2, autos_tamponneuses: 2, grande_roue: 1, maison_hantee: 1, chute_eau: 1, montagnes_russes: 1,
  stand_glaces: 2, creperie: 2, boutique_souvenirs: 2, restaurant_parc: 1,
  spectacle: 1, toilettes: 1, premiers_secours: 1, securite_parc: 1, jardin_parc: 3, parking_parc: 1,
};

export class MapView {
  ctx: CanvasRenderingContext2D;
  ox = 0;
  oy = 0;
  z = 1;
  hover = -1;
  selected = -1;
  overlay: Overlay = 'normal';
  state: GameState | null = null;
  dpr = 1;
  w = 0;
  h = 0;
  private raf = 0;
  /** Mode « balade » : un petit personnage qu'on déplace librement au clavier. */
  walking = false;
  walkerX = 0;
  walkerY = 0;
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

  centerOn(s: GameState, idx: number) {
    const p = hexToPixel(idx, s.W, SIZE);
    this.ox = this.w / 2 - p.x * this.z;
    this.oy = this.h / 2 - p.y * this.z;
    this.requestDraw();
  }

  centerOnWorld(x: number, y: number) {
    this.ox = this.w / 2 - x * this.z;
    this.oy = this.h / 2 - y * this.z;
  }

  startWalk(s: GameState) {
    this.walking = true;
    const p = hexToPixel(s.capital, s.W, SIZE);
    this.walkerX = p.x;
    this.walkerY = p.y;
    this.centerOnWorld(this.walkerX, this.walkerY);
    this.requestDraw();
  }

  stopWalk() {
    this.walking = false;
    this.requestDraw();
  }

  /** Déplace le personnage en espace monde ; bloqué par l'eau, les montagnes et le bord de la carte. */
  stepWalker(dx: number, dy: number, s: GameState) {
    const passable = (x: number, y: number) => {
      const idx = pixelToHex(x, y, SIZE, s.W, s.H);
      if (idx < 0) return false;
      const t = s.tiles[idx].terrain;
      return t !== 'water' && t !== 'mountain';
    };
    const nx = this.walkerX + dx;
    if (passable(nx, this.walkerY)) this.walkerX = nx;
    const ny = this.walkerY + dy;
    if (passable(this.walkerX, ny)) this.walkerY = ny;
    if (dx || dy) this.walkBob += Math.hypot(dx, dy) * 0.35;
  }

  tileAt(sx: number, sy: number): number {
    if (!this.state) return -1;
    const wx = (sx - this.ox) / this.z;
    const wy = (sy - this.oy) / this.z;
    return pixelToHex(wx, wy, SIZE, this.state.W, this.state.H);
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const nz = Math.max(0.35, Math.min(3.2, this.z * factor));
    const k = nz / this.z;
    this.ox = sx - (sx - this.ox) * k;
    this.oy = sy - (sy - this.oy) * k;
    this.z = nz;
    this.requestDraw();
  }

  pan(dx: number, dy: number) {
    this.ox += dx;
    this.oy += dy;
    this.requestDraw();
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
    ctx.fillStyle = '#0b1119';
    ctx.fillRect(0, 0, this.w, this.h);
    if (!s) return;
    const { W, H } = s;
    const z = this.z;
    const r = SIZE * z;
    const connected = this.overlay === 'serve' ? roadNetwork(s) : null;
    const pollution = this.overlay === 'pollution' ? this.pollutionField(s) : null;
    const margin = r * 2;

    const screen = (i: number) => {
      const p = hexToPixel(i, W, SIZE);
      return { x: p.x * z + this.ox, y: p.y * z + this.oy };
    };

    // --- terrain
    for (let i = 0; i < s.tiles.length; i++) {
      const sp = screen(i);
      if (sp.x < -margin || sp.y < -margin || sp.x > this.w + margin || sp.y > this.h + margin) continue;
      const t = s.tiles[i];
      const shades = TERRAIN_SHADES[t.terrain];
      this.hexPath(sp.x, sp.y, r * 1.005);
      ctx.fillStyle = shades[Math.floor(tileHash(i) * shades.length)];
      ctx.fill();
      if (t.terrain === 'hill' || t.terrain === 'mountain' || t.terrain === 'water') {
        // Dégradé fixe (lumière en haut à gauche) pour suggérer le relief des hauteurs
        // et la profondeur de l'eau, plutôt qu'un aplat uniforme.
        const grad = ctx.createLinearGradient(sp.x - r, sp.y - r, sp.x + r, sp.y + r);
        if (t.terrain === 'water') {
          grad.addColorStop(0, 'rgba(255,255,255,.14)');
          grad.addColorStop(1, 'rgba(0,25,55,.12)');
        } else {
          grad.addColorStop(0, 'rgba(255,255,255,.2)');
          grad.addColorStop(1, 'rgba(0,0,0,.18)');
        }
        this.hexPath(sp.x, sp.y, r * 1.005);
        ctx.fillStyle = grad;
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
      }
      if (this.overlay === 'zones' && t.zone !== 'free') {
        this.hexPath(sp.x, sp.y, r * 1.005);
        ctx.fillStyle = ZONE_COLOR[t.zone];
        ctx.fill();
      } else if (this.overlay === 'districts') {
        this.hexPath(sp.x, sp.y, r * 1.005);
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = DISTRICT_FILL[t.district];
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (pollution) {
        const v = pollution[i];
        if (Math.abs(v) > 0.05) {
          this.hexPath(sp.x, sp.y, r * 1.005);
          ctx.fillStyle = v > 0 ? `rgba(120,60,40,${Math.min(0.7, v * 0.5)})` : `rgba(30,160,70,${Math.min(0.6, -v * 0.6)})`;
          ctx.fill();
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,.14)';
      ctx.lineWidth = 1;
      this.hexPath(sp.x, sp.y, r);
      ctx.stroke();
    }

    // --- infrastructures
    const drawLinks = (kind: 'road' | 'highway' | 'rail') => {
      for (let i = 0; i < s.tiles.length; i++) {
        const t = s.tiles[i];
        const isNode = kind === 'rail' ? t.infra === 'rail' || (t.building && B[t.building]?.station && t.build === 0) : t.infra === kind;
        if (!isNode) continue;
        const sp = screen(i);
        if (sp.x < -margin || sp.y < -margin || sp.x > this.w + margin || sp.y > this.h + margin) continue;
        for (const j of neighborsOf(i, W, H)) {
          const u = s.tiles[j];
          let link = false;
          if (kind === 'rail') link = u.infra === 'rail' || (!!u.building && !!B[u.building]?.station);
          else link = u.infra === 'road' || u.infra === 'highway';
          if (!link) continue;
          if (kind === 'road' && (t.infra === 'highway' || u.infra === 'highway')) continue;
          if (kind === 'highway' && u.infra !== 'highway' && u.infra !== 'road') continue;
          const sq = screen(j);
          const mx = (sp.x + sq.x) / 2;
          const my = (sp.y + sq.y) / 2;
          ctx.beginPath();
          ctx.moveTo(sp.x, sp.y);
          ctx.lineTo(mx, my);
          this.strokeInfra(kind, r);
        }
        // nœud
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, kind === 'highway' ? r * 0.2 : kind === 'rail' ? r * 0.14 : r * 0.17, 0, Math.PI * 2);
        ctx.fillStyle = kind === 'highway' ? '#ff9f43' : kind === 'rail' ? '#3a3a3a' : '#7a7468';
        ctx.fill();
        // stub vers un bâtiment adjacent (accès)
        if (kind === 'road') {
          for (const j of neighborsOf(i, W, H)) {
            if (s.tiles[j].building) {
              const sq = screen(j);
              ctx.beginPath();
              ctx.moveTo(sp.x, sp.y);
              ctx.lineTo((sp.x + sq.x) / 2, (sp.y + sq.y) / 2);
              ctx.strokeStyle = '#b9b2a2';
              ctx.lineWidth = r * 0.08;
              ctx.stroke();
            }
          }
        }
      }
    };
    drawLinks('road');
    drawLinks('highway');
    drawLinks('rail');

    // --- bâtiments
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      if (!t.building) continue;
      const sp = screen(i);
      if (sp.x < -margin || sp.y < -margin || sp.x > this.w + margin || sp.y > this.h + margin) continue;
      const def = B[t.building];
      if (t.build === 0 && t.building !== 'mairie') {
        const count = BUILDING_COUNT[t.building] ?? 1;
        const pts = CLUSTER_PTS[count - 1];
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.font = `${r * CLUSTER_SIZE[count - 1]}px "Apple Color Emoji","Segoe UI Emoji",system-ui`;
        for (const [dx, dy] of pts) ctx.fillText(def.icon, sp.x + dx * r * 2, sp.y + dy * r * 2);
      } else {
        this.hexPath(sp.x, sp.y, r * 0.78);
        ctx.fillStyle = t.build > 0 ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.72)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.stroke();
        ctx.font = `${r * 0.95}px "Apple Color Emoji","Segoe UI Emoji",system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = t.build > 0 ? 0.55 : 1;
        ctx.fillStyle = '#000';
        ctx.fillText(def.icon, sp.x, sp.y + r * 0.04);
        ctx.globalAlpha = 1;
      }
      if (t.build > 0) {
        ctx.font = `bold ${r * 0.55}px system-ui`;
        ctx.fillStyle = '#c0392b';
        ctx.fillText('🚧' + t.build, sp.x, sp.y - r * 0.55);
      }
      if (connected && t.build === 0 && t.building !== 'mairie') {
        const sv = connected[i] || neighborsOf(i, W, H).some((j) => connected[j]);
        this.hexPath(sp.x, sp.y, r * 0.9);
        ctx.lineWidth = Math.max(2, r * 0.14);
        ctx.strokeStyle = sv ? '#2ecc71' : '#e74c3c';
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    // --- fond hors territoire
    for (let i = 0; i < s.tiles.length; i++) {
      if (inTerritory(s, i)) continue;
      const sp = screen(i);
      if (sp.x < -margin || sp.y < -margin || sp.x > this.w + margin || sp.y > this.h + margin) continue;
      this.hexPath(sp.x, sp.y, r * 1.01);
      ctx.fillStyle = 'rgba(11,17,25,.62)';
      ctx.fill();
    }

    // --- noms de secteurs
    if (this.overlay === 'districts') {
      const acc: { x: number; y: number; n: number }[] = Array.from({ length: 7 }, () => ({ x: 0, y: 0, n: 0 }));
      for (let i = 0; i < s.tiles.length; i++) {
        if (!inTerritory(s, i)) continue;
        const p = screen(i);
        const a = acc[s.tiles[i].district];
        a.x += p.x;
        a.y += p.y;
        a.n++;
      }
      const names = ['Centre', 'Nord', 'Nord-Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Nord-Ouest'];
      ctx.font = `bold ${Math.max(11, r * 0.7)}px system-ui`;
      ctx.textAlign = 'center';
      for (let d = 0; d < 7; d++) {
        const a = acc[d];
        if (!a.n) continue;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,.7)';
        ctx.strokeText(names[d], a.x / a.n, a.y / a.n);
        ctx.fillStyle = '#fff';
        ctx.fillText(names[d], a.x / a.n, a.y / a.n);
      }
    }

    // --- survol / sélection
    const mark = (i: number, color: string, lw: number) => {
      if (i < 0) return;
      const sp = screen(i);
      this.hexPath(sp.x, sp.y, r * 0.98);
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.lineWidth = 1;
    };
    mark(this.selected, '#ffd54f', 3);
    mark(this.hover, '#ffffff', 2);

    // --- petit personnage (mode balade)
    if (this.walking) {
      const wx = this.walkerX * z + this.ox;
      const wy = this.walkerY * z + this.oy;
      const bob = Math.sin(this.walkBob) * r * 0.08;
      ctx.beginPath();
      ctx.ellipse(wx, wy + r * 0.55, r * 0.38, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fill();
      ctx.font = `${r * 1.15}px "Apple Color Emoji","Segoe UI Emoji",system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧑', wx, wy + bob);
    }
    void SQ3;
  }

  private strokeInfra(kind: 'road' | 'highway' | 'rail', r: number) {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    if (kind === 'road') {
      ctx.strokeStyle = '#8e877a';
      ctx.lineWidth = r * 0.28;
      ctx.stroke();
      ctx.strokeStyle = '#d9d3c3';
      ctx.lineWidth = r * 0.17;
      ctx.stroke();
    } else if (kind === 'highway') {
      ctx.strokeStyle = '#5b3a12';
      ctx.lineWidth = r * 0.46;
      ctx.stroke();
      ctx.strokeStyle = '#ff9f43';
      ctx.lineWidth = r * 0.32;
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#2f2f2f';
      ctx.lineWidth = r * 0.26;
      ctx.stroke();
      ctx.strokeStyle = '#ececec';
      ctx.lineWidth = r * 0.1;
      ctx.setLineDash([r * 0.18, r * 0.18]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineCap = 'butt';
  }

  /** Champ de pollution (+) / verdure (−) pour le calque dédié */
  private pollutionField(s: GameState): Float32Array {
    const f = new Float32Array(s.tiles.length);
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      let src = 0;
      if (t.terrain === 'forest' && !t.building) src -= 0.25;
      if (t.zone === 'nature') src -= 0.3;
      if (t.infra === 'highway') src += 0.5;
      if (t.building && t.build === 0) {
        const d = B[t.building];
        src += (d.pollution ?? 0) * 0.6 - (d.green ?? 0) * 0.5 - (d.absorb ?? 0) * 0.3;
      }
      if (src === 0) continue;
      const seen = new Map<number, number>([[i, 0]]);
      let frontier = [i];
      for (let d = 1; d <= 2; d++) {
        const next: number[] = [];
        for (const a of frontier) {
          for (const b of neighborsOf(a, s.W, s.H)) {
            if (!seen.has(b)) {
              seen.set(b, d);
              next.push(b);
            }
          }
        }
        frontier = next;
      }
      for (const [j, dd] of seen) f[j] += src / (1 + dd);
    }
    return f;
  }
}
