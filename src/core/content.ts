import type { Level, Party, Terrain } from './types';

export type Cat =
  | 'logement' | 'economie' | 'energie' | 'education' | 'sante' | 'securite'
  | 'culture' | 'environnement' | 'finance' | 'transport' | 'admin' | 'attraction';

export const CAT_LABEL: Record<Cat, string> = {
  logement: 'Logement',
  economie: 'Économie',
  energie: 'Énergie',
  education: 'Éducation',
  sante: 'Santé',
  securite: 'Sécurité & secours',
  culture: 'Culture & sport',
  environnement: 'Environnement',
  finance: 'Banques',
  transport: 'Transports',
  admin: 'Administration',
  attraction: 'Attractions',
};

export const CAT_ORDER: Cat[] = [
  'logement', 'economie', 'energie', 'education', 'sante', 'securite',
  'culture', 'environnement', 'finance', 'transport',
];

/** Ordre et libellés des catégories dans la barre d'outils du mode « Parc d'attraction ». */
export const PARK_CAT_ORDER: Cat[] = ['attraction', 'economie', 'culture', 'sante', 'securite', 'environnement', 'transport', 'energie', 'finance'];
export const PARK_CAT_LABEL: Partial<Record<Cat, string>> = {
  attraction: 'Attractions',
  economie: 'Restauration & boutiques',
  culture: 'Spectacles',
  sante: 'Secours & hygiène',
  securite: 'Sécurité',
  environnement: 'Espaces verts',
  transport: 'Accès & stationnement',
  energie: 'Énergie',
  finance: 'Banques',
};

/** Catégories financées par une ligne de budget réglable */
export const FUNDING_KEY: Partial<Record<Cat, string>> = {
  education: 'education',
  sante: 'health',
  securite: 'safety',
  culture: 'culture',
  environnement: 'environment',
  transport: 'transport',
};

export const FUNDING_LABEL: Record<string, string> = {
  education: 'Éducation',
  health: 'Santé',
  safety: 'Sécurité & secours',
  culture: 'Culture & sport',
  environment: 'Environnement',
  transport: 'Transports',
};

export interface BuildingDef {
  id: string;
  name: string;
  icon: string;
  cat: Cat;
  desc: string;
  cost: number;
  upkeep: number;
  level: Level;
  turns: number;
  terrains: Terrain[];
  unique?: boolean;
  housing?: number;
  jobs?: number;
  skilled?: boolean;
  prod?: number;
  supply?: number;
  pollution?: number;
  green?: number;
  absorb?: number;
  eduP?: number;
  eduS?: number;
  eduH?: number;
  health?: number;
  safety?: number;
  culture?: number;
  transit?: number;
  credit?: number;
  econBonus?: number;
  station?: boolean;
  rateControl?: boolean;
  fire?: number;
  /** Capacité d'accueil d'une attraction (mode Parc). */
  rideCapacity?: number;
  /** Intensité des sensations d'une attraction, 0-1 (mode Parc). */
  thrill?: number;
  /** Modes de jeu où ce bâtiment est proposé. Par défaut : commune/région/pays uniquement. */
  modes?: ('city' | 'park')[];
}

const LAND: Terrain[] = ['plain', 'forest', 'hill'];
const FLAT: Terrain[] = ['plain', 'hill'];

