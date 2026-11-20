import './style.css';
import { B, FUNDING_LABEL } from './core/content';
import * as A from './core/actions';
import { REFERENDUMS } from './core/elections';
import { computeMetrics, endTurn } from './core/sim';
import { deserialize, newGame, serialize, dateLabel } from './core/state';
import { gauss, hashString } from './core/rng';
import type { GameState, Metrics, Zone } from './core/types';
import { MapView, type Overlay } from './ui/mapview';
import * as P from './ui/panels';
import { deleteGame, listGames, loadGame, migrateLegacySave, newId, saveGame } from './ui/saves';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let game: GameState;
let metrics: Metrics;
let tool = 'inspect';
let tab: P.Tab = 'city';
let currentId: string | null = null;
let appActive = false;

const view = new MapView($<HTMLCanvasElement>('map'));
const dlg = $<HTMLDialogElement>('dlg');

// ------------------------------------------------------------------ utilitaires
function save() {
  if (!currentId) return;
  saveGame(currentId, game);
}

function renderHome() {
  $('home-list').innerHTML = P.homeList(listGames());
}

function showHome() {
  appActive = false;
  $('app').classList.add('hidden');
  $('home').classList.remove('hidden');
  renderHome();
}

function showGame() {
  appActive = true;
  $('home').classList.add('hidden');
  $('app').classList.remove('hidden');
  view.resize();
}

let toastTimer = 0;
let lastToast = '';
function toast(msg: string, bad = false) {
  if (!msg) return;
  const el = $('toast');
  if (msg === lastToast && el.style.display === 'block') return;
  lastToast = msg;
  el.textContent = msg;
  el.className = bad ? 'bad' : '';
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.style.display = 'none';
    lastToast = '';
  }, bad ? 2600 : 2200);
}

function report(r: A.Result) {
  if (!r.ok) toast(r.msg, true);
  else if (r.msg) toast(r.msg);
}

function renderTabs() {
  const tabs = P.TABS.filter((t) => (t.id !== 'elections' || !game.sandbox) && (t.id !== 'politics' || !game.park));
  if ((game.sandbox && tab === 'elections') || (game.park && tab === 'politics')) tab = 'city';
  $('tabs').innerHTML = tabs.map((t) => `<button data-tab="${t.id}" class="${t.id === tab ? 'on' : ''}">${t.label}</button>`).join('');
}

function renderPanel() {
  const el = $('panel');
  const top = el.scrollTop;
  let html = '';
  switch (tab) {
    case 'city': html = game.park ? P.panelParkCity(game, metrics) : P.panelCity(game, metrics); break;
    case 'budget': html = game.park ? P.panelParkBudget(game, metrics) : P.panelBudget(game, metrics); break;
    case 'politics': html = P.panelPolitics(game, metrics); break;
    case 'elections': html = P.panelElections(game, metrics, P.computePoll(game, metrics)); break;
    case 'plan': html = P.panelPlan(game, metrics, tool); break;
    case 'journal': html = P.panelJournal(game); break;
    case 'help': html = P.panelHelp(); break;
  }
  el.innerHTML = html;
  el.scrollTop = top;
}

function renderToolbar() {
  const el = $('toolbar');
  const top = el.scrollTop;
  el.innerHTML = P.renderToolbar(game, metrics, tool);
  el.scrollTop = top;
}

function refresh(full = true) {
  metrics = computeMetrics(game);
  view.state = game;
  $('stats').innerHTML = P.renderStats(game, metrics);
  if (full) {
    renderToolbar();
    renderTabs();
    renderPanel();
  }
  view.requestDraw();
}

function setTool(t: string) {
  tool = t;
  view.canvas.style.cursor = t === 'inspect' ? 'grab' : 'crosshair';
  renderToolbar();
  if (tab === 'plan') renderPanel();
}

// ------------------------------------------------------------------ outils sur la carte
const isPaint = (t: string) => t.startsWith('infra:') || t.startsWith('zone:') || t === 'demolish' || t === 'forest';

