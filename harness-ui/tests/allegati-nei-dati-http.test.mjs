/*
 * Decisioni 43 e 47: il percorso intero sul server vero, con l'aiutante nativo vero: si carica, l'invio lega, il nucleo riceve l'elenco, il
 * chip legge per riferimento, un'altra chat no, una fork eredita, la chat si cancella col suo file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { creaArchivioAllegati } from '../src/allegati-dati.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const TOKEN = 'test-chat-file-token';

function sessioniFinte() {
  const ingressi = [];
  const attese = [];
  return {
    ingressi, attese,
    avviaSessioneFn: async (input) => {
      ingressi.push(input);
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${ingressi.length}` });
      return new Promise((risolvi) => { attese.push({ input, risolvi }); });
    },
    concludi(i = attese.length - 1) {
      const { input, risolvi } = attese[i];
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r', outcome: 'success' });
      risolvi({ esito: { messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'fatto' }] } });
    },
  };
}

async function banco(t, { conStore = false, clock } = {}) {
  /* `.native`: il percorso vero, come lo vedono il prodotto e Git. Sul runner di GitHub TEMP ha il nome corto 8.3 (`RUNNER~1`), e `realpathSync` di JavaScript lo lascia (ROSSO 4 della PR 91) */
  const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-allegati-http-')));
  const progetto = join(radice, 'progetto');
  mkdirSync(progetto);
  const finte = sessioniFinte();
  const archivioAllegati = creaArchivioAllegati({ cartella: join(radice, 'dati', 'allegati'), ...(clock ? { clock } : {}) });
  const sessionRegistry = createSessionRegistry({ avviaSessioneFn: finte.avviaSessioneFn, modello: 'test/model', chiave: 'test', archivioAllegati,
    ...(conStore ? { cartellaStore: join(radice, 'sessioni') } : {}),
    cartelleProgetto: [{ id: 'p1', nome: 'progetto', percorso: progetto }] });
  const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: () => {}, token: TOKEN, sessionRegistry, archivioAllegati }));
  await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
  t.after(async () => {
    finte.attese.forEach((_, i) => finte.concludi(i));
    await new Promise((risolvi) => setTimeout(risolvi, 30));
    await sessionRegistry.chiudi?.();
    server.closeAllConnections();
    await new Promise((risolvi) => server.close(risolvi));
    rimuoviCartellaDiProva(radice);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const intestazioni = { Origin: base, 'Sec-Fetch-Site': 'same-origin', Cookie: `talos_token=${TOKEN}` };
  const carica = async (nome = 'nota.txt', byte = Buffer.from('ciao')) => {
    const r = await fetch(`${base}/api/v1/chat-files`, { method: 'POST', body: byte, headers: { ...intestazioni, 'Content-Type': 'application/octet-stream', 'X-Talos-File-Name': encodeURIComponent(nome) } });
    return { status: r.status, ...(await r.json()) };
  };
  const caricaInSessione = (sessionId) => fetch(`${base}/api/v1/sessions/${sessionId}/chat-files`, { method: 'POST', body: Buffer.from('x'), headers: { ...intestazioni, 'Content-Type': 'application/octet-stream', 'X-Talos-File-Name': 'x.txt' } });
  const posta = (percorso, corpo) => fetch(`${base}${percorso}`, { method: 'POST', body: JSON.stringify(corpo), headers: { ...intestazioni, 'Content-Type': 'application/json' } });
  const leggi = (sessionId, allegatoId) => fetch(`${base}/api/v1/sessions/${sessionId}/allegati/${allegatoId}`, { headers: { Cookie: `talos_token=${TOKEN}` } });
  const avvia = async (consegna, allegati = []) => {
    const r = await posta('/api/v1/sessions/custom', { cartellaId: 'p1', consegna, ...(allegati.length ? { bolla: { testo: consegna.split('\n')[0], allegati } } : {}) });
    return { status: r.status, ...(await r.json()) };
  };
  return { radice, progetto, finte, archivioAllegati, sessionRegistry, carica, caricaInSessione, posta, leggi, avvia };
}
const chip = (data) => ({ tipo: 'file', nome: data.nome, percorso: data.percorso, allegatoId: data.allegatoId });

test('HTTP-01: si carica senza sessione né cartella, nel posto dei dati; progetto e git non si toccano; la ricevuta non dice il PC', async (t) => {
  const b = await banco(t);
  const { status, data } = await b.carica();
  assert.equal(status, 201);
  assert.deepEqual(Object.keys(data).sort(), ['allegatoId', 'bytes', 'nome', 'percorso', 'tipo']);
  assert.equal(data.percorso, `attachments/${data.allegatoId}/nota.txt`);
  assert.deepEqual(readdirSync(b.progetto), []);
  assert.ok(existsSync(join(b.radice, 'dati', 'allegati', data.allegatoId, 'allegati', 'nota.txt')));
});

test('HTTP-02: l invio lega, il nucleo riceve il nome corto e il percorso vero; il chip legge per riferimento', async (t) => {
  const b = await banco(t);
  const { data } = await b.carica();
  const { status, data: nata } = await b.avvia(`Leggi questo\n\nAttachments:\n- ${data.percorso}`, [chip(data)]);
  assert.equal(status, 200);
  const elenco = [...b.finte.ingressi[0].allegatiConversazioneFn()];
  assert.equal(elenco.length, 1);
  assert.equal(elenco[0].riferimento, data.percorso);
  assert.ok(elenco[0].percorso.startsWith(join(b.radice, 'dati', 'allegati')));
  const letto = await b.leggi(nata.sessionId, data.allegatoId);
  assert.equal(letto.status, 200);
  assert.equal(await letto.text(), 'ciao');
  assert.equal(letto.headers.get('x-content-type-options'), 'nosniff');
});

test('HTTP-02b: il PDF si apre in linea con la sua CSP; un file che non è un PDF no', async (t) => {
  const b = await banco(t);
  const pdf = (await b.carica('a.pdf', Buffer.from('%PDF-1.7 x'))).data;
  const testo = (await b.carica('b.txt', Buffer.from('ciao'))).data;
  const { data: nata } = await b.avvia('uno', [chip(pdf), chip(testo)]);
  const r = await b.leggi(nata.sessionId, `${pdf.allegatoId}/anteprima`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition'), /^inline/u);
  assert.equal(r.headers.get('content-security-policy'), "default-src 'none'; sandbox allow-scripts; object-src 'none'");
  assert.equal((await b.leggi(nata.sessionId, `${testo.allegatoId}/anteprima`)).status, 404);
});

test('HTTP-03: al contrario, il legame non nasce dal testo: un riferimento scritto o incollato non lega niente', async (t) => {
  const b = await banco(t);
  const { data } = await b.carica();
  const { data: nata } = await b.avvia(`Leggi ${data.percorso}`);
  assert.deepEqual([...b.finte.ingressi[0].allegatiConversazioneFn()], []);
  assert.equal((await b.leggi(nata.sessionId, data.allegatoId)).status, 409);
  assert.deepEqual(b.archivioAllegati.legamiDi(data.allegatoId), []);
});

test('HTTP-04: al contrario, l allegato di un altra chat ferma l invio prima che parta e non si legge da lì', async (t) => {
  const b = await banco(t);
  const { data } = await b.carica();
  const { data: prima } = await b.avvia('uno', [chip(data)]);
  const rifiutata = await b.avvia('due', [chip(data)]);
  assert.equal(rifiutata.status, 409);
  assert.equal(rifiutata.error.code, 'ATTACHMENT_NOT_AVAILABLE');
  assert.equal(b.finte.ingressi.length, 1, 'il giro non è partito');
  const inventato = await b.avvia('tre', [{ ...chip(data), allegatoId: 'f'.repeat(24) }]);
  assert.equal(inventato.status, 409);
  const { data: seconda } = await b.avvia('quattro');
  assert.equal((await b.leggi(seconda.sessionId, data.allegatoId)).status, 409);
  assert.equal((await b.leggi(prima.sessionId, 'non-un-id')).status, 404);
  const coda = await b.posta(`/api/v1/sessions/${seconda.sessionId}/queue`, { messaggio: 'cinque', bolla: { testo: 'cinque', allegati: [chip(data)] } });
  assert.equal(coda.status, 409);
});

test('HTTP-05: un messaggio accodato lega l allegato alla sua chat, e una seconda chat non ne vede niente', async (t) => {
  const b = await banco(t);
  const { data } = await b.carica();
  const { data: prima } = await b.avvia('uno');
  const { data: seconda } = await b.avvia('due');
  const coda = await b.posta(`/api/v1/sessions/${prima.sessionId}/queue`, { messaggio: `cinque\n- ${data.percorso}`, bolla: { testo: 'cinque', allegati: [chip(data)] } });
  assert.equal(coda.status, 200);
  assert.deepEqual(b.archivioAllegati.legamiDi(data.allegatoId), [prima.sessionId]);
  assert.equal([...b.finte.ingressi[0].allegatiConversazioneFn()].length, 1);
  assert.equal([...b.finte.ingressi[1].allegatiConversazioneFn()].length, 0);
  assert.equal((await b.leggi(seconda.sessionId, data.allegatoId)).status, 409);
});

test('HTTP-06: una fork eredita, una cancellazione porta via il file solo con l ultima chat che lo usa', async (t) => {
  const b = await banco(t);
  const { data } = await b.carica();
  const { data: prima } = await b.avvia('uno', [chip(data)]);
  b.finte.concludi(0);
  await new Promise((risolvi) => setImmediate(risolvi));
  await b.sessionRegistry.attendiFuoriDallaFinestra?.(prima.sessionId);
  const fork = b.sessionRegistry.forka(prima.sessionId);
  assert.ok(fork.sessionId, JSON.stringify(fork));
  await new Promise((risolvi) => setTimeout(risolvi, 50));
  assert.deepEqual(b.archivioAllegati.legamiDi(data.allegatoId), [prima.sessionId, fork.sessionId]);
  assert.equal((await b.leggi(fork.sessionId, data.allegatoId)).status, 200);
  const dove = b.archivioAllegati.percorsoDi(data.allegatoId);
  assert.deepEqual(await b.sessionRegistry.elimina(prima.sessionId), { ok: true });
  assert.ok(existsSync(dove), 'la fork lo usa ancora');
  b.finte.concludi(1);
  await new Promise((risolvi) => setImmediate(risolvi));
  await b.sessionRegistry.attendiFuoriDallaFinestra?.(fork.sessionId);
  assert.deepEqual(await b.sessionRegistry.elimina(fork.sessionId), { ok: true });
  assert.equal(existsSync(dove), false);
});

/* Revisione del blocco dati, BD4: dopo la partenza del messaggio nessun errore degli allegati fa cadere il server o rimanda un invio riuscito */
test('HTTP-07 (BD4): una fork con l archivio rotto non fa cadere il server', async (t) => {
  const b = await banco(t);
  const { data } = await b.carica();
  const { data: prima } = await b.avvia('uno', [chip(data)]);
  b.finte.concludi(0);
  await new Promise((risolvi) => setImmediate(risolvi));
  const rifiuti = [];
  const ascolta = (motivo) => rifiuti.push(motivo);
  process.on('unhandledRejection', ascolta);
  t.after(() => process.off('unhandledRejection', ascolta));
  b.archivioAllegati.eredita = async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); };
  const fork = b.sessionRegistry.forka(prima.sessionId);
  assert.ok(fork.sessionId);
  await new Promise((risolvi) => setTimeout(risolvi, 50));
  assert.deepEqual(rifiuti, []);
  assert.equal(b.archivioAllegati.legamiDi(data.allegatoId).length, 1);
});

