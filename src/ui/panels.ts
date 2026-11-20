import {
  B, BUILDINGS, CAT_LABEL, CAT_ORDER, DISTRICT_NAMES, FUNDING_LABEL, INFRA, ISSUES, LEVEL_ASSEMBLY, LEVEL_EXEC, LEVEL_NAME,
  LEVEL_POP_GOAL, LEVEL_SEATS, LEVEL_WB_GOAL, P, POLICIES, PLATFORMS,
} from '../core/content';
import { ZONE_COLOR, ZONE_LABEL, buildCost, highwayAllowed } from '../core/actions';
import { REFERENDUMS, campaignBonus, districtShares, listColor, listName } from '../core/elections';
import { dateLabel } from '../core/state';
import type { GameState, Metrics, Zone } from '../core/types';
import type { GameMeta } from './saves';

export const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const fmtK = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} Md€`;
  if (a >= 1000) return `${(v / 1000).toFixed(2)} M€`;
  return `${Math.round(v)} k€`;
};
export const fmtN = (v: number) => Math.round(v).toLocaleString('fr-FR');
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)} %`;
const col = (v: number) => (v >= 70 ? 'var(--good)' : v >= 45 ? 'var(--warn)' : 'var(--bad)');

export type Tab = 'city' | 'budget' | 'politics' | 'elections' | 'plan' | 'journal' | 'help';
export const TABS: { id: Tab; label: string }[] = [
  { id: 'city', label: '🏙️ Ville' },
  { id: 'budget', label: '💶 Budget' },
  { id: 'politics', label: '🏛️ Institutions' },
  { id: 'elections', label: '🗳️ Élections' },
  { id: 'plan', label: '🗺️ Plan' },
  { id: 'journal', label: '📰 Journal' },
  { id: 'help', label: '❓ Aide' },
];

