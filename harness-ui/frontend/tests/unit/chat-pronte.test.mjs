/*
 * B1 (owner 10/10/2026, «Le ultime 3, con un tetto di memoria»): le chat tenute pronte (`src/components/chat-pronte.js`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  creaChatPronte, chatParcheggiabile, ultimaSequenzaVista, campiDellaChat,
  CAMPI_DELLA_CHAT, CAMPI_DELL_APERTURA, CAMPI_VIVI, CHAT_PRONTE_MASSIME,
} from '../../src/components/chat-pronte.js';

const voce = (nodi = 10) => ({ nodi });

test('B1-PRONTE-LRU: at most three chats; the least recently left goes first; taking one removes it', () => {
  assert.equal(CHAT_PRONTE_MASSIME, 3);
  const r = creaChatPronte();
  for (const id of ['a', 'b', 'c']) r.parcheggia(id, voce());
  assert.deepEqual(r.ids(), ['a', 'b', 'c']);
  r.parcheggia('d', voce());
  assert.deepEqual(r.ids(), ['b', 'c', 'd'], 'the 4th evicts the oldest');
  r.parcheggia('b', voce());
  assert.deepEqual(r.ids(), ['c', 'd', 'b'], 'left again: it becomes the most recent');
  assert.equal(r.prendi('d').nodi, 10);
  assert.deepEqual(r.ids(), ['c', 'b'], 'a chat taken back is the one on screen, no longer kept');
  assert.equal(r.prendi('nessuna'), null);
});

test('B1-PRONTE-TETTO: the node cap evicts the oldest, and a chat larger than the cap alone is not kept', () => {
  const r = creaChatPronte({ massime: 3, nodiMassimi: 100 });
  r.parcheggia('a', voce(60));
  r.parcheggia('b', voce(30));
  assert.deepEqual(r.ids(), ['a', 'b']);
  r.parcheggia('c', voce(30));
  assert.deepEqual(r.ids(), ['b', 'c'], '60 + 30 + 30 > 100: the oldest goes');
  assert.equal(r.nodi(), 60);
  assert.equal(r.parcheggia('enorme', voce(101)), false);
  assert.deepEqual(r.ids(), ['b', 'c'], 'too large alone: not kept, and nothing else evicted for it');
});

test('B1-PRONTE-POTA: a chat that is no longer in the server list is dropped; svuota drops all', () => {
  const r = creaChatPronte();
  r.parcheggia('a', voce()); r.parcheggia('b', voce());
  r.pota(new Map([['b', {}]]));
  assert.deepEqual(r.ids(), ['b']);
  r.svuota();
  assert.deepEqual(r.ids(), []);
});

test('B1-PRONTE-FERMA: only a quiet chat is kept — and each reason it is not is said', () => {
  const ferma = { id: 's', inRigiocata: false, eventoTerminaleVisto: true, approvazioniPendenti: new Map(), domandePendenti: new Map(),
    richiesteMcpPendenti: new Map(), domandeDelleFiglie: new Map(), carteDelleFiglie: new Map(), codaMessaggi: [], comandiInVolo: new Set(),
    attesaBubble: null, sequenzeViste: new Set([1, 2]) };
  assert.deepEqual(chatParcheggiabile(ferma), { ok: true });
  assert.deepEqual(chatParcheggiabile({ ...ferma, eventoTerminaleVisto: false, chiusaDalServer: true }), { ok: true }, 'closed by the server counts as ended');
  const casi = [
    [{ id: null }, 'senza-sessione'],
    [{ inRigiocata: true }, 'storia-in-arrivo'],
    [{ eventoTerminaleVisto: false }, 'giro-vivo'],
    [{ approvazioniPendenti: new Map([['r', {}]]) }, 'in-attesa:approvazioniPendenti'],
    [{ domandePendenti: new Map([['q', {}]]) }, 'in-attesa:domandePendenti'],
    [{ richiesteMcpPendenti: new Map([['m', {}]]) }, 'in-attesa:richiesteMcpPendenti'],
    [{ domandeDelleFiglie: new Map([['f', {}]]) }, 'in-attesa:domandeDelleFiglie'],
    [{ carteDelleFiglie: new Map([['c', {}]]) }, 'in-attesa:carteDelleFiglie'],
    [{ codaMessaggi: [{ testo: 'x' }] }, 'in-attesa:codaMessaggi'],
    [{ comandiInVolo: new Set(['t1']) }, 'in-attesa:comandiInVolo'],
    [{ attesaBubble: {} }, 'attesa'],
    [{ sequenzeViste: new Set() }, 'senza-sequenza'],
  ];
  for (const [patch, motivo] of casi) assert.deepEqual(chatParcheggiabile({ ...ferma, ...patch }), { ok: false, motivo }, motivo);
});

test('B1-PRONTE-SEQUENZA: the last sequence seen is the maximum, whatever the order', () => {
  assert.equal(ultimaSequenzaVista(new Set([3, 900, 12])), 900);
  assert.equal(ultimaSequenzaVista(new Set()), 0);
  assert.equal(ultimaSequenzaVista(null), 0);
});

test('B1-PRONTE-CAMPI: the parked copy keeps the chat\'s OWN objects (references, not clones) and nothing of the opening', () => {
  const messaggi = new Map();
  const rs = { messageElements: messaggi, generation: 7, id: 's', eventSource: {}, risorseProcessi: new Map(), contesto: { cartella: 'x' } };
  const copia = campiDellaChat(rs);
  assert.equal(copia.messageElements, messaggi);
  assert.deepEqual(copia.contesto, { cartella: 'x' });
  for (const campo of [...CAMPI_DELL_APERTURA, ...CAMPI_VIVI]) assert.equal(Object.hasOwn(copia, campo), false, campo);
});

/*
 * ⛔ LA GUARDIA DELL'INVENTARIO. Una chat ripresa torna com'era solo se il parcheggio porta TUTTO ciò che il cambio di chat azzera.
 *   Questa prova legge il reset VERO in `app.js` (`nuovaGenerazioneSessione` fino alla nuova generazione, e `azzeraSchedaContesto`)
 *   e diventa rossa se qualcuno aggiunge un campo al reset senza dire se va parcheggiato (CAMPI_DELLA_CHAT), lo rimette chi apre
 *   (CAMPI_DELL_APERTURA) o è una misura viva (CAMPI_VIVI).
 */
