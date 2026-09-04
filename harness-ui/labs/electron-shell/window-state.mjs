/**
 * ⭐ 04/9 — W2-13: posizione e dimensione della finestra, salvate da noi.
 * `windowStatePersistence` NON esiste in Electron 44 (documentazione
 * ufficiale, letta il 04/09): la guida del 03/09 lo dava per buono.
 *
 * Puro: legge/scrive un JSON e valida i limiti contro gli schermi che gli
 * vengono passati — una finestra salvata su un monitor staccato non deve
 * riaprirsi fuori dallo schermo. Lo store è quello del lab
 * (`labs/stores/electron-shell/window-state.json`), mai uno store stabile.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const STATO_FINESTRA_DEFAULT = Object.freeze({ width: 1440, height: 900, x: undefined, y: undefined, massimizzata: false });
const MIN_W = 900;
const MIN_H = 600;

function interseca(bounds, schermo) {
  const dx = Math.min(bounds.x + bounds.width, schermo.x + schermo.width) - Math.max(bounds.x, schermo.x);
  const dy = Math.min(bounds.y + bounds.height, schermo.y + schermo.height) - Math.max(bounds.y, schermo.y);
  return dx > 100 && dy > 100; // almeno un pezzo afferrabile della finestra è visibile
}

/** @param {Array<{x:number,y:number,width:number,height:number}>} schermi aree di lavoro correnti */
export function leggiStatoFinestra(file, schermi = []) {
  let salvato = null;
  try { if (file && existsSync(file)) salvato = JSON.parse(readFileSync(file, 'utf8')); } catch { salvato = null; }
  if (!salvato || typeof salvato !== 'object') return { ...STATO_FINESTRA_DEFAULT };
  const width = Number.isInteger(salvato.width) && salvato.width >= MIN_W ? salvato.width : STATO_FINESTRA_DEFAULT.width;
  const height = Number.isInteger(salvato.height) && salvato.height >= MIN_H ? salvato.height : STATO_FINESTRA_DEFAULT.height;
  const massimizzata = salvato.massimizzata === true;
  let x; let y;
  if (Number.isInteger(salvato.x) && Number.isInteger(salvato.y)) {
    const bounds = { x: salvato.x, y: salvato.y, width, height };
    if (schermi.length === 0 || schermi.some((s) => interseca(bounds, s))) { x = salvato.x; y = salvato.y; }
  }
  return { width, height, x, y, massimizzata };
}

export function salvaStatoFinestra(file, { x, y, width, height, massimizzata = false } = {}) {
  if (!file) return;
  const dati = { x, y, width, height, massimizzata: massimizzata === true, salvatoIl: new Date().toISOString() };
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(dati, null, 2)}\n`);
  renameSync(tmp, file);
}
