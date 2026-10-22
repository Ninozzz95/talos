/*
 * 22/10/2026 (CLI, revisione 2 della 0.6.13, S2-A BLOCCANTE; owner «cura completa») — il /compact a mano sostituiva la storia con tre
 * messaggi e lasciava VIVO il record dell'adapter. Appena la storia tornava lunga quanto il record, ogni richiesta era il riassunto
 * VECCHIO più `storia.slice(N)`: il riassunto manuale e i turni dopo sparivano da ciò che il modello vedeva, senza un avviso; e
 * `persistiRecordCompattazione` rifiutava ogni record nuovo con meno copertura, quindi niente lo riparava.
 * Ora: il /compact scrive un RECORD (la stessa strada del riassunto di fine giro), ogni record porta l'impronta del tratto coperto, e
 * al ripristino un record superato da un /compact di prima della cura non torna. Insieme: la prima richiesta sempre tenuta (owner),
 * la richiesta con un'immagine è una richiesta (S3-C), il riassunto di sfondo si ferma alla chiusura e ritenta come l'adapter.
 * Registro VERO, giri e riassuntore finti, TEMP privata, nessuna porta.
 */
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import {
  ATTESA_RITENTA_RIASSUNTO_MS, MARCATORE_ACCORCIATO, MARCATORE_RIASSUNTO, PRIMA_RICHIESTA_CARATTERI_MASSIMI, TENTATIVI_RIASSUNTO,
  VARIABILE_TETTO_TOKEN, applicaRecord, chiaveBaseDelRecord, creaRecord, dividiPerCompattazione, eRichiestaDellaPersona, improntaDelPrefisso, improntaDelTrattoCoperto,
} from '../src/kernel/compattazione-desktop.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CLOUD = 'z-ai/glm-5.3-flash';

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function giri() {
  const tutti = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    tutti.push({ input, concludi(storia) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [] } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${tutti.length}` });
    return attesa;
  };
  return { tutti, avviaSessioneFn };
}
/* Il riassuntore: il primo risponde «RIASSUNTO-AUTO», gli altri «RIASSUNTO-MANUALE»; `appeso` lo tiene finché non lo si rilascia. */
function riassuntore({ appeso = false } = {}) {
  const chiamate = [];
  const rilasci = [];
  const fn = (input) => {
    chiamate.push(input);
    const testo = chiamate.length === 1 ? 'RIASSUNTO-AUTO' : 'RIASSUNTO-MANUALE';
    const risposta = { scelta: { role: 'assistant', content: `## Riassunto\n${testo}` }, finishReason: 'stop', usage: null };
    if (!appeso) return Promise.resolve(risposta);
    return new Promise((ok, no) => {
      rilasci.push(() => ok(risposta));
      input.segnaleStop?.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    });
  };
  return { fn, chiamate, rilascia: () => { for (const r of rilasci.splice(0)) r(); } };
}
const storiaGrande = () => {
  const s = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < 6; i += 1) {
    s.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `file${i}.txt` }) } }] });
    s.push({ role: 'tool', tool_call_id: `call_${i}`, content: 'x'.repeat(3_000) });
  }
  s.push({ role: 'user', content: 'Seconda richiesta' }, { role: 'assistant', content: 'Fatto.' });
  return s;
};
const righe = (cartellaStore, sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r));
async function attendi(condizione, messaggio) {
  for (let i = 0; i < 400; i += 1) { if (await condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error(messaggio);
}
function ambiente(t, { tetto = '2000', appeso = false, ...opzioni } = {}) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = tetto;
  const cartellaStore = opzioni.cartellaStore ?? cartellaDiProva('talos-compact-record-');
  const r = riassuntore({ appeso });
  const g = giri();
  let ms = Date.parse('2026-10-22T10:00:00.000Z');
  const crea = (extra = {}) => createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn: g.avviaSessioneFn,
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: CLOUD, chiave: 'k', riassumiPerCompattazioneFn: r.fn, clock: () => new Date(ms += 1000), ...opzioni, ...extra });
  const registro = crea();
  t.after(async () => {
    r.rilascia();
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  });
  const avvia = () => { const { sessionId, erroreAvvio } = registro.avvia('task-vero', { modelloScelto: CLOUD }); assert.ok(sessionId, JSON.stringify(erroreAvvio)); return sessionId; };
  return { registro, r, g, avvia, cartellaStore, crea };
}
const testoDi = (messaggi) => JSON.stringify(messaggi);
/* Il caso della CLI: dopo il riassunto automatico la conversazione va avanti (giri corti, sotto il tetto), POI il /compact. Subito dopo il
   riassunto automatico non ci sarebbe niente da riassumere (`niente-da-compattare`, CTX-MANUAL-EVENT-03). */
