/*
 * ⛔⛔ A6 (07/10/2026) — IL BADGE DEI PROCESSI CONTA SOLO CIÒ CHE È VIVO.
 *
 * Il difetto (B0, `bugfixer/B0-VERIFICA-2026-10-07.md`): `processiDagliEventi` chiudeva una riga SOLO col suo
 * `ToolCallResult`, quindi un comando in primo piano di un giro fermato, fallito o morto col server restava «in corso»
 * per sempre e il badge lo contava; il badge contava anche i comandi che aspettano il consenso (non partiti) e le
 * voci con lo stesso id due volte, che la lista invece mostra una volta sola.
 *
 * ⛔ I fatti che chiudono una riga in primo piano: un giro SUCCESSIVO è cominciato, oppure il SUO giro non è più vivo.
 *   Una riga «in sfondo» non si chiude a fine giro: vive oltre (BUG-3/14) finché arriva la sua chiusura (C06).
 * Forma: Hermes `tools/process_registry.py:538` (`completion_reason … lost`) e `:1017` («without inventing an exit»):
 *   la riga diventa «Interrotto», senza codice d'uscita né durata inventati.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { contaProcessiAttivi, processiDagliEventi } from '../../src/components/inspector.js';

const avvio = (id, giro = 1) => ({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', ricevutoA: 1_000, giro });
const argomenti = (id, comando = 'npm test') => ({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando }) });
const esito = (id) => ({ type: 'ToolCallResult', toolCallId: id, uscita: 0, ricevutoA: 2_000 });
const adesso = 3_000; // sotto la soglia del silenzio: «in corso» non diventa «in attesa» per il solo tempo

test('A6-01: il giro del comando non è più vivo — la riga in primo piano diventa «interrotto» e il badge scende a 0', () => {
  const lista = processiDagliEventi([avvio('a'), argomenti('a')], { adesso, giroCorrente: 1, giroVivo: false });
  assert.equal(lista[0].stato, 'interrotto');
  assert.equal(lista[0].uscita, null, 'nessun codice d\'uscita inventato');
  assert.equal(lista[0].durataMs, null, 'nessuna durata inventata');
  assert.equal(contaProcessiAttivi(lista), 0);
});

test('A6-02: è cominciato un giro successivo — la riga del giro prima è «interrotto»', () => {
  const lista = processiDagliEventi([avvio('a', 1), argomenti('a')], { adesso, giroCorrente: 2, giroVivo: true });
  assert.equal(lista[0].stato, 'interrotto');
  assert.equal(contaProcessiAttivi(lista), 0);
});

test('A6-03: contropelo — giro vivo, stesso giro: la riga resta «in corso» e conta', () => {
  const lista = processiDagliEventi([avvio('a', 2), argomenti('a')], { adesso, giroCorrente: 2, giroVivo: true });
  assert.equal(lista[0].stato, 'in-corso');
  assert.equal(contaProcessiAttivi(lista), 1);
});

test('A6-04: contropelo — una riga «in sfondo» NON si chiude a fine giro', () => {
  const sfondo = { type: 'ToolCallResult', toolCallId: 'a', inSfondo: true, fileSfondo: 'C:\\out.log', ricevutoA: 2_000 };
  const lista = processiDagliEventi([avvio('a', 1), argomenti('a'), sfondo], { adesso, giroCorrente: 3, giroVivo: false });
  assert.equal(lista[0].stato, 'in-sfondo');
  assert.equal(contaProcessiAttivi(lista), 1);
});

test('A6-05: un comando che aspetta il consenso non è partito — resta «in-consenso» ma il badge non lo conta', () => {
  const eventi = [avvio('a'), argomenti('a'), { type: 'ApprovalRequested', requestId: 'r1', toolCallId: 'a' }];
  const lista = processiDagliEventi(eventi, { adesso, giroCorrente: 1, giroVivo: true });
  assert.equal(lista[0].stato, 'in-consenso');
  assert.equal(contaProcessiAttivi(lista), 0);
});

test('A6-06: lo stesso toolCallId due volte vale UNA riga viva nel badge, come nella lista', () => {
  const lista = processiDagliEventi([avvio('a', 1), argomenti('a'), avvio('a', 1), argomenti('a')], { adesso, giroCorrente: 1, giroVivo: true });
  assert.equal(contaProcessiAttivi(lista), 1);
});

test('A6-07: compatibilità — senza i fatti del giro, l\'esito è quello di prima', () => {
  const lista = processiDagliEventi([avvio('a'), argomenti('a'), avvio('b'), argomenti('b'), esito('b')], { adesso });
  assert.deepEqual(lista.map((p) => p.stato), ['riuscito', 'in-corso']);
  assert.equal(contaProcessiAttivi(lista), 1);
});

test('A6-08: una riga già conclusa resta conclusa anche a giro finito', () => {
  const lista = processiDagliEventi([avvio('a'), argomenti('a'), esito('a')], { adesso, giroCorrente: 1, giroVivo: false });
  assert.equal(lista[0].stato, 'riuscito');
});

/*
 * ⛔⛔ RED di «talos desktop» sulla prima cura (07/10/2026): il comando `!` della PERSONA non è un passo del giro del
 *   modello. È un'operazione sua (`ComandoUtenteIniziato`/`ComandoUtenteFinito`, `session-registry.mjs:9148`), che gira
 *   anche a modello fermo e in parallelo a un giro nuovo. I fatti del giro del modello non la chiudono: si chiude col
 *   suo risultato.
 */
const avvioDellaPersona = (id, giro) => ({ ...avvio(id, giro), chi: 'tu' });

test('A6-09: un `!` della persona a modello fermo resta «in corso» e conta', () => {
  const lista = processiDagliEventi([avvioDellaPersona('p1', 3), argomenti('p1', 'npm run build')], { adesso, giroCorrente: 3, giroVivo: false });
  assert.notEqual(lista[0].stato, 'interrotto');
  assert.equal(lista[0].stato, 'in-corso');
  assert.equal(contaProcessiAttivi(lista), 1);
});

test('A6-10: un `!` della persona resta vivo quando parte in parallelo un giro nuovo del modello', () => {
  const lista = processiDagliEventi([avvioDellaPersona('p1', 3), argomenti('p1', 'npm run build')], { adesso, giroCorrente: 4, giroVivo: true });
  assert.equal(lista[0].stato, 'in-corso');
  assert.equal(contaProcessiAttivi(lista), 1);
});

test('A6-11: il `!` della persona si chiude col SUO risultato', () => {
  const lista = processiDagliEventi([avvioDellaPersona('p1', 3), argomenti('p1'), esito('p1')], { adesso, giroCorrente: 4, giroVivo: false });
  assert.equal(lista[0].stato, 'riuscito');
  assert.equal(contaProcessiAttivi(lista), 0);
});
