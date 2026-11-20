export type Terrain = 'water' | 'plain' | 'forest' | 'hill' | 'mountain';
export type Infra = 'none' | 'road' | 'highway' | 'rail';
export type Zone = 'free' | 'residential' | 'economic' | 'industrial' | 'nature' | 'agri';
export type Level = 0 | 1 | 2;

export interface Tile {
  terrain: Terrain;
  infra: Infra;
  building: string | null;
  /** trimestres restants avant la fin du chantier (0 = terminé) */
  build: number;
  zone: Zone;
  district: number;
}

export interface Loan {
  id: number;
  amount0: number;
  balance: number;
  /** taux annuel en % */
  rate: number;
  term: number;
  termLeft: number;
}

export interface Party {
  id: string;
  name: string;
  color: string;
  /** [écologie, social, libéral, ordre, local] */
  ideo: number[];
}

export interface Proposal {
  id: number;
  district: number;
  building: string;
  cost: number;
  title: string;
}

/** Cagnotte citoyenne : collecte progressive des habitants d'un secteur pour financer un bâtiment. */
export interface Fundraiser {
  id: number;
  district: number;
  building: string;
  goal: number;
  raised: number;
}

export interface LogEntry {
  turn: number;
  kind: 'good' | 'bad' | 'info' | 'vote';
  text: string;
}

export interface HistPoint {
  turn: number;
  pop: number;
  wellbeing: number;
  satisfaction: number;
  treasury: number;
  debt: number;
}

export interface DistrictResult {
  name: string;
  shares: Record<string, number>;
}

export interface ElectionResult {
  turn: number;
  level: Level;
  system: 'majoritaire' | 'proportionnelle';
  title: string;
  rounds: { round: number; shares: Record<string, number> }[];
  districts: DistrictResult[];
  seats: Record<string, number>;
  totalSeats: number;
  winner: string;
  playerWon: boolean;
  coalition?: string;
  wellbeingAtVote: number;
}

export interface RefResult {
  turn: number;
  id: string;
  title: string;
  yes: number;
  passed: boolean;
  effect: string;
}

export interface Settings {
  voteSystem: 'majoritaire' | 'proportionnelle';
  mandateQ: number;
  ric: boolean;
}

export interface Macro {
  cycle: number;
  inflation: number;
  costIndex: number;
  baseRate: number;
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  W: number;
  H: number;
  tiles: Tile[];
  capital: number;
  turn: number;
  level: Level;
  treasury: number;
  loans: Loan[];
  nextId: number;
  pop: number;
  satisfaction: number;
  wellbeing: number;
  rates: { income: number; corp: number; property: number; transit: number; toll: number; entry: number };
  funding: Record<string, number>;
  policies: string[];
  policyRate: number;
  macro: Macro;
  bankStability: number;
  parties: Party[];
  playerList: { name: string; color: string; ideo: number[] };
  districtW: number[][];
  settings: Settings;
  /** Mode entraînement libre : pas d'élections ni de cohabitation. */
  sandbox: boolean;
  /** Mode Parc d'attraction : remplace la gestion de commune par la gestion d'un parc (visiteurs, attractions, billetterie). */
  park: boolean;
  nextElection: number;
  lastElection: ElectionResult | null;
  electionHistory: { turn: number; level: Level; winner: string; playerShare: number; playerWon: boolean }[];
  cohabitation: boolean;
  campaign: number;
  councilSeats: Record<string, number>;
  proposals: Proposal[];
  nextProposalTurn: number;
  fundraisers: Fundraiser[];
  lastReferendum: number;
  referendums: RefResult[];
  unlocks: Record<string, number>;
  levelReady: boolean;
  levelStreak: number;
  log: LogEntry[];
  history: HistPoint[];
}

export interface Indices {
  edu: number;
  health: number;
  safety: number;
  culture: number;
  env: number;
  housing: number;
  employment: number;
  energy: number;
  mobility: number;
}

export interface DistrictInfo {
  name: string;
  pop: number;
  share: number;
  delta: number;
  polluters: number;
  greens: number;
  services: number;
}

export interface Metrics {
  pop: number;
  housingCap: number;
  workforce: number;
  jobs: number;
  filled: number;
  unemployment: number;
  incomeBase: number;
  output: number;
  revenue: { income: number; corp: number; property: number; tickets: number; tolls: number; transfers: number; vat: number; total: number };
  upkeep: Record<string, number>;
  expenses: { upkeep: number; admin: number; policies: number; interest: number; operating: number; principal: number };
  operatingBalance: number;
  netCash: number;
  idx: Indices;
  wellbeing: number;
  energySupply: number;
  energyDemand: number;
  pollution: number;
  creditLimit: number;
  creditAvailable: number;
  debt: number;
  loanRate: number;
  banks: number;
  stations: number;
  connectedStations: number;
  lines: number;
  roadTiles: number;
  highwayTiles: number;
  railTiles: number;
  servedShare: number;
  districts: DistrictInfo[];
  counts: Record<string, number>;
  attract: number;
  taxPenalty: number;
}