const bar = (v: number, color = 'var(--accent)') => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></i></div>`;

// ------------------------------------------------------------------ Barre du haut
export function renderStats(s: GameState, m: Metrics): string {
  const left = s.nextElection - s.turn;
  const chip = (label: string, value: string, cls = '') => `<div class="chip ${cls}">${label} <b>${value}</b></div>`;
  return [
    chip('📅', dateLabel(s.turn)),
    chip(LEVEL_NAME[s.level] === 'Commune' ? '🏘️' : LEVEL_NAME[s.level] === 'Région' ? '🗺️' : '🇫🇷', LEVEL_NAME[s.level]),
    chip('💰', fmtK(s.treasury), s.treasury < 0 ? 'bad' : ''),
    chip('Solde/trim.', `${m.netCash >= 0 ? '+' : ''}${fmtK(m.netCash)}`, m.netCash >= 0 ? 'good' : 'bad'),
    chip('👥', fmtN(s.pop)),
    chip('😊 Bien-être', m.wellbeing.toFixed(0), m.wellbeing >= 65 ? 'good' : m.wellbeing < 45 ? 'bad' : 'warn'),
    chip('👍 Popularité', s.satisfaction.toFixed(0) + ' %', s.satisfaction >= 50 ? 'good' : 'bad'),
    s.sandbox ? chip('🧪', 'Entraînement libre') : chip('🗳️', left <= 0 ? 'ce trimestre' : `dans ${left} trim.`, s.cohabitation ? 'warn' : ''),
  ].join('');
}

// ------------------------------------------------------------------ Barre d'outils
export function renderToolbar(s: GameState, m: Metrics, tool: string): string {
  const btn = (id: string, icon: string, name: string, cost: string, locked: string | null, title: string) =>
    `<button class="tool ${tool === id ? 'active' : ''} ${locked ? 'locked' : ''}" data-tool="${id}" title="${esc(title)}${locked ? ' — ' + esc(locked) : ''}"><span class="ic">${icon}</span><span class="nm">${esc(name)}</span><span class="co">${locked ? '🔒' : cost}</span></button>`;
  let h = `<h4>Outils</h4>`;
  h += btn('inspect', '🧭', 'Inspecter / déplacer', '', null, 'Cliquez une tuile pour la détailler ; glissez pour déplacer la carte.');
  h += btn('demolish', '🧨', 'Démolir', `${Math.round(5 * s.macro.costIndex)}`, null, 'Supprime un bâtiment ou une infrastructure (sans remboursement).');
  h += btn('forest', '🌲', 'Reboiser', `${Math.round(20 * s.macro.costIndex)}`, null, 'Plante une forêt sur une plaine ou une colline : absorbe la pollution.');
  h += `<h4>Réseaux</h4>`;
  for (const k of ['road', 'highway', 'rail'] as const) {
    const lock = k === 'highway' && !highwayAllowed(s) ? 'Niveau région ou référendum « Autoroute urbaine »' : null;
    h += btn(`infra:${k}`, INFRA[k].icon, INFRA[k].name, `${Math.round(INFRA[k].cost * s.macro.costIndex)}+`, lock, `${INFRA[k].name} : coût par tuile (plus cher sur relief et eau).`);
  }
  for (const cat of CAT_ORDER) {
    h += `<h4>${CAT_LABEL[cat]}</h4>`;
    for (const def of BUILDINGS.filter((b) => b.cat === cat)) {
      const lock = def.level > s.level && !s.sandbox ? `Disponible à l’échelle « ${LEVEL_NAME[def.level]} »` : null;
      const aff = def.cost * s.macro.costIndex;
      h += btn(`build:${def.id}`, def.icon, def.name, `${Math.round(aff)}`, lock, `${def.desc}\nCoût : ${Math.round(aff)} k€ · entretien ${def.upkeep} k€/trim. · chantier ${def.turns} trim.`);
    }
  }
  void m;
  return h;
}

// ------------------------------------------------------------------ Onglet Ville
const IDX_LABELS: [keyof Metrics['idx'], string, string][] = [
  ['edu', '🎓', 'Éducation'], ['health', '🩺', 'Santé'], ['safety', '🛡️', 'Sécurité'], ['employment', '💼', 'Emploi'],
  ['housing', '🏠', 'Logement'], ['env', '🌿', 'Environnement'], ['energy', '⚡', 'Énergie'], ['mobility', '🚌', 'Mobilité'],
  ['culture', '🎭', 'Culture'],
];

export function panelCity(s: GameState, m: Metrics): string {
  let h = '';
  if (s.cohabitation) h += `<div class="warn-box"><b>Cohabitation.</b> Vous avez perdu les dernières élections : impôts, lois et institutions sont gelés jusqu’au scrutin du ${dateLabel(s.nextElection)}. Vous pouvez toujours bâtir et gérer la dette.</div>`;
  if (s.treasury < 0) h += `<div class="warn-box"><b>Trésorerie négative.</b> Réduisez les dépenses ou augmentez les recettes : la popularité en souffre.</div>`;
  const goalPop = LEVEL_POP_GOAL[s.level];
  const goalWb = LEVEL_WB_GOAL[s.level];
  if (s.level < 2) {
    const next = LEVEL_NAME[s.level + 1];
    h += `<div class="card"><h3>Prochaine étape : ${next}</h3>
      <div class="row"><span>👥 Population ${fmtN(s.pop)} / ${fmtN(goalPop)}</span>${bar((s.pop / goalPop) * 100)}</div>
      <div class="row"><span>😊 Bien-être ${m.wellbeing.toFixed(0)} / ${goalWb}</span>${bar((m.wellbeing / goalWb) * 100, col(m.wellbeing))}</div>
      <div class="mute">Il faut tenir ces deux objectifs pendant 2 trimestres (${s.levelStreak}/2).</div>
      ${s.levelReady ? `<div class="actions"><button class="primary" data-act="levelup">🚀 Passer à l’échelle « ${next} »</button></div>` : ''}</div>`;
  } else {
    h += `<div class="good-box">Vous dirigez le pays : c’est le bac à sable final. Visez le bien-être maximal !</div>`;
  }
  h += `<div class="card"><div class="row"><div><div class="mute">Indice de bien-être</div><div class="big" style="color:${col(m.wellbeing)}">${m.wellbeing.toFixed(0)}<small class="mute" style="font-size:14px"> /100</small></div></div>
    <div style="text-align:right"><div class="mute">Popularité</div><div class="big" style="font-size:26px;color:${col(s.satisfaction)}">${s.satisfaction.toFixed(0)}%</div></div></div></div>`;
  h += `<div class="card"><h3>Indicateurs</h3>`;
  for (const [k, ic, label] of IDX_LABELS) {
    const v = m.idx[k];
    h += `<div class="idx"><span>${ic}</span><span>${label}</span>${bar(v, col(v))}<span class="v">${v.toFixed(0)}</span></div>`;
  }
  h += `</div>`;
  h += `<div class="card"><h3>Chiffres clés</h3><table>
    <tr><td>Population / logements</td><td>${fmtN(s.pop)} / ${fmtN(m.housingCap)}</td></tr>
    <tr><td>Emplois pourvus / actifs</td><td>${fmtN(m.filled)} / ${fmtN(m.workforce)}</td></tr>
    <tr><td>Chômage</td><td class="${m.unemployment > 0.15 ? 'neg' : ''}">${pct(m.unemployment)}</td></tr>
    <tr><td>Énergie (offre / demande)</td><td class="${m.energySupply < m.energyDemand ? 'neg' : ''}">${fmtN(m.energySupply)} / ${fmtN(m.energyDemand)}</td></tr>
    <tr><td>Production économique</td><td>${fmtK(m.output)}/trim.</td></tr>
    <tr><td>Bâtiments desservis</td><td class="${m.servedShare < 0.8 ? 'neg' : ''}">${pct(m.servedShare, 0)}</td></tr>
    <tr><td>Gares / lignes de train</td><td>${m.stations} / ${m.lines}</td></tr>
    <tr><td>Inflation · indice des prix</td><td>${s.macro.inflation.toFixed(1)} % · ${s.macro.costIndex.toFixed(2)}</td></tr>
  </table></div>`;
  h += `<div class="card"><h3>Secteurs <small>(population · cadre de vie)</small></h3><table>`;
  m.districts.forEach((d, k) => {
    h += `<tr><td>${k === 0 ? 'Centre' : 'Secteur ' + d.name}</td><td>${fmtN(d.pop)} hab.</td><td class="${d.delta >= 0 ? 'pos' : 'neg'}">${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(0)}</td></tr>`;
  });
  h += `</table></div>`;
  return h;
}

// ------------------------------------------------------------------ Onglet Budget
export function panelBudget(s: GameState, m: Metrics): string {
  const r = m.revenue;
  const e = m.expenses;
  const rowv = (label: string, v: number, neg = false) => v === 0 ? '' : `<tr><td>${label}</td><td class="${neg ? 'neg' : ''}">${neg ? '−' : ''}${fmtK(v)}</td></tr>`;
  let h = `<div class="card"><h3>Comptes du trimestre</h3><table>
    ${rowv('Impôt sur le revenu', r.income)}${rowv('Impôt sur les entreprises', r.corp)}${rowv('Taxe foncière', r.property)}
    ${rowv('Billets de train', r.tickets)}${rowv('Péages', r.tolls)}${rowv('Dotation de l’État', r.transfers)}${rowv('TVA', r.vat)}
    <tr class="sep"><td>Recettes</td><td class="pos">${fmtK(r.total)}</td></tr>
    ${rowv('Entretien des équipements', e.upkeep, true)}${rowv('Administration', e.admin, true)}${rowv('Mesures en vigueur', e.policies, true)}${rowv('Intérêts de la dette', e.interest, true)}
    <tr class="sep"><td>Solde de fonctionnement</td><td class="${m.operatingBalance >= 0 ? 'pos' : 'neg'}">${fmtK(m.operatingBalance)}</td></tr>
    ${rowv('Remboursement du capital', e.principal, true)}
    <tr class="sep"><td>Variation de trésorerie</td><td class="${m.netCash >= 0 ? 'pos' : 'neg'}">${fmtK(m.netCash)}</td></tr></table></div>`;

  const dis = s.cohabitation ? 'disabled' : '';
  const rateSl = (key: string, label: string, v: number) => `<div class="sl"><label><span>${label}</span><b id="lbl-rate-${key}">${v} %</b></label><input type="range" min="0" max="30" step="1" value="${v}" data-act="rate" data-key="${key}" ${dis}/></div>`;
  h += `<div class="card"><h3>Fiscalité</h3>${rateSl('income', 'Impôt sur le revenu', s.rates.income)}${rateSl('corp', 'Impôt sur les entreprises', s.rates.corp)}${rateSl('property', 'Taxe foncière', s.rates.property)}
    <div class="mute">Au-delà de ~14 %, la popularité baisse ; un impôt entreprises > 12 % freine la production.</div></div>`;

  h += `<div class="card"><h3>Tarifs des transports</h3>
    <div class="sl"><label><span>Prix du billet de train</span><b id="lbl-rate-transit">${Math.round(s.rates.transit)} k€</b></label><input type="range" min="0" max="40" step="1" value="${s.rates.transit}" data-act="rate" data-key="transit" ${dis}/></div>
    <div class="mute">Par gare connectée, modulé par la population desservie ; n’a d’effet qu’avec un réseau ferré relié.</div>`;
  if (s.policies.includes('autoroutes_peage')) {
    h += `<div class="sl" style="margin-top:10px"><label><span>Péage autoroutier</span><b id="lbl-rate-toll">${s.rates.toll.toFixed(1)} k€</b></label><input type="range" min="0" max="5" step="0.1" value="${s.rates.toll}" data-act="rate" data-key="toll" ${dis}/></div>
      <div class="mute">Par tuile d’autoroute et par trimestre.</div>`;
  } else {
    h += `<div class="mute" style="margin-top:10px">Adoptez la mesure « Autoroutes à péage » (onglet Institutions) pour fixer un tarif de péage.</div>`;
  }
  h += `</div>`;

  h += `<div class="card"><h3>Financement des services</h3>`;
  for (const [k, label] of Object.entries(FUNDING_LABEL)) {
    const v = s.funding[k];
    h += `<div class="sl"><label><span>${label}</span><b id="lbl-fund-${k}">${Math.round(v * 100)} %</b></label><input type="range" min="0.5" max="1.5" step="0.05" value="${v}" data-act="funding" data-key="${k}" ${dis}/></div>`;
  }
  h += `<div class="mute">100 % = fonctionnement normal. Plus de budget = services plus efficaces (jusqu’à +15 %), moins = dégradation.</div></div>`;

  h += `<div class="card"><h3>Banques & dette</h3>`;
  if (m.banks === 0) h += `<div class="mute">Construisez une banque (catégorie « Banques ») pour pouvoir emprunter.</div>`;
  else {
    h += `<table><tr><td>Banques</td><td>${m.banks}</td></tr><tr><td>Plafond de crédit disponible</td><td>${fmtK(m.creditAvailable)}</td></tr>
      <tr><td>Taux actuel</td><td>${m.loanRate.toFixed(2)} %</td></tr><tr><td>Stabilité bancaire</td><td class="${s.bankStability < 45 ? 'neg' : ''}">${s.bankStability.toFixed(0)} / 100</td></tr></table>
      <div class="row" style="margin-top:8px"><select id="loan-amount">${[250, 500, 1000, 2000, 4000, 8000, 16000].map((a) => `<option value="${a}">${fmtK(a)}</option>`).join('')}</select>
      <select id="loan-term"><option value="8">2 ans</option><option value="16" selected>4 ans</option><option value="32">8 ans</option></select>
      <button data-act="loan">Emprunter</button></div>`;
  }
  if (s.loans.length) {
    h += `<table style="margin-top:8px"><tr><th>Prêt</th><th>Reste</th><th>Taux</th><th></th></tr>`;
    for (const l of s.loans) h += `<tr><td>#${l.id}</td><td>${fmtK(l.balance)}</td><td>${l.rate.toFixed(2)} %</td><td><button class="small" data-act="repay" data-id="${l.id}">Rembourser</button></td></tr>`;
    h += `</table>`;
  }
  h += `</div>`;

  if (s.level === 2) {
    const hasCB = (m.counts.banque_centrale ?? 0) > 0;
    h += `<div class="card"><h3>Banque centrale</h3>`;
    if (!hasCB) h += `<div class="mute">Construisez la Banque centrale (catégorie « Banques ») pour piloter le taux directeur.</div>`;
    else h += `<div class="sl"><label><span>Taux directeur</span><b id="lbl-prate">${s.policyRate.toFixed(2)} %</b></label><input type="range" min="0" max="8" step="0.25" value="${s.policyRate}" data-act="prate" ${dis}/></div>
      <div class="mute">Un taux bas stimule l’activité mais fait monter l’inflation ; un taux élevé refroidit. Neutre : ~3 %.</div>`;
    h += `<table><tr><td>Inflation</td><td>${s.macro.inflation.toFixed(1)} %</td></tr><tr><td>Conjoncture</td><td>${s.macro.cycle >= 0 ? '+' : ''}${(s.macro.cycle * 100).toFixed(0)}</td></tr></table></div>`;
  }
  return h;
}