async function altriGiri(registro, g, sessionId, storia, cartellaStore) {
  const nuova = [...storia];
  for (const q of ['Terza richiesta', 'Quarta richiesta']) nuova.push({ role: 'user', content: q }, { role: 'assistant', content: `risposta a ${q}` });
  assert.equal(registro.resume(sessionId, 'Terza richiesta').sessionId, sessionId);
  g.tutti.at(-1).concludi(nuova);
  await attendiScritture({ cartellaStore, sessionId });
  await new Promise((ok) => setTimeout(ok, 30));
  return nuova;
}

test('S2A-01 — dopo un riassunto di fine giro, il /compact a mano SOSTITUISCE il record: il giro dopo vede il riassunto manuale, non quello vecchio', async (t) => {
  const { registro, r, g, avvia, cartellaStore } = ambiente(t);
  const sessionId = avvia();
  const storia = storiaGrande();
  g.tutti[0].concludi(storia);
  await attendi(() => registro.statoCompattazione(sessionId)?.record?.coveredThrough === storia.length, 'il riassunto di fine giro non ha scritto il record');
  const automatico = registro.statoCompattazione(sessionId).record;
  const dopo = await altriGiri(registro, g, sessionId, storia, cartellaStore);
  assert.equal(registro.statoCompattazione(sessionId).record.at, automatico.at, 'premessa: i giri corti non hanno riassunto di nuovo');
  const esito = await registro.compatta(sessionId);
  assert.equal(esito.compattato, true, JSON.stringify(esito));
  const manuale = registro.statoCompattazione(sessionId).record;
  assert.notEqual(manuale.at, automatico.at, 'il record vivo è un altro');
  assert.equal(manuale.at, esito.at);
  assert.equal(manuale.coveredThrough, dopo.length, 'copre tutta la storia, anche i giri dopo il riassunto automatico');
  /* il riassunto manuale parte dalla PROIEZIONE: il riassuntore ha visto il riassunto automatico, non i sei esiti grezzi */
  const ingresso = testoDi(r.chiamate[1].messaggi);
  assert.ok(ingresso.includes('RIASSUNTO-AUTO'), 'l\'ingresso del /compact è la proiezione col record vivo');
  /* dei sei esiti grezzi (3.000 «x» ciascuno) ne arriva al più UNO: quello che il riassunto automatico aveva tenuto alla lettera in coda */
  const esitiVisti = (ingresso.match(/x{3000}/gu) ?? []).length;
  assert.equal((testoDi(storia).match(/x{3000}/gu) ?? []).length, 6, 'premessa: sei esiti nella storia grezza');
  assert.ok(esitiVisti <= 1, `e non gli esiti grezzi già riassunti: ${esitiVisti} su 6`);
  /* il giro dopo: riceve la storia grezza e il record MANUALE */
  assert.equal(registro.resume(sessionId, 'Quinta richiesta').sessionId, sessionId);
  const input = g.tutti.at(-1).input;
  assert.equal(input.recordCompattazioneIniziale?.at, manuale.at, 'il giro parte col record del /compact');
  const vista = applicaRecord(input.messaggiIniziali, input.recordCompattazioneIniziale);
  const testo = testoDi(vista);
  assert.ok(testo.includes('RIASSUNTO-MANUALE'), 'il modello vede il riassunto manuale');
  assert.ok(!testo.includes('RIASSUNTO-AUTO'), 'e non più quello automatico');
  assert.ok(testo.includes('Quinta richiesta'));
  assert.ok(testo.includes('Consegna: analizza tutto'), 'e la prima richiesta della persona, alla lettera (owner 22/10)');
  g.tutti.at(-1).concludi([...input.messaggiIniziali, { role: 'assistant', content: 'ok' }]);
  await attendiScritture({ cartellaStore, sessionId });
  const scritte = righe(cartellaStore, sessionId).filter((x) => x?.tipo === 'compattazione').map((x) => x.record.at);
  assert.deepEqual(scritte.slice(0, 2), [automatico.at, manuale.at], 'sul disco: il record automatico, poi quello manuale (che vince al ripristino)');
});

