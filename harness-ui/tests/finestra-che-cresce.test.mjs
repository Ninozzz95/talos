/*
 * ⭐ L1 1.3 — la finestra che cresce (owner 26/10/2026, bozzetto approvato). Il modulo da solo, con un supervisore e un motore finti:
 *   quanto si apre, quando NON si apre (scelta, massimo, memoria, motore occupato, modello diverso), la vecchia finestra rimessa se
 *   quella nuova non entra, il ricordo per il prossimo avvio, un allargamento alla volta.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaFinestraCheCresce, finestraDaAprire, prossimoGradino, SCELTA_DI_SERIE, velocitaDalleMetriche } from '../src/finestra-che-cresce.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function banco(t, { finestra = 16_384, massimo = 131_072, perToken = 100_000, liberi = 32e9, occupato = false, gpuLayers = 0, falliscaA = null, modelId = 'm1',
  metriche = null, riapri = null } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'finestra-cresce-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const stato = { state: 'ready', modelId, windowTokens: finestra };
  const caricamenti = [];
  const supervisor = {
    status: () => ({ ...stato }),
    request: async (percorso) => {
      if (percorso === '/metrics') return new Response(metriche ?? '', { status: metriche === null ? 404 : 200 });
      assert.equal(percorso, '/slots');
      return Response.json([{ id: 0, is_processing: occupato }]);
    },
  };
  const motore = {
    unload: async () => { stato.state = 'stopped'; },
    load: async ({ modelId: id, contextLength }) => {
      caricamenti.push(contextLength);
      if (falliscaA !== null && (Array.isArray(falliscaA) ? falliscaA.includes(contextLength) : contextLength === falliscaA)) {
        throw Object.assign(new Error('out of memory'), { code: 'RUNTIME_OUT_OF_MEMORY' });
      }
      Object.assign(stato, { state: 'ready', modelId: id, windowTokens: contextLength });
    },
    ...(riapri ? { riapri: async (id) => riapri(id, stato, caricamenti) } : {}),
  };
  const f = creaFinestraCheCresce({
    supervisor, motore, gpuLayers, cartella,
    modello: async (id) => ({ modelPath: `C:/modelli/${id}.gguf`, nome: 'LFM2.5 24B' }),
    leggiIntestazione: async () => ({ trainedContext: massimo, kvCacheBytesPerToken: perToken }),
    misuraMacchina: async () => ({ memory: { freeBytes: liberi } }),
  });
  return { f, stato, caricamenti, cartella };
}

test('FC-01 quanto si apre: quello che serve più metà (sotto la soglia del 75%), a passi di 4.096, mai oltre il massimo addestrato', () => {
  assert.equal(finestraDaAprire({ servono: 17_432, prima: 16_384, massimo: 131_072 }), 28_672, '26.148 → 28.672: la conversazione al 61%, sotto la soglia');
  assert.equal(finestraDaAprire({ servono: 16_500, prima: 16_384, massimo: 131_072 }), 28_672, '×1,5 arrotondato (24.750 → 28.672)');
  assert.equal(finestraDaAprire({ servono: 30_000, prima: 16_384, massimo: 32_768 }), 32_768, 'tagliata al massimo');
  assert.equal(finestraDaAprire({ servono: 33_000, prima: 16_384, massimo: 32_768 }), null, 'oltre il massimo non entra comunque');
  assert.equal(finestraDaAprire({ servono: 30_000, prima: 32_768, massimo: 32_768 }), null, 'già al massimo');
  assert.equal(finestraDaAprire({ servono: 10_000, prima: 8_192, massimo: 0 }), 16_384, 'massimo ignoto: si apre col margine (15.000 → 16.384)');
});

test('FC-02 il caso del bozzetto: 17.432 su 16.384 ⇒ riaperto a 28.672, ricordato, e la riga ha i numeri', async (t) => {
  const { f, stato, caricamenti, cartella } = banco(t);
  const esito = await f.allarga({ modelId: 'm1', servono: 17_432 });
  assert.deepEqual({ ok: esito.ok, prima: esito.prima, dopo: esito.dopo, nome: esito.nome }, { ok: true, prima: 16_384, dopo: 28_672, nome: 'LFM2.5 24B' });
  assert.equal(esito.memoriaInPiu, 100_000 * (28_672 - 16_384));
  assert.deepEqual(caricamenti, [28_672]);
  assert.equal(stato.windowTokens, 28_672);
  assert.equal(await f.finestraPreferita('m1'), 28_672, 'al prossimo avvio si riparte da lì');
  assert.deepEqual(JSON.parse(readFileSync(join(cartella, 'finestre-preferite.json'), 'utf8')), { m1: 28_672 });
});

test('FC-03 AL CONTRARIO: le ragioni per NON aprire, e il motore resta com\'era', async (t) => {
  for (const [nome, opzioni, richiesta, motivo] of [
    ['già al massimo', { finestra: 32_768, massimo: 32_768 }, { servono: 33_000 }, 'oltre-il-massimo'],
    ['messaggio oltre il massimo', { massimo: 131_072 }, { servono: 160_000 }, 'oltre-il-massimo'],
    ['memoria che non basta (senza scheda)', { liberi: 1e9 }, { servono: 17_432 }, 'memoria'],
    ['motore che lavora su un\'altra richiesta', { occupato: true }, { servono: 17_432 }, 'motore-occupato'],
    ['un altro modello aperto', { modelId: 'm2' }, { servono: 17_432 }, 'motore-non-pronto'],
  ]) {
    const { f, caricamenti, stato } = banco(t, opzioni);
    const prima = stato.windowTokens;
    const esito = await f.allarga({ modelId: 'm1', ...richiesta });
    assert.equal(esito.ok, false, nome);
    assert.equal(esito.motivo, motivo, nome);
    assert.deepEqual(caricamenti, [], `${nome}: nessuna riapertura`);
    assert.equal(stato.windowTokens, prima, nome);
  }
});

test('FC-04 la scelta della persona: di serie «allarga»; «riassumi» e «chiedi» non riaprono; un valore inventato è rifiutato', async (t) => {
  const { f, caricamenti } = banco(t);
  assert.equal(await f.scelta(), SCELTA_DI_SERIE);
  assert.equal(SCELTA_DI_SERIE, 'allarga');
  await f.salvaScelta('riassumi');
  assert.equal(await f.scelta(), 'riassumi');
  assert.equal((await f.allarga({ modelId: 'm1', servono: 17_432 })).motivo, 'scelta');
  /* «Chiedimi»: si fanno i conti e, se si PUÒ allargare, si torna coi numeri per la carta — senza riaprire niente */
  await f.salvaScelta('chiedi');
  const chiedi = await f.allarga({ modelId: 'm1', servono: 17_432 });
  assert.deepEqual({ ok: chiedi.ok, motivo: chiedi.motivo, prima: chiedi.prima, dopo: chiedi.dopo }, { ok: false, motivo: 'chiedi', prima: 16_384, dopo: 28_672 });
  /* …e se non si può, non c'è niente da chiedere: si riassume come sempre */
  assert.equal((await f.allarga({ modelId: 'm1', servono: 200_000 })).motivo, 'oltre-il-massimo');
  /* la persona che ha scelto dalla carta (o il modello dietro la sua carta) passa `forza`: si apre anche con «Chiedimi» */
  assert.equal((await f.allarga({ modelId: 'm1', servono: 17_432, forza: true })).ok, true);
  caricamenti.length = 0;
  await f.salvaScelta('chiedi');
  assert.deepEqual(caricamenti, []);
  await assert.rejects(() => f.salvaScelta('sempre'), { code: 'INVALID_REQUEST' });
  await f.salvaScelta('allarga');
  assert.equal((await f.allarga({ modelId: 'm1', servono: 17_432 })).ok, true);
});

