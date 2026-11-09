/*
 * Spesa di servizio (owner 30/10/2026; contratto in-corso/CONTRATTO-SPESA-DI-SERVIZIO-2026-10-30.md §1): il costruttore UNICO del
 * `value` dell'evento `consumo-di-servizio`. Le fixture qui sono quelle di conformità condivise con CLI e Mobile (Chat e Codice).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NOME_CONSUMO_DI_SERVIZIO, SCHEMA_CONSUMO_DI_SERVIZIO, SCOPI_DI_SERVIZIO,
  depositaConsumoDiServizio, eventoConsumoDiServizio, valoreConsumoDiServizio,
} from '../src/kernel/consumo-di-servizio.mjs';

const AT = '2026-10-30T13:00:00.000Z';
const base = { scopo: 'riassunto', fonte: 'openrouter', modelloRemoto: 'z-ai/glm-5.3-flash', esito: 'completato', at: AT, inPrimoPiano: false };

test('CONSUMO-SERVIZIO-01 — nome e schema fissi (contratto §5.1: non cambiano mai), sei scopi (parte 2 C: obiettivo e domanda)', () => {
  assert.equal(NOME_CONSUMO_DI_SERVIZIO, 'consumo-di-servizio');
  assert.equal(SCHEMA_CONSUMO_DI_SERVIZIO, 'talos.consumo-di-servizio.v1');
  // 04/11/2026 (revisione del passo 5, difetto 6): 'computer-use' in coda, gli altri allo stesso posto
  assert.deepEqual([...SCOPI_DI_SERVIZIO], ['riassunto', 'compact', 'giudice', 'motore', 'obiettivo', 'domanda', 'computer-use']);
  const evento = eventoConsumoDiServizio({ ...base, usage: { prompt_tokens: 10, completion_tokens: 2 } });
  assert.equal(evento.type, 'CUSTOM');
  assert.equal(evento.name, 'consumo-di-servizio');
  assert.equal(evento.value.schema, 'talos.consumo-di-servizio.v1');
});

test('CONSUMO-SERVIZIO-02 (fixture di conformità per scopo) — la forma intera, con ogni campo noto', () => {
  for (const scopo of SCOPI_DI_SERVIZIO) {
    const v = valoreConsumoDiServizio({ ...base, scopo, riserva: true, usage: { prompt_tokens: 1200, completion_tokens: 300, cost: 0.0042, prompt_tokens_details: { cached_tokens: 800, altro: 'x' }, completion_tokens_details: { reasoning_tokens: 120, altro: 'y' }, testo: 'mai' },
      maxTokensInviato: 4096, giro: 7, richiestaDelGiro: 2, runId: 'r7', durataMs: 3120, inPrimoPiano: scopo === 'riassunto' });
    assert.deepEqual(v, {
      schema: 'talos.consumo-di-servizio.v1', scopo, riserva: true, fonte: 'openrouter', modelloRemoto: 'z-ai/glm-5.3-flash',
      usage: { prompt_tokens: 1200, completion_tokens: 300, cost: 0.0042, prompt_tokens_details: { cached_tokens: 800 }, completion_tokens_details: { reasoning_tokens: 120 } },
      costoDichiarato: 0.0042, esito: 'completato', at: AT, maxTokensInviato: 4096, giro: 7, richiestaDelGiro: 2, runId: 'r7', durataMs: 3120, inPrimoPiano: scopo === 'riassunto',
    });
  }
});

test('CONSUMO-SERVIZIO-03 — ciò che non si sa resta ASSENTE, mai 0 (0 = gratis / giro zero, regola della CLI)', () => {
  const v = valoreConsumoDiServizio({ ...base, usage: null, giro: 0, runId: '', durataMs: -1, maxTokensInviato: 0 });
  for (const campo of ['costoDichiarato', 'giro', 'runId', 'durataMs', 'maxTokensInviato', 'riserva', 'richiestaDelGiro']) assert.equal(campo in v, false, campo);
  /* richiestaDelGiro parte da 0 (Performance): lo 0 è un indice vero e resta; un negativo no */
  assert.equal(valoreConsumoDiServizio({ ...base, richiestaDelGiro: 0 }).richiestaDelGiro, 0);
  assert.equal('richiestaDelGiro' in valoreConsumoDiServizio({ ...base, richiestaDelGiro: -1 }), false);
  assert.equal(v.usage, null);
  /* al contrario: un costo dichiarato a 0 dal fornitore È gratis, e resta */
  assert.equal(valoreConsumoDiServizio({ ...base, costoDichiarato: 0 }).costoDichiarato, 0);
});

test('CONSUMO-SERVIZIO-04 — un errore di contratto non si degrada: scopo, esito o inPrimoPiano sconosciuti lanciano', () => {
  assert.throws(() => valoreConsumoDiServizio({ ...base, scopo: 'chat' }), /unknown scopo "chat"/u);
  assert.throws(() => valoreConsumoDiServizio({ ...base, esito: 'ok' }), /unknown esito "ok"/u);
  assert.throws(() => valoreConsumoDiServizio({ ...base, inPrimoPiano: undefined }), /inPrimoPiano must be true or false/u);
});

test('CONSUMO-SERVIZIO-05 — la porta: senza porta niente; un guasto della porta non ferma chi ha pagato; un errore di contratto sì', async () => {
  assert.equal(await depositaConsumoDiServizio(null, base), false);
  const visti = [];
  assert.equal(await depositaConsumoDiServizio(async (v) => { visti.push(v); }, { ...base, usage: { prompt_tokens: 1 } }), true);
  assert.equal(visti.length, 1);
  assert.equal(visti[0].scopo, 'riassunto');
  assert.equal(await depositaConsumoDiServizio(async () => { throw new Error('disco pieno'); }, base), false);
  await assert.rejects(depositaConsumoDiServizio(async () => {}, { ...base, scopo: 'x' }), /unknown scopo/u);
});

test('CONSUMO-SERVIZIO-CU — computer use: scopo per nome, token di immagine e di testo separati, assenti se non stimati (Performance 04/11)', () => {
  const v = valoreConsumoDiServizio({ ...base, scopo: 'computer-use', inPrimoPiano: true, usage: { prompt_tokens: 1900, completion_tokens: 40, cost: 0.0011 },
    stimaTokenImmagine: 1600, stimaTokenTesto: 300 });
  assert.equal(v.scopo, 'computer-use');
  assert.equal(v.stimaTokenImmagine, 1600);
  assert.equal(v.stimaTokenTesto, 300);
  assert.equal(v.costoDichiarato, 0.0011, 'il costo entra nel conto come ogni altra riga di servizio');
  const senza = valoreConsumoDiServizio({ ...base, scopo: 'computer-use', inPrimoPiano: true, stimaTokenImmagine: -1, stimaTokenTesto: 'x' });
  assert.equal('stimaTokenImmagine' in senza, false);
  assert.equal('stimaTokenTesto' in senza, false);
  const altro = valoreConsumoDiServizio({ ...base });
  assert.equal('stimaTokenImmagine' in altro, false, 'le righe degli altri scopi non cambiano forma');
});
