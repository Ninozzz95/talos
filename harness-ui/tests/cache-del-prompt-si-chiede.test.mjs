/*
 * ⭐⭐⭐ BC-07/BC-16 — LA CACHE DEL PROMPT SI CHIEDE, E IL MARCATORE PARTE NELLA FORMA GIUSTA.
 *
 * Owner 11/09/2026, «approvato il punto 1», dopo la misura che ha aperto il debito: al PRIMO giro
 * di ogni invio i token in ingresso sono in mediana 29.148 e la cache prende **mediana 0%** (16
 * invii su 24 sotto il 10%), mentre dal secondo giro dello stesso invio sale a 87-100%. La prima
 * risposta — l'unica che la persona sta guardando — ripaga ogni volta tutto il preambolo.
 *
 * ⛔⛔ LA PRIMA STESURA DI QUESTO CANCELLO PROVAVA LA FORMA SBAGLIATA, e va detto perché la lezione
 *   è più preziosa della cura: pretendeva `cache_control` alla RADICE della richiesta, ed era
 *   VERDE. Poi due invii veri sul 4174 con `z-ai/glm-5.3-flash` hanno dato `cached_tokens` **0 e
 *   0**: il marcatore partiva e non serviva a niente. Un cancello verde su una forma inefficace è
 *   esattamente un cancello inerte — l'ha smentito la misura dal vivo, non un test.
 *
 * ⇒ La forma vera è PER BLOCCO, col contenuto multi-parte (OpenRouter, «Prompt Caching», letto
 *   l'11/09/2026: «prompt caching requires explicit cache_control breakpoints in message content
 *   blocks»), e il marcatore va sull'ultimo blocco cacheable — come fa Hermes
 *   (`anthropic_message_convert.py:436-445`).
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CARATTERI_MINIMI_PER_CACHE, conMarcatoreDiCache, talosLavora } from '../src/kernel/talosHarness.mjs';

/*
 * ⛔ Un preambolo FINTO ma di taglia VERA. Sotto il minimo dichiarato dai fornitori il
 *   marcatore non verrebbe messo — giustamente, perché non sarebbe onorato — e la prova
 *   misurerebbe il caso sbagliato. Il preambolo vero ne ha 66.523 di caratteri.
 */
const PREAMBOLO_GRANDE = ['File del progetto:', ...Array.from({ length: 700 }, (_, i) => `percorso/lungo/di/un/file-${i}.mjs`)].join('\n');

/** Cattura il corpo JSON di ogni richiesta al fornitore. */
function fornitoreCheRegistra() {
  const corpi = [];
  return {
    corpi,
    fetchDiRete: async (_url, opzioni) => {
      corpi.push(JSON.parse(opzioni.body));
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 29_148, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 0 } },
      });
    },
  };
}

test('⭐⭐⭐ la richiesta porta il marcatore SUL BLOCCO di sistema, col TTL di un\'ora', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-cache-'));
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const fornitore = fornitoreCheRegistra();

  await talosLavora({
    cartella, task: { consegna: 'un giro qualunque' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
    messaggiIniziali: [{ role: 'system', content: PREAMBOLO_GRANDE }, { role: 'user', content: 'fai qualcosa' }],
    fetchDiRete: fornitore.fetchDiRete,
  });

  assert.ok(fornitore.corpi.length > 0, 'almeno una richiesta deve essere partita');
  for (const [indice, corpo] of fornitore.corpi.entries()) {
    const sistemi = corpo.messages.filter((m) => m.role === 'system');
    const marcati = sistemi.filter((m) => Array.isArray(m.content) && m.content.some((p) => p?.cache_control));
    assert.equal(marcati.length, 1, `⛔ richiesta ${indice + 1}: deve esserci UN solo blocco marcato — più breakpoint costano scritture di cache in più`);
    assert.deepEqual(
      marcati[0].content[0].cache_control,
      { type: 'ephemeral', ttl: '1h' },
      '⛔ il TTL deve essere di un\'ora: il default di 5 minuti è più corto della pausa fra due messaggi, ed è la ragione per cui la cache era a zero',
    );
    assert.equal(marcati[0].content[0].type, 'text', 'la parte deve dichiarare il proprio tipo, o il fornitore la scarta');
  }
});

test('⛔ il marcatore va sull\'ULTIMO blocco di sistema, e gli altri messaggi non si toccano', () => {
  const messaggi = [
    { role: 'system', content: 'istruzioni' },
    { role: 'system', content: PREAMBOLO_GRANDE },
    { role: 'user', content: 'ciao' },
  ];
  const fuori = conMarcatoreDiCache(messaggi);

  assert.equal(fuori[0].content, 'istruzioni', 'il primo sistema resta una stringa');
  assert.ok(Array.isArray(fuori[1].content), 'l\'ultimo sistema diventa multi-parte');
  assert.equal(fuori[1].content[0].text, PREAMBOLO_GRANDE);
  assert.equal(fuori[2].content, 'ciao', 'i messaggi dell\'utente non si toccano');
  /* ⛔ E l'originale non è stato mutato: la conversazione su disco deve restare di stringhe, o
     resume, fork, banco e test si troverebbero davanti a un formato che non hanno mai visto. */
  assert.equal(messaggi[1].content, PREAMBOLO_GRANDE, 'l\'array di partenza non si muta');
});

test('⛔⛔ AL CONTRARIO — senza un messaggio di sistema non si inventa niente, e niente si rompe', () => {
  const soloUtente = [{ role: 'user', content: 'ciao' }];
  assert.deepEqual(conMarcatoreDiCache(soloUtente), soloUtente, 'nessun sistema, nessun marcatore');
  assert.deepEqual(conMarcatoreDiCache([]), []);
  /* Un sistema VUOTO non è un posto dove far partire una cache: si lascia stare. */
  const sistemaVuoto = [{ role: 'system', content: '' }, { role: 'user', content: 'ciao' }];
  assert.deepEqual(conMarcatoreDiCache(sistemaVuoto), sistemaVuoto);
  /*
   * ⛔⛔ E un preambolo SOTTO il minimo del fornitore resta una stringa: un marcatore che non
   *   può essere onorato è solo un formato in più da far attraversare a ogni messaggio —
   *   «a prompt below the provider's token minimum» è la prima causa di cache miss che OpenRouter
   *   elenca. È anche la ragione per cui i tre test del kernel che leggono il corpo della prima
   *   richiesta sono tornati veri da soli, invece di essere «aggiustati».
   */
  const corto = [{ role: 'system', content: 'x'.repeat(CARATTERI_MINIMI_PER_CACHE - 1) }, { role: 'user', content: 'ciao' }];
  assert.deepEqual(conMarcatoreDiCache(corto), corto);
});