test('HTTP-08 (BD4): un legame che non si scrive non trasforma un invio partito in un errore', async (t) => {
  const b = await banco(t);
  const { data } = await b.carica();
  b.archivioAllegati.lega = async () => { throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }); };
  const nata = await b.avvia('uno', [chip(data)]);
  assert.equal(nata.status, 200);
  assert.equal(b.finte.ingressi.length, 1);
});

test('HTTP-09 (BD6): all avvio un legame verso una chat sparita si scioglie e il file se ne va; quello di una chat vera resta', async (t) => {
  let adesso = 1_000_000;
  const b = await banco(t, { conStore: true, clock: () => adesso });
  await b.sessionRegistry.ripristina();
  const orfano = (await b.carica('a.txt')).data;
  const vero = (await b.carica('b.txt')).data;
  await b.archivioAllegati.lega('chat-sparita', [orfano.allegatoId]);
  const { data: nata } = await b.avvia('uno', [chip(vero)]);
  const dove = b.archivioAllegati.percorsoDi(orfano.allegatoId);
  adesso += 2 * 3_600_000;
  await b.sessionRegistry.riconciliaAllegati();
  assert.equal(existsSync(dove), false);
  assert.deepEqual(b.archivioAllegati.legamiDi(vero.allegatoId), [nata.sessionId]);
});