// ------------------------------------------------------------------ Onglet Institutions
export function panelPolitics(s: GameState, m: Metrics): string {
  const dis = s.cohabitation ? 'disabled' : '';
  let h = '';
  if (s.cohabitation) h += `<div class="warn-box"><b>Cohabitation :</b> les lois, les institutions et les référendums sont gelés jusqu’aux prochaines élections.</div>`;

  h += `<div class="card"><h3>Institutions</h3>`;
  const inst: [number, string, string][] = [
    [0, '🏛️ Mairie', 'Exécutif communal : budget, urbanisme, services de proximité.'],
    [0, '🪑 Conseil municipal', `${LEVEL_SEATS[0]} sièges, élus pour ${s.settings.mandateQ / 4} ans.`],
    [1, '🏞️ Conseil régional', `${LEVEL_SEATS[1]} sièges : transports, lycées, universités, autoroutes.`],
    [2, '🏛️ Parlement', `${LEVEL_SEATS[2]} sièges : lois nationales, fiscalité d’État.`],
    [2, '👔 Gouvernement', 'Pilote la politique nationale et la Banque centrale.'],
    [2, '⚖️ Cour des comptes', 'Vérifie la dette : plus elle est élevée, plus les taux montent.'],
  ];
  for (const [lv, name, desc] of inst) {
    const on = s.level >= lv;
    h += `<div class="row" style="opacity:${on ? 1 : 0.45}"><div><b>${name}</b><div class="mute" style="font-size:12px">${desc}</div></div><span class="pill">${on ? 'en place' : LEVEL_NAME[lv]}</span></div>`;
  }
  h += `</div>`;

  if (!s.sandbox && Object.keys(s.councilSeats).length) {
    h += `<div class="card"><h3>${LEVEL_ASSEMBLY[s.level]} <small>(dernier scrutin)</small></h3>${seatsBar(s, s.councilSeats, s.lastElection?.totalSeats ?? 1)}</div>`;
  }

  if (s.sandbox) {
    h += `<div class="card"><h3>Règles du jeu démocratique</h3><div class="mute">🧪 Mode entraînement libre : pas d’élections ni de cohabitation, les règles de scrutin ne s’appliquent pas.</div></div>`;
  } else {
    h += `<div class="card"><h3>Règles du jeu démocratique</h3>
    <div class="field"><label>Mode de scrutin</label><select data-act="setting" data-key="voteSystem" ${dis}>
      <option value="majoritaire" ${s.settings.voteSystem === 'majoritaire' ? 'selected' : ''}>Majoritaire à 2 tours (prime à la liste gagnante)</option>
      <option value="proportionnelle" ${s.settings.voteSystem === 'proportionnelle' ? 'selected' : ''}>Proportionnelle (coalitions)</option></select></div>
    <div class="field"><label>Durée du mandat</label><select data-act="setting" data-key="mandateQ" ${dis}>
      ${[12, 16, 20, 24].map((q) => `<option value="${q}" ${s.settings.mandateQ === q ? 'selected' : ''}>${q / 4} ans</option>`).join('')}</select></div></div>`;
  }

  // Mesures
  h += `<div class="card"><h3>Mesures & lois</h3>`;
  for (const p of POLICIES) {
    const on = s.policies.includes(p.id);
    const locked = p.level > s.level;
    const likes = p.likes.map((id) => s.parties.find((x) => x.id === id)?.name).filter(Boolean).join(', ');
    const dislikes = p.dislikes.map((id) => s.parties.find((x) => x.id === id)?.name).filter(Boolean).join(', ');
    h += `<div class="row" style="align-items:flex-start;opacity:${locked ? 0.45 : 1}"><div style="flex:1"><b>${p.icon} ${p.name}</b> ${on ? '<span class="pill" style="color:var(--good)">en vigueur</span>' : ''}
      <div class="mute" style="font-size:12px">${p.desc} · ${p.upkeep ? p.upkeep + ' k€/trim.' : 'gratuit'}</div>
      <div class="mute" style="font-size:11px">${likes ? '👍 ' + likes : ''} ${dislikes ? ' 👎 ' + dislikes : ''}</div></div>
      <button class="small ${on ? 'danger' : ''}" data-act="${on ? 'repeal' : 'enact'}" data-id="${p.id}" ${locked || s.cohabitation ? 'disabled' : ''}>${locked ? '🔒' : on ? 'Abroger' : 'Adopter'}</button></div>`;
  }
  h += `</div>`;

  // Budget participatif
  if (s.policies.includes('budget_participatif')) {
    h += `<div class="card"><h3>🗳️ Budget participatif</h3>`;
    if (!s.proposals.length) h += `<div class="mute">Aucune proposition pour le moment. De nouveaux projets arrivent tous les 4 trimestres.</div>`;
    for (const p of s.proposals) h += `<div class="row"><div>${esc(p.title)}<div class="mute" style="font-size:12px">${fmtK(p.cost)}</div></div><button class="small" data-act="fund" data-id="${p.id}">Financer</button></div>`;
    if (s.proposals.length) h += `<div class="actions"><button class="small" data-act="dismiss">Ignorer</button></div>`;
    h += `</div>`;
  }

  // Cagnottes citoyennes
  h += `<div class="card"><h3>💰 Cagnottes citoyennes</h3>
    <div class="mute">Les habitants d’un secteur cotisent chaque trimestre pour financer un bâtiment, sans toucher à la trésorerie de la commune.</div>`;
  for (const fr of s.fundraisers) {
    const def = B[fr.building];
    const pct = Math.min(100, (fr.raised / fr.goal) * 100);
    h += `<div class="row" style="align-items:flex-start;margin-top:8px"><div style="flex:1">
      <div>${def.icon} <b>${def.name}</b> — ${DISTRICT_NAMES[fr.district] === 'Centre' ? 'Centre' : 'Secteur ' + DISTRICT_NAMES[fr.district]}</div>
      ${bar(pct)}<div class="mute" style="font-size:12px">${fmtK(fr.raised)} / ${fmtK(fr.goal)}</div></div>
      <button class="small danger" data-act="cancel-fundraiser" data-id="${fr.id}" ${s.cohabitation ? 'disabled' : ''}>Annuler</button></div>`;
  }
  const frOptions = BUILDINGS.filter((b) => b.id !== 'mairie' && (b.level <= s.level || s.sandbox) && !(b.unique && s.tiles.some((t) => t.building === b.id)));
  if (s.fundraisers.length >= 3) h += `<div class="mute" style="margin-top:8px">Trois cagnottes au maximum en même temps.</div>`;
  else if (!frOptions.length) h += `<div class="mute" style="margin-top:8px">Aucun bâtiment disponible à financer pour le moment.</div>`;
  else {
    h += `<div class="row" style="margin-top:10px;gap:6px">
      <select id="fr-building" style="flex:1">${CAT_ORDER.map((cat) => {
        const opts = frOptions.filter((b) => b.cat === cat);
        return opts.length ? `<optgroup label="${CAT_LABEL[cat]}">${opts.map((b) => `<option value="${b.id}">${b.icon} ${b.name} — ${Math.round(b.cost * s.macro.costIndex)} k€</option>`).join('')}</optgroup>` : '';
      }).join('')}</select>
      <select id="fr-district">${DISTRICT_NAMES.map((n, i) => `<option value="${i}">${n === 'Centre' ? 'Centre' : 'Secteur ' + n}</option>`).join('')}</select>
      <button class="small" data-act="start-fundraiser" ${s.cohabitation ? 'disabled' : ''}>Lancer</button></div>`;
  }
  h += `</div>`;

  // Référendums
  h += `<div class="card"><h3>Référendums <small>(1 tous les 2 trimestres)</small></h3>`;
  for (const t of REFERENDUMS) {
    h += `<div style="margin:8px 0"><b>${t.title}</b><div class="mute" style="font-size:12px">${t.question}<br>${t.describe}</div>
      <div class="actions" style="margin-top:4px"><button class="small" data-act="poll" data-id="${t.id}">Sondage (10 k€)</button><button class="small" data-act="referendum" data-id="${t.id}" ${s.cohabitation ? 'disabled' : ''}>Organiser (${Math.round(t.cost * s.macro.costIndex)} k€)</button></div></div>`;
  }
  if (s.referendums.length) {
    h += `<h3 style="margin-top:12px">Historique</h3>`;
    for (const r of [...s.referendums].reverse().slice(0, 6)) h += `<div class="log ${r.passed ? 'good' : ''}">${dateLabel(r.turn)} · ${r.title} : ${pct(r.yes)} de oui — ${r.passed ? 'adopté' : 'rejeté'}</div>`;
  }
  h += `</div>`;
  void m;
  return h;
}

