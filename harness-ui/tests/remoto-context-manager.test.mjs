import assert from 'node:assert/strict';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

/*
 * Context Manager dal dispositivo (`CONTRATTO-REMOTO-CONTEXT-MANAGER-2026-10-31.md`, 01/11/2026). Le rotte sono quelle che il PC chiama da `context-client.js`: qui l'elenco
 * chiuso, la forma degli id, il consenso nel ponte E nella rotta, fermare sempre ammesso, e `CTX_NOT_ENABLED` che arriva intatto.
 */
const DISP = 'dispositivo-A1';
const CORPO = { expectedRevision: 3, idempotencyKey: 'k-1' };
const C = '/api/v1/sessions/s1/context';

/* operazione → [argomenti, metodo, percorso, corpo atteso] */
const LETTURE = {
  'session.context.job': [{ sessionId: 's1', jobId: 'j-1' }, 'GET', `${C}/jobs/j-1`],
  'session.context.versions': [{ sessionId: 's1' }, 'GET', `${C}/versions`],
  'session.context.facts': [{ sessionId: 's1' }, 'GET', `${C}/facts`],
  'session.context.source': [{ sessionId: 's1', sourceId: 'message-12' }, 'GET', `${C}/sources/message-12`],
  'session.compaction-policy': [{ sessionId: 's1' }, 'GET', '/api/v1/sessions/s1/compaction-policy'],
  'session.compaction-state': [{ sessionId: 's1' }, 'GET', '/api/v1/sessions/s1/compaction-state'],
};
const SCRITTURE = {
  'session.context.job.start': [{ sessionId: 's1', corpo: { ...CORPO, kind: 'compact' } }, 'POST', `${C}/jobs`, { ...CORPO, kind: 'compact' }],
  'session.context.job.resume': [{ sessionId: 's1', jobId: 'j-1', corpo: CORPO }, 'POST', `${C}/jobs/j-1/resume`, CORPO],
  'session.context.version.restore': [{ sessionId: 's1', versionId: 'v-1', corpo: CORPO }, 'POST', `${C}/versions/v-1/restore`, CORPO],
  'session.context.fact.upsert': [{ sessionId: 's1', corpo: { ...CORPO, fact: { id: 'f-1', text: 'x' } } }, 'POST', `${C}/facts`, { ...CORPO, fact: { id: 'f-1', text: 'x' } }],
  'session.context.fact.remove': [{ sessionId: 's1', factId: 'f-1', corpo: CORPO }, 'DELETE', `${C}/facts/f-1`, CORPO],
  'session.context.fact.resolve': [{ sessionId: 's1', factId: 'f-1', corpo: { ...CORPO, accept: true } }, 'POST', `${C}/facts/f-1/resolve`, { ...CORPO, accept: true }],
};
const FERMA = { 'session.context.job.cancel': [{ sessionId: 's1', jobId: 'j-1', corpo: CORPO }, 'DELETE', `${C}/jobs/j-1`, CORPO] };

const contestoDi = () => ({ dispositivo: { id: DISP, nome: 'OnePlus Pad 3' }, iscrizioni: new Map(), iscrivi: () => async () => {} });

test('RCM-01 ogni operazione arriva alla SUA rotta col suo metodo e il corpo del dispositivo, e porta l\'identità del canale', async () => {
  const chiamate = [];
  const operazioni = creaOperazioni({ chiama: async (c) => { chiamate.push(c); return { stato: 200, dati: { ok: true } }; }, sessionRegistry: { elenca: () => [] }, iscriviConRigiocata });
  for (const [op, [args, metodo, percorso, corpo]] of Object.entries({ ...LETTURE, ...SCRITTURE, ...FERMA })) {
    assert.ok(operazioni.elenco().includes(op), `${op} non è nell'elenco`);
    chiamate.length = 0;
    await operazioni.esegui(op, args, contestoDi());
    assert.equal(chiamate.length, 1, op);
    assert.deepEqual([chiamate[0].metodo, chiamate[0].percorso, chiamate[0].corpo], [metodo, percorso, corpo], op);
    assert.equal(chiamate[0].origineRemota?.dispositivoId, DISP, op);
  }
});

