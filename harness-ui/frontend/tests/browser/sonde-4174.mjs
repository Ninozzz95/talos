/*
 * L3-11 — LE SONDE SCRITTE PER IL 4174 STANNO FUORI DALLA SUITE DI SERIE (D13, decisa il 13/10/2026 sera: «etichetta +
 * configurazione, non solo --grep-invert a mano»).
 *
 * Perché: le sonde `_*-4174.spec.mjs` si saltano da sole senza `TALOS_HARNESS_UI_BASE_URL`, ma la regola di verifica dice proprio
 * di lanciare la suite con quella variabile («si verifica solo sul 4174»). In quella corsa le sonde partivano: `_sonda-streaming-4174`
 * apre una sessione e fa un giro VERO (13/10: due giri non chiesti sul 4177), e le altre scrivono foto in `artifacts/`. La difesa
 * era a mano (`--grep-invert "STREAMING-VERO|SONDA"`), e un `--grep-invert` scritto da riga di comando sostituisce quello della
 * configurazione: non poteva essere la sola.
 * ⇒ Due fili, e servono tutti e due:
 *   · CONFIGURAZIONE: `playwright.config.mjs` mette queste sonde in `testIgnore` (escluse dalla scoperta dei file: nessun
 *     `--grep` della riga di comando le riporta dentro). Rientrano SOLO con `TALOS_SONDE_4174=1`, detto apposta;
 *   · ETICHETTA: ogni prova di questi file porta `@sonda-4174` nel titolo, così nei rapporti e con `--grep @sonda-4174` si
 *     riconosce che cosa è (Playwright, «Tag tests»: un `@parola` nel titolo è un'etichetta).
 * Lancio voluto: `TALOS_SONDE_4174=1 TALOS_HARNESS_UI_BASE_URL=http://127.0.0.1:4174/ npx playwright test <file>`.
 * La prova che lo tiene vero: `tests/unit/sonde-4174-fuori-dalla-suite.test.mjs`.
 */
export const ETICHETTA_SONDA_4174 = '@sonda-4174';

/** I file delle sonde del 4174: `_<nome>-4174.spec.mjs`, in qualunque cartella (si confronta il percorso assoluto). */
export const FILE_SONDE_4174 = /[\\/]_[^\\/]*-4174\.spec\.mjs$/u;

/** Le voci da aggiungere a `testIgnore`: le sonde restano fuori, a meno che chi lancia le chieda con `TALOS_SONDE_4174=1`. */
export function ignoraSonde4174(env = process.env) {
  return env?.TALOS_SONDE_4174 === '1' ? [] : [FILE_SONDE_4174];
}