function seatsBar(s: GameState, seats: Record<string, number>, total: number): string {
  const ids = Object.keys(seats).filter((k) => seats[k] > 0).sort((a, b) => seats[b] - seats[a]);
  let h = `<div class="seats">`;
  for (const id of ids) h += `<div style="width:${(seats[id] / total) * 100}%;background:${listColor(s, id)}" title="${esc(listName(s, id))}">${seats[id]}</div>`;
  h += `</div><div class="legend">`;
  for (const id of ids) h += `<span><i style="background:${listColor(s, id)}"></i>${esc(listName(s, id))}</span>`;
  return h + `</div>`;
}

// ------------------------------------------------------------------ Onglet Élections
export function panelElections(s: GameState, m: Metrics, pollShares: Record<string, number>): string {
  if (s.sandbox) return `<div class="card"><h3>🧪 Mode entraînement libre</h3><p class="mute">Pas d’élections ni de cohabitation dans ce mode : vous gardez la main en permanence pour vous entraîner.</p></div>`;
  const left = s.nextElection - s.turn;
  const titles = ['municipales', 'régionales', 'législatives'];
  let h = `<div class="card"><h3>Élections ${titles[s.level]}</h3>
    <div class="row"><span>Prochain scrutin</span><b>${dateLabel(s.nextElection)} (${left} trim.)</b></div>
    <div class="row"><span>Votre liste</span><b style="color:${s.playerList.color}">${esc(s.playerList.name)}</b></div>
    <div class="row"><span>Scrutin</span><span>${s.settings.voteSystem === 'majoritaire' ? 'Majoritaire à 2 tours' : 'Proportionnel'}</span></div></div>`;

  h += `<div class="card"><h3>Sondage d’intentions de vote <small>(aujourd’hui)</small></h3>`;
  const ids = Object.keys(pollShares).sort((a, b) => pollShares[b] - pollShares[a]);
  for (const id of ids) h += `<div class="idx" style="grid-template-columns:1fr 2fr 48px"><span>${esc(listName(s, id))}</span>${bar(pollShares[id] * 100 * 1.5, listColor(s, id))}<span class="v">${pct(pollShares[id], 0)}</span></div>`;
  h += `<div class="mute">Les sondages varient de quelques points d’un trimestre à l’autre.</div></div>`;

  const maxCamp = Math.floor(Math.max(0, Math.min(s.treasury, 1500 * (1 + s.level))));
  h += `<div class="card"><h3>Campagne électorale</h3>`;
  if (left > 4) h += `<div class="mute">La campagne s’ouvre 4 trimestres avant le scrutin.</div>`;
  else h += `<div class="sl"><label><span>Budget de campagne</span><b id="lbl-camp">${fmtK(s.campaign)} (+${(campaignBonus(s, s.campaign) * 40).toFixed(1)} pts env.)</b></label><input type="range" min="0" max="${Math.max(1, maxCamp)}" step="10" value="${Math.min(s.campaign, maxCamp)}" data-act="campaign"/></div><div class="mute">Dépensé au moment du scrutin. Rendements décroissants.</div>`;
  h += `</div>`;

  const le = s.lastElection;
  if (le) {
    h += `<div class="card"><h3>${le.title} · ${dateLabel(le.turn)}</h3>`;
    for (const r of le.rounds) {
      h += `<div class="mute" style="margin-top:4px">Tour ${r.round}</div>`;
      const rid = Object.keys(r.shares).sort((a, b) => r.shares[b] - r.shares[a]);
      for (const id of rid) h += `<div class="idx" style="grid-template-columns:1fr 2fr 48px"><span>${esc(listName(s, id))}</span>${bar(r.shares[id] * 100 * 1.4, listColor(s, id))}<span class="v">${pct(r.shares[id], 1)}</span></div>`;
    }
    h += `<div class="mute" style="margin-top:6px">Sièges</div>${seatsBar(s, le.seats, le.totalSeats)}`;
    h += `<div class="${le.playerWon ? 'good-box' : 'warn-box'}">${le.playerWon ? '🏆 Vous avez gagné.' : '⚠️ Vous avez perdu : ' + esc(listName(s, le.winner)) + ' est en tête.'}${le.coalition ? '<br>Coalition : ' + esc(le.coalition) : ''}</div>`;
    h += `<h3>Résultats par secteur <small>(1er tour)</small></h3><table>`;
    for (const d of le.districts) {
      const best = Object.keys(d.shares).sort((a, b) => d.shares[b] - d.shares[a])[0];
      h += `<tr><td>${d.name}</td><td style="color:${listColor(s, best)}">${esc(listName(s, best))}</td><td>${pct(d.shares.player, 0)}</td></tr>`;
    }
    h += `</table></div>`;
  }
  if (s.electionHistory.length) {
    h += `<div class="card"><h3>Historique</h3>`;
    for (const e of [...s.electionHistory].reverse()) h += `<div class="log ${e.playerWon ? 'good' : 'bad'}">${dateLabel(e.turn)} · ${LEVEL_NAME[e.level]} — ${e.playerWon ? 'victoire' : 'défaite'} (${pct(e.playerShare, 0)})</div>`;
    h += `</div>`;
  }
  void m;
  return h;
}