test('S2A-02 — al riavvio torna il record del /compact; un record superato da un /compact di PRIMA della cura (la storia sostituita) non torna', async (t) => {
  const amb = ambiente(t);
  const sessionId = amb.avvia();
  amb.g.tutti[0].concludi(storiaGrande());
  await attendi(() => amb.registro.statoCompattazione(sessionId)?.record, 'record automatico mancante');
  const automatico = amb.registro.statoCompattazione(sessionId).record;
  await attendiScritture({ cartellaStore: amb.cartellaStore, sessionId });
  /* il riavvio normale: il record torna */
  const dopo = amb.crea();
  await dopo.ripristina();
  assert.equal(dopo.statoCompattazione(sessionId)?.record?.at, automatico.at, 'senza /compact il record automatico torna');
  /* un /compact di prima della cura: storia sostituita + evento durevole «manuale», e NESSUN record nuovo. Si scrive la riga dell'evento
     come la scriveva il server di prima (copia dell'ultima riga di evento, valore cambiato). */
  const file = join(amb.cartellaStore, `${sessionId}.jsonl`);
  const ultimaEvento = righe(amb.cartellaStore, sessionId).filter((x) => x?.type === 'CUSTOM' && x.name === 'talos.compattazione').at(-1);
  appendFileSync(file, `${JSON.stringify({ ...ultimaEvento, value: { fase: 'fine', compattato: true, motivo: 'manuale', annullabile: false, at: '2099-01-01T00:00:00.000Z', tokenPrima: 9000, tokenDopo: 100 } })}\n`);
  const rotto = amb.crea();
  await rotto.ripristina();
  assert.equal(rotto.statoCompattazione(sessionId)?.record ?? null, null, 'il record vecchio parla di un\'altra storia: non torna');
});

test('S2A-03 — l\'impronta del tratto coperto: un record si applica solo alla storia da cui è nato; i record senza impronta come prima', () => {
  const storia = storiaGrande();
  const riassunto = [storia[0], { role: 'user', content: `${MARCATORE_RIASSUNTO}\n\nR` }];
  const record = creaRecord({ coveredThrough: storia.length, riassunto, at: '2026-10-22T10:00:00.000Z', modello: CLOUD, coperti: storia });
  assert.deepEqual(record.impronta, improntaDelTrattoCoperto(storia, storia.length));
  const cresciuta = [...storia, { role: 'user', content: 'nuova' }];
  assert.deepEqual(applicaRecord(cresciuta, record), [...riassunto, { role: 'user', content: 'nuova' }]);
  /* la storia del caso S2-A: tre messaggi del /compact di prima, poi i giri dopo fino a raggiungere la copertura del record */
  const sostituita = [storia[0], { role: 'user', content: 'riassunto manuale' }, { role: 'assistant', content: 'ok' }];
  while (sostituita.length < storia.length + 1) sostituita.push({ role: 'user', content: `richiesta ${sostituita.length}` });
  assert.deepEqual(applicaRecord(sostituita, record), sostituita, 'storia diversa sotto la stessa lunghezza: il record non si applica');
  const senza = creaRecord({ coveredThrough: storia.length, riassunto, at: 'x', modello: CLOUD });
  assert.equal(senza.impronta, undefined);
  assert.deepEqual(applicaRecord(sostituita, senza)[0], riassunto[0], 'un record di prima (senza impronta) si applica come prima');
});

