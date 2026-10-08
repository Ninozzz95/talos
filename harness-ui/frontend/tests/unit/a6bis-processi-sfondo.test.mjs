import test from 'node:test';
import assert from 'node:assert/strict';

import { contaProcessiAttivi, processiDagliEventi } from '../../src/components/inspector.js';

/*
 * ⛔ A6-bis (bugfixer, 08/10/2026) — una riga «in sfondo» si chiude col SUO evento (`talos.processo-sfondo` → `ProcessoSfondoFinito`
 *   in `eventiAttrezzi`), e uno sfondo nato prima del riavvio del server diventa «Non più seguito». Prima restavano vive per sempre
 *   e il numero sulla scheda Processi le contava.
 */
const sfondato = (id, sequenza) => [
  { type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', _sequenza: sequenza - 2, ricevutoA: 1000, giro: 1, chi: 'agente' },
  { type: 'ToolCallArgs', toolCallId: id, delta: '{"comando":"npm run dev"}', _sequenza: sequenza - 1 },
  { type: 'ToolCallResult', toolCallId: id, inSfondo: true, ricevutoA: 2000, _sequenza: sequenza },
];
const finito = (id, esito, codice, sequenza) => ({ type: 'ProcessoSfondoFinito', toolCallId: id, esito, codice, _sequenza: sequenza });
const stato = (processi, id) => processi.find((p) => p.toolCallId === id || p.id === id)?.stato;

test('A6B-UI-01: premessa — sfondato e basta, la riga è «in sfondo» e il numero la conta', () => {
  const processi = processiDagliEventi(sfondato('a', 3), { adesso: 3000 });
  assert.equal(processi[0].stato, 'in-sfondo');
  assert.equal(contaProcessiAttivi(processi), 1);
});

test('A6B-UI-02: la sua uscita la chiude — riuscito, fallito (col codice), terminato a forza; il numero torna a zero', () => {
  const eventi = [...sfondato('a', 3), ...sfondato('b', 13), ...sfondato('c', 23), finito('a', 'riuscito', 0, 30), finito('b', 'fallito', 2, 31), finito('c', 'terminato', null, 32)];
  const processi = processiDagliEventi(eventi, { adesso: 3000 });
  assert.deepEqual(['a', 'b', 'c'].map((id) => stato(processi, id)), ['riuscito', 'fallito', 'ucciso']); // la lista esce dalla più recente
  assert.equal(processi.find((p) => p.id === 'b').uscita, 2);
  assert.equal(contaProcessiAttivi(processi), 0);
});

test('A6B-UI-03: dopo un riavvio — uno sfondo di PRIMA è «Non più seguito» (non vivo), uno di DOPO resta in sfondo', () => {
  const eventi = [...sfondato('prima', 3), ...sfondato('dopo', 13)];
  const processi = processiDagliEventi(eventi, { adesso: 3000, sfondiNonSeguitiFinoA: 5 });
  assert.deepEqual(['prima', 'dopo'].map((id) => stato(processi, id)), ['perso', 'in-sfondo']);
  assert.equal(contaProcessiAttivi(processi), 1);
});

test('A6B-UI-04: AL CONTRARIO — senza il dato del ripristino niente cambia, e un esito arrivato non si riscrive', () => {
  assert.equal(processiDagliEventi(sfondato('a', 3), { adesso: 3000, sfondiNonSeguitiFinoA: null })[0].stato, 'in-sfondo');
  const giaChiuso = [...sfondato('a', 3), finito('a', 'riuscito', 0, 30), finito('a', 'fallito', 9, 31)];
  assert.equal(processiDagliEventi(giaChiuso, { adesso: 3000 })[0].stato, 'riuscito');
  // l'evento di uscita di un comando NON sfondato (finito in primo piano) non lo tocca
  const primoPiano = [
    { type: 'ToolCallStart', toolCallId: 'p', toolCallName: 'shell', _sequenza: 1, ricevutoA: 1000, giro: 1, chi: 'agente' },
    { type: 'ToolCallResult', toolCallId: 'p', uscita: 0, ricevutoA: 2000, _sequenza: 2 },
    finito('p', 'fallito', 1, 3),
  ];
  assert.equal(processiDagliEventi(primoPiano, { adesso: 3000 })[0].stato, 'riuscito');
});

/*
 * ⛔ A6-bis R2 (G1, review di talos desktop, 08/10/2026 sera) — L'USCITA PUÒ ARRIVARE PRIMA DEL RISULTATO «IN SFONDO».
 *   Il kernel aggancia l'uscita subito, e prima del `ToolCallResult` ci sono attese vere (gancio post_tool_call, cattura): un
 *   comando corto esce in quella finestra. Il giornale conserva l'ordine, quindi conta anche alla rigiocata.
 */
test('A6B-UI-05: l\'uscita prima del suo risultato «in sfondo» chiude la riga quando il risultato arriva; il numero è zero', () => {
  // sequenze del giornale: avvio 8, argomenti 9, USCITA 10, risultato «in sfondo» 11
  const [avvio, argomenti, risultato] = sfondato('presto', 11).map((e, i) => (i === 2 ? e : { ...e, _sequenza: e._sequenza - 1 }));
  const eventi = [avvio, argomenti, finito('presto', 'fallito', 3, 10), risultato];
  const processi = processiDagliEventi(eventi, { adesso: 3000 });
  assert.equal(stato(processi, 'presto'), 'fallito');
  assert.equal(processi.find((p) => p.id === 'presto').uscita, 3);
  assert.equal(contaProcessiAttivi(processi), 0);
  // e l'anticipo non si perde nemmeno se fra i due c'è un altro comando, né si applica a un risultato in primo piano
  const altro = [
    { type: 'ToolCallStart', toolCallId: 'primo-piano', toolCallName: 'shell', _sequenza: 20, ricevutoA: 1000, giro: 1, chi: 'agente' },
    { type: 'ToolCallArgs', toolCallId: 'primo-piano', delta: '{"comando":"ls"}', _sequenza: 21 },
    finito('primo-piano', 'fallito', 9, 22),
    { type: 'ToolCallResult', toolCallId: 'primo-piano', uscita: 0, ricevutoA: 2000, _sequenza: 23 },
  ];
  const conAltro = processiDagliEventi([avvio, argomenti, finito('presto', 'riuscito', 0, 10), ...altro, risultato], { adesso: 3000 });
  assert.deepEqual(['presto', 'primo-piano'].map((id) => stato(conAltro, id)), ['riuscito', 'riuscito']);
  assert.equal(conAltro.find((p) => p.id === 'primo-piano').uscita, 0, 'un esito in primo piano resta il suo, non quello tenuto da parte');
});

/*
 * ⛔ Taccuino (08/10/2026) — LA DURATA DI UNO SFONDATO È QUELLA DEL PROCESSO. Misurato sulla 4176: un comando di 8 s diceva
 *   «0,2 s · uscita 0» — 0,2 s era la chiamata fino allo sfondamento. Hermes: `exited_at - started_at`.
 */
test('A6B-UI-06: durata — nessuna mentre è in sfondo, quella vera all\'uscita (anche nell\'ordine invertito), mai con l\'orologio all\'indietro', () => {
  // avvio sul server (1_000) e arrivo alla pagina (1_400) DIVERSI: dopo un ricaricamento `ricevutoA` è l'ora della rigiocata, e la
  // durata deve partire dall'avvio vero (review D4 di talos desktop)
  const avvio = (id, sequenza) => ({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', _sequenza: sequenza, avviatoA: 1_000, ricevutoA: 1_400, giro: 1, chi: 'agente' });
  const argomenti = (id, sequenza) => ({ type: 'ToolCallArgs', toolCallId: id, delta: '{"comando":"npm run build"}', _sequenza: sequenza });
  const risultato = (id, sequenza) => ({ type: 'ToolCallResult', toolCallId: id, inSfondo: true, durataMs: 200, ricevutoA: 1_200, _sequenza: sequenza });
  const uscita = (id, sequenza, finitoAlle) => ({ type: 'ProcessoSfondoFinito', toolCallId: id, esito: 'riuscito', codice: 0, finitoAlle, _sequenza: sequenza });
  const inSfondo = processiDagliEventi([avvio('a', 1), argomenti('a', 2), risultato('a', 3)], { adesso: 3000 });
  assert.equal(inSfondo[0].durataMs, null, 'in sfondo: la durata della chiamata (0,2 s) non è quella del processo');
  const finito = processiDagliEventi([avvio('a', 1), argomenti('a', 2), risultato('a', 3), uscita('a', 4, 9_000)], { adesso: 10_000 });
  assert.equal(finito[0].durataMs, 8_000);
  const invertito = processiDagliEventi([avvio('b', 1), argomenti('b', 2), uscita('b', 3, 6_000), risultato('b', 4)], { adesso: 10_000 });
  assert.deepEqual([invertito[0].stato, invertito[0].durataMs], ['riuscito', 5_000]);
  const indietro = processiDagliEventi([avvio('c', 1), argomenti('c', 2), risultato('c', 3), uscita('c', 4, 500)], { adesso: 10_000 });
  assert.equal(indietro[0].durataMs, null, 'fine prima dell\'avvio: nessuna durata, mai un numero negativo');
  const senzaOra = processiDagliEventi([avvio('d', 1), argomenti('d', 2), risultato('d', 3), uscita('d', 4, NaN)], { adesso: 10_000 });
  assert.equal(senzaOra[0].durataMs, null, 'un evento vecchio senza l\'ora di fine: nessuna durata inventata');
});