export const BUILDINGS: BuildingDef[] = [
  { id: 'mairie', name: 'Mairie', icon: '🏛️', cat: 'admin', desc: 'Cœur de la commune. Point de départ du réseau routier.', cost: 0, upkeep: 0, level: 0, turns: 0, terrains: LAND, unique: true, jobs: 20, prod: 0 },

  { id: 'pavillons', name: 'Quartier pavillonnaire', icon: '🏡', cat: 'logement', desc: 'Maisons individuelles : 120 habitants.', cost: 120, upkeep: 3, level: 0, turns: 1, terrains: FLAT, housing: 120 },
  { id: 'immeubles', name: 'Résidence collective', icon: '🏘️', cat: 'logement', desc: 'Petits immeubles : 400 habitants.', cost: 380, upkeep: 9, level: 0, turns: 2, terrains: FLAT, housing: 400 },
  { id: 'ecoquartier', name: 'Écoquartier', icon: '🌱', cat: 'logement', desc: 'Logements sobres avec énergie solaire intégrée : 320 habitants.', cost: 520, upkeep: 9, level: 1, turns: 2, terrains: FLAT, housing: 320, supply: 350, green: 0.4 },
  { id: 'tours', name: 'Tours d’habitation', icon: '🏢', cat: 'logement', desc: 'Habitat dense : 1 000 habitants.', cost: 900, upkeep: 20, level: 1, turns: 3, terrains: ['plain'], housing: 1000, pollution: 0.2 },

  { id: 'ferme', name: 'Exploitation agricole', icon: '🌾', cat: 'economie', desc: '25 emplois non qualifiés, alimentation locale.', cost: 80, upkeep: 3, level: 0, turns: 1, terrains: FLAT, jobs: 25, prod: 3.5, pollution: 0.3 },
  { id: 'bio', name: 'Maraîchage bio', icon: '🥕', cat: 'economie', desc: '20 emplois, améliore l’environnement.', cost: 100, upkeep: 3, level: 0, turns: 1, terrains: FLAT, jobs: 20, prod: 3.2, green: 0.5 },
  { id: 'atelier', name: 'Ateliers & artisanat', icon: '🛠️', cat: 'economie', desc: '40 emplois non qualifiés.', cost: 150, upkeep: 6, level: 0, turns: 1, terrains: FLAT, jobs: 40, prod: 4, pollution: 0.5 },
  { id: 'commerces', name: 'Pôle commercial', icon: '🛍️', cat: 'economie', desc: '60 emplois non qualifiés.', cost: 220, upkeep: 7, level: 0, turns: 2, terrains: FLAT, jobs: 60, prod: 4.2, pollution: 0.1 },
  { id: 'usine', name: 'Zone industrielle', icon: '🏭', cat: 'economie', desc: '150 emplois, très productive mais polluante.', cost: 450, upkeep: 14, level: 1, turns: 2, terrains: FLAT, jobs: 150, prod: 5, pollution: 2 },
  { id: 'bureaux', name: 'Parc tertiaire', icon: '💼', cat: 'economie', desc: '100 emplois qualifiés (demande de la formation).', cost: 520, upkeep: 11, level: 1, turns: 2, terrains: FLAT, jobs: 100, skilled: true, prod: 8.5 },
  { id: 'innovation', name: 'Pôle d’innovation', icon: '🔬', cat: 'economie', desc: '200 emplois très qualifiés.', cost: 1100, upkeep: 22, level: 2, turns: 3, terrains: FLAT, jobs: 200, skilled: true, prod: 11 },

  { id: 'solaire', name: 'Centrale solaire', icon: '☀️', cat: 'energie', desc: 'Énergie propre : 900 unités.', cost: 260, upkeep: 4, level: 0, turns: 1, terrains: FLAT, supply: 900, modes: ['city', 'park'] },
  { id: 'eolien', name: 'Parc éolien', icon: '🌬️', cat: 'energie', desc: 'Énergie propre : 1 300 unités.', cost: 380, upkeep: 6, level: 0, turns: 1, terrains: FLAT, supply: 1300, modes: ['city', 'park'] },
  { id: 'gaz', name: 'Centrale à gaz', icon: '🔥', cat: 'energie', desc: 'Beaucoup d’énergie (4 500) mais polluante.', cost: 600, upkeep: 25, level: 0, turns: 2, terrains: FLAT, supply: 4500, pollution: 2.5, modes: ['city', 'park'] },
  { id: 'geothermie', name: 'Géothermie', icon: '♨️', cat: 'energie', desc: 'Énergie propre et stable : 3 000 unités.', cost: 900, upkeep: 11, level: 1, turns: 2, terrains: FLAT, supply: 3000, modes: ['city', 'park'] },
  { id: 'nucleaire', name: 'Centrale nucléaire', icon: '⚛️', cat: 'energie', desc: 'Très grosse capacité (15 000), faible pollution, coûteuse.', cost: 3500, upkeep: 56, level: 2, turns: 4, terrains: ['plain'], supply: 15000, pollution: 0.4 },

  { id: 'ecole', name: 'École primaire', icon: '🏫', cat: 'education', desc: 'Capacité 500 élèves.', cost: 300, upkeep: 20, level: 0, turns: 1, terrains: FLAT, eduP: 500 },
  { id: 'college', name: 'Collège-lycée', icon: '🎓', cat: 'education', desc: 'Capacité 700 élèves.', cost: 600, upkeep: 34, level: 0, turns: 2, terrains: FLAT, eduS: 700 },
  { id: 'univ', name: 'Université', icon: '📖', cat: 'education', desc: 'Capacité 1 000 étudiants, 80 emplois qualifiés.', cost: 1500, upkeep: 77, level: 1, turns: 3, terrains: FLAT, eduH: 1000, jobs: 80, skilled: true, prod: 3 },

  { id: 'clinique', name: 'Centre de santé', icon: '🩺', cat: 'sante', desc: 'Soins pour 1 500 habitants.', cost: 250, upkeep: 20, level: 0, turns: 1, terrains: FLAT, health: 1500 },
  { id: 'hopital', name: 'Hôpital', icon: '🏥', cat: 'sante', desc: 'Soins pour 6 000 habitants.', cost: 1400, upkeep: 98, level: 1, turns: 3, terrains: FLAT, health: 6000, jobs: 100, skilled: true, prod: 2 },

  { id: 'commissariat', name: 'Commissariat', icon: '🚓', cat: 'securite', desc: 'Sécurité pour 3 000 habitants.', cost: 280, upkeep: 20, level: 0, turns: 1, terrains: FLAT, safety: 3000 },
  { id: 'pompiers', name: 'Caserne de pompiers', icon: '🚒', cat: 'securite', desc: 'Sécurité pour 5 000 habitants, réduit les dégâts des catastrophes.', cost: 350, upkeep: 25, level: 0, turns: 1, terrains: FLAT, safety: 5000, fire: 1 },

  { id: 'biblio', name: 'Médiathèque', icon: '📚', cat: 'culture', desc: 'Culture : 25 points.', cost: 220, upkeep: 14, level: 0, turns: 1, terrains: FLAT, culture: 25 },
  { id: 'stade', name: 'Complexe sportif', icon: '🏟️', cat: 'culture', desc: 'Culture & sport : 20 points.', cost: 400, upkeep: 22, level: 0, turns: 2, terrains: FLAT, culture: 20 },
  { id: 'theatre', name: 'Théâtre & salle de concert', icon: '🎭', cat: 'culture', desc: 'Culture : 40 points.', cost: 480, upkeep: 31, level: 1, turns: 2, terrains: FLAT, culture: 40 },

  { id: 'parc', name: 'Parc urbain', icon: '🌳', cat: 'environnement', desc: 'Espace vert : absorbe la pollution, +5 culture.', cost: 90, upkeep: 4, level: 0, turns: 1, terrains: LAND, green: 1.5, culture: 5 },
  { id: 'epuration', name: 'Recyclage & épuration', icon: '♻️', cat: 'environnement', desc: 'Absorbe fortement la pollution.', cost: 400, upkeep: 17, level: 0, turns: 2, terrains: FLAT, absorb: 3 },

  { id: 'banque_locale', name: 'Banque locale', icon: '🏦', cat: 'finance', desc: 'Permet d’emprunter (+1 500 de plafond), 30 emplois qualifiés.', cost: 400, upkeep: 8, level: 0, turns: 2, terrains: FLAT, credit: 1500, jobs: 30, skilled: true, prod: 6, modes: ['city', 'park'] },
  { id: 'banque_coop', name: 'Banque coopérative citoyenne', icon: '🤝', cat: 'finance', desc: 'Microcrédit : +4 % de production, plafond +1 000.', cost: 700, upkeep: 11, level: 1, turns: 2, terrains: FLAT, credit: 1000, econBonus: 0.04, jobs: 40, skilled: true, prod: 5, modes: ['city', 'park'] },
  { id: 'banque_centrale', name: 'Banque centrale', icon: '🏛️', cat: 'finance', desc: 'Fixe le taux directeur et stabilise le système bancaire (une seule).', cost: 3000, upkeep: 70, level: 2, turns: 4, terrains: FLAT, credit: 4000, rateControl: true, unique: true, jobs: 120, skilled: true, prod: 6 },

  { id: 'depot', name: 'Dépôt de bus / tram', icon: '🚌', cat: 'transport', desc: 'Transports en commun : 6 000 déplacements.', cost: 300, upkeep: 22, level: 0, turns: 1, terrains: FLAT, transit: 6000 },
  { id: 'gare', name: 'Gare', icon: '🚉', cat: 'transport', desc: 'À relier à une autre gare par des rails pour former une ligne.', cost: 500, upkeep: 17, level: 0, turns: 2, terrains: FLAT, station: true, transit: 800 },
  { id: 'aeroport', name: 'Aéroport régional', icon: '✈️', cat: 'transport', desc: '+6 % de production, mais polluant.', cost: 4000, upkeep: 63, level: 2, turns: 4, terrains: ['plain'], econBonus: 0.06, pollution: 3, jobs: 120, prod: 5 },

  // ---------------------------------------------------------------- Mode Parc d'attraction
  { id: 'entree_parc', name: 'Entrée du parc', icon: '🎪', cat: 'admin', desc: 'Cœur du parc. Point de départ du réseau d’allées.', cost: 0, upkeep: 0, level: 0, turns: 0, terrains: LAND, unique: true, modes: ['park'] },

  { id: 'maneges_enfants', name: 'Manège enfants', icon: '🎠', cat: 'attraction', desc: 'Attraction familiale : 6 000 visiteurs/trim.', cost: 150, upkeep: 6, level: 0, turns: 1, terrains: FLAT, rideCapacity: 6000, thrill: 0.1, jobs: 5, modes: ['park'] },
  { id: 'autos_tamponneuses', name: 'Autos tamponneuses', icon: '🚗', cat: 'attraction', desc: 'Attraction familiale : 7 500 visiteurs/trim.', cost: 260, upkeep: 10, level: 0, turns: 1, terrains: FLAT, rideCapacity: 7500, thrill: 0.3, jobs: 6, modes: ['park'] },
  { id: 'grande_roue', name: 'Grande roue', icon: '🎡', cat: 'attraction', desc: 'Attraction emblématique : 9 000 visiteurs/trim.', cost: 380, upkeep: 12, level: 0, turns: 2, terrains: FLAT, rideCapacity: 9000, thrill: 0.35, jobs: 8, modes: ['park'] },
  { id: 'maison_hantee', name: 'Maison hantée', icon: '👻', cat: 'attraction', desc: 'Sensations fortes : 5 000 visiteurs/trim.', cost: 420, upkeep: 16, level: 0, turns: 2, terrains: FLAT, rideCapacity: 5000, thrill: 0.55, jobs: 10, modes: ['park'] },
  { id: 'chute_eau', name: 'Chute d’eau', icon: '🌊', cat: 'attraction', desc: 'Sensations fortes : 9 000 visiteurs/trim.', cost: 650, upkeep: 22, level: 0, turns: 3, terrains: FLAT, rideCapacity: 9000, thrill: 0.7, jobs: 12, modes: ['park'] },
  { id: 'montagnes_russes', name: 'Montagnes russes', icon: '🎢', cat: 'attraction', desc: 'Attraction phare : 12 000 visiteurs/trim.', cost: 900, upkeep: 30, level: 0, turns: 3, terrains: FLAT, rideCapacity: 12000, thrill: 0.9, jobs: 14, modes: ['park'] },

  { id: 'stand_glaces', name: 'Stand de glaces', icon: '🍦', cat: 'economie', desc: 'Petite restauration : 10 emplois.', cost: 90, upkeep: 4, level: 0, turns: 1, terrains: FLAT, jobs: 10, prod: 3, modes: ['park'] },
  { id: 'creperie', name: 'Crêperie', icon: '🥞', cat: 'economie', desc: 'Petite restauration : 12 emplois.', cost: 120, upkeep: 5, level: 0, turns: 1, terrains: FLAT, jobs: 12, prod: 3.2, modes: ['park'] },
  { id: 'boutique_souvenirs', name: 'Boutique souvenirs', icon: '🛍️', cat: 'economie', desc: 'Commerce : 15 emplois.', cost: 160, upkeep: 6, level: 0, turns: 1, terrains: FLAT, jobs: 15, prod: 3.6, modes: ['park'] },
  { id: 'restaurant_parc', name: 'Restaurant', icon: '🍔', cat: 'economie', desc: 'Restauration : 25 emplois.', cost: 220, upkeep: 9, level: 0, turns: 1, terrains: FLAT, jobs: 25, prod: 4.4, modes: ['park'] },

  { id: 'spectacle', name: 'Chapiteau de spectacle', icon: '🎪', cat: 'culture', desc: 'Animations : 150 points.', cost: 300, upkeep: 15, level: 0, turns: 2, terrains: FLAT, culture: 150, modes: ['park'] },
  { id: 'toilettes', name: 'Toilettes publiques', icon: '🚻', cat: 'sante', desc: 'Hygiène pour 18 000 visiteurs.', cost: 60, upkeep: 4, level: 0, turns: 1, terrains: FLAT, health: 18000, modes: ['park'] },
  { id: 'premiers_secours', name: 'Poste de premiers secours', icon: '⛑️', cat: 'sante', desc: 'Secours pour 30 000 visiteurs.', cost: 180, upkeep: 11, level: 0, turns: 1, terrains: FLAT, health: 30000, modes: ['park'] },
  { id: 'securite_parc', name: 'Poste de sécurité', icon: '🚨', cat: 'securite', desc: 'Sécurité pour 37 000 visiteurs.', cost: 160, upkeep: 10, level: 0, turns: 1, terrains: FLAT, safety: 37000, modes: ['park'] },
  { id: 'jardin_parc', name: 'Jardin paysager', icon: '🌳', cat: 'environnement', desc: 'Espace vert : absorbe la pollution, +4 culture.', cost: 70, upkeep: 3, level: 0, turns: 1, terrains: LAND, green: 1.5, culture: 4, modes: ['park'] },
  { id: 'parking_parc', name: 'Parking visiteurs', icon: '🅿️', cat: 'transport', desc: 'Accès pour 60 000 visiteurs.', cost: 200, upkeep: 7, level: 0, turns: 1, terrains: FLAT, transit: 60000, modes: ['park'] },
];