test('PRIMA-01 — owner 22/10: la PRIMA richiesta resta alla lettera dopo tre richieste nuove; se è enorme se ne tengono inizio e fine, e il taglio è detto', () => {
  const richieste = ['Il compito: rifai il modulo X', 'r2', 'r3', 'r4', 'r5'];
  const storia = [{ role: 'system', content: 's' }];
  for (const [i, q] of richieste.entries()) storia.push({ role: 'user', content: q }, { role: 'assistant', content: `risposta ${i} ${'y'.repeat(500)}` });
  const parti = dividiPerCompattazione(storia);
  const tenute = parti.richiesteLetterali.map((m) => m.content);
  assert.equal(tenute[0], 'Il compito: rifai il modulo X', `tenute: ${JSON.stringify(tenute)}`);
  assert.ok(!parti.coda.some((m) => m.content === richieste[0]));
  const enorme = `INIZIO ${'z'.repeat(PRIMA_RICHIESTA_CARATTERI_MASSIMI * 2)} FINE`;
  storia[1] = { role: 'user', content: enorme };
  const tagliata = dividiPerCompattazione(storia).richiesteLetterali[0].content;
  assert.ok(tagliata.startsWith('INIZIO ') && tagliata.endsWith(' FINE') && tagliata.includes(MARCATORE_ACCORCIATO), 'inizio, fine e il taglio detto');
  assert.ok(tagliata.length <= PRIMA_RICHIESTA_CARATTERI_MASSIMI + 400, `${tagliata.length} caratteri`);
  assert.equal(storia[1].content, enorme, 'la storia grezza non si tocca');
});

test('IMG-01 — S3-C: una richiesta con un\'immagine è una richiesta della persona (e un riassunto a parti no)', () => {
  const conImmagine = { role: 'user', content: [{ type: 'text', text: 'Cosa vedi qui?' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] };
  assert.equal(eRichiestaDellaPersona(conImmagine), true);
  assert.equal(eRichiestaDellaPersona({ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:,' } }] }), true, 'anche solo l\'immagine');
  assert.equal(eRichiestaDellaPersona({ role: 'user', content: [{ type: 'text', text: `${MARCATORE_RIASSUNTO}\n\nR` }] }), false);
  assert.equal(eRichiestaDellaPersona({ role: 'user', content: [] }), false);
  const storia = [{ role: 'system', content: 's' }, conImmagine];
  for (let i = 0; i < 4; i += 1) storia.push({ role: 'assistant', content: `a${i} ${'y'.repeat(500)}` }, { role: 'user', content: `r${i}` });
  storia.push({ role: 'assistant', content: 'fine' });
  assert.equal(dividiPerCompattazione(storia).richiesteLetterali[0], conImmagine, 'tenuta alla lettera, immagine compresa');
});

test('CHIUSURA-01 — CLI revisione 1: la chiusura del registro ferma il riassunto di fine giro (niente più richieste dopo l\'uscita), senza una «fine»', async (t) => {
  const { registro, r, g, avvia, cartellaStore } = ambiente(t, { appeso: true });
  const sessionId = avvia();
  g.tutti[0].concludi(storiaGrande());
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === true, 'il riassunto di sfondo non è partito');
  assert.equal(r.chiamate[0].segnaleStop.aborted, false);
  await registro.chiudi({ attesaMassimaMs: 2_000 });
  assert.equal(r.chiamate[0].segnaleStop.aborted, true, 'la richiesta si chiude');
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === false, 'il riassunto fermato non si è chiuso');
  assert.equal(r.chiamate.length, 1, 'fermato non si ritenta');
  await attendiScritture({ cartellaStore, sessionId });
  const fine = righe(cartellaStore, sessionId).filter((e) => e?.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value?.fase === 'fine');
  assert.deepEqual(fine, [], 'come le sintesi abbandonate allo spegnimento: nessuna «fine»');
});

test('RITENTA-01 — CLI revisione 1: il riassunto del registro (fine giro e /compact) ritenta come l\'adapter, non come un giro', async (t) => {
  const { registro, r, g, avvia, cartellaStore } = ambiente(t);
  const sessionId = avvia();
  g.tutti[0].concludi(storiaGrande());
  await attendi(() => registro.statoCompattazione(sessionId)?.record, 'record automatico mancante');
  await altriGiri(registro, g, sessionId, storiaGrande(), cartellaStore);
  await registro.compatta(sessionId);
  assert.equal(r.chiamate.length, 2);
  for (const c of r.chiamate) {
    assert.equal(c.tentativiMassimi, TENTATIVI_RIASSUNTO);
    assert.equal(c.attesaRitentaMassimaMs, ATTESA_RITENTA_RIASSUNTO_MS);
  }
  assert.deepEqual([TENTATIVI_RIASSUNTO, ATTESA_RITENTA_RIASSUNTO_MS], [2, 10_000]);
});

test('MODELLO-01 — il /compact a mano scrive col modello dei riassunti (leggero), e il record resta intestato alla conversazione', async (t) => {
  const LEGGERO = 'openai/gpt-5-nano';
  const { registro, r, g, avvia } = ambiente(t, { tetto: '200000', modelloRiassuntoFn: (m) => (m === CLOUD ? LEGGERO : null) });
  const sessionId = avvia();
  g.tutti[0].concludi(storiaGrande());
  await new Promise((ok) => setTimeout(ok, 30));
  assert.equal(r.chiamate.length, 0, 'premessa: sotto il tetto nessun riassunto di fine giro');
  const esito = await registro.compatta(sessionId);
  assert.equal(esito.compattato, true, JSON.stringify(esito));
  assert.equal(r.chiamate[0].modello, LEGGERO);
  assert.equal(registro.statoCompattazione(sessionId).record.modello, CLOUD);
});

test('ATTESA-01 — un /compact a mano mentre il riassunto di fine giro è in volo lo aspetta, poi scrive il suo: l\'ultimo record è il manuale', async (t) => {
  const { registro, r, g, avvia } = ambiente(t, { appeso: true });
  const sessionId = avvia();
  g.tutti[0].concludi(storiaGrande());
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === true, 'il riassunto di sfondo non è partito');
  const promessa = registro.compatta(sessionId);
  await new Promise((ok) => setTimeout(ok, 30));
  assert.equal(r.chiamate.length, 1, 'il /compact aspetta: nessun secondo riassunto in parallelo');
  r.rilascia();
  /* con un tempo massimo: un /compact che riassumesse di nuovo resterebbe appeso al riassuntore (mutante M3 del 22/10) */
  const esito = await Promise.race([promessa, new Promise((ok) => { setTimeout(() => ok('APPESO'), 4_000).unref(); })]);
  /* il riassunto di sfondo ha appena coperto tutto: il /compact, partito DOPO di lui, lo dice invece di riassumere due volte */
  assert.deepEqual(esito, { ok: true, compattato: false, fase: 'riassunto', motivo: 'niente-da-compattare' });
  assert.equal(r.chiamate.length, 1);
  assert.ok(registro.statoCompattazione(sessionId).record, 'resta il record del riassunto di sfondo');
});

