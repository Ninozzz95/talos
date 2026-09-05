/*
 * Lo stato vuoto del mockup come dati: la cartella appena scelta e i fatti
 * letti alla sua radice (package.json con lo script di test, README, .claude).
 */
export const VUOTA = Object.freeze({
  progetto: 'AVM-harness-desktop',
  suggerimenti: [
    { icona: 'i-check-sq', titolo: 'Fai passare la suite di test', sub: 'trovata in package.json · node --test tests/*.test.mjs · 1.565 test' },
    { icona: 'i-doc', titolo: 'Spiegami src/session-registry.mjs', sub: 'il file più grande del progetto: 3.572 righe' },
    { icona: 'i-search', titolo: 'Trova le righe di ledger ancora aperte', sub: 'cerca «[ ]» in .claude/LEDGER-ROADMAP-DESKTOP' },
  ],
  ultimaSessione: { nome: 'W1-02 registro processi' },
  hint: 'Gli esempi nascono da cosa c\'è nella cartella.',
});