export const B: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

export type CustomEffect = 'capacity' | 'econ' | 'health' | 'safety' | 'culture' | 'green' | 'energy' | 'transit';

export const CUSTOM_EFFECT_CAT: Record<CustomEffect, { city: Cat; park: Cat }> = {
  capacity: { city: 'logement', park: 'attraction' },
  econ: { city: 'economie', park: 'economie' },
  health: { city: 'sante', park: 'sante' },
  safety: { city: 'securite', park: 'securite' },
  culture: { city: 'culture', park: 'culture' },
  green: { city: 'environnement', park: 'environnement' },
  energy: { city: 'energie', park: 'energie' },
  transit: { city: 'transport', park: 'transport' },
};

export const CUSTOM_EFFECT_LABEL: Record<CustomEffect, { city: string; park: string; unitCity: string; unitPark: string }> = {
  capacity: { city: 'Logement', park: 'Attraction', unitCity: 'habitants', unitPark: 'visiteurs' },
  econ: { city: 'Emplois & production', park: 'Restauration / boutique', unitCity: 'emplois', unitPark: 'emplois' },
  health: { city: 'Santé', park: 'Hygiène & secours', unitCity: 'personnes desservies', unitPark: 'visiteurs desservis' },
  safety: { city: 'Sécurité', park: 'Sécurité', unitCity: 'personnes desservies', unitPark: 'visiteurs desservis' },
  culture: { city: 'Culture', park: 'Spectacle', unitCity: 'points', unitPark: 'points' },
  green: { city: 'Environnement', park: 'Environnement', unitCity: 'points', unitPark: 'points' },
  energy: { city: 'Énergie', park: 'Énergie', unitCity: 'unités', unitPark: 'unités' },
  transit: { city: 'Transport', park: 'Accès & stationnement', unitCity: 'unités', unitPark: 'unités' },
};

