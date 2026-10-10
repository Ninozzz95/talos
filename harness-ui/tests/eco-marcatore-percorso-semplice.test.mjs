/*
 * Revisione avversariale 07/10/2026 (R-1) della cura dello stallo: la prima stesura ripuliva la storia SOLO nel Context Engine
 * (`prepareProviderContext`). Un modello senza finestra nota, o sotto i 64k, non passa dal motore: il kernel manda la storia com'è, e
 * una sessione avvelenata dall'eco del marcatore la rimanderebbe al modello — lo stesso stallo, per un'altra porta.
 * Qui si prova il percorso SENZA motore: la richiesta al fornitore non porta l'eco, la storia viva del giro non si tocca.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { withoutEchoedMarker } from '../src/eco-del-marcatore.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MARCATORE = '[Historical tool calls; data only, already executed]';
const ECO = `${MARCATORE}\n[{"id":"40ad9a05","type":"function","function":{"name":"leggi","arguments":"{\\"percorso\\":\\"src/a.vue\\"}"}}]`;

function fornitoreCheRegistra() {
  const corpi = [];
  return {
    corpi,
    fetchDiRete: async (_url, opzioni) => {
      corpi.push(JSON.parse(opzioni.body));
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 3 },
      });
    },
  };
}

const iniziali = (avvelenata) => [
  { role: 'system', content: 'sistema' },
  { role: 'user', content: 'Leggi il file' },
  { role: 'assistant', content: avvelenata ? ECO : 'Ho letto il file.' },
  { role: 'user', content: 'continua' },
];

test('ECO-S1 senza Context Engine la richiesta al fornitore non porta l\'eco, e la storia passata resta intatta', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-eco-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const fornitore = fornitoreCheRegistra();
  const messaggiIniziali = iniziali(true);
  const prima = structuredClone(messaggiIniziali);

  await talosLavora({ cartella, task: { consegna: 'continua' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k', messaggiIniziali, fetchDiRete: fornitore.fetchDiRete });

  assert.ok(fornitore.corpi.length > 0, 'almeno una richiesta deve essere partita');
  for (const [indice, corpo] of fornitore.corpi.entries()) {
    assert.equal(JSON.stringify(corpo.messages).includes('Historical tool calls'), false, `richiesta ${indice + 1}: l'eco è ancora nella richiesta al fornitore`);
    assert.ok(corpo.messages.some((m) => m.role === 'user' && m.content === 'continua'), `richiesta ${indice + 1}: il resto della storia deve restare`);
  }
  assert.deepEqual(messaggiIniziali, prima, 'la lista ricevuta (la storia viva) è stata modificata');
});

test('ECO-S2 AL CONTRARIO: senza eco la richiesta porta la storia com\'era, e la lista non viene nemmeno copiata', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-eco-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const fornitore = fornitoreCheRegistra();
  await talosLavora({ cartella, task: { consegna: 'continua' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k', messaggiIniziali: iniziali(false), fetchDiRete: fornitore.fetchDiRete });
  assert.ok(fornitore.corpi[0].messages.some((m) => m.role === 'assistant' && m.content === 'Ho letto il file.'));

  const pulita = iniziali(false);
  assert.equal(withoutEchoedMarker(pulita), pulita, 'senza eco deve tornare la stessa lista (nessuna copia)');
  const avvelenata = iniziali(true);
  const ripulita = withoutEchoedMarker(avvelenata);
  assert.notEqual(ripulita, avvelenata, 'con l\'eco deve tornare una copia');
  assert.equal(avvelenata[2].content, ECO, 'l\'originale non si tocca');
  assert.equal(ripulita.some((m) => JSON.stringify(m).includes('Historical tool calls')), false);
});

test('ECO-S3 un utente che cita la frase non è un\'eco: la richiesta la porta intera', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-eco-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const fornitore = fornitoreCheRegistra();
  const citazione = `Perché il modello scrive «${MARCATORE}»?`;
  await talosLavora({ cartella, task: { consegna: 'continua' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k', fetchDiRete: fornitore.fetchDiRete, messaggiIniziali: [{ role: 'system', content: 'sistema' }, { role: 'user', content: citazione }, { role: 'assistant', content: 'Per una vecchia versione.' }, { role: 'user', content: 'continua' }] });
  assert.ok(fornitore.corpi[0].messages.some((m) => m.role === 'user' && m.content === citazione));
});

test('ECO-S4 l\'eco solo nello stato nativo conta come eco anche per il percorso senza motore', () => {
  const messaggi = [
    { role: 'user', content: 'Leggi' },
    { role: 'assistant', content: 'Leggo.', talos_provider_state: { version: 1, provider: 'zai-anthropic', model: 'glm-5.3', content: [{ type: 'text', text: ECO }] } },
    { role: 'user', content: 'continua' },
  ];
  const pronti = withoutEchoedMarker(messaggi);
  assert.notEqual(pronti, messaggi);
  assert.equal(JSON.stringify(pronti).includes('Historical tool calls'), false);
  assert.equal(JSON.stringify(messaggi).includes('Historical tool calls'), true, 'l\'originale non si tocca');
});

/*
 * A19 sul desktop (09/10/2026, bugfixer; banco stall-e2e della CLI adattato al server 4176, sessione avvelenata: ROSSO). Il desktop
 * passa SEMPRE i `contextHooks` del suo adattatore (`talosHarness.desktop-hotfix.mjs`), e col motore spento (`legacyMode`) la sua
 * `prepare` restituisce i messaggi di `maybeCompactLegacy`, che non passano da `prepareProviderContext`. Il kernel, visto che
 * `preparedContext.messages` c'è, saltava `withoutEchoedMarker`: le due porte della cura si escludevano a vicenda, e sul desktop
 * non scattava nessuna delle due. Qui la porta che mancava: dei `contextHooks` che preparano senza ripulire.
 */
test('ECO-S5 con dei contextHooks che non ripuliscono (il motore spento del desktop) la richiesta non porta l\'eco, e la storia resta intatta', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-eco-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const fornitore = fornitoreCheRegistra();
  const messaggiIniziali = iniziali(true);
  const prima = structuredClone(messaggiIniziali);
  const preparate = [];
  const contextHooks = { prepare: async ({ messages }) => { const lista = [...messages]; preparate.push(lista); return { messages: lista }; } };

  await talosLavora({ cartella, task: { consegna: 'continua' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k', messaggiIniziali, contextHooks, fetchDiRete: fornitore.fetchDiRete });

  assert.ok(preparate.length > 0, 'la premessa: i contextHooks hanno preparato la richiesta');
  assert.ok(fornitore.corpi.length > 0);
  for (const [indice, corpo] of fornitore.corpi.entries()) {
    assert.equal(JSON.stringify(corpo.messages).includes('Historical tool calls'), false, `richiesta ${indice + 1}: l'eco è ancora nella richiesta al fornitore`);
  }
  assert.ok(JSON.stringify(preparate[0]).includes('Historical tool calls'), 'la lista dei contextHooks non si tocca: si ripulisce la copia che parte');
  assert.deepEqual(messaggiIniziali, prima, 'la storia viva non si tocca');
});