test('FC-05 la finestra nuova non entra nella scheda: si rimette QUELLA DI PRIMA e si torna al riassunto', async (t) => {
  const { f, caricamenti, stato } = banco(t, { gpuLayers: 99, falliscaA: 28_672 });
  const esito = await f.allarga({ modelId: 'm1', servono: 17_432 });
  assert.deepEqual({ ok: esito.ok, motivo: esito.motivo }, { ok: false, motivo: 'memoria' });
  assert.deepEqual(caricamenti, [28_672, 16_384], 'provata la nuova, rimessa la vecchia');
  assert.deepEqual({ state: stato.state, windowTokens: stato.windowTokens }, { state: 'ready', windowTokens: 16_384 }, 'il motore resta acceso e pronto');
  assert.equal(await f.finestraPreferita('m1'), null, 'non si ricorda una finestra che non è entrata');
});

test('FC-06 con la scheda la RAM libera non decide: decide il caricamento', async (t) => {
  const { f, caricamenti } = banco(t, { gpuLayers: 99, liberi: 1e9 });
  assert.equal((await f.allarga({ modelId: 'm1', servono: 17_432 })).ok, true);
  assert.deepEqual(caricamenti, [28_672]);
});

test('FC-07 due richieste piene insieme: un allargamento solo, la seconda rifà i conti sulla finestra nuova', async (t) => {
  const { f, caricamenti } = banco(t);
  const [a, b] = await Promise.all([f.allarga({ modelId: 'm1', servono: 17_432 }), f.allarga({ modelId: 'm1', servono: 17_432 })]);
  assert.equal(a.ok, true);
  assert.deepEqual({ ok: b.ok, giaAllargata: b.giaAllargata, dopo: b.dopo }, { ok: true, giaAllargata: true, dopo: 28_672 }, 'la seconda trova la finestra già grande: si rimanda e basta');
  assert.deepEqual(caricamenti, [28_672], 'una riapertura sola');
});

