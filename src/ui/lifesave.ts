import { deserializeLife, serializeLife, type LifeState } from '../core/life';

const KEY = 'concorde-life-v1';

export function loadLifeSave(): LifeState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserializeLife(raw) : null;
  } catch {
    return null;
  }
}

export function saveLifeSave(s: LifeState) {
  try {
    localStorage.setItem(KEY, serializeLife(s));
  } catch {
    /* stockage indisponible */
  }
}

export function clearLifeSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
}