test('RCM-02 col `factId` il fatto si modifica: PATCH sul suo percorso, come `upsertProtectedFact` del PC', async () => {
  const chiamate = [];
  const operazioni = creaOperazioni({ chiama: async (c) => { chiamate.push(c); return { stato: 200, dati: {} }; }, sessionRegistry: { elenca: () => [] }, iscriviConRigiocata });
  await operazioni.esegui('session.context.fact.upsert', { sessionId: 's1', factId: 'f-1', corpo: { ...CORPO, fact: { id: 'f-1', text: 'nuovo' } } }, contestoDi());
  assert.deepEqual([chiamate[0].metodo, chiamate[0].percorso], ['PATCH', `${C}/facts/f-1`]);
});

test('RCM-03 AL CONTRARIO: un id storto non diventa mai un pezzo di percorso (BAD_MESSAGE, nessuna chiamata)', async () => {
  const chiamate = [];
  const operazioni = creaOperazioni({ chiama: async (c) => { chiamate.push(c); return { dati: {} }; }, sessionRegistry: { elenca: () => [] }, iscriviConRigiocata });
  const lungo = 'x'.repeat(201);
  const storti = [
    ['session.context.job', { sessionId: 's1' }],
    ['session.context.job', { sessionId: 's1', jobId: '../settings' }],
    ['session.context.job', { sessionId: 's1', jobId: '..' }],
    ['session.context.job', { sessionId: 's1', jobId: lungo }],
    ['session.context.job.cancel', { sessionId: 's1', jobId: 'a/b', corpo: CORPO }],
    ['session.context.job.resume', { sessionId: 's1', jobId: 7, corpo: CORPO }],
    ['session.context.version.restore', { sessionId: 's1', versionId: 'v\\1', corpo: CORPO }],
    ['session.context.fact.upsert', { sessionId: 's1', factId: '', corpo: CORPO }],
    ['session.context.fact.remove', { sessionId: 's1', corpo: CORPO }],
    ['session.context.fact.resolve', { sessionId: 's1', factId: 'a/b', corpo: CORPO }],
    ['session.context.source', { sessionId: 's1', sourceId: '../../x' }],
    ['session.context.job.start', { sessionId: 's1', corpo: [] }],
    ['session.compaction-policy', { sessionId: '..' }],
    ['session.compaction-state', {}],
  ];
  for (const [op, args] of storti) await assert.rejects(operazioni.esegui(op, args, contestoDi()), { code: 'BAD_MESSAGE' }, `${op} ${JSON.stringify(args)}`);
  assert.equal(chiamate.length, 0, '⛔ un id storto è arrivato al PC');
});

function banco({ contextService = null, registro = {} } = {}) {
  const radice = cartellaDiProva('talos-remoto-cm-');
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return realpathSync(p); };
  const avm = crea('progetti', 'AVM');
  const dati = crea('dati');
  const sessionRegistry = {
    cartellePiuUsate: () => [{ percorso: avm, conteggio: 1, ultimaVolta: '2026-11-01T10:00:00.000Z' }],
    elenca: () => [{ sessionId: 's1', titolo: 's1' }],
    esiste: (id) => id === 's1',
    async cartellaPerChatFile(id) { return id === 's1' ? { ok: true, cartella: avm } : { code: 'NOT_FOUND', reason: 'session-not-found' }; },
    politicaCompattazione: () => ({ numero: 1, soglia: 0.75 }),
    statoCompattazione: () => ({ compattazioni: [] }),
    ...registro,
  };
  const cartelle = creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
    sessionRegistry, cartelleAmmesse: [], cartelleEscluse: [dati] });
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry, contextService, remotoFn: () => ({ cartelle }) });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const passate = []; // ciò che il ponte ha lasciato arrivare alla rotta
  const operazioni = creaOperazioni({ chiama: (c) => { passate.push(c); return chiama(c); }, sessionRegistry, iscriviConRigiocata, cartelle });
  const dalDispositivo = (metodo, percorso, corpo) => chiama({ metodo, percorso, corpo, origine: 'telefono', origineRemota: { tipo: 'telefono', nome: 'X', dispositivoId: DISP } });
  return { avm, cartelle, operazioni, chiama, passate, dalDispositivo, pc: (metodo, percorso, corpo) => chiama({ metodo, percorso, corpo, origine: 'pc' }) };
}
const servizioFinto = () => {
  const fatte = [];
  return { fatte, contextService: { request: async ({ method, path, body }) => { fatte.push([method, path, body]); return { ok: true, path }; } } };
};

