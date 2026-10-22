/*
 * 22/10/2026 — revisione 3 della CLI 0.6.13 su r4 84f9b22dd (owner: «curo prima, poi release»).
 * S2-2: il riassunto di fine giro e il /compact a mano non accorciavano la coda protetta. Col contenuto grosso negli ultimi scambi il
 *       riassunto di fine giro si pagava e scriveva un record PIÙ GRANDE (CLI: 15.630 → 15.792), e il /compact rispondeva «niente da
 *       compattare» al doppio della soglia.
 * S4:   uno Stop durante il riassunto atteso lasciava l'«inizio» senza la «fine».
 * Registro VERO e adattatore VERO; giri, riassuntore e rete finti; TEMP privata, nessuna porta.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { VARIABILE_TETTO_TOKEN } from '../src/kernel/compattazione-desktop.mjs';
import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CLOUD = 'z-ai/glm-5.3-flash';
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function ambiente(t, { tetto = '2000', testoRiassunto = `${'Punto riassunto. '.repeat(30)}` } = {}) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = tetto;
  const cartellaStore = cartellaDiProva('talos-cli-613-3-');
  const giri = [];
  const riassunti = [];
  const registro = createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {}, cartellaStore, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: CLOUD, chiave: 'k',
    avviaSessioneFn: async (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      giri.push({ concludi(storia) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [] } }); } });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
      return attesa;
    },
    riassumiPerCompattazioneFn: async (input) => { riassunti.push(input); return { scelta: { role: 'assistant', content: `## Riassunto\n${typeof testoRiassunto === 'function' ? testoRiassunto() : testoRiassunto}` }, finishReason: 'stop', usage: null }; },
  });
  t.after(async () => {
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  });
  const eventi = [];
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CLOUD });
  registro.iscriviti(sessionId, (e) => { if (e?.type === 'CUSTOM' && e.name === 'talos.compattazione') eventi.push(e.value); });
  return { registro, giri, riassunti, sessionId, cartellaStore, eventi };
}
/* Il caso della CLI: scambi brevi prima, e il contenuto GROSSO nell'ultimo scambio (la lettura che ha appena passato la soglia). */
const storiaCodaGrossa = () => {
  const s = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: sistema il log' }];
  for (let i = 0; i < 4; i += 1) s.push({ role: 'user', content: `Domanda ${i}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(40)}` });
  s.push({ role: 'user', content: 'Leggi il log intero' });
  s.push({ role: 'assistant', content: '', tool_calls: [{ id: 'call_log', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"app.log"}' } }] });
  s.push({ role: 'tool', tool_call_id: 'call_log', content: `${'riga del log con un errore ripetuto '.repeat(1_200)}` });
  s.push({ role: 'assistant', content: 'Ho letto il log.' });
  return s;
};
async function attendi(condizione, messaggio) {
  for (let i = 0; i < 400; i += 1) { if (await condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error(messaggio);
}

test('S22-COMPACT-01 — col contenuto grosso nell\'ultimo scambio il /compact a mano RIDUCE (prima: «niente da compattare» al doppio della soglia)', async (t) => {
  const { registro, giri, sessionId, cartellaStore } = ambiente(t, { tetto: '1000000' }); // nessun riassunto di fine giro in mezzo
  const storia = storiaCodaGrossa();
  giri[0].concludi(storia);
  await attendiScritture({ cartellaStore, sessionId });
  process.env[VARIABILE_TETTO_TOKEN] = '2000';
  const esito = await registro.compatta(sessionId);
  assert.equal(esito.compattato, true, JSON.stringify(esito));
  assert.ok(esito.tokenDopo < esito.tokenPrima / 2, `ridotto davvero: ${esito.tokenPrima} → ${esito.tokenDopo}`);
});

test('S22-FINEGIRO-01 — il riassunto di fine giro non scrive mai un record più grande: con la coda grossa la accorcia', async (t) => {
  const { registro, giri, sessionId } = ambiente(t);
  giri[0].concludi(storiaCodaGrossa());
  await attendi(() => registro.statoCompattazione(sessionId)?.record, 'il riassunto di fine giro non ha scritto il record');
  const { record } = registro.statoCompattazione(sessionId);
  assert.ok(record.tokenDopo < record.tokenPrima, `record ${record.tokenPrima} → ${record.tokenDopo}`);
});

test('S22-MINIMO-01 — sopra la soglia senza niente da ridurre il /compact dice «al-minimo»; AL CONTRARIO sotto la soglia «niente-da-compattare»; nessun riassunto pagato', async (t) => {
  const { registro, giri, riassunti, sessionId, cartellaStore } = ambiente(t, { tetto: '1000000' });
  /* il peso sta nel prompt di sistema: non si riassume e non si accorcia */
  giri[0].concludi([{ role: 'system', content: `${'istruzione di sistema '.repeat(2_000)}` }, { role: 'user', content: 'Consegna' }, { role: 'assistant', content: 'ok' }]);
  await attendiScritture({ cartellaStore, sessionId });
  assert.equal((await registro.compatta(sessionId)).motivo, 'niente-da-compattare', 'sotto la soglia');
  process.env[VARIABILE_TETTO_TOKEN] = '2000';
  const sopra = await registro.compatta(sessionId);
  assert.equal(sopra.compattato, false);
  assert.equal(sopra.motivo, 'al-minimo', JSON.stringify(sopra));
  assert.equal(riassunti.length, 0, 'nessun riassunto pagato per non ridurre');
});

test('S4-STOP-01 — uno Stop durante il riassunto atteso chiude la riga: un inizio e una fine (motivo «interrotta»)', async () => {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '4000';
  const cartella = mkdtempSync(join(tmpdir(), 'cli-613-3-s4-'));
  try {
    const stop = new AbortController();
    const eventi = [];
    const storia = Array.from({ length: 40 }, (_, i) => [
      { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(60)}` },
      { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(60)}` }]).flat();
    const fetchDiRete = async (_u, o) => {
      const corpo = JSON.parse(o.body);
      if (!corpo.tools?.length) {
        setTimeout(() => stop.abort(), 50);
        return new Promise((_, no) => { o.signal?.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }); });
      }
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
    };
    await talosLavora({ cartella, modello: CLOUD, chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: storia, contestoDelProgetto: 'Project files:\n',
      fetchDiRete, segnaleStop: stop.signal,
      onGiro: (e) => { if (e?.tipo === 'compattazione-inizio' || e?.tipo === 'compattazione-fine') eventi.push(e); } }).catch(() => null);
    const inizi = eventi.filter((e) => e.tipo === 'compattazione-inizio');
    const fini = eventi.filter((e) => e.tipo === 'compattazione-fine');
    assert.ok(stop.signal.aborted && inizi.length >= 1, `premessa: lo Stop è arrivato durante il riassunto — ${JSON.stringify(eventi.map((e) => e.tipo))}`);
    assert.equal(fini.length, inizi.length, `ogni riga aperta si chiude: ${JSON.stringify(eventi.map((e) => [e.tipo, e.motivo]))}`);
    assert.equal(fini.at(-1).motivo, 'interrotta');
  } finally {
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima;
    rimuoviCartellaDiProva(cartella);
  }
});

test('S22-FINEGIRO-02 — un riassunto di fine giro che, pagato, viene più lungo di ciò che sostituisce NON diventa un record (fine muta «inefficace»)', async (t) => {
  /* il riassuntore prolisso: la proiezione col riassunto supera quella di prima */
  const { registro, giri, riassunti, sessionId, eventi } = ambiente(t, { testoRiassunto: 'Ripeto tutto per filo e per segno. '.repeat(2_000) });
  const storia = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna' }];
  for (let i = 0; i < 10; i += 1) storia.push({ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(150)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(150)}` });
  giri[0].concludi(storia);
  await attendi(() => eventi.some((v) => v.fase === 'fine'), `nessuna fine: ${JSON.stringify(eventi)}`);
  assert.ok(riassunti.length >= 1, 'premessa: il riassunto è stato chiesto (il pavimento non lo escludeva)');
  assert.equal(registro.statoCompattazione(sessionId)?.record ?? null, null, 'nessun record più grande scritto');
  assert.equal(eventi.find((v) => v.fase === 'fine').motivo, 'inefficace');
});

test('S22-COMPACT-02 — un /compact a mano il cui riassunto viene più lungo di ciò che sostituisce non scrive un record e non dice «compattato»', async (t) => {
  const { registro, giri, sessionId, cartellaStore } = ambiente(t, { tetto: '1000000', testoRiassunto: 'Ripeto tutto per filo e per segno. '.repeat(2_000) });
  const storia = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna' }];
  for (let i = 0; i < 10; i += 1) storia.push({ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(150)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(150)}` });
  giri[0].concludi(storia);
  await attendiScritture({ cartellaStore, sessionId });
  const esito = await registro.compatta(sessionId);
  assert.equal(esito.compattato, false, JSON.stringify(esito));
  assert.equal(esito.motivo, 'inefficace');
  assert.ok(esito.tokenDopo >= esito.tokenPrima);
  assert.equal(registro.statoCompattazione(sessionId)?.record ?? null, null);
});

test('Q-A-01 (domanda a) — un\'immagine nel tratto da riassumere arriva al riassuntore come segnaposto di testo, mai come image_url', async () => {
  const { costruisciRichiestaDiRiassunto, SEGNAPOSTO_IMMAGINE } = await import('../src/kernel/compattazione-desktop.mjs');
  const mezzo = [{ role: 'user', content: [{ type: 'text', text: 'Guarda questa schermata' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
    { role: 'assistant', content: 'Vista.' }];
  const richiesta = costruisciRichiestaDiRiassunto({ testa: [{ role: 'system', content: 's' }], mezzo });
  const testo = JSON.stringify(richiesta);
  assert.equal(testo.includes('image_url'), false, testo.slice(0, 300));
  assert.ok(testo.includes(SEGNAPOSTO_IMMAGINE));
  assert.ok(testo.includes('Guarda questa schermata'), 'il testo accanto all\'immagine resta');
  assert.equal(mezzo[0].content[1].type, 'image_url', 'AL CONTRARIO: la storia non si tocca');
});

test('S21-DEST-01 (S2-1, caso limite) — dopo un cambio di fornitore il riassunto sul modello leggero va al SUO modello; AL CONTRARIO quello in sottofondo va al fornitore attivo, come prima', async () => {
  const { destinazioneDellaSecondaria } = await import('../src/runtime-owner-adapter.mjs');
  const effettivo = { provider: 'deepseek', model: 'deepseek-chat' };
  assert.deepEqual(destinazioneDellaSecondaria({ effettivo, modello: 'openrouter:liquid/lfm-2.5-2.6b:free', modelloProprio: true }),
    { provider: 'openrouter', model: 'liquid/lfm-2.5-2.6b:free' });
  assert.deepEqual(destinazioneDellaSecondaria({ effettivo, modello: 'openrouter:z-ai/glm-5.3-flash' }), effettivo);
  assert.deepEqual(destinazioneDellaSecondaria({ effettivo: null, modello: 'openrouter:z-ai/glm-5.3-flash' }), { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' });
});

test('S22-PAGA-UNA-VOLTA (settima revisione) — sistema pesante e mezzo piccolo: il riassunto di fine giro non si paga affatto; AL CONTRARIO uno «inefficace» non si ripaga al giro dopo', async (t) => {
  const { registro, giri, riassunti, sessionId, cartellaStore } = ambiente(t);
  /* il caso del revisore: ~8.800 token di sistema, pochi scambi brevi — ciò che un riassunto toglierebbe è sotto un riassunto minimo */
  const storia = [{ role: 'system', content: `${'istruzione di sistema '.repeat(2_000)}` }, { role: 'user', content: 'Consegna' }];
  for (let i = 0; i < 5; i += 1) storia.push({ role: 'user', content: `d${i}` }, { role: 'assistant', content: `r${i}` });
  giri[0].concludi(storia);
  await attendiScritture({ cartellaStore, sessionId });
  await new Promise((r) => { setTimeout(r, 100); });
  assert.equal(riassunti.length, 0, 'nessun riassunto pagato per non ridurre');
  assert.equal((await registro.compatta(sessionId)).motivo, 'al-minimo');
});

test('S22-INEFFICACE-RICORDATO (settima revisione) — dopo un «inefficace» il riassunto di fine giro non riparte a ogni giro, finché la storia non cresce', async (t) => {
  const { registro, giri, riassunti, sessionId, cartellaStore, eventi } = ambiente(t, { testoRiassunto: 'Ripeto tutto per filo e per segno. '.repeat(2_000) });
  const storia = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna' }];
  for (let i = 0; i < 10; i += 1) storia.push({ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(150)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(150)}` });
  giri[0].concludi(storia);
  await attendi(() => eventi.some((v) => v.fase === 'fine' && v.motivo === 'inefficace'), `premessa: il primo è inefficace — ${JSON.stringify(eventi)}`);
  const pagati = riassunti.length;
  /* due giri brevi dopo: la storia cresce di poco */
  for (const q of ['Ancora una cosa', 'E un\'altra']) {
    assert.equal(registro.resume(sessionId, q).sessionId, sessionId);
    giri.at(-1).concludi([...storia, { role: 'user', content: q }, { role: 'assistant', content: 'ok' }]);
    await attendiScritture({ cartellaStore, sessionId });
    await new Promise((r) => { setTimeout(r, 60); });
  }
  assert.equal(riassunti.length, pagati, `nessun riassunto ripagato: ${riassunti.length} contro ${pagati}`);
});

test('S22-INEFFICACE-BASE (ottava passata) — un /compact riuscito rende vecchio il ricordo dell\'«inefficace»: i riassunti di fine giro tornano', async (t) => {
  let prolisso = true;
  /* il riassuntore cambia a metà: prolisso la prima volta, poi normale */
  const testoNormale = 'Punto riassunto. '.repeat(30);
  const { registro, giri, riassunti, sessionId, cartellaStore, eventi } = ambiente(t, { testoRiassunto: () => (prolisso ? 'Ripeto tutto per filo e per segno. '.repeat(2_000) : testoNormale) });
  const storia = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna' }];
  for (let i = 0; i < 10; i += 1) storia.push({ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(150)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(150)}` });
  giri[0].concludi(storia);
  await attendi(() => eventi.some((v) => v.fase === 'fine' && v.motivo === 'inefficace'), `premessa: il primo è inefficace — ${JSON.stringify(eventi)}`);
  prolisso = false;
  assert.equal((await registro.compatta(sessionId)).compattato, true, 'il /compact a mano riesce');
  const pagatiDopoIlCompact = riassunti.length;
  let storiaOra = storia;
  for (let g = 0; g < 4; g += 1) {
    assert.equal(registro.resume(sessionId, `Giro ${g}`).sessionId, sessionId);
    storiaOra = [...storiaOra, { role: 'user', content: `Giro ${g}: ${'parola '.repeat(300)}` }, { role: 'assistant', content: `ok ${'parola '.repeat(300)}` }];
    giri.at(-1).concludi(storiaOra);
    await attendiScritture({ cartellaStore, sessionId });
    await new Promise((r) => { setTimeout(r, 60); });
  }
  assert.ok(riassunti.length > pagatiDopoIlCompact, `dopo il /compact il riassunto di fine giro riparte (${riassunti.length} contro ${pagatiDopoIlCompact})`);
});

test('S22-INEFFICACE-TETTO (ottava passata) — col riassuntore sempre prolisso e giri grossi, al più due riassunti inutili di fila', async (t) => {
  const { registro, giri, riassunti, sessionId, cartellaStore } = ambiente(t, { testoRiassunto: 'Ripeto tutto per filo e per segno. '.repeat(2_000) });
  let storia = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna' }];
  for (let i = 0; i < 10; i += 1) storia.push({ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(150)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(150)}` });
  giri[0].concludi(storia);
  await attendiScritture({ cartellaStore, sessionId });
  await new Promise((r) => { setTimeout(r, 80); });
  for (let g = 0; g < 4; g += 1) {
    assert.equal(registro.resume(sessionId, `Giro ${g}`).sessionId, sessionId);
    storia = [...storia, { role: 'user', content: `Giro ${g}: ${'parola '.repeat(800)}` }, { role: 'assistant', content: `ok ${'parola '.repeat(800)}` }];
    giri.at(-1).concludi(storia);
    await attendiScritture({ cartellaStore, sessionId });
    await new Promise((r) => { setTimeout(r, 80); });
  }
  assert.ok(riassunti.length <= 2, `riassunti inutili pagati: ${riassunti.length}`);
});

test('S22-INEFFICACE-ANNULLA (nona passata) — un «Annulla» verso nessun record non riaccende il tetto vecchio: i riassunti di fine giro tornano', async (t) => {
  let prolisso = true;
  const { registro, giri, riassunti, sessionId, cartellaStore, eventi } = ambiente(t, { testoRiassunto: () => (prolisso ? 'Ripeto tutto per filo e per segno. '.repeat(2_000) : 'Punto riassunto. '.repeat(30)) });
  let storia = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna' }];
  for (let i = 0; i < 10; i += 1) storia.push({ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(150)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(150)}` });
  /* due «inefficace» di fila senza record: il tetto è pieno sulla base «nessuna» */
  giri[0].concludi(storia);
  await attendi(() => eventi.filter((v) => v.fase === 'fine' && v.motivo === 'inefficace').length === 1, 'premessa: primo inefficace');
  await attendi(() => !registro.statoCompattazione(sessionId)?.inCorso, 'il lavoro di sfondo si chiude'); // la «fine» arriva prima che il lavoro esca dalla mappa
  assert.equal(registro.resume(sessionId, 'Ancora').sessionId, sessionId);
  storia = [...storia, { role: 'user', content: `Ancora ${'parola '.repeat(800)}` }, { role: 'assistant', content: `ok ${'parola '.repeat(800)}` }];
  giri.at(-1).concludi(storia);
  await attendi(() => eventi.filter((v) => v.fase === 'fine' && v.motivo === 'inefficace').length === 2, `premessa: secondo inefficace — ${JSON.stringify(eventi.map((v) => [v.fase, v.motivo, v.tokenPrima]))} riassunti ${riassunti.length}`);
  await attendi(() => !registro.statoCompattazione(sessionId)?.inCorso, 'il lavoro di sfondo si chiude');
  /* un /compact riuscito, poi «Annulla»: di nuovo nessun record */
  prolisso = false;
  const compattato = await registro.compatta(sessionId);
  assert.equal(compattato.compattato, true, JSON.stringify(compattato));
  assert.equal((await registro.annullaCompattazione(sessionId, compattato.at)).ok, true);
  assert.equal(registro.statoCompattazione(sessionId)?.record ?? null, null, 'premessa: nessun record vivo');
  const pagati = riassunti.length;
  for (let g = 0; g < 3; g += 1) {
    assert.equal(registro.resume(sessionId, `Giro ${g}`).sessionId, sessionId);
    storia = [...storia, { role: 'user', content: `Giro ${g}: ${'parola '.repeat(800)}` }, { role: 'assistant', content: `ok ${'parola '.repeat(800)}` }];
    giri.at(-1).concludi(storia);
    await attendiScritture({ cartellaStore, sessionId });
    await new Promise((r) => { setTimeout(r, 80); });
  }
  assert.ok(riassunti.length > pagati, `dopo l'«Annulla» i riassunti di fine giro ripartono (${riassunti.length} contro ${pagati})`);
});