test('B1-PRONTE-INVENTARIO: every field the chat switch resets is declared in one of the three lists', () => {
  const sorgente = readFileSync(fileURLToPath(new URL('../../src/legacy/app.js', import.meta.url)), 'utf8');
  const inizio = sorgente.indexOf('function nuovaGenerazioneSessione(');
  const fine = sorgente.indexOf('state.realSession.generation += 1', inizio);
  assert.ok(inizio > 0 && fine > inizio, 'premise: the reset is where it was');
  const reset = sorgente.slice(inizio, fine);
  const azzerati = new Set([...reset.matchAll(/state\.realSession\.([A-Za-z_]+)\s*=(?!=)/gu)].map((m) => m[1]));
  const scheda = sorgente.slice(sorgente.indexOf('function azzeraSchedaContesto('), sorgente.indexOf('function applicaRichiestaDelGiro('));
  for (const m of scheda.matchAll(/([A-Za-z_]+): null/gu)) azzerati.add(m[1]);
  assert.ok(azzerati.size > 40, `premise: the reset was read (${azzerati.size} fields)`);
  const dichiarati = new Set([...CAMPI_DELLA_CHAT, ...CAMPI_DELL_APERTURA, ...CAMPI_VIVI]);
  const mancanti = [...azzerati].filter((campo) => !dichiarati.has(campo));
  assert.deepEqual(mancanti, [], 'reset fields with no declared fate: add each to CAMPI_DELLA_CHAT, CAMPI_DELL_APERTURA or CAMPI_VIVI');
});