test('RCM-04 senza il consenso le scritture sono CONSENT_REQUIRED dal ponte e dalla rotta; fermare un lavoro passa da tutti e due', async () => {
  const { fatte, contextService } = servizioFinto();
  const b = banco({ contextService });
  for (const [op, [args, metodo, percorso, corpo]] of Object.entries(SCRITTURE)) {
    await assert.rejects(b.operazioni.esegui(op, args, contestoDi()), (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403 && e.params?.nome === 'AVM', op);
    assert.deepEqual(b.passate, [], `${op}: il ponte si ferma da sé, prima della rotta`);
    await assert.rejects(b.dalDispositivo(metodo, percorso, corpo), (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403, `rotta ${op}`);
  }
  assert.deepEqual(fatte, [], '⛔ il PC ha scritto senza consenso');
  await b.operazioni.esegui('session.context.job.cancel', FERMA['session.context.job.cancel'][0], contestoDi());
  await b.dalDispositivo('DELETE', `${C}/jobs/j-2`, CORPO);
  assert.deepEqual(fatte.map(([m, p]) => [m, p]), [['DELETE', '/jobs/j-1'], ['DELETE', '/jobs/j-2']]);
});

test('RCM-05 l\'eccezione del «fermare» è stretta: solo la DELETE di un lavoro, non la sua ripresa né un percorso che ci somiglia', async () => {
  const { fatte, contextService } = servizioFinto();
  const b = banco({ contextService });
  for (const [metodo, percorso] of [['POST', `${C}/jobs/j-1`], ['POST', `${C}/jobs/j-1/resume`], ['DELETE', `${C}/facts/j-1`], ['DELETE', `${C}/jobs/j-1/resume`], ['DELETE', `${C}/jobs/`]]) {
    await assert.rejects(b.dalDispositivo(metodo, percorso, CORPO), (e) => e.code === 'CONSENT_REQUIRED', `${metodo} ${percorso}`);
  }
  assert.deepEqual(fatte, []);
});

test('RCM-06 col consenso le scritture arrivano al servizio del contesto col loro corpo', async () => {
  const { fatte, contextService } = servizioFinto();
  const b = banco({ contextService });
  await b.pc('POST', `/api/v1/remote/phones/${DISP}/folders`, { percorso: b.avm });
  for (const [op, [args]] of Object.entries(SCRITTURE)) await b.operazioni.esegui(op, args, contestoDi());
  assert.deepEqual(fatte.map(([m, p]) => `${m} ${p}`), ['POST /jobs', 'POST /jobs/j-1/resume', 'POST /versions/v-1/restore', 'POST /facts', 'DELETE /facts/f-1', 'POST /facts/f-1/resolve']);
  assert.deepEqual(fatte[0][2], SCRITTURE['session.context.job.start'][3]);
});

test('RCM-07 senza servizio del contesto: `CTX_NOT_ENABLED` intatto sulle 11 del motore, e le due del registro rispondono', async () => {
  const b = banco();
  await b.pc('POST', `/api/v1/remote/phones/${DISP}/folders`, { percorso: b.avm });
  const delMotore = Object.entries({ ...LETTURE, ...SCRITTURE, ...FERMA }).filter(([op]) => op.startsWith('session.context.'));
  assert.equal(delMotore.length, 11);
  for (const [op, [args]] of delMotore) await assert.rejects(b.operazioni.esegui(op, args, contestoDi()), (e) => e.code === 'CTX_NOT_ENABLED', op);
  assert.equal((await b.operazioni.esegui('session.compaction-policy', { sessionId: 's1' }, contestoDi())).numero, 1);
  assert.ok(await b.operazioni.esegui('session.compaction-state', { sessionId: 's1' }, contestoDi()));
});

/*
 * Revisione del blocco 25, R2 (forma `FORMA-REV25-R2-FONTE-COL-CONSENSO-2026-11-01.md`, approvata da Mobile, CLI e Performance): una fonte dell'archivio del motore
 *   (`message-1` è il prompt di sistema) dal dispositivo passa dal consenso della cartella PRIMA di leggere il record, ed esce oscurata; dalla finestra del PC resta intera.
 *   La TABELLA qui sotto è quella del contratto (in fondo alla forma R2): ogni lettura del ponte che porta testo archiviato o riassunto, con la sua regola. Ognuna si prova
 *   nel verso in cui la regola NON la ferma: chi ha «consenso: no» deve passare senza consenso col testo com'è, chi ha «consenso: sì» deve fermarsi senza consenso, e chi
 *   ha «oscurata: no» deve arrivare col segreto intero, così la tabella non può dire una cosa e il codice un'altra.
 */
const SEGRETO = `sk-or-v1-${'0123456789abcdef'.repeat(4)}`;
const OSCURATO = '[redacted]';
const archivioFinto = ({ fonte = null } = {}) => {
  const fatte = [];
  const contextService = { request: async ({ method, path }) => {
    fatte.push([method, path]);
    if (path.startsWith('/sources/')) return { source: fonte ?? { id: path.slice(9), message: { role: 'system', content: `You are TALOS. Memory: ${SEGRETO}` }, [`chiave ${SEGRETO}`]: 1 } };
    if (path === '/') return { activeVersion: { summary: { text: `riassunto ${SEGRETO}` } }, facts: [], jobs: [] };
    if (path === '/versions') return { versions: [{ id: 'v-1', summary: { text: `riassunto ${SEGRETO}` } }] };
    if (path === '/facts') return { facts: [{ id: 'f-1', text: `fatto ${SEGRETO}` }] };
    if (path.startsWith('/jobs/')) return { job: { id: 'j-1', state: 'failed', error: { message: `uscita ${SEGRETO}` } } };
    return {};
  } };
  return { fatte, contextService };
};
const registroCoiSegreti = {
  leggiUltimaRichiesta: (id) => (id === 's1' ? { at: 1, messages: [{ role: 'system', content: `rules ${SEGRETO}` }] } : undefined),
  statoCompattazione: () => ({ compattazioni: [{ riassunto: `riassunto ${SEGRETO}`, indice: [] }] }),
};
const consenti = (b) => b.pc('POST', `/api/v1/remote/phones/${DISP}/folders`, { percorso: b.avm });
const ultimaRichiestaDalPonte = async (b) => {
  const elenco = await b.operazioni.esegui('session.last-request', { sessionId: 's1' }, contestoDi());
  return [elenco, await b.operazioni.esegui('session.last-request.message', { sessionId: 's1', impronta: elenco.impronta, indice: 0, daByte: 0, quantiByte: 4_096 }, contestoDi())];
};
/* operazione → [come la si legge dal ponte, consenso, oscurata, letta dal servizio del contesto (null = dal registro)] */
const TABELLA_R2 = {
  'session.context.source': [(b) => b.operazioni.esegui('session.context.source', { sessionId: 's1', sourceId: 'message-1' }, contestoDi()), true, true, 'GET /sources/message-1'],
  'session.last-request + .message': [ultimaRichiestaDalPonte, true, true, null],
  'session.context': [(b) => b.operazioni.esegui('session.context', { sessionId: 's1' }, contestoDi()), false, false, 'GET /'],
  'session.context.versions': [(b) => b.operazioni.esegui('session.context.versions', { sessionId: 's1' }, contestoDi()), false, false, 'GET /versions'],
  'session.context.job': [(b) => b.operazioni.esegui('session.context.job', { sessionId: 's1', jobId: 'j-1' }, contestoDi()), false, false, 'GET /jobs/j-1'],
  'session.context.facts': [(b) => b.operazioni.esegui('session.context.facts', { sessionId: 's1' }, contestoDi()), false, false, 'GET /facts'],
  /* Condizione del Mobile (01/11/2026 sera): «no consenso» vale solo se chi scrive il riassunto riceve gli stessi messaggi del trascritto. Nella compattazione semplice
     NON è così: la richiesta di riassunto porta in testa i `system` iniziali — prompt di sistema, contesto del progetto, memoria (`compattazione-desktop.mjs:594-596`
     `dividiPerCompattazione` testa, `:880-883` `costruisciRichiestaDiRiassunto`, `:906-916` la forma per la cache col prefisso intero; prova RIASSUNTORE-LEGACY qui sotto).
     ⇒ riassunto e indice della compattazione semplice passano a «consenso + oscurata», come la fonte. Il motore del contesto invece li toglie (prova nel motore). */
  'session.compaction-state': [(b) => b.operazioni.esegui('session.compaction-state', { sessionId: 's1' }, contestoDi()), true, true, null],
};

test('RCM-08 R2: senza consenso la fonte è CONSENT_REQUIRED con la cartella, dal ponte E dalla rotta, e il record non si legge nemmeno', async () => {
  const { fatte, contextService } = archivioFinto();
  const b = banco({ contextService, registro: registroCoiSegreti });
  await assert.rejects(b.operazioni.esegui('session.context.source', { sessionId: 's1', sourceId: 'message-1' }, contestoDi()),
    (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403 && e.params?.nome === 'AVM' && typeof e.params?.cartellaId === 'string' && e.params.cartellaId !== '');
  assert.deepEqual(b.passate, [], 'il ponte si ferma da sé, prima della rotta');
  /* la rotta da sola (una chiamata in processo che non passa da `operazioni`): stesso rifiuto */
  await assert.rejects(b.dalDispositivo('GET', `${C}/sources/message-1`), (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403);
  assert.deepEqual(fatte, [], '⛔ il record è stato letto prima del consenso (Performance: il consenso si guarda PRIMA)');
});

test('RCM-09 R2: col consenso la fonte esce oscurata (anche nelle chiavi), dal ponte e da una chiamata in processo con origine remota; dal PC resta intera', async () => {
  const { contextService } = archivioFinto();
  const b = banco({ contextService, registro: registroCoiSegreti });
  await consenti(b);
  for (const [come, leggi] of [
    ['ponte', () => b.operazioni.esegui('session.context.source', { sessionId: 's1', sourceId: 'message-1' }, contestoDi())],
    /* nessuna req HTTP vera: la chiamata in processo, come quella della CLI che ospita il ponte. L'oscuramento segue l'origine, non il trasporto */
    ['in processo, origine remota', async () => (await b.dalDispositivo('GET', `${C}/sources/message-1`)).dati],
  ]) {
    const testo = JSON.stringify(await leggi());
    assert.ok(!testo.includes(SEGRETO), `${come}: ⛔ segreto in chiaro: ${testo.slice(0, 160)}`);
    assert.ok(testo.includes(OSCURATO) && testo.includes('You are TALOS. Memory:'), `${come}: oscurata, non svuotata: ${testo.slice(0, 160)}`);
  }
  const dalPc = JSON.stringify((await b.pc('GET', `${C}/sources/message-1`)).dati);
  assert.ok(dalPc.includes(SEGRETO), 'AL CONTRARIO: dalla finestra del PC la persona vede i suoi originali, interi');
});

test('RCM-10 R2: il nega vince e vale SUBITO — revocata la cartella, la lettura dopo è CONSENT_REQUIRED e il record non si legge', async () => {
  const { fatte, contextService } = archivioFinto();
  const b = banco({ contextService, registro: registroCoiSegreti });
  await consenti(b);
  await b.operazioni.esegui('session.context.source', { sessionId: 's1', sourceId: 'message-1' }, contestoDi());
  const { cartellaId } = await b.cartelle.descrivi(b.avm);
  await b.cartelle.revoca(DISP, cartellaId);
  const lette = fatte.length;
  await assert.rejects(b.operazioni.esegui('session.context.source', { sessionId: 's1', sourceId: 'message-2' }, contestoDi()), { code: 'CONSENT_REQUIRED' });
  await assert.rejects(b.dalDispositivo('GET', `${C}/sources/message-2`), { code: 'CONSENT_REQUIRED' });
  assert.equal(fatte.length, lette, '⛔ dopo la revoca il record è stato letto');
});

test('RCM-11 R2: una fonte che non sta sul filo è TOO_LARGE (413), mai tagliata in silenzio; dal PC si legge intera', async () => {
  const grande = { id: 'message-3', message: { role: 'tool', content: 'x'.repeat(1_200_000) } };
  const b = banco({ contextService: archivioFinto({ fonte: grande }).contextService, registro: registroCoiSegreti });
  await consenti(b);
  await assert.rejects(b.operazioni.esegui('session.context.source', { sessionId: 's1', sourceId: 'message-3' }, contestoDi()),
    (e) => e.code === 'TOO_LARGE' && e.stato === 413 && e.message === 'A message cannot exceed 1048576 bytes.');
  assert.equal((await b.pc('GET', `${C}/sources/message-3`)).dati.source.message.content.length, 1_200_000);
  /* appena sotto il filo passa, e intera */
  const sotto = { id: 'message-4', message: { role: 'tool', content: 'y'.repeat(900_000) } };
  const b2 = banco({ contextService: archivioFinto({ fonte: sotto }).contextService, registro: registroCoiSegreti });
  await consenti(b2);
  assert.equal((await b2.operazioni.esegui('session.context.source', { sessionId: 's1', sourceId: 'message-4' }, contestoDi())).source.message.content.length, 900_000);
});

test('RCM-12 R2, la TABELLA del contratto: ogni lettura di testo archiviato o riassunto, nel verso in cui la sua regola non la ferma', async () => {
  for (const [op, [leggi, consenso, oscurata, letta]] of Object.entries(TABELLA_R2)) {
    const { fatte, contextService } = archivioFinto();
    const b = banco({ contextService, registro: registroCoiSegreti });
    if (consenso) {
      await assert.rejects(leggi(b), (e) => e.code === 'CONSENT_REQUIRED' && e.params?.nome === 'AVM', `${op}: consenso «sì», ma passa senza`);
      assert.deepEqual(fatte, [], `${op}: letto prima del consenso`);
      assert.deepEqual(b.passate, [], `${op}: il ponte si ferma da sé, prima della rotta, con la cartella per il dispositivo`);
    } else {
      const testo = JSON.stringify(await leggi(b));
      assert.ok(testo.includes(SEGRETO), `${op}: la tabella dice «consenso: no, oscurata: no», e senza consenso deve arrivare com'è: ${testo.slice(0, 120)}`);
      if (letta) assert.deepEqual(fatte.map(([m, p]) => `${m} ${p}`), [letta], op);
    }
    await consenti(b);
    const testo = JSON.stringify(await leggi(b));
    assert.equal(testo.includes(SEGRETO), !oscurata, `${op}: oscurata «${oscurata ? 'sì' : 'no'}» ma ${testo.slice(0, 120)}`);
    if (oscurata) assert.ok(testo.includes(OSCURATO), `${op}: oscurata, non svuotata`);
  }
});

/* Condizione del Mobile (01/11/2026 sera), la strada della compattazione semplice: CHI SCRIVE IL RIASSUNTO riceve il prompt di sistema, il contesto del progetto e la
   memoria (i `system` iniziali). Questa prova fissa il fatto che giustifica «consenso + oscurata» su `session.compaction-state`: se un giorno il riassuntore smettesse di
   riceverli, questa diventa rossa e la riga della tabella si può ridiscutere — mai il contrario in silenzio. */
test('RIASSUNTORE-LEGACY: la richiesta di riassunto della compattazione semplice porta il prompt di sistema (nelle due forme)', async () => {
  const { dividiPerCompattazione, costruisciRichiestaDiRiassunto, richiestaDiRiassuntoSicuraPerCache } = await import('../src/kernel/compattazione-desktop.mjs');
  const SEGNAPOSTO = 'SEGNAPOSTO-DEL-PROMPT-DI-SISTEMA-7f3a';
  const storia = [{ role: 'system', content: `You are TALOS. ${SEGNAPOSTO}` }, { role: 'system', content: 'Memory: the person likes tabs.' }];
  for (let i = 0; i < 14; i += 1) storia.push({ role: 'user', content: `domanda ${i} ${'parola '.repeat(40)}` }, { role: 'assistant', content: `risposta ${i} ${'parola '.repeat(40)}` });
  const { testa, mezzo } = dividiPerCompattazione(storia);
  assert.ok(mezzo.length > 0, 'controllo positivo: c\'è un tratto da riassumere');
  assert.ok(JSON.stringify(costruisciRichiestaDiRiassunto({ testa, mezzo })).includes(SEGNAPOSTO), 'forma di sempre');
  const perLaCache = richiestaDiRiassuntoSicuraPerCache({ testa, mezzo, attrezzi: [{ type: 'function', function: { name: 'read' } }], finestraToken: 200_000, maxOutputTokens: 4_000 });
  assert.ok(perLaCache && JSON.stringify(perLaCache).includes(SEGNAPOSTO), 'forma per la cache');
});

test('RCM-13 condizione del Mobile: riassunto e indice della compattazione semplice dalla ROTTA — senza consenso CONSENT_REQUIRED, col consenso oscurati, dal PC interi', async () => {
  const b = banco({ contextService: archivioFinto().contextService, registro: registroCoiSegreti });
  await assert.rejects(b.dalDispositivo('GET', '/api/v1/sessions/s1/compaction-state'), (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403);
  await consenti(b);
  const dalDispositivo = JSON.stringify((await b.dalDispositivo('GET', '/api/v1/sessions/s1/compaction-state')).dati);
  assert.ok(!dalDispositivo.includes(SEGRETO) && dalDispositivo.includes(OSCURATO), dalDispositivo.slice(0, 160));
  assert.ok(JSON.stringify((await b.pc('GET', '/api/v1/sessions/s1/compaction-state')).dati).includes(SEGRETO), 'AL CONTRARIO: il PC li legge interi');
});
