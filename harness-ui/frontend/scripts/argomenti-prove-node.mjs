/*
 * 15/10/2026 (bugfixer, seconda passata della revisione) — UNA PROVA DI UNITÀ APPESA TENEVA FERMA LA SUITE PER SEMPRE.
 *   Misurato: `tests/unit/provider-modale-salva-browser.test.mjs` è rimasta appesa più di 20 minuti (fermata a mano), e la suite
 *   aspettava lei. La causa NON era la `dist` mancante, come avevo scritto: senza la `dist` la stessa prova passa 19 su 19 in 15 s, e
 *   sei corse in parallelo passano tutte. Quattordici prove di unità aprono un browser (otto il Chrome installato, `channel: 'chrome'`),
 *   e nessuna ha un tetto: un `launch`, un `close` o un'attesa che non torna più tiene appeso il file, e il file tiene appesa la suite.
 *   Il runner non passava né `--test-timeout` né `--test-force-exit`.
 * ⇒ Di serie: ogni prova (e ogni gancio) ha un tetto di 3 minuti — la più lunga misurata oggi ne prende 19 s — e a fine file il
 *   processo esce anche se un browser o un handle restano aperti. Così una prova appesa diventa una ROSSA con il suo nome e
 *   «test timed out after 180000ms», invece di una suite che non finisce. Chi passa i suoi valori li tiene.
 * Fonte: nodejs.org/api/cli.html, `--test-timeout` e `--test-force-exit` (Node 24); misurati qui sotto in `runner-prove-node.test.mjs`
 *   (un gancio `before` appeso: senza il tetto non finisce; un `after` appeso con un handle vivo: serve anche `--test-force-exit`).
 */
export const TETTO_DI_SERIE_MS = 180_000;

/** Gli argomenti di `node --test` per la suite del frontend: quelli di chi chiama, più i due di serie se non li ha già dati. */
export function argomentiDelRunner(argomenti = [], { tettoMs = TETTO_DI_SERIE_MS } = {}) {
  const dato = (nome) => argomenti.some((a) => a === nome || a.startsWith(`${nome}=`));
  return [
    ...(dato('--test-timeout') ? [] : [`--test-timeout=${tettoMs}`]),
    ...(dato('--test-force-exit') ? [] : ['--test-force-exit']),
    ...argomenti,
  ];
}
