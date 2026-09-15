import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * BC-12 — dove si depositano le fotografie e i rapporti di una prova.
 *
 * 13/09/2026. Quattro prove del frontend calcolavano la cartella come `resolve(frontend, '..', '.claude')`:
 * non e' il `.claude/` della radice, e' `harness-ui/.claude/` — una cartella che git NON ignora
 * (`git check-ignore` esce 1 su entrambe: misurato, non supposto). Sul disco c'erano davvero
 * quattro PNG (PH-UI-1440, PH-UI-390, PK-UI-1440, PK-UI-390).
 *
 * ⭐ Che sia una profondita' SBAGLIATA e non una scelta lo prova il codice stesso: `tests/bc43/banco.mjs`
 * scriveva lo stato del banco a due livelli, mentre il suo `tests/bc43/playwright.config.mjs`, per le
 * foto dello STESSO banco, ne risale tre. Due file gemelli, due cartelle diverse.
 *
 * ⇒ La cura e' in DUE classi, e la differenza e' se la prova gira DA SOLA:
 *
 *   1. prove AUTOMATICHE (`*.test.mjs`, che `npm run test:unit` e `npm run verify` lanciano a ogni
 *      giro): le foto vanno in `frontend/artifacts/`, che `frontend/.gitignore` ignora alla riga 4
 *      (verificato con `git check-ignore -v`, non supposto) ed e' gia' la convenzione del progetto
 *      — `artifacts/astra-mockup`, `artifacts/bc30`, `artifacts/confronto` sono tutte li'. Scrivere
 *      in `.claude/` a ogni corsa della suite lascerebbe comunque il repository sporco, perche'
 *      NEMMENO il `.claude/` della radice e' ignorato: correggere solo la profondita' avrebbe
 *      spostato il problema di una cartella.
 *
 *   2. generatori di RAPPORTO lanciati a mano (il banco BC43, la visuale BC48): il loro posto e'
 *      il `.claude/` della radice, dove stanno gia' i loro artefatti e dove punta il config gemello.
 *      Qui si corregge la profondita', e la si calcola UNA VOLTA SOLA: `cartellaRapporti()`.
 *
 * `TALOS_FOTO_DI_PROVA` resta per chi vuole raccogliere le foto altrove DELIBERATAMENTE (una
 * consegna, un rapporto): e' una scelta esplicita di chi lancia, non piu' il comportamento di serie.
 */

const FRONTEND = fileURLToPath(new URL('../../', import.meta.url));
const RADICE_REPO = fileURLToPath(new URL('../../../../', import.meta.url));

function nomeValido(nome) {
  if (!/^[A-Za-z0-9._-]+$/.test(nome)) throw new Error(`Nome di cartella non valido: ${nome}`);
  return nome;
}

/** Il percorso della cartella foto di una prova AUTOMATICA. Non tocca il disco: serve anche ai config. */
export function cartellaFoto(nome) {
  const base = process.env.TALOS_FOTO_DI_PROVA
    ? resolve(process.env.TALOS_FOTO_DI_PROVA)
    : resolve(FRONTEND, 'artifacts');
  return resolve(base, nomeValido(nome));
}

/** Come sopra, ma la cartella esiste al ritorno. */
export async function preparaCartellaFoto(nome) {
  const cartella = cartellaFoto(nome);
  await mkdir(cartella, { recursive: true });
  return cartella;
}

/**
 * Il `.claude/` della RADICE del repository, per i generatori di rapporto lanciati a mano.
 * ⛔ Il conto dei livelli sta solo qui: e' la cosa che BC-12 ha sbagliato quattro volte.
 */
export function cartellaRapporti(nome = '') {
  const base = resolve(RADICE_REPO, '.claude');
  return nome ? resolve(base, nomeValido(nome)) : base;
}