test('HTTP-10 (BD6): al contrario, se una sessione non si è letta non si scioglie niente', async (t) => {
  let adesso = 1_000_000;
  const b = await banco(t, { conStore: true, clock: () => adesso });
  mkdirSync(join(b.radice, 'sessioni'), { recursive: true });
  writeFileSync(join(b.radice, 'sessioni', 'rotta.jsonl'), 'non è un giornale\n');
  await b.sessionRegistry.ripristina();
  const { data } = await b.carica();
  await b.archivioAllegati.lega('chat-sparita', [data.allegatoId]);
  adesso += 2 * 3_600_000;
  await b.sessionRegistry.riconciliaAllegati();
  assert.ok(existsSync(b.archivioAllegati.percorsoDi(data.allegatoId)));
});

test('HTTP-11 (BD7): subito dopo una fork il suo invio può portare l allegato ereditato, senza aspettare l eredità', async (t) => {
  const b = await banco(t);
  const { data } = await b.carica();
  const { data: prima } = await b.avvia('uno', [chip(data)]);
  b.finte.concludi(0);
  await new Promise((risolvi) => setImmediate(risolvi));
  const fork = b.sessionRegistry.forka(prima.sessionId);
  assert.equal(await b.sessionRegistry.controllaAllegati(fork.sessionId, [data.allegatoId]), null);
});

test('HTTP-12 (BD21): la rotta vecchia con la sessione non c è più: niente scrive nel progetto da qui', async (t) => {
  const b = await banco(t);
  const { data: nata } = await b.avvia('uno');
  const r = await b.caricaInSessione(nata.sessionId);
  assert.equal(r.status, 404);
  assert.deepEqual(readdirSync(b.progetto), []);
});