/* ⭐ Revisione blocco 4 (26/10/2026) — A1-1 (crescita alla soglia), A-2 (il ritorno com'era), A-5 (la finestra ricordata che non parte) */

test('FC-08 la scala di Hermes: da 64K ×1,5 fino al massimo; sotto 64K ×1,5 dalla finestra di adesso; null al massimo', () => {
  assert.equal(prossimoGradino({ prima: 65_536, massimo: 262_144 }), 98_304);
  assert.equal(prossimoGradino({ prima: 98_304, massimo: 262_144 }), 147_456);
  assert.equal(prossimoGradino({ prima: 147_456, massimo: 200_000 }), 200_000, 'l\'ultimo gradino è il massimo addestrato');
  assert.equal(prossimoGradino({ prima: 16_384, massimo: 131_072 }), 24_576, 'sotto 64K: ×1,5, non un salto a 64K');
  assert.equal(prossimoGradino({ prima: 49_152, massimo: 131_072 }), 65_536, 'poi si raggiunge il primo gradino della scala');
  assert.equal(prossimoGradino({ prima: 70_000, massimo: 131_072 }), 98_304, 'dopo un soccorso fuori scala, il gradino sopra');
  assert.equal(prossimoGradino({ prima: 131_072, massimo: 131_072 }), null, 'già al massimo');
  assert.equal(prossimoGradino({ prima: 16_384, massimo: 0 }), null, 'massimo ignoto: niente da salire');
});

test('FC-09 (A-8) la velocità dai CONTATORI del motore (token / secondi di generazione), mai dalla media fra due letture', () => {
  /* llama.cpp `server-task.cpp:1573-1580` (contatori) e `:1609` (la media fra due letture, che si azzera a ogni `/metrics`) */
  const testo = '# HELP llamacpp:tokens_predicted_total Number of generation tokens processed\nllamacpp:tokens_predicted_total 1000\n'
    + '# HELP llamacpp:tokens_predicted_seconds_total Total time spent generating tokens\nllamacpp:tokens_predicted_seconds_total 250\n'
    + '# HELP llamacpp:predicted_tokens_seconds Average generation throughput in tokens/s\nllamacpp:predicted_tokens_seconds 0\n';
  assert.equal(velocitaDalleMetriche(testo), 4, 'la media azzerata (0) non conta: contano i contatori');
  assert.equal(velocitaDalleMetriche('llamacpp:predicted_tokens_seconds 41.2\n'), null, 'la sola media fra due letture: ignota');
  assert.equal(velocitaDalleMetriche('llamacpp:tokens_predicted_total 0\nllamacpp:tokens_predicted_seconds_total 0\n'), null, 'nessuna generazione ancora: ignota');
  assert.equal(velocitaDalleMetriche('llamacpp:tokens_predicted_total 500\n'), null, 'manca il tempo: ignota');
  assert.equal(velocitaDalleMetriche('llamacpp:tokens_predicted_total_bis 9\nllamacpp:tokens_predicted_seconds_total 1\n'), null, 'un nome che comincia uguale non conta');
  assert.equal(velocitaDalleMetriche(null), null);
});