function applyTool(idx: number): A.Result | null {
  if (idx < 0) return null;
  const [kind, arg] = tool.split(':');
  switch (kind) {
    case 'build': return A.buildBuilding(game, idx, arg);
    case 'infra': return A.buildInfra(game, idx, arg as 'road' | 'highway' | 'rail');
    case 'demolish': return A.demolish(game, idx);
    case 'forest': return A.plantForest(game, idx);
    case 'zone': return A.setZone(game, idx, arg as Zone);
    default: return null;
  }
}

let drag: { x: number; y: number; mode: 'pan' | 'paint' | 'click'; moved: boolean; last: number; sx: number; sy: number } | null = null;
let dirty = false;

const canvas = view.canvas;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const mode = e.button === 1 || e.button === 2 || e.shiftKey || tool === 'inspect' ? 'pan' : isPaint(tool) ? 'paint' : 'click';
  drag = { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, mode, moved: false, last: -1 };
  if (mode === 'paint') {
    const idx = view.tileAt(e.offsetX, e.offsetY);
    drag.last = idx;
    const r = applyTool(idx);
    if (r) {
      report(r);
      dirty = dirty || r.ok;
      refresh(false);
    }
  }
});
canvas.addEventListener('pointermove', (e) => {
  const idx = view.tileAt(e.offsetX, e.offsetY);
  if (idx !== view.hover) {
    view.hover = idx;
    view.requestDraw();
    $('tileinfo').textContent = P.tileInfo(game, metrics, idx);
  }
  const tip = $('tip');
  const html = P.tipHtml(game, idx, tool);
  if (html && !drag) {
    tip.innerHTML = html;
    tip.style.display = 'block';
    tip.style.left = `${Math.min(e.offsetX + 14, view.w - 270)}px`;
    tip.style.top = `${Math.min(e.offsetY + 14, view.h - 80)}px`;
  } else tip.style.display = 'none';
  if (!drag) return;
  const dx = e.offsetX - drag.x;
  const dy = e.offsetY - drag.y;
  if (!drag.moved && Math.hypot(e.offsetX - drag.sx, e.offsetY - drag.sy) > 6) {
    drag.moved = true;
    if (drag.mode === 'click') drag.mode = 'pan';
  }
  if (drag.mode === 'pan' && drag.moved) {
    view.pan(dx, dy);
    canvas.style.cursor = 'grabbing';
  } else if (drag.mode === 'paint' && idx !== drag.last) {
    drag.last = idx;
    const r = applyTool(idx);
    if (r) {
      if (!r.ok) report(r);
      dirty = dirty || r.ok;
      refresh(false);
    }
  }
  drag.x = e.offsetX;
  drag.y = e.offsetY;
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  canvas.style.cursor = tool === 'inspect' ? 'grab' : 'crosshair';
  const idx = view.tileAt(e.offsetX, e.offsetY);
  if (d.mode === 'click' && !d.moved) {
    const r = applyTool(idx);
    if (r) {
      report(r);
      if (r.ok) {
        save();
        refresh();
      }
    }
  } else if (d.mode === 'pan' && !d.moved && tool === 'inspect') {
    view.selected = idx;
    view.requestDraw();
  }
  if (d.mode === 'paint' && dirty) {
    dirty = false;
    save();
    refresh();
  }
});
canvas.addEventListener('pointerleave', () => {
  view.hover = -1;
  $('tip').style.display = 'none';
  $('tileinfo').textContent = '';
  view.requestDraw();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

$('overlay').addEventListener('change', (e) => {
  view.overlay = (e.target as HTMLSelectElement).value as Overlay;
  view.requestDraw();
});
$('btn-center').addEventListener('click', () => view.centerOn(game, game.capital));

// ------------------------------------------------------------------ tour suivant
function nextTurn() {
  if (dlg.open || !appActive) return;
  const before = game.lastElection?.turn ?? -1;
  const lvBefore = game.levelReady;
  endTurn(game);
  save();
  const elected = game.lastElection && game.lastElection.turn !== before;
  if (elected) tab = 'elections';
  refresh();
  if (elected && game.lastElection) {
    const le = game.lastElection;
    toast(le.playerWon ? '🏆 Vous remportez les élections !' : '⚠️ Défaite électorale : cohabitation', !le.playerWon);
  } else if (game.levelReady && !lvBefore) {
    tab = 'city';
    refresh();
    toast('🚀 Vous pouvez passer à l’échelle supérieure (onglet Ville)');
  } else {
    const last = game.log[game.log.length - 1];
    if (last && last.turn === game.turn && last.kind !== 'info') toast(last.text, last.kind === 'bad');
  }
}
$('btn-next').addEventListener('click', nextTurn);

function pauseGame() {
  if (!appActive) return;
  save();
  showHome();
  toast('Partie mise en pause : reprenez-la quand vous voulez depuis l’accueil.');
}
$('btn-pause').addEventListener('click', pauseGame);

// ------------------------------------------------------------------ interactions des panneaux
$('toolbar').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-tool]') as HTMLElement | null;
  if (b) setTool(b.dataset.tool!);
});
$('tabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
  if (!b) return;
  tab = b.dataset.tab as P.Tab;
  renderTabs();
  renderPanel();
});

