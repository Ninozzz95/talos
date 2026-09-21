import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizzaSchemaAttrezzo, schemaIngressoAttrezzo } from '../src/tool-schema-normalize.mjs';

/*
 * ⭐⭐⭐ 03/9 — «il modello locale dà errore, quindi non funziona».
 *
 * Il motore rispondeva HTTP 400 «JSON schema conversion failed: Unrecognized
 * schema: "string"» — due volte, ed erano esattamente due: un manifest Forge
 * in `.tool-forge-store/promemoria-trattativa.json` scrive le proprietà come
 * stringhe nude invece di `{ type: 'string' }`, e senza `type: 'object'`.
 *
 * ⛔ Non era «un limite del locale»: era una cosa rotta NOSTRA, che solo un
 * motore severo abbastanza da costruire una grammatica poteva vedere.
 * OpenRouter riceveva lo stesso schema e non fiatava.
 *
 * MISURATO contro il motore vero, con lo schema vero:
 *   PRIMA  → «Unable to generate parser for this template…»
 *   DOPO   → 200 OK
 */

test('TOOL-SCHEMA-01 — il caso VERO che ha rotto il modello locale', async () => {
  const rotto = {
    required: ['nome_contatto'],
    properties: { nome_contatto: 'string', dettagli_contatto: 'string' },
  };
  assert.deepEqual(schemaIngressoAttrezzo(rotto), {
    required: ['nome_contatto'],
    properties: { nome_contatto: { type: 'string' }, dettagli_contatto: { type: 'string' } },
    type: 'object',
  });
});

test('TOOL-SCHEMA-02 — uno schema GIÀ corretto non viene toccato nella sostanza', async () => {
  // ⛔ La cura non deve riscrivere ciò che era giusto: gli attrezzi del kernel
  // sono 43 e passavano tutti, singolarmente e insieme (misurato).
  const buono = { type: 'object', properties: { testo: { type: 'string', description: 'x' } }, required: ['testo'] };
  assert.deepEqual(schemaIngressoAttrezzo(buono), buono);
});

test('TOOL-SCHEMA-03 — l\'abbreviazione si espande in profondità, non solo in cima', async () => {
  const dentro = {
    type: 'object',
    properties: {
      lista: { type: 'array', items: 'string' },
      nidificato: { properties: { a: 'number', b: 'boolean' } },
    },
  };
  const uscita = schemaIngressoAttrezzo(dentro);
  assert.deepEqual(uscita.properties.lista.items, { type: 'string' });
  assert.deepEqual(uscita.properties.nidificato.properties.a, { type: 'number' });
  assert.equal(uscita.properties.nidificato.type, 'object', 'properties senza type intende un oggetto');
});

test('TOOL-SCHEMA-04 — AL CONTRARIO: una stringa che NON è un nome di tipo resta com\'è', async () => {
  /*
   * ⛔ `'string'` è un'abbreviazione; `'ciao'` no. Trasformare qualunque
   * stringa in `{ type: … }` inventerebbe uno schema che nessuno ha scritto,
   * ed è il modo di far passare in silenzio un manifest sbagliato.
   */
  assert.equal(normalizzaSchemaAttrezzo('ciao'), 'ciao');
  assert.deepEqual(normalizzaSchemaAttrezzo('integer'), { type: 'integer' });
});

test('TOOL-SCHEMA-05 — AL CONTRARIO: non si buttano via proprietà sconosciute', async () => {
  /*
   * ⛔ Togliere in silenzio un parametro cambia cosa il modello può chiedere:
   * un attrezzo che perde un argomento fallisce PIÙ TARDI, in un punto che
   * non nomina la causa. Meglio uno schema che il motore rifiuta dicendolo.
   */
  const strano = { type: 'object', properties: { x: { not: {} }, y: 'string' } };
  const uscita = schemaIngressoAttrezzo(strano);
  assert.deepEqual(uscita.properties.x, { not: {} }, 'ciò che non si sa espandere si lascia intatto');
  assert.deepEqual(uscita.properties.y, { type: 'string' });
});

test('TOOL-SCHEMA-06 — uno schema assente diventa un oggetto vuoto, non `{}`', async () => {
  // ⛔ `{}` è ammesso da JSON Schema ma non dice niente a una grammatica.
  assert.deepEqual(schemaIngressoAttrezzo(undefined), { type: 'object', properties: {} });
  assert.deepEqual(schemaIngressoAttrezzo(null), { type: 'object', properties: {} });
});

test('TOOL-SCHEMA-07 — i combinatori e le definizioni si attraversano', async () => {
  const con = { anyOf: ['string', { type: 'number' }], $defs: { a: 'boolean' } };
  const uscita = schemaIngressoAttrezzo(con);
  assert.deepEqual(uscita.anyOf[0], { type: 'string' });
  assert.deepEqual(uscita.$defs.a, { type: 'boolean' });
});

test('TOOL-SCHEMA-08 — la cura è applicata dove gli schemi ESTERNI entrano', async () => {
  /*
   * ⛔ Due punti, non uno: i manifest Forge (li scriviamo noi, in forma
   * abbreviata) e i server MCP (li scrivono TERZI, e non possiamo
   * correggerli). Uno schema MCP malformato farebbe fallire l'INTERA
   * richiesta, non solo il suo attrezzo.
   */
  const { readFile } = await import('node:fs/promises');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const radice = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const file of ['src/agent-service.mjs', 'src/mcp-session.mjs']) {
    const sorgente = await readFile(join(radice, file), 'utf8');
    assert.match(sorgente, /schemaIngressoAttrezzo\(/u, `${file} deve normalizzare lo schema prima di offrirlo al modello`);
  }
});