test('IMPRONTA-GIRO-01 — anche i record nati DENTRO il giro (adapter) portano l\'impronta, e si applicano alla storia che il kernel restituisce', async (t) => {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
  const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
  const cartella = cartellaDiProva('talos-impronta-giro-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const storia = [];
  for (let i = 0; i < 40; i += 1) storia.push({ role: 'user', content: `Domanda ${i} ${'parola '.repeat(60)}` }, { role: 'assistant', content: `Risposta ${i} ${'parola '.repeat(60)}` });
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    const message = corpo.tools?.length ? { role: 'assistant', content: 'fatto' } : { role: 'assistant', content: '## Riassunto\nR' };
    return Response.json({ choices: [{ index: 0, message, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 1 } });
  };
  const r = await talosLavora({ cartella, modello: CLOUD, chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia, contestoDelProgetto: 'Project files:\n', fetchDiRete });
  const record = r.recordDiCompattazione?.at(-1);
  assert.ok(record, 'premessa: il giro ha compattato');
  assert.match(record.impronta?.primo ?? '', /^[0-9a-f]{16}$/u);
  assert.deepEqual(record.impronta, improntaDelTrattoCoperto(r.messaggiFinali, record.coveredThrough), 'l\'impronta è quella della storia che il registro salva');
  assert.notDeepEqual(applicaRecord(r.messaggiFinali, record), r.messaggiFinali, 'e il record si applica');
});

test('S3B-01 — CLI S3-B: senza l\'istantanea, il giro che parte mentre il riassunto di fine giro è in volo lo riceve «in arrivo», con impronta e base giuste', async (t) => {
  const { registro, r, g, avvia } = ambiente(t, { appeso: true });
  const sessionId = avvia();
  const storia = storiaGrande();
  g.tutti[0].concludi(storia);
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === true, 'il riassunto di sfondo non è partito');
  assert.equal(registro.resume(sessionId, 'Terza richiesta').sessionId, sessionId);
  const inArrivo = g.tutti[1].input.compattazioneInArrivo;
  assert.equal(typeof inArrivo?.then, 'function', 'il giro riceve il riassunto in volo');
  /* owner 22/10 sera («one-up su tutti»): la firma è nota PRIMA dell'arrivo, così il giro decide se aspettarlo (come Codex) */
  assert.deepEqual(inArrivo.firma, { coveredThrough: storia.length, impronta: improntaDelPrefisso(storia, storia.length), base: chiaveBaseDelRecord(null) },
    'la firma del riassunto in volo, prima che arrivi');
  r.rilascia();
  const arrivata = await inArrivo;
  assert.equal(arrivata.record.at, registro.statoCompattazione(sessionId).record.at, 'è il record che il riassunto di sfondo ha scritto');
  assert.equal(arrivata.impronta, improntaDelPrefisso(storia, storia.length));
  assert.equal(arrivata.base, chiaveBaseDelRecord(null), 'la base è il record con cui il giro è partito (nessuno)');
  assert.equal(arrivata.soloCoda, false);
  g.tutti[1].concludi([...g.tutti[1].input.messaggiIniziali, { role: 'assistant', content: 'ok' }]);
});

