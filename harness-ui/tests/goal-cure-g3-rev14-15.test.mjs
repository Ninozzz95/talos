/*
 * ⭐ Le cure della quarta riverifica della G3 (bugfixer, 14/10/2026 notte; prove rosse in `goal-revisione-g3-cure-4.test.mjs`):
 *   · REV-14: `,` e `=` separano la parola del comando in cmd (`start,/b`, `call,start`), e non devono rompere i comandi legittimi;
 *   · REV-15: una conversazione in una sottocartella (o nella cartella madre) ferma le prove; una cartella SORELLA col nome che
 *     comincia uguale (`progetto` e `progetto-2`) no.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { esitoAttribuibile } from '../src/obiettivo/contratto.mjs';
import { conStore, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function aspetta(condizione, cosa) {
  const fino = Date.now() + 20000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`never happened: ${cosa}`);
}

test('G3-CURA-14 — virgola e uguale chiudono la parola del comando; i comandi legittimi con `=` e `,` passano', () => {
  for (const [comando, operatore] of [['start,/b x', 'start'], ['start=/b x', 'start'], ['start, /b x', 'start'], ['call,start /b x', 'call'], ['npm -v&&start,/b x', 'start']]) {
    assert.deepEqual(esitoAttribuibile(comando), { ok: false, operatore }, comando);
  }
  // AL CONTRARIO
  for (const comando of ['npm test -- --reporter=dot', 'node --test --test-concurrency=4 tests', 'pytest -k "a,b"', 'FOO=1 npm test', 'node a.js,b.js']) {
    assert.deepEqual(esitoAttribuibile(comando), { ok: true }, comando);
  }
});

test('G3-CURA-15 — sottocartella e cartella madre fermano le prove; una cartella sorella col nome che comincia uguale no', async (t) => conStore(t, async (cartellaStore) => {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g3-cura4-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  const pacchetto = join(progetto, 'packages', 'api');
  const sorella = join(radice, 'progetto-2');
  for (const c of [pacchetto, sorella]) mkdirSync(c, { recursive: true });
  const appesi = [];
  const fermate = [];
  const cartelle = [progetto, pacchetto, sorella, radice];
  let n = 0;
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella: cartelle[n++], comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: (riga, dove, o) => new Promise((r) => {
      appesi.push(r);
      o.segnaleStop?.addEventListener('abort', () => { fermate.push(o.segnaleStop.reason); r({ codice: 130, fermatoSuRichiesta: true }); });
    }),
  });
  const fine = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'r1' }];
  const ids = [];
  for (let i = 0; i < cartelle.length; i += 1) { ids.push(b.registro.avvia('task-vero').sessionId); b.giri.at(-1).concludi(fine); }
  await new Promise((r) => setTimeout(r, 30));
  const [madre, figliaDiCartella, sorellaId, nonna] = ids;
  await b.registro.impostaObiettivo(madre, 'goal', { criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  const prova = async (chi, siFerma) => {
    appesi.length = 0; fermate.length = 0;
    const inCorso = b.registro.verificaObiettivo(madre);
    await aspetta(() => appesi.length > 0, 'the check starts');
    const prima = b.giri.length;
    b.registro.resume(chi, 'work');
    await aspetta(() => b.giri.length > prima, 'the other turn starts');
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(fermate.length > 0, siFerma, `${chi}: stopped ${JSON.stringify(fermate)}`);
    if (!siFerma) appesi.shift()({ codice: 0 });
    const esito = await inCorso;
    assert.equal(esito.ok === true, !siFerma, JSON.stringify(esito));
    // e mentre l'altra lavora ancora, le prove non partono (o partono, per la sorella)
    if (siFerma) assert.equal((await b.registro.verificaObiettivo(madre)).reason, 'goal-check-while-working', `${chi}: refused while it works`);
    b.giri.at(-1).concludi([{ role: 'assistant', content: 'r' }]);
    await aspetta(() => b.registro.esporta(chi).conclusa === true, 'the other turn ends');
  };
  await prova(figliaDiCartella, true); // una sottocartella del progetto
  await prova(nonna, true); // la cartella che contiene il progetto
  await prova(sorellaId, false); // AL CONTRARIO: `progetto-2` non sta dentro `progetto`
}));