export function computePoll(s: GameState, m: Metrics): Record<string, number> {
  const saved = s.rng;
  const bonus = campaignBonus(s, s.campaign);
  const tot: Record<string, number> = {};
  for (let d = 0; d < 7; d++) {
    const sh = districtShares(s, m, d, bonus);
    for (const k of Object.keys(sh)) tot[k] = (tot[k] ?? 0) + sh[k] * m.districts[d].share;
  }
  s.rng = saved;
  return tot;
}

// ------------------------------------------------------------------ Onglet Plan
export function panelPlan(s: GameState, m: Metrics, tool: string): string {
  let h = `<div class="card"><h3>Plan d’urbanisme</h3><div class="mute" style="margin-bottom:6px">Choisissez une zone puis peignez-la sur la carte (clic ou glisser). Les bâtiments doivent respecter le zonage.</div>`;
  const zones: Zone[] = ['free', 'residential', 'economic', 'industrial', 'agri', 'nature'];
  for (const z of zones) {
    h += `<button class="tool ${tool === 'zone:' + z ? 'active' : ''}" data-tool="zone:${z}"><span class="ic" style="background:${ZONE_COLOR[z] === 'transparent' ? '#fff3' : ZONE_COLOR[z]};border-radius:4px">&nbsp;</span><span class="nm">${ZONE_LABEL[z]}</span><span class="co">${Math.round(1.5 * s.macro.costIndex)}</span></button>`;
  }
  h += `<div class="mute" style="margin-top:6px">Zones naturelles : inconstructibles et absorbent la pollution. Agricoles : fermes et maraîchage.</div></div>`;
  h += `<div class="card"><h3>Réseaux</h3><table>
    <tr><td>Routes</td><td>${m.roadTiles} tuiles</td></tr><tr><td>Autoroutes</td><td>${m.highwayTiles} tuiles</td></tr><tr><td>Voies ferrées</td><td>${m.railTiles} tuiles</td></tr>
    <tr><td>Gares</td><td>${m.stations} (${m.connectedStations} reliées)</td></tr><tr><td>Lignes de train</td><td>${m.lines}</td></tr>
    <tr><td>Bâtiments desservis par la route</td><td>${pct(m.servedShare, 0)}</td></tr></table>
    <div class="mute" style="margin-top:6px">Un bâtiment doit toucher une route reliée à la mairie, sinon son efficacité est divisée par 2. Deux gares reliées par des rails forment une ligne : transport, billets et mobilité.</div></div>`;
  h += `<div class="card"><h3>Calques de la carte</h3><div class="mute">Utilisez le menu « Calque » au-dessus de la carte : plan d’urbanisme, secteurs électoraux, desserte routière, pollution.</div></div>`;
  return h;
}