test('FC-10 alla soglia (proattiva): si sale di UN gradino, si ricorda, e l\'esito lo dice', async (t) => {
  const { f, caricamenti } = banco(t, { finestra: 65_536, massimo: 262_144, gpuLayers: 99, metriche: 'llamacpp:tokens_predicted_total 4120\nllamacpp:tokens_predicted_seconds_total 100\n' });
  const esito = await f.allarga({ modelId: 'm1', servono: 49_200, proattiva: true });
  assert.deepEqual({ ok: esito.ok, prima: esito.prima, dopo: esito.dopo, proattiva: esito.proattiva }, { ok: true, prima: 65_536, dopo: 98_304, proattiva: true });
  assert.deepEqual(caricamenti, [98_304]);
  assert.equal(await f.finestraPreferita('m1'), 98_304);
});

test('FC-11 AL CONTRARIO alla soglia: sotto 6 token/s non si cresce (si riassume); il soccorso sul rifiuto invece sì', async (t) => {
  const { f, caricamenti } = banco(t, { finestra: 65_536, massimo: 262_144, gpuLayers: 99, metriche: 'llamacpp:tokens_predicted_total 410\nllamacpp:tokens_predicted_seconds_total 100\n' });
  const lenta = await f.allarga({ modelId: 'm1', servono: 49_200, proattiva: true });
  assert.deepEqual({ ok: lenta.ok, motivo: lenta.motivo }, { ok: false, motivo: 'lento' });
  assert.deepEqual(caricamenti, [], 'nessuna riapertura');
  assert.equal((await f.allarga({ modelId: 'm1', servono: 70_000 })).ok, true, 'una richiesta già rifiutata si salva comunque');
});

test('FC-12 (A-2) la finestra nuova non entra: il ritorno passa dall\'avvio di SEMPRE (`riapri`), e un ritorno fallito non lancia', async (t) => {
  const riaperti = [];
  const { f, stato, caricamenti } = banco(t, {
    finestra: 65_536, massimo: 262_144, gpuLayers: 99, falliscaA: 98_304, metriche: 'llamacpp:tokens_predicted_total 4000\nllamacpp:tokens_predicted_seconds_total 100\n',
    riapri: (id, s) => { riaperti.push(id); Object.assign(s, { state: 'ready', modelId: id, windowTokens: 65_536 }); },
  });
  const esito = await f.allarga({ modelId: 'm1', servono: 49_200, proattiva: true });
  assert.deepEqual({ ok: esito.ok, motivo: esito.motivo }, { ok: false, motivo: 'memoria' });
  assert.deepEqual(caricamenti, [98_304], 'la finestra detta si prova una volta; il ritorno NON è un `load` con la finestra di prima');
  assert.deepEqual(riaperti, ['m1']);
  assert.deepEqual({ state: stato.state, windowTokens: stato.windowTokens }, { state: 'ready', windowTokens: 65_536 });

  const { f: g, stato: s2 } = banco(t, {
    finestra: 65_536, massimo: 262_144, gpuLayers: 99, falliscaA: 106_496, // 70.000 × 1,5 → 106.496, il soccorso sul rifiuto
    riapri: () => { throw Object.assign(new Error('engine gone'), { code: 'RUNTIME_PROCESS_FAILED' }); },
  });
  const spento = await g.allarga({ modelId: 'm1', servono: 70_000 });
  assert.deepEqual({ ok: spento.ok, motivo: spento.motivo, spento: spento.spento }, { ok: false, motivo: 'memoria', spento: true }, 'mai un\'eccezione a chi chiedeva');
  assert.equal(s2.state, 'stopped', 'il motore spento si riaccende alla prossima richiesta (avviaLocale)');
});