test('S3B-02 — AL CONTRARIO: senza un riassunto in volo il giro non riceve niente «in arrivo»', async (t) => {
  const { registro, g, avvia } = ambiente(t, { tetto: '200000' });
  const sessionId = avvia();
  g.tutti[0].concludi(storiaGrande());
  await new Promise((ok) => setTimeout(ok, 30));
  assert.equal(registro.statoCompattazione(sessionId).inCorso, false);
  registro.resume(sessionId, 'Terza richiesta');
  assert.equal(g.tutti[1].input.compattazioneInArrivo, undefined);
  g.tutti[1].concludi([...g.tutti[1].input.messaggiIniziali, { role: 'assistant', content: 'ok' }]);
});

test('FINE-GIRO-01 — CLI: chi chiude subito dopo un giro aspetta il riassunto di fine giro anche PRIMA che parta, con un tetto che lo dice', async (t) => {
  const { registro, r, g, avvia } = ambiente(t, { appeso: true });
  const sessionId = avvia();
  g.tutti[0].concludi(storiaGrande());
  /* subito, nella finestra in cui `inCorso` è ancora falso: l'attesa non si risolve vuota */
  const breve = await registro.attendiRiassuntoDiFineGiro(sessionId, { attesaMassimaMs: 150 });
  assert.deepEqual(breve, { atteso: false, scaduta: true }, 'il riassunto è appeso: il tetto scade e lo dice');
  const lunga = registro.attendiRiassuntoDiFineGiro(sessionId);
  setTimeout(() => r.rilascia(), 50);
  assert.deepEqual(await lunga, { atteso: true, scaduta: false });
  assert.ok(registro.statoCompattazione(sessionId).record, 'risolta solo a riassunto scritto');
  assert.deepEqual(await registro.attendiRiassuntoDiFineGiro('non-esiste'), { atteso: false, scaduta: false });
});

/* ─── revisione avversaria del 22/10 (ROSSA), le sue tre riproduzioni portate qui ─── */