// ------------------------------------------------------------------ Onglet Journal
export function panelJournal(s: GameState): string {
  let h = '';
  const hist = s.history;
  if (hist.length > 2) {
    const W = 330, H = 110;
    const maxP = Math.max(...hist.map((p) => p.pop), 1);
    const x = (i: number) => 4 + (i / (hist.length - 1)) * (W - 8);
    const line = (f: (p: (typeof hist)[0]) => number, max: number, color: string) =>
      `<polyline fill="none" stroke="${color}" stroke-width="2" points="${hist.map((p, i) => `${x(i).toFixed(1)},${(H - 6 - (Math.max(0, f(p)) / max) * (H - 12)).toFixed(1)}`).join(' ')}"/>`;
    h += `<div class="card"><h3>Évolution <small>(pop. bleu · bien-être vert · popularité orange)</small></h3><svg viewBox="0 0 ${W} ${H}" width="100%">
      <rect width="${W}" height="${H}" fill="#0f1a29" rx="6"/>${line((p) => p.pop, maxP, '#4aa3ff')}${line((p) => p.wellbeing, 100, '#43b96b')}${line((p) => p.satisfaction, 100, '#e9a820')}</svg></div>`;
  }
  h += `<div class="card"><h3>Journal</h3>`;
  for (const l of [...s.log].reverse().slice(0, 80)) h += `<div class="log ${l.kind}"><span class="mute">${dateLabel(l.turn)}</span> ${esc(l.text)}</div>`;
  return h + `</div>`;
}