test('FC-13 una finestra che non è entrata non si riprova a ogni soglia (due ricaricamenti per niente)', async (t) => {
  const { f, caricamenti } = banco(t, { finestra: 65_536, massimo: 262_144, gpuLayers: 99, falliscaA: 98_304, metriche: 'llamacpp:tokens_predicted_total 4000\nllamacpp:tokens_predicted_seconds_total 100\n' });
  assert.equal((await f.allarga({ modelId: 'm1', servono: 49_200, proattiva: true })).motivo, 'memoria');
  caricamenti.length = 0;
  const ancora = await f.allarga({ modelId: 'm1', servono: 49_500, proattiva: true });
  assert.deepEqual({ ok: ancora.ok, motivo: ancora.motivo, giaProvata: ancora.giaProvata }, { ok: false, motivo: 'memoria', giaProvata: 98_304 });
  assert.deepEqual(caricamenti, [], 'nessun ricaricamento');
  assert.equal(await f.puoCrescere('m1'), false, 'e il kernel lo sa prima: prepara il riassunto come sempre');
});

test('FC-14 puoCrescere: sì di serie e con «Chiedimi»; no con «Riassumi», al massimo, con un altro modello', async (t) => {
  const { f } = banco(t, { finestra: 65_536, massimo: 131_072 });
  assert.equal(await f.puoCrescere('m1'), true);
  assert.equal(await f.puoCrescere('m2'), false, 'non è il modello acceso');
  await f.salvaScelta('chiedi');
  assert.equal(await f.puoCrescere('m1'), true, 'con «Chiedimi» la crescita si chiede: un riassunto senza la persona no');
  await f.salvaScelta('riassumi');
  assert.equal(await f.puoCrescere('m1'), false);
  const { f: alMassimo } = banco(t, { finestra: 131_072, massimo: 131_072 });
  assert.equal(await alMassimo.puoCrescere('m1'), false);
});

test('FC-15 (A-5) la finestra ricordata che oggi non parte si dimentica per OGNI guasto, non solo la memoria della scheda', async (t) => {
  const { f } = banco(t, { finestra: 65_536 });
  assert.equal((await f.allarga({ modelId: 'm1', servono: 70_000 })).ok, true);
  const ricordata = await f.finestraPreferita('m1');
  assert.ok(ricordata > 65_536);
  const cpu = Object.assign(new Error('llama-server closed after 0 s: failed to allocate buffer for kv cache'), { code: 'RUNTIME_PROCESS_FAILED' });
  const esito = await f.conLaPreferita('m1', async () => { throw cpu; });
  assert.deepEqual({ avviato: esito.avviato, dimenticata: esito.dimenticata }, { avviato: false, dimenticata: ricordata });
  assert.equal(await f.finestraPreferita('m1'), null, 'il prossimo avvio parte dalla finestra di serie');
  /* AL CONTRARIO: un avvio annullato non dice niente sulla finestra — resta ricordata */
  assert.equal((await f.allarga({ modelId: 'm1', servono: 120_000 })).ok, true);
  const ancora = await f.finestraPreferita('m1');
  await assert.rejects(() => f.conLaPreferita('m1', async () => { throw Object.assign(new Error('cancelled'), { code: 'RUNTIME_START_CANCELLED' }); }), { code: 'RUNTIME_START_CANCELLED' });
  assert.equal(await f.finestraPreferita('m1'), ancora);
  const ok = await f.conLaPreferita('m1', async (finestra) => ({ finestra }));
  assert.deepEqual(ok, { avviato: true, esito: { finestra: ancora } });
});

test('FC-16 senza il massimo addestrato non si sale a caso: si riassume come prima', async (t) => {
  const { f, caricamenti } = banco(t, { massimo: 0 });
  assert.equal((await f.allarga({ modelId: 'm1', servono: 17_432 })).motivo, 'massimo-ignoto');
  assert.deepEqual(caricamenti, []);
});
