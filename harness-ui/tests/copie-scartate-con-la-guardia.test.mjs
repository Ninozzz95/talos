/*
 * 13/10/2026, review avversaria di `28c973bdc` — la strada che il DESKTOP percorre davvero (guardia dei giri in tondo accesa,
 * `agent-service.mjs`: `guardiaGiriInTondo: true`) non aveva una prova: con `RISPOSTE_RIPETUTE_MASSIME_CON_GUARDIA` portato
 * da 6 a 600 le 674 prove del kernel restavano verdi. Qui la strada intera, nei suoi quattro esiti:
 *   - risultati UGUALI: decide la guardia, alla 5ª esecuzione identica (terza risposta); il no ferma, il sì azzera e si riparte;
 *   - nessuno può rispondere (automazione, sessione senza canale): il no arriva subito, alla stessa quinta esecuzione;
 *   - risultati DIVERSI a ogni copia (la guardia non li conta): ferma il tetto, alla sesta risposta.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GIRI_IN_TONDO_DOMANDA, RISPOSTE_RIPETUTE_MASSIME_CON_GUARDIA, talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const enc = new TextEncoder();
const sse = (fotogrammi) => new Response(new ReadableStream({ start(c) { for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }));
const valanga = (n) => Array.from({ length: 5 }, (_, i) => ({ choices: [{ delta: { tool_calls: [{ index: i, id: `v${n}_${i}`, function: { name: 'leggi', arguments: '{"percorso":"uno.txt"}' } }] } }] }));
const testo = (t) => [{ choices: [{ delta: { content: t } }] }];

function scena(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-copie-guardia-'));
  writeFileSync(join(cartella, 'uno.txt'), 'sempre uguale');
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}

async function giro(cartella, { risposte, approva, cambiaIlFile = false } = {}) {
  let richieste = 0;
  const domande = [];
  const eventi = [];
  const esito = await talosLavora({
    cartella, task: { consegna: 'leggi uno.txt' }, modello: 'x', chiave: 'y', onDelta: () => {}, guardiaGiriInTondo: true,
    onGiro: (e) => eventi.push(e),
    ...(approva ? { chiediApprovazioneFn: async (azione) => { domande.push({ ...azione, allaRichiesta: richieste }); return approva(domande.length); } } : {}),
    fetchDiRete: async () => {
      richieste += 1;
      if (cambiaIlFile) writeFileSync(join(cartella, 'uno.txt'), `contenuto ${richieste}`);
      return sse(richieste <= risposte ? valanga(richieste) : testo('Finito.'));
    },
  });
  return { esito, richieste, domande, scartate: eventi.filter((e) => e.tipo === 'copie-scartate').length };
}

test('COPIE-CON-GUARDIA-01 — risultati uguali: la guardia chiede alla quinta esecuzione identica (quinta risposta); il NO ferma il giro lì', async (t) => {
  const { esito, richieste, domande } = await giro(scena(t), { risposte: 99, approva: () => false });
  assert.equal(domande.length, 1);
  assert.equal(domande[0].tipo, 'giri-in-tondo');
  assert.equal(domande[0].volte, GIRI_IN_TONDO_DOMANDA);
  assert.equal(domande[0].allaRichiesta, 5, 'una esecuzione per risposta: la quinta è nella quinta'); /* R54 della CLI (15/10/2026): della valanga gira UNA copia per risposta (erano due) */
  assert.equal(richieste, 5);
  assert.equal(esito.comeFinita, 'ripetizione');
  assert.match(esito.detto, /got the same result each time/);
});

test('COPIE-CON-GUARDIA-02 — il SÌ azzera i due conti: undici risposte con copie (più del tetto) e il giro si conclude lo stesso', async (t) => {
  const { esito, richieste, domande, scartate } = await giro(scena(t), { risposte: 11, approva: () => true }); /* R54 della CLI (15/10/2026): della valanga gira UNA copia per risposta (erano due) */
  assert.equal(esito.comeFinita, 'concluso', 'senza l azzeramento il tetto fermerebbe il giro alla sesta risposta');
  assert.equal(richieste, 12);
  assert.deepEqual(domande.map((d) => d.allaRichiesta), [5, 10], 'dopo il sì il conto della guardia riparte da zero e la domanda torna (posizioni misurate, non previste)');
  assert.equal(scartate, 11, 'ogni risposta con copie lo dice a chi guarda');
});

test('COPIE-CON-GUARDIA-03 — nessuno può rispondere (automazione): il no arriva subito, alla stessa quinta esecuzione, e lo dice', async (t) => {
  const { esito, richieste } = await giro(scena(t), { risposte: 99 });
  assert.equal(richieste, 5); /* R54 della CLI (15/10/2026): della valanga gira UNA copia per risposta (erano due) */
  assert.equal(esito.comeFinita, 'ripetizione');
  assert.match(esito.detto, /no approval channel/);
});

test('COPIE-CON-GUARDIA-04 — risultati DIVERSI a ogni copia: la guardia non li conta, e ferma il tetto alla sesta risposta', async (t) => {
  const { esito, richieste, domande } = await giro(scena(t), { risposte: 99, approva: () => true, cambiaIlFile: true });
  assert.equal(domande.length, 0, 'la guardia conta solo i risultati identici');
  assert.equal(richieste, RISPOSTE_RIPETUTE_MASSIME_CON_GUARDIA);
  assert.equal(esito.comeFinita, 'ripetizione');
  assert.match(esito.detto, new RegExp(`did it again in ${RISPOSTE_RIPETUTE_MASSIME_CON_GUARDIA} answers of this turn`, 'u'));
});
