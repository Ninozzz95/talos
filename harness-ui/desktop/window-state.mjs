/** R-01 — Geometria e scelta del vassoio, salvate nel profilo desktop. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const STATO_FINESTRA_DEFAULT = Object.freeze({ width: 1440, height: 900, x: undefined, y: undefined, massimizzata: false, restaNelVassoio: false });
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
  return { width, height, x, y, massimizzata, restaNelVassoio: salvato.restaNelVassoio === true };
}

export function salvaStatoFinestra(file, { x, y, width, height, massimizzata = false, restaNelVassoio = false } = {}) {
  if (!file) return;
  const dati = { x, y, width, height, massimizzata: massimizzata === true, restaNelVassoio: restaNelVassoio === true, salvatoIl: new Date().toISOString() };
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(dati, null, 2)}\n`);
  renameSync(tmp, file);
}