const panel = $('panel');
panel.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const tl = t.closest('[data-tool]') as HTMLElement | null;
  if (tl) return setTool(tl.dataset.tool!);
  const b = t.closest('[data-act]') as HTMLElement | null;
  if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
  const id = b.dataset.id ?? '';
  let r: A.Result | null = null;
  switch (b.dataset.act) {
    case 'levelup': r = A.levelUp(game); break;
    case 'loan': {
      const amount = Number((document.getElementById('loan-amount') as HTMLSelectElement).value);
      const term = Number((document.getElementById('loan-term') as HTMLSelectElement).value);
      r = A.takeLoan(game, amount, term);
      break;
    }
    case 'repay': r = A.repayLoan(game, Number(id)); break;
    case 'enact': r = A.enactPolicy(game, id); break;
    case 'repeal': r = A.repealPolicy(game, id); break;
    case 'referendum': r = A.hostReferendum(game, id); break;
    case 'poll': {
      if (game.treasury < 10) { r = { ok: false, msg: 'Fonds insuffisants.' }; break; }
      game.treasury -= 10;
      const est = A.previewReferendum(game, id) + gauss(game) * 0.04;
      const tpl = REFERENDUMS.find((x) => x.id === id)!;
      r = { ok: true, msg: `Sondage « ${tpl.title} » : environ ${(Math.max(0, Math.min(1, est)) * 100).toFixed(0)} % de oui (±4 pts).` };
      break;
    }
    case 'fund': r = A.fundProposal(game, Number(id)); break;
    case 'dismiss': r = A.dismissProposals(game); break;
    case 'start-fundraiser': {
      const building = (document.getElementById('fr-building') as HTMLSelectElement).value;
      const district = Number((document.getElementById('fr-district') as HTMLSelectElement).value);
      r = A.startFundraiser(game, building, district);
      break;
    }
    case 'cancel-fundraiser': r = A.cancelFundraiser(game, Number(id)); break;
  }
  if (r) {
    report(r);
    save();
    refresh();
  }
});

panel.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  const act = t.dataset.act;
  if (!act) return;
  const v = Number(t.value);
  if (act === 'rate') {
    const key = t.dataset.key;
    const lbl = key === 'transit' ? `${Math.round(v)} k€` : key === 'toll' ? `${v.toFixed(1)} k€` : key === 'entry' ? `${Math.round(v)} €` : `${v} %`;
    $('lbl-rate-' + key)!.textContent = lbl;
  }
  if (act === 'funding') $('lbl-fund-' + t.dataset.key)!.textContent = `${Math.round(v * 100)} %`;
  if (act === 'prate') $('lbl-prate')!.textContent = `${v.toFixed(2)} %`;
  if (act === 'campaign') $('lbl-camp')!.textContent = P.fmtK(v);
});
panel.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  const act = t.dataset.act;
  if (!act) return;
  let r: A.Result | null = null;
  switch (act) {
    case 'rate': r = A.setRate(game, t.dataset.key as 'income' | 'corp' | 'property' | 'transit' | 'toll' | 'entry', Number(t.value)); break;
    case 'funding': r = A.setFunding(game, t.dataset.key!, Number(t.value)); break;
    case 'prate': r = A.setPolicyRate(game, Number(t.value)); break;
    case 'campaign': r = A.setCampaign(game, Number(t.value)); break;
    case 'setting':
      if (t.dataset.key === 'voteSystem') r = A.setSetting(game, 'voteSystem', t.value as 'majoritaire' | 'proportionnelle');
      if (t.dataset.key === 'mandateQ') r = A.setSetting(game, 'mandateQ', Number(t.value));
      break;
  }
  if (r) {
    report(r);
    save();
    refresh();
  }
});

