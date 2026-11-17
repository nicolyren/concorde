import { deserialize, serialize } from '../core/state';
import type { GameState, Level } from '../core/types';

const LEGACY_KEY = 'concorde-save-v1';
const INDEX_KEY = 'concorde-games-index-v1';
const gameKey = (id: string) => `concorde-game-${id}`;

export interface GameMeta {
  id: string;
  name: string;
  color: string;
  level: Level;
  turn: number;
  pop: number;
  treasury: number;
  wellbeing: number;
  sandbox: boolean;
  updatedAt: number;
}

function readIndex(): GameMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as GameMeta[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: GameMeta[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible */
  }
}

function metaOf(id: string, s: GameState): GameMeta {
  return {
    id, name: s.playerList.name, color: s.playerList.color, level: s.level, turn: s.turn,
    pop: s.pop, treasury: Math.round(s.treasury), wellbeing: Math.round(s.wellbeing),
    sandbox: s.sandbox, updatedAt: Date.now(),
  };
}

export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Parties triées de la plus récemment jouée à la plus ancienne. */
export function listGames(): GameMeta[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveGame(id: string, s: GameState) {
  try {
    localStorage.setItem(gameKey(id), serialize(s));
    writeIndex([...readIndex().filter((g) => g.id !== id), metaOf(id, s)]);
  } catch {
    /* stockage indisponible */
  }
}

export function loadGame(id: string): GameState | null {
  try {
    const raw = localStorage.getItem(gameKey(id));
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function deleteGame(id: string) {
  try {
    localStorage.removeItem(gameKey(id));
    writeIndex(readIndex().filter((g) => g.id !== id));
  } catch {
    /* stockage indisponible */
  }
}

/** Reprend l'ancienne sauvegarde mono-partie (avant le multi-slots) comme première entrée. */
export function migrateLegacySave() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw && readIndex().length === 0) {
      const g = deserialize(raw);
      if (g) saveGame(newId(), g);
    }
    if (raw) localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* stockage indisponible */
  }
}
