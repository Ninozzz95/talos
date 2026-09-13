import assert from 'node:assert/strict';
import test from 'node:test';
import { testoIstruzioniDiProgetto } from '../src/istruzioni-di-progetto.mjs';
import { testoMappaCartelle } from '../src/mappa-cartelle.mjs';

test('BC48-ISTANTI: orologio e durata non entrano nella resa dei due blocchi stabili', t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 12, 17) });
  const file = [{ etichetta: 'AGENTS.md', contenuto: '# Regole\nRispondi in italiano.\n', byte: 33 }];
  const mappa = { cartelle: [{ percorso: 'src', livello: 1, file: 1 }], profonditaRaggiunta: 1, fileTotali: 1 };
  const prima = [testoIstruzioniDiProgetto(file).testo, testoMappaCartelle({ ...mappa, msImpiegati: 3 }, { radice: 'prova' })];
  t.mock.timers.tick(60_000);
  const dopo = [testoIstruzioniDiProgetto(file).testo, testoMappaCartelle({ ...mappa, msImpiegati: 987 }, { radice: 'prova' })];
  assert.deepEqual(dopo.map(x => Buffer.from(x)), prima.map(x => Buffer.from(x)));
  for (const testo of dopo) assert.doesNotMatch(testo, /2026-09-12|17:0[01]|987|oggi/i);
});