// ------------------------------------------------------------------ dialogues
function openNewGame(hasSave: boolean, park = false) {
  dlg.innerHTML = P.newGameDialog(hasSave, park);
  if (!dlg.open) dlg.showModal();
}
function openMenu() {
  dlg.innerHTML = P.menuDialog();
  if (!dlg.open) dlg.showModal();
}
dlg.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-dlg]') as HTMLElement | null;
  if (!b) return;
  switch (b.dataset.dlg) {
    case 'cancel':
    case 'close': dlg.close(); break;
    case 'new': openNewGame(true); break;
    case 'confirm-delete':
      deleteGame(b.dataset.id!);
      dlg.close();
      renderHome();
      break;
    case 'start': {
      const name = (document.getElementById('ng-name') as HTMLInputElement).value;
      const park = (document.getElementById('ng-park') as HTMLInputElement).value === '1';
      const plat = (document.querySelector('input[name=ng-plat]:checked') as HTMLInputElement)?.value;
      const color = (document.getElementById('ng-color') as HTMLInputElement).value;
      const seedRaw = (document.getElementById('ng-seed') as HTMLInputElement).value.trim();
      const seed = seedRaw ? (/^\d+$/.test(seedRaw) ? Number(seedRaw) : hashString(seedRaw)) : undefined;
      const sandbox = !park && (document.getElementById('ng-sandbox') as HTMLInputElement).checked;
      game = newGame({ seed, listName: name, platform: plat, color, sandbox, park });
      currentId = newId();
      tab = 'city';
      dlg.close();
      showGame();
      setTool('inspect');
      save();
      refresh();
      view.z = 1;
      view.centerOn(game, game.capital);
      toast('Bienvenue ! Choisissez un outil à gauche pour bâtir.');
      break;
    }
    case 'export': {
      const blob = new Blob([serialize(game)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `concorde-${dateLabel(game.turn).replace(' ', '-')}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      break;
    }
    case 'import': $('importfile').click(); break;
  }
});
$('importfile').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  const g = deserialize(await f.text());
  if (!g) return toast('Fichier de sauvegarde invalide.', true);
  game = g;
  currentId = newId();
  tab = 'city';
  dlg.close();
  showGame();
  setTool('inspect');
  save();
  refresh();
  view.centerOn(game, game.capital);
  toast('Sauvegarde importée.');
});
$('btn-menu').addEventListener('click', openMenu);

// ------------------------------------------------------------------ accueil
function resumeGame(id: string) {
  const g = loadGame(id);
  if (!g) {
    toast('Cette sauvegarde est introuvable ou corrompue.', true);
    renderHome();
    return;
  }
  game = g;
  currentId = id;
  tab = 'city';
  showGame();
  setTool('inspect');
  refresh();
  view.centerOn(game, game.capital);
}
$('home-new').addEventListener('click', () => openNewGame(false));
$('home-new-park').addEventListener('click', () => openNewGame(false, true));
$('home-import').addEventListener('click', () => $('importfile').click());
$('home-list').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-home-act]') as HTMLElement | null;
  if (!b) return;
  const id = b.dataset.id!;
  if (b.dataset.homeAct === 'resume') resumeGame(id);
  else if (b.dataset.homeAct === 'delete') {
    const meta = listGames().find((g) => g.id === id);
    if (meta) {
      dlg.innerHTML = P.confirmDeleteDialog(meta);
      dlg.showModal();
    }
  }
});

window.addEventListener('keydown', (e) => {
  const tg = e.target as HTMLElement;
  if (dlg.open || !appActive || tg.tagName === 'INPUT' || tg.tagName === 'SELECT' || tg.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    nextTurn();
  } else if (e.key === 'Escape') setTool('inspect');
});

// ------------------------------------------------------------------ démarrage
function boot() {
  migrateLegacySave();
  showHome();
}
requestAnimationFrame(boot);
(window as unknown as { __concorde: unknown }).__concorde = { get game() { return game; }, B, FUNDING_LABEL };