/** Ajoute (ou met à jour) un bâtiment personnalisé dans le catalogue partagé B / BUILDINGS. */
export function registerCustomBuilding(def: BuildingDef) {
  B[def.id] = def;
  const i = BUILDINGS.findIndex((b) => b.id === def.id);
  if (i >= 0) BUILDINGS[i] = def;
  else BUILDINGS.push(def);
}

export const CUSTOM_TERRAINS = FLAT;

export const INFRA = {
  road: { name: 'Route', icon: '🛣️', cost: 12, level: 0 as Level },
  highway: { name: 'Autoroute', icon: '🚗', cost: 70, level: 1 as Level },
  rail: { name: 'Voie ferrée', icon: '🚆', cost: 80, level: 0 as Level },
};

export type FxKey = 'edu' | 'health' | 'safety' | 'culture' | 'env' | 'housing' | 'mobility' | 'employment' | 'satisfaction';

export interface PolicyDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  level: Level;
  upkeep: number;
  fx: Partial<Record<FxKey, number>> & { energyDemand?: number; output?: number; pollution?: number; nature?: number; bankStab?: number; skilled?: number; tollsPerTile?: number; housingCap?: number };
  likes: string[];
  dislikes: string[];
}

export const POLICIES: PolicyDef[] = [
  { id: 'cantine', name: 'Cantine gratuite', icon: '🍽️', desc: 'Repas gratuits dans les écoles : +6 éducation.', level: 0, upkeep: 60, fx: { edu: 6, satisfaction: 2 }, likes: ['social'], dislikes: ['liberal'] },
  { id: 'transports_gratuits', name: 'Transports gratuits', icon: '🆓', desc: '+10 mobilité, +3 environnement.', level: 0, upkeep: 80, fx: { mobility: 10, env: 3, satisfaction: 2 }, likes: ['verts', 'social'], dislikes: ['liberal'] },
  { id: 'police_proximite', name: 'Police de proximité', icon: '👮', desc: '+8 sécurité.', level: 0, upkeep: 50, fx: { safety: 8 }, likes: ['patrimoine'], dislikes: [] },
  { id: 'budget_participatif', name: 'Budget participatif', icon: '🗳️', desc: 'Les citoyens proposent et votent des projets de quartier.', level: 0, upkeep: 30, fx: { satisfaction: 3 }, likes: ['verts', 'social'], dislikes: [] },
  { id: 'plan_climat', name: 'Plan climat', icon: '🌍', desc: '+10 environnement, −20 % de pollution.', level: 0, upkeep: 70, fx: { env: 10, pollution: -0.2 }, likes: ['verts'], dislikes: ['liberal'] },
  { id: 'protection_nature', name: 'Protection des espaces naturels', icon: '🦌', desc: 'Les zones naturelles absorbent 2× plus de pollution.', level: 0, upkeep: 20, fx: { nature: 1 }, likes: ['verts', 'patrimoine'], dislikes: ['liberal'] },
  { id: 'allegement_entreprises', name: 'Allègement pour les entreprises', icon: '📉', desc: '+6 % de production.', level: 0, upkeep: 0, fx: { output: 0.06 }, likes: ['liberal'], dislikes: ['social'] },
  { id: 'logement_social', name: 'Logement social', icon: '🏠', desc: '+10 logement, +10 % de capacité d’accueil.', level: 0, upkeep: 90, fx: { housing: 10, housingCap: 0.1 }, likes: ['social'], dislikes: ['liberal'] },
  { id: 'commerces_locaux', name: 'Soutien aux commerces locaux', icon: '🧺', desc: '+3 % de production, +3 satisfaction.', level: 0, upkeep: 40, fx: { output: 0.03, satisfaction: 3 }, likes: ['patrimoine'], dislikes: [] },
  { id: 'culture_pour_tous', name: 'Culture pour tous', icon: '🎟️', desc: '+8 culture.', level: 0, upkeep: 40, fx: { culture: 8 }, likes: ['social', 'patrimoine'], dislikes: [] },
  { id: 'sante_proximite', name: 'Santé de proximité', icon: '💊', desc: '+8 santé.', level: 1, upkeep: 90, fx: { health: 8 }, likes: ['social', 'patrimoine'], dislikes: [] },
  { id: 'numerique_education', name: 'Numérique éducatif', icon: '💻', desc: '+8 éducation, +5 % de travailleurs qualifiés.', level: 1, upkeep: 100, fx: { edu: 8, skilled: 0.05 }, likes: ['liberal'], dislikes: [] },
  { id: 'renovation_thermique', name: 'Rénovation thermique', icon: '🧱', desc: '−15 % de demande d’énergie, +4 environnement.', level: 1, upkeep: 110, fx: { energyDemand: -0.15, env: 4 }, likes: ['verts', 'social'], dislikes: [] },
  { id: 'autoroutes_peage', name: 'Autoroutes à péage', icon: '🛂', desc: 'Autorise la perception d’un péage par tuile d’autoroute (taux réglable dans l’onglet Budget), −3 satisfaction.', level: 1, upkeep: 10, fx: { tollsPerTile: 1, satisfaction: -3 }, likes: ['liberal'], dislikes: ['verts'] },
  { id: 'revenu_transition', name: 'Revenu de transition', icon: '🤲', desc: '+6 satisfaction, +10 emploi (pondéré).', level: 2, upkeep: 300, fx: { satisfaction: 6, employment: 10 }, likes: ['social', 'verts'], dislikes: ['liberal'] },
  { id: 'supervision_bancaire', name: 'Supervision bancaire renforcée', icon: '🔍', desc: '+25 stabilité du système bancaire.', level: 2, upkeep: 40, fx: { bankStab: 25 }, likes: ['social', 'verts'], dislikes: ['liberal'] },
];