// ------------------------------------------------------------------ Aide
export function panelHelp(): string {
  return `<div class="card"><h3>But du jeu</h3><p>Concorde est un jeu <b>coopératif et positif</b> : pas de guerre, pas de rivaux. Vous dirigez une commune, puis une région, puis un pays. Améliorez le <b>bien-être</b> de la population tout en gardant des finances saines et en gagnant la confiance des électeurs.</p></div>
  <div class="card"><h3>Comment jouer</h3><ul style="padding-left:18px;margin:0">
    <li>Choisissez un outil à gauche et cliquez sur la carte. Les <b>routes</b> relient les bâtiments à la mairie ; sans route, ils sont à moitié efficaces.</li>
    <li>Logez, employez, formez, soignez, protégez, cultivez, alimentez en énergie : 9 indicateurs composent le bien-être.</li>
    <li>Cliquez <b>Trimestre suivant</b> (ou Espace) : les chantiers avancent, l’argent rentre, les habitants arrivent ou partent.</li>
    <li><b>Budget</b> : impôts, financement des services, emprunts. Les banques permettent de s’endetter ; la dette coûte des intérêts.</li>
    <li><b>Institutions</b> : lois, budget participatif, référendums, mode de scrutin.</li>
    <li><b>Élections</b> : des listes concurrentes (mais non violentes !) se disputent les électeurs de 7 secteurs. Perdre = cohabitation : plus de lois ni d’impôts à changer, jusqu’au prochain vote.</li>
    <li>Atteignez la taille et le bien-être requis pour passer <b>Commune → Région → Pays</b> : le territoire s’agrandit, autoroutes, hôpitaux, universités puis Banque centrale se débloquent.</li>
    <li><b>🧪 Mode entraînement libre</b> (à choisir en début de partie) : désactive les élections et la cohabitation, et débloque tous les bâtiments dès le départ (il faut toujours un emplacement compatible et payer le prix normal), pour s’entraîner sans contrainte politique ni de progression.</li></ul></div>
  <div class="card"><h3>Commandes</h3><ul style="padding-left:18px;margin:0"><li>Molette : zoom · glisser (outil Inspecter) ou clic droit/milieu : déplacer</li><li>Espace : trimestre suivant · Échap : outil Inspecter</li><li>Menu ☰ : nouvelle partie, export/import de sauvegarde</li></ul></div>`;
}

