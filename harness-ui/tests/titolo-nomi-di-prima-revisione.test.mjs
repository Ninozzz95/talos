/*
 * 15/10/2026 sera (bugfixer) — revisione avversaria di 08e48c462: i nomi di prima mostrati con la regola nuova (`nomeMostrato`).
 * Le ROSSE sono difetti; le VERDI dicono ciò che regge.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { nomeMostrato, titoloBreve } from '../src/titolo-breve.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

// le funzioni di PRIMA, copiate dal codice di allora (2161afb32): custom-task.mjs:173 e session-registry.mjs:281-285
const consegnaCortaDiPrima = (c) => (c.length > 80 ? `${c.slice(0, 77)}...` : c);
const derivatoDiPrima = (cc) => cc.replace(/\s+/g, ' ').trim().slice(0, 80);
const clientDiPrima = (c) => String(c || '').replace(/\s+/g, ' ').trim().slice(0, 80).trim(); // app.js:26632 + trim di rinomina

/** Un primo messaggio come lo scrive la persona: due righe, con una riga vuota in mezzo. */
const SU_PIU_RIGHE = 'Ciao,\n\nleggi i due documenti nella cartella e dimmi se la mia idea è concettualmente valida e se ha senso proseguire';
const SPAZI_DOPPI = 'Ciao,  leggi i due documenti nella cartella e dimmi se la mia idea è concettualmente valida e se ha senso proseguire';

async function nomeAllaRilettura(t, task, recordNome = null) {
  const cartellaStore = cartellaDiProva('talos-nomi-di-prima-rev-');
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const sessionId = '00000000-0000-4000-8000-0000000000bb';
  const righe = [
    { tipo: 'intestazione', schema: 1, sessionId, taskId: 'libero:prova', cartella: cartellaStore, task,
      comandoProva: null, forkDa: null, avviataAlle: '2026-10-10T09:00:00.000Z', modello: 'z-ai/glm-5.3-flash', permessi: 'Full access', padreId: null, profonditaDelega: 0, provider: 'cloud', cartellaGiaScelta: true },
    { type: 'RunStarted', _sequenza: 1, threadId: sessionId, runId: 'r1' },
    { type: 'RunFinished', _sequenza: 2, threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } },
    ...(recordNome ? [{ tipo: 'nome-sessione', nome: recordNome }] : []),
  ];
  const file = join(cartellaStore, `${sessionId}.jsonl`);
  writeFileSync(file, righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
  const prima = readFileSync(file, 'utf8');
  const registro = createSessionRegistry({ cartellaStore, guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', avviaSessioneFn: async () => ({ ok: true }) });
  await registro.ripristina({ soloSessioni: [sessionId] });
  const nome = registro.elenca().find((s) => s.sessionId === sessionId)?.nome;
  await attendiScritture({ cartellaStore });
  assert.equal(readFileSync(file, 'utf8'), prima, 'il disco resta com\'era');
  await registro.chiudi({ attesaMassimaMs: 1_000 });
  return nome;
}

test('REV3-TITOLO-01 — [ROSSO, S4] una sessione di prima MAI rinominata, il cui primo messaggio ha una riga vuota o spazi doppi: alla rilettura resta «…è concettu...»', async (t) => {
  for (const consegna of [SU_PIU_RIGHE, SPAZI_DOPPI]) {
    const cc = consegnaCortaDiPrima(consegna);
    const nome = await nomeAllaRilettura(t, { consegna, consegnaCorta: cc });
    assert.equal(nome, titoloBreve(consegna), `resta il nome di prima «${derivatoDiPrima(cc)}». La forma di prima del nome DERIVATO è il taglio a 77 del testo GREZZO, poi gli spazi raccolti: formeDiPrima (titolo-breve.mjs) ha il grezzo non raccolto e il raccolto prima del taglio, non questa; e la consegnaCorta stessa, in coda ai testi, «riconosce» il nome e lo lascia com'è`);
  }
});

test('REV3-TITOLO-02 — [VERDE] le stesse sessioni rinominate dal client di prima (80 secchi sul testo raccolto) e un primo messaggio su una riga sola tornano alla regola nuova', async (t) => {
  for (const consegna of [SU_PIU_RIGHE, SPAZI_DOPPI]) {
    assert.equal(await nomeAllaRilettura(t, { consegna, consegnaCorta: consegnaCortaDiPrima(consegna) }, clientDiPrima(consegna)), titoloBreve(consegna));
  }
  const unaRiga = SU_PIU_RIGHE.replace(/\s+/g, ' ');
  assert.equal(await nomeAllaRilettura(t, { consegna: unaRiga, consegnaCorta: consegnaCortaDiPrima(unaRiga) }), titoloBreve(unaRiga));
});

test('REV3-TITOLO-03 — [VERDE] le emoji: la forma di prima si riconosce in unità UTF-16, come la tagliava il codice di allora, anche con mezza emoji in fondo', () => {
  const consegna = `${'parola '.repeat(11)}${'🚀'.repeat(20)}`; // 77 unità di testo, poi razzi: slice(0, 80) taglia a metà del secondo razzo
  const vecchio = clientDiPrima(consegna);
  assert.match(vecchio, /[\uD800-\uDBFF]$/u, 'premessa: il nome di prima finisce con mezza emoji');
  assert.equal(nomeMostrato(vecchio, [consegna]), titoloBreve(consegna));
});

test('REV3-TITOLO-04 — [VERDE, rischio dichiarato] un nome scelto dalla persona che coincide per caso coi primi 80 caratteri del suo messaggio si mostra riscritto (solo a schermo)', () => {
  const consegna = SU_PIU_RIGHE.replace(/\s+/g, ' ');
  const sceltoDallaPersona = consegna.slice(0, 80); // l'ha incollato lei
  assert.notEqual(nomeMostrato(sceltoDallaPersona, [consegna]), sceltoDallaPersona, 'non si distingue da un taglio di prima: è il prezzo della decisione «solo a schermo»');
});