test('REV-ANNULLA-01 — un «Annulla» arrivato mentre il /compact riassume vince: il /compact non scrive un record costruito sul riassunto annullato', async (t) => {
  const { registro, r, g, avvia, cartellaStore } = ambiente(t, { appeso: true });
  const sessionId = avvia();
  const storia = storiaGrande();
  g.tutti[0].concludi(storia);
  await attendi(() => r.chiamate.length === 1, 'il riassunto di fine giro non è partito');
  r.rilascia();
  await attendi(() => registro.statoCompattazione(sessionId)?.record?.coveredThrough === storia.length, 'record automatico mancante');
  const automatico = registro.statoCompattazione(sessionId).record;
  await altriGiri(registro, g, sessionId, storia, cartellaStore);
  const compact = registro.compatta(sessionId);
  await attendi(() => r.chiamate.length === 2, 'il /compact non sta riassumendo');
  assert.ok(testoDi(r.chiamate[1].messaggi).includes('RIASSUNTO-AUTO'), 'premessa: il /compact riassume sopra il record automatico');
  const annullo = await registro.annullaCompattazione(sessionId, automatico.at);
  assert.equal(annullo.ok, true, JSON.stringify(annullo));
  r.rilascia();
  const esito = await compact;
  assert.notEqual(esito.compattato, true, `il /compact non deve scrivere sopra l'annullo: ${JSON.stringify(esito)}`);
  assert.equal(esito.code, 'SESSION_NOT_READY');
  assert.equal(registro.statoCompattazione(sessionId).record, null, 'resta l’annullo: nessun record vivo');
});

test('REV-PRIMA-02 — la prima richiesta già accorciata non si riaccorcia alla compattazione dopo: il taglio detto resta quello vero', () => {
  const enorme = `INIZIO ${'z'.repeat(50_000)} FINE`;
  const storia = [{ role: 'system', content: 's' }, { role: 'user', content: enorme }];
  for (let i = 0; i < 5; i += 1) storia.push({ role: 'assistant', content: `r${i} ${'y'.repeat(500)}` }, { role: 'user', content: `n${i}` });
  storia.push({ role: 'assistant', content: 'fine' });
  const prima = dividiPerCompattazione(storia).richiesteLetterali[0];
  const detto = /\[… ([\d,]+) /u.exec(prima.content)?.[1];
  assert.ok(detto, 'premessa: il taglio è detto');
  /* la compattazione dopo parte dalla proiezione: la prima richiesta è la copia accorciata */
  const proiezione = [storia[0], prima, { role: 'user', content: `${MARCATORE_RIASSUNTO}\n\nR` }];
  for (let i = 0; i < 4; i += 1) proiezione.push({ role: 'assistant', content: `q${i} ${'y'.repeat(500)}` }, { role: 'user', content: `m${i}` });
  proiezione.push({ role: 'assistant', content: 'fine' });
  const seconda = dividiPerCompattazione(proiezione).richiesteLetterali[0];
  assert.equal(seconda.content, prima.content, 'identica: non si riaccorcia');
  assert.equal(/\[… ([\d,]+) /u.exec(seconda.content)?.[1], detto);
});

test('REV-ANNULLA-02 — lo stesso sul riassunto di FINE GIRO: un «Annulla» mentre è in volo vince, il riassunto non torna vivo', async (t) => {
  const { registro, r, g, avvia } = ambiente(t, { appeso: true });
  const sessionId = avvia();
  const storia = storiaGrande();
  g.tutti[0].concludi(storia);
  await attendi(() => r.chiamate.length === 1, 'il primo riassunto non è partito');
  r.rilascia();
  await attendi(() => registro.statoCompattazione(sessionId)?.record && registro.statoCompattazione(sessionId).inCorso === false, 'il primo riassunto non si è chiuso');
  const primo = registro.statoCompattazione(sessionId).record;
  /* un altro giro grande: il riassunto di fine giro riparte, e resta appeso */
  registro.resume(sessionId, 'Ancora');
  const grande = [...storia];
  for (let i = 10; i < 16; i += 1) {
    grande.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${i}.txt` }) } }] });
    grande.push({ role: 'tool', tool_call_id: `call_${i}`, content: 'y'.repeat(3_000) });
  }
  grande.push({ role: 'assistant', content: 'Fatto di nuovo.' });
  g.tutti.at(-1).concludi(grande);
  await attendi(() => r.chiamate.length === 2, 'il secondo riassunto non è partito');
  assert.equal((await registro.annullaCompattazione(sessionId, primo.at)).ok, true);
  r.rilascia();
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === false, 'il secondo riassunto non si è chiuso');
  assert.equal(registro.statoCompattazione(sessionId).record, null, 'l’annullo resta: il riassunto partito prima non torna vivo');
});