export function newGameDialog(hasSave: boolean): string {
  return `<h2>🏛️ Nouvelle partie</h2>
  <div class="field"><label>Nom de votre liste</label><input type="text" id="ng-name" value="Concorde citoyenne" maxlength="40" style="width:100%"/></div>
  <div class="field"><label>Votre programme</label>${PLATFORMS.map((p, i) => `<label class="opt"><input type="radio" name="ng-plat" value="${p.id}" ${i === 0 ? 'checked' : ''}/> <b>${p.name}</b> — <span class="mute">${p.desc}</span></label>`).join('')}</div>
  <div class="field"><label>Couleur</label><input type="color" id="ng-color" value="#2b7de9"/></div>
  <div class="field"><label>Graine du monde (laisser vide = aléatoire)</label><input type="text" id="ng-seed" placeholder="ex. 12345" style="width:100%"/></div>
  <div class="field"><label class="opt"><input type="checkbox" id="ng-sandbox"/> <b>🧪 Mode entraînement libre</b> — <span class="mute">pas d’élections ni de cohabitation, et tous les bâtiments sont débloqués dès le départ (prix normal, terrain compatible requis).</span></label></div>
  <div class="actions">${hasSave ? '<button data-dlg="cancel">Reprendre la partie</button>' : ''}<button class="primary" data-dlg="start">Commencer</button></div>`;
}

export function homeList(games: GameMeta[]): string {
  if (!games.length) return `<p class="mute">Aucune partie commencée pour l’instant. Créez-en une pour débuter.</p>`;
  return games.map((g) => `<div class="save-item" data-id="${g.id}">
    <div class="sw" style="background:${g.color}"></div>
    <div class="info">
      <div class="name">${esc(g.name)} ${g.sandbox ? '<span class="pill">🧪 entraînement</span>' : ''}</div>
      <div class="meta">${dateLabel(g.turn)} · ${LEVEL_NAME[g.level]} · 👥 ${fmtN(g.pop)} · 😊 ${g.wellbeing} · 💰 ${fmtK(g.treasury)}</div>
    </div>
    <div class="actions" style="margin:0"><button class="small danger" data-home-act="delete" data-id="${g.id}" title="Supprimer">🗑️</button>
      <button class="primary small" data-home-act="resume" data-id="${g.id}">▶️ Continuer</button></div>
  </div>`).join('');
}

export function confirmDeleteDialog(g: GameMeta): string {
  return `<h2>🗑️ Supprimer la partie</h2>
  <p>Voulez-vous vraiment supprimer définitivement « <b>${esc(g.name)}</b> » (${dateLabel(g.turn)}) ? Cette action est irréversible.</p>
  <div class="actions"><button data-dlg="close">Annuler</button><button class="danger" data-dlg="confirm-delete" data-id="${g.id}">Supprimer</button></div>`;
}

export function menuDialog(): string {
  return `<h2>☰ Menu</h2><div class="actions" style="justify-content:flex-start">
    <button data-dlg="new">🆕 Nouvelle partie</button><button data-dlg="export">💾 Exporter la sauvegarde</button><button data-dlg="import">📂 Importer</button><button data-dlg="close">Fermer</button></div>
  <p class="mute">La partie est sauvegardée automatiquement dans ce navigateur.</p>`;
}

export function tileInfo(s: GameState, m: Metrics, i: number): string {
  if (i < 0) return '';
  const t = s.tiles[i];
  const tn: Record<string, string> = { water: 'Eau', plain: 'Plaine', forest: 'Forêt', hill: 'Colline', mountain: 'Montagne' };
  const parts = [tn[t.terrain]];
  if (t.building) {
    const d = B[t.building];
    parts.push(`${d.icon} ${d.name}${t.build > 0 ? ` (chantier : ${t.build} trim.)` : ''}`);
  }
  if (t.infra !== 'none') parts.push(INFRA[t.infra].name);
  if (t.zone !== 'free') parts.push(`Zone ${ZONE_LABEL[t.zone].toLowerCase()}`);
  parts.push(i === s.capital ? 'Centre' : (m.districts[t.district]?.name ?? ''));
  return parts.join(' · ');
}

export function tipHtml(s: GameState, i: number, tool: string): string {
  if (i < 0) return '';
  const t = s.tiles[i];
  let h = '';
  if (tool.startsWith('build:')) {
    const id = tool.slice(6);
    h += `<b>${B[id].icon} ${B[id].name}</b><br>Coût : ${buildCost(s, id, i)} k€`;
  } else if (t.building) {
    const d = B[t.building];
    h += `<b>${d.icon} ${d.name}</b><br>${d.desc}<br>Entretien : ${d.upkeep} k€/trim.`;
  }
  return h;
}

void ISSUES; void LEVEL_EXEC; void P;