export const P: Record<string, PolicyDef> = Object.fromEntries(POLICIES.map((p) => [p.id, p]));

export const PARTIES: Party[] = [
  { id: 'verts', name: 'Les Verdoyants', color: '#3f9b4a', ideo: [0.95, 0.55, 0.15, 0.2, 0.45] },
  { id: 'social', name: 'Union Sociale', color: '#d9534f', ideo: [0.5, 0.95, 0.1, 0.35, 0.3] },
  { id: 'liberal', name: 'Alliance Libérale', color: '#e9a820', ideo: [0.15, 0.15, 0.95, 0.5, 0.2] },
  { id: 'patrimoine', name: 'Patrimoine & Territoires', color: '#7b68c9', ideo: [0.3, 0.2, 0.4, 0.85, 0.9] },
];

export const PLATFORMS: { id: string; name: string; desc: string; ideo: number[] }[] = [
  { id: 'equilibre', name: 'Équilibre', desc: 'Pragmatique, un peu de tout.', ideo: [0.55, 0.55, 0.5, 0.5, 0.5] },
  { id: 'ecologie', name: 'Écologie', desc: 'Transition et sobriété.', ideo: [0.95, 0.5, 0.2, 0.3, 0.4] },
  { id: 'solidarite', name: 'Solidarité', desc: 'Services publics et justice sociale.', ideo: [0.5, 0.95, 0.15, 0.4, 0.4] },
  { id: 'entreprise', name: 'Entreprise', desc: 'Emploi, innovation, fiscalité légère.', ideo: [0.2, 0.25, 0.95, 0.5, 0.3] },
  { id: 'territoires', name: 'Territoires', desc: 'Sécurité, identité locale.', ideo: [0.3, 0.3, 0.4, 0.85, 0.9] },
];

export const ISSUES = ['Écologie', 'Social', 'Économie', 'Ordre', 'Vie locale'];

export const DISTRICT_NAMES = ['Centre', 'Nord', 'Nord-Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Nord-Ouest'];

export const LEVEL_NAME = ['Commune', 'Région', 'Pays'];
export const LEVEL_EXEC = ['Maire', 'Président·e de région', 'Chef·fe du gouvernement'];
export const LEVEL_ASSEMBLY = ['Conseil municipal', 'Conseil régional', 'Parlement'];
export const LEVEL_SEATS = [33, 69, 151];
export const LEVEL_RADIUS = [8, 15, 999];
export const LEVEL_POP_GOAL = [4000, 30000, Infinity];
export const LEVEL_WB_GOAL = [58, 62, 100];
