import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

import { MAX_DEVICE_FILE_BYTES } from '../src/chat-file-upload.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { sanificaNomeLibreria } from '../src/library-store.mjs';
import { creaFileDeiDispositivi } from '../src/remoto/file-dispositivi.mjs';
import { STATI_DEI_RIFIUTI, creaOperazioni, senzaPercorsiAssoluti } from '../src/remoto/operazioni.mjs';
import { nomeSicuroDiEsportazione } from '../src/research/esportazioni.mjs';

/*
 * Parità remoto (censimento C1 e C3, forma col Mobile del 31/10/2026): la Libreria di una sessione del PC dal dispositivo, e l'esportazione di una ricerca. Elenco e versioni
 *   liberi, senza percorsi; il contenuto, rinominare e ripristinare col consenso; eliminare toglie la voce con le sue versioni, e vuole anche la carta. I byte passano dallo
 *   scambio di file: un'offerta per quel dispositivo, e file.read. Rivela e apri restano fuori: agiscono sullo schermo del PC.
 */
const DISP = 'dispositivo-A1';
const contesto = { dispositivo: { id: DISP, nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
const BASE = '/api/v1/sessions/s1/library';

function banco(t, { consentita = true, risposte = {}, ricerca = null, rifiuto = null, senzaCartelle = false, vitaCopiaMs, bloccate = [], nomeVoce = 'nota.md', dirBase = null } = {}) {
  /* `.native`: il percorso vero, come lo vedono il prodotto e Git. Sul runner di GitHub TEMP ha il nome corto 8.3 (`RUNNER~1`), e `realpathSync` di JavaScript lo lascia (ROSSO 4 della PR 91) — il blocco si salva già col percorso vero (`src/remoto/cartelle-dispositivi.mjs`). `dirBase` resta com'è: COPIE-06 e COPIE-07 provano apposta la giunzione e il nome corto */
  const dir = dirBase ?? realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-libreria-ponte-')));
  if (!dirBase) t.after(() => rimuoviCartellaDiProva(dir));
  const progetto = join(dir, 'progetto');
  mkdirSync(progetto, { recursive: true });
  const sessionRegistry = {
    elenca: () => [], esiste: () => true,
    async cartellaPerChatFile() { return { ok: true, cartella: progetto }; },
    async scaricaVoceLibreria(_s, voceId) { if (rifiuto) return rifiuto; return voceId === 'v1' || voceId === 'v2' ? { ok: true, nome: nomeVoce, bytes: Buffer.from(`# la nota vera ${voceId}`) } : { erroreAvvio: 'no', code: 'LIBRARY_NOT_FOUND' }; },
    async leggiRicerca() { if (rifiuto) return rifiuto; return ricerca ? { ricerca } : { ricerca: null }; },
    async elencaVersioniLibreria() { return { ok: true, versioni: [], totale: 0 }; },
  };
  const scambio = join(dir, 'file-dispositivi');
  const file = creaFileDeiDispositivi({ cartella: scambio, sessionRegistry, bloccateDi: async () => bloccate, ...(vitaCopiaMs ? { vitaCopiaMs } : {}) });
  const chiamate = [];
  const chiama = async (c) => { chiamate.push(c); return { stato: 200, dati: risposte[c.percorso] ?? { ok: true } }; };
  const cartelle = { consentita: async () => consentita, descrivi: async () => ({ nome: 'progetto' }), elenco: async () => [] };
  const copie = () => { try { return readdirSync(join(scambio, 'dati-offerti')); } catch { return []; } };
  const registrate = () => (JSON.parse(readFileSync(join(scambio, 'offerte.json'), 'utf8')).offerte ?? []).length;
  return { cartelle, chiamate, copie, file, progetto, registrate, scambio, sessionRegistry, operazioni: creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle: senzaCartelle ? undefined : cartelle, file, bloccateDi: async () => bloccate }) };
}
const leggi = (operazioni, o) => operazioni.esegui('file.read', { sessionId: 's1', fileId: o.fileId, versione: o.versione, da: 0, quanti: 1024 }, contesto);

test('LIBRERIA-PONTE-01 elenco e versioni sono liberi, e la cartella del PC non esce: né percorso né cartella', async (t) => {
  const voci = { voci: [{ id: 'v1', nome: 'Nota', cartella: 'C:\\Users\\persona\\progetto', percorso: 'C:\\Users\\persona\\progetto\\.harness-ui-library\\v1\\nota.md' }], errore: null };
  const { chiamate, operazioni } = banco(t, { consentita: false, risposte: { [BASE]: voci } });
  const elenco = await operazioni.esegui('session.library.list', { sessionId: 's1' }, contesto);
  assert.deepEqual(elenco.voci, [{ id: 'v1', nome: 'Nota' }]);
  await operazioni.esegui('session.library.versions', { sessionId: 's1', voceId: 'v1' }, contesto);
  assert.deepEqual(chiamate.map((c) => [c.metodo, c.percorso]), [['GET', BASE], ['GET', `${BASE}/v1/versions`]]);
});

test('LIBRERIA-PONTE-02 il contenuto, rinominare, ripristinare ed eliminare vogliono il consenso', async (t) => {
  const { chiamate, operazioni } = banco(t, { consentita: false });
  for (const [op, args] of [['fetch', {}], ['rename', { corpo: { nome: 'x' } }], ['restore', { versione: 'v-1' }], ['delete', { confermata: true }]]) {
    await assert.rejects(operazioni.esegui(`session.library.${op}`, { sessionId: 's1', voceId: 'v1', ...args }, contesto), { code: 'CONSENT_REQUIRED' }, op);
  }
  assert.equal(chiamate.length, 0);
});

test('LIBRERIA-PONTE-03 eliminare vuole anche la carta: toglie la voce con tutte le sue versioni', async (t) => {
  const { chiamate, operazioni } = banco(t);
  await assert.rejects(operazioni.esegui('session.library.delete', { sessionId: 's1', voceId: 'v1' }, contesto), { code: 'CONFIRMATION_REQUIRED' });
  assert.equal(chiamate.length, 0);
  await operazioni.esegui('session.library.delete', { sessionId: 's1', voceId: 'v1', confermata: true }, contesto);
  await operazioni.esegui('session.library.rename', { sessionId: 's1', voceId: 'v1', corpo: { nome: 'Nuovo' } }, contesto);
  await operazioni.esegui('session.library.restore', { sessionId: 's1', voceId: 'v1', versione: 'v-1' }, contesto);
  assert.deepEqual(chiamate.map((c) => [c.metodo, c.percorso, c.corpo]), [['DELETE', `${BASE}/v1`, undefined], ['PATCH', `${BASE}/v1`, { nome: 'Nuovo' }], ['POST', `${BASE}/v1/versions/v-1/restore`, {}]]);
});

test('LIBRERIA-PONTE-04 un id storto non diventa mai un pezzo di percorso', async (t) => {
  const { chiamate, operazioni } = banco(t);
  for (const voceId of ['../x', 'a/b', '', 7, undefined, '.nascosto', 'a'.repeat(129)]) {
    for (const op of ['versions', 'fetch', 'delete']) await assert.rejects(operazioni.esegui(`session.library.${op}`, { sessionId: 's1', voceId, confermata: true }, contesto), { code: 'BAD_MESSAGE' }, `${op} ${voceId}`);
  }
  await assert.rejects(operazioni.esegui('session.library.restore', { sessionId: 's1', voceId: 'v1', versione: '../x' }, contesto), { code: 'BAD_MESSAGE' });
  assert.equal(chiamate.length, 0);
});

test('LIBRERIA-PONTE-05 il contenuto di una voce arriva con un file.read vero, e la voce sta fuori dalla cartella della sessione', async (t) => {
  const { operazioni } = banco(t);
  const offerta = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  assert.equal(offerta.nome, 'nota.md');
  assert.match(offerta.sha256, /^[0-9a-f]{64}$/u);
  const letta = await operazioni.esegui('file.read', { sessionId: 's1', fileId: offerta.fileId, versione: offerta.versione, da: 0, quanti: 1024 }, contesto);
  assert.equal(Buffer.from(letta.dati, 'base64url').toString(), '# la nota vera v1');
  assert.equal(letta.fine, true);
});

test('LIBRERIA-PONTE-06 rimandare la stessa voce sostituisce la copia, non ne accumula: quella vecchia non si legge più', async (t) => {
  const { copie, operazioni, registrate } = banco(t);
  const prima = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  const dopo = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  assert.notEqual(dopo.fileId, prima.fileId);
  await assert.rejects(operazioni.esegui('file.read', { sessionId: 's1', fileId: prima.fileId, versione: prima.versione, da: 0, quanti: 10 }, contesto), { code: 'FILE_GONE' });
  assert.equal(registrate(), 1, 'la vecchia offerta non resta nel registro');
  assert.equal(copie().length, 1);
});

test('LIBRERIA-PONTE-08 una voce oltre il tetto dello scambio non si offre', async (t) => {
  const { copie, file } = banco(t);
  await assert.rejects(file.offriDati({ sessionId: 's1', dispositivoId: DISP, chiave: 'libreria/g', nome: 'grande.bin', bytes: Buffer.alloc(MAX_DEVICE_FILE_BYTES + 1) }), { code: 'FILE_TOO_LARGE' });
  assert.equal(copie().length, 0);
});

test('LIBRERIA-PONTE-07 una voce che non c è più lo dice con l errore del PC', async (t) => {
  const { operazioni } = banco(t);
  await assert.rejects(operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'sparita' }, contesto), { code: 'LIBRARY_NOT_FOUND' });
});

test('LIBRERIA-PONTE-09 un PC senza consenso delle cartelle non offre nessuna scrittura: né elenco né rotta', async (t) => {
  const { chiamate, operazioni } = banco(t, { senzaCartelle: true });
  const voci = ['session.library.rename', 'session.library.restore', 'session.library.delete', 'session.library.fetch', 'session.research.resume', 'session.research.recheck', 'session.research.delete'];
  for (const op of voci) {
    assert.equal(operazioni.elenco().includes(op), false, op);
    await assert.rejects(operazioni.esegui(op, { sessionId: 's1', voceId: 'v1', ricercaId: 'r1', versione: 'v-1', confermata: true, corpo: { nome: 'x' } }, contesto), { code: 'UNKNOWN_OPERATION', reason: 'no-folder-consent' }, op);
  }
  assert.equal(chiamate.length, 0);
  assert.equal(operazioni.elenco().includes('session.library.list'), true, 'leggere resta');
  assert.equal(operazioni.elenco().includes('session.research.get'), true);
});

test('LIBRERIA-PONTE-10 la copia muore a scarico finito: un file.read dopo la fine dice che non c è più', async (t) => {
  const { copie, operazioni, registrate } = banco(t);
  const o = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  assert.equal(copie().length, 1);
  const letta = await operazioni.esegui('file.read', { sessionId: 's1', fileId: o.fileId, versione: o.versione, da: 0, quanti: 1024 }, contesto);
  assert.equal(letta.fine, true);
  assert.equal(copie().length, 0, 'scaricata, sul PC non resta');
  assert.equal(registrate(), 0);
  await assert.rejects(operazioni.esegui('file.read', { sessionId: 's1', fileId: o.fileId, versione: o.versione, da: 0, quanti: 1024 }, contesto), { code: 'FILE_GONE' });
});

test('LIBRERIA-PONTE-11 eliminare una voce toglie anche la copia offerta, a ogni dispositivo: il contenuto non sopravvive', async (t) => {
  const { copie, operazioni } = banco(t);
  const altro = { ...contesto, dispositivo: { id: 'dispositivo-B2', nome: 'Telefono' } };
  const mia = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, altro);
  const restaAltra = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v2' }, contesto);
  await operazioni.esegui('session.library.delete', { sessionId: 's1', voceId: 'v1', confermata: true }, contesto);
  assert.equal(copie().length, 1, 'resta solo la voce non eliminata');
  await assert.rejects(operazioni.esegui('file.read', { sessionId: 's1', fileId: mia.fileId, versione: mia.versione, da: 0, quanti: 10 }, contesto), { code: 'FILE_GONE' });
  const letta = await operazioni.esegui('file.read', { sessionId: 's1', fileId: restaAltra.fileId, versione: restaAltra.versione, da: 0, quanti: 1024 }, contesto);
  assert.equal(Buffer.from(letta.dati, 'base64url').toString(), '# la nota vera v2');
});

test('LIBRERIA-PONTE-12 ripristinare una versione toglie la copia vecchia', async (t) => {
  const { copie, operazioni } = banco(t);
  await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  await operazioni.esegui('session.library.restore', { sessionId: 's1', voceId: 'v1', versione: 'v-1' }, contesto);
  assert.equal(copie().length, 0);
});

test('LIBRERIA-PONTE-13 la copia muore col dispositivo dimenticato, con la conversazione e al riavvio', async (t) => {
  const b = banco(t);
  await b.operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  await b.file.dimenticaDispositivo(DISP);
  assert.equal(b.copie().length, 0, 'dispositivo dimenticato');

  await b.operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  b.sessionRegistry.esiste = () => false;
  b.file.offerte('s1');
  assert.equal(b.copie().length, 0, 'conversazione cancellata');
  b.sessionRegistry.esiste = () => true;

  await b.operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  const riavviato = creaFileDeiDispositivi({ cartella: b.scambio, sessionRegistry: b.sessionRegistry });
  assert.equal(b.copie().length, 0, 'riavvio');
  assert.equal(existsSync(join(b.scambio, 'dati-offerti')), false);
  assert.equal(b.registrate(), 0, 'e il registro sul disco non la porta più');
  assert.deepEqual(riavviato.offerte('s1'), []);
});

test('LIBRERIA-PONTE-14 due voci con lo stesso nome non si tolgono la copia a vicenda', async (t) => {
  const { operazioni } = banco(t);
  const prima = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  const seconda = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v2' }, contesto);
  assert.equal(prima.nome, seconda.nome);
  const letta = await operazioni.esegui('file.read', { sessionId: 's1', fileId: prima.fileId, versione: prima.versione, da: 0, quanti: 1024 }, contesto);
  assert.equal(Buffer.from(letta.dati, 'base64url').toString(), '# la nota vera v1');
});

test('LIBRERIA-PONTE-15 una copia per il dispositivo non è un file mandato: fuori da file.list, dalle offerte in attesa e dalla finestra, anche a lettura interrotta', async (t) => {
  const { file, operazioni } = banco(t);
  const visti = [];
  file.ascoltaOfferte((o) => visti.push(o));
  const bytes = Buffer.alloc(70_000, 7);
  const o = await file.offriDati({ sessionId: 's1', dispositivoId: DISP, chiave: 'libreria/grande', nome: 'grande.bin', bytes });
  await operazioni.esegui('file.read', { sessionId: 's1', fileId: o.fileId, versione: o.versione, da: 0, quanti: 1024 }, contesto);
  assert.deepEqual((await operazioni.esegui('file.list', { sessionId: 's1' }, contesto)).items.filter((i) => i.fileId === o.fileId), []);
  assert.deepEqual((await file.offerteInAttesa(DISP)).items, []);
  assert.deepEqual(file.offerte('s1'), []);
  assert.deepEqual(await file.offerteAggiornate('s1'), []);
  assert.deepEqual(visti, [], 'la carta del PC non la vede mai');
  const seguito = await operazioni.esegui('file.read', { sessionId: 's1', fileId: o.fileId, versione: o.versione, da: 1024, quanti: 1024 }, contesto);
  assert.ok(seguito.dati, 'dopo file.list la lettura prosegue');
});

test('LIBRERIA-PONTE-17 una copia non scaricata scade da sola: la voce può sparire dalla finestra o dal modello, strade che il ponte non vede', async (t) => {
  const { copie, operazioni, registrate } = banco(t, { vitaCopiaMs: 20 });
  const o = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  assert.equal(copie().length, 1);
  await new Promise((fatto) => { setTimeout(fatto, 120); });
  assert.equal(copie().length, 0);
  assert.equal(registrate(), 0);
  await assert.rejects(operazioni.esegui('file.read', { sessionId: 's1', fileId: o.fileId, versione: o.versione, da: 0, quanti: 10 }, contesto), { code: 'FILE_GONE' });
});

test('LIBRERIA-PONTE-16 offrire senza dire che cosa si offre non si può', async (t) => {
  const { file } = banco(t);
  await assert.rejects(file.offriDati({ sessionId: 's1', dispositivoId: DISP, nome: 'a.txt', bytes: Buffer.from('a') }), { code: 'BAD_MESSAGE' });
});

test('RICERCA-ESPORTA-01 esportare una ricerca vuole il consenso, e il file arriva con file.read', async (t) => {
  const ricerca = { id: 'r1', titolo: 'Prezzi', stato: 'conclusa', domanda: 'Quanto costa?', contenutoRapporto: 'Costa poco.' };
  await assert.rejects(banco(t, { consentita: false, ricerca }).operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto), { code: 'CONSENT_REQUIRED', stato: 403 });
  const { operazioni } = banco(t, { ricerca });
  const offerta = await operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto);
  assert.deepEqual(Object.keys(offerta).sort(), ['dimensione', 'fileId', 'nome', 'offertaId', 'sha256', 'versione']);
  const letta = await operazioni.esegui('file.read', { sessionId: 's1', fileId: offerta.fileId, versione: offerta.versione, da: 0, quanti: 65_536 }, contesto);
  assert.ok(Buffer.from(letta.dati, 'base64url').length > 0);
  assert.match(offerta.nome, /\.md$/u);
});

test('RICERCA-ESPORTA-02 un formato sconosciuto, una ricerca che non c è e un id storto non offrono niente', async (t) => {
  const { operazioni } = banco(t);
  await assert.rejects(operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto), { code: 'RESEARCH_NOT_FOUND' });
  await assert.rejects(operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: '../x', formato: 'md' }, contesto), { code: 'BAD_MESSAGE' });
  await assert.rejects(operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 7 }, contesto), { code: 'BAD_MESSAGE' });
});

test('RICERCA-ESPORTA-04 eliminare una ricerca toglie le sue esportazioni in sospeso; due formati convivono', async (t) => {
  const ricerca = { id: 'r1', domanda: 'Quanto costa?', contenutoRapporto: 'Costa poco.' };
  const { copie, operazioni } = banco(t, { ricerca });
  await operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto);
  await operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'html' }, contesto);
  assert.equal(copie().length, 2);
  await operazioni.esegui('session.research.delete', { sessionId: 's1', ricercaId: 'r1', confermata: true }, contesto);
  assert.equal(copie().length, 0);
});

test('COPIE-01 D-33: con la cartella bloccata la copia non si legge e non si offre, e sbloccata torna', async (t) => {
  const bloccate = [];
  const ricerca = { id: 'r1', domanda: 'Quanto costa?', contenutoRapporto: 'Costa poco.' };
  const { operazioni, progetto } = banco(t, { bloccate, ricerca });
  const o = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  bloccate.push(progetto);
  await assert.rejects(leggi(operazioni, o), { code: 'FILE_GONE' });
  await assert.rejects(operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v2' }, contesto), { code: 'FILE_GONE' });
  await assert.rejects(operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto), { code: 'FILE_GONE' });
  bloccate.length = 0;
  assert.equal(Buffer.from((await leggi(operazioni, o)).dati, 'base64url').toString(), '# la nota vera v1');
});

test('COPIE-02 D-33: un elenco dei blocchi illeggibile chiude: la copia non si legge', async (t) => {
  const { sessionRegistry, scambio } = banco(t);
  const chiuso = creaFileDeiDispositivi({ cartella: join(scambio, 'altra'), sessionRegistry, bloccateDi: async () => { throw new Error('illeggibile'); } });
  await assert.rejects(chiuso.offriDati({ sessionId: 's1', dispositivoId: DISP, chiave: 'libreria/x', nome: 'a.md', bytes: Buffer.from('a') }), { code: 'FILE_GONE' });
});

const NOMI_VERI = ['Riassunto…', 'Nota finale.', 'Bozza v2.', 'Appunti della riunione...', 'CON', 'Aux.pdf', 'con.md', 'nul', 'COM1.txt', 'LPT9', 'x'.repeat(300)];
const DOMANDE_VERE = ['Con', 'con', 'AUX', 'nul', 'COM1', 'lpt1?', 'fine.', 'CON: la guida'];

test('COPIE-03 D-34: ogni nome vero della Libreria si scarica, e il nome da mostrare resta il suo', async (t) => {
  for (const grezzo of NOMI_VERI) {
    const nome = sanificaNomeLibreria(grezzo);
    const { copie, operazioni, scambio } = banco(t, { nomeVoce: nome });
    const o = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
    assert.equal(o.nome, nome, grezzo);
    const [cartella] = copie();
    assert.deepEqual(readdirSync(join(scambio, 'dati-offerti', cartella)), ['copia'], 'sul disco il nome lo sceglie il PC');
    assert.equal(Buffer.from((await leggi(operazioni, o)).dati, 'base64url').toString(), '# la nota vera v1', grezzo);
  }
});

test('COPIE-04 D-34: ogni domanda vera si esporta, in tutti i formati', async (t) => {
  const { file, operazioni } = banco(t, { ricerca: { id: 'r1' } });
  for (const domanda of DOMANDE_VERE) {
    for (const formato of ['md', 'html', 'pdf', 'docx', 'bib', 'ris']) {
      const nome = nomeSicuroDiEsportazione(domanda, formato, 'it');
      const o = await file.offriDati({ sessionId: 's1', dispositivoId: DISP, chiave: `ricerca/r1/${domanda}/${formato}`, nome, bytes: Buffer.from('byte') });
      assert.equal(o.nome, nome);
      assert.equal(Buffer.from((await leggi(operazioni, o)).dati, 'base64url').toString(), 'byte', nome);
    }
  }
  const con = banco(t, { ricerca: { id: 'r1', domanda: 'Con', contenutoRapporto: 'Testo.' } });
  const o = await con.operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto);
  assert.match(o.nome, /^Con.*\.md$/u);
});

test('COPIE-05 D-34: il nome da mostrare perde i caratteri di controllo e le barre; senza niente da mostrare non si offre', async (t) => {
  const { file } = banco(t);
  const offri = (nome, i = 0) => file.offriDati({ sessionId: 's1', dispositivoId: DISP, chiave: `libreria/n${i}`, nome, bytes: Buffer.from('a') });
  assert.equal((await offri('a\u0007b‮c d\n.md')).nome, 'abcd.md');
  assert.doesNotMatch((await offri('../../fuori.md', 1)).nome, /[\\/]/u);
  for (const nome of ['', '   ', '\u0007', undefined, 7]) await assert.rejects(offri(nome, 2), { code: 'BAD_MESSAGE' }, String(nome));
});

test('COPIE-06 D-35: dietro una giunzione la copia si legge', { skip: process.platform !== 'win32' }, async (t) => {
  const vero = mkdtempSync(join(tmpdir(), 'talos-libreria-vero-'));
  const ponte = `${vero}-ponte`;
  symlinkSync(vero, ponte, 'junction');
  t.after(async () => { await rimuoviCartellaDiProva(ponte); await rimuoviCartellaDiProva(vero); });
  const { operazioni } = banco(t, { dirBase: join(ponte, 'dentro') });
  const o = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  assert.equal(Buffer.from((await leggi(operazioni, o)).dati, 'base64url').toString(), '# la nota vera v1');
});

test('COPIE-07 D-35: col nome corto di Windows, come TEMP sul runner, la copia si legge', { skip: process.platform !== 'win32' }, async (t) => {
  const corto = execFileSync('cmd', ['/d', '/c', `for %I in ("${tmpdir()}") do @echo %~sI`], { encoding: 'utf8', windowsVerbatimArguments: true }).trim();
  if (!corto.includes('~')) { t.skip('la cartella temporanea di questa macchina non ha un nome corto'); return; }
  const dir = mkdtempSync(join(corto, 'talos-libreria-nome-corto-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const { operazioni } = banco(t, { dirBase: join(dir, 'dentro') });
  const o = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  assert.equal(Buffer.from((await leggi(operazioni, o)).dati, 'base64url').toString(), '# la nota vera v1');
});

test('COPIE-08 D-36: ogni rifiuto del ponte porta il suo stato', async (t) => {
  const { operazioni } = banco(t);
  const vuota = banco(t, { ricerca: { id: 'r1', domanda: 'x' } });
  const piena = banco(t, { ricerca: { id: 'r1', domanda: 'x', contenutoRapporto: 'testo' } });
  const casi = [
    [operazioni, 'session.library.fetch', { sessionId: 's1', voceId: 'manca' }, 'LIBRARY_NOT_FOUND', 404],
    [operazioni, 'session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, 'RESEARCH_NOT_FOUND', 404],
    [piena.operazioni, 'session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'zip' }, 'RESEARCH_INVALID', 400],
    [piena.operazioni, 'session.research.export', { sessionId: 's1', ricercaId: 'r1' }, 'RESEARCH_INVALID', 400],
    [vuota.operazioni, 'session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, 'RESEARCH_CONFLICT', 409],
    [operazioni, 'session.library.fetch', { sessionId: 's1', voceId: '../x' }, 'BAD_MESSAGE', 400],
    [operazioni, 'session.library.list', { sessionId: '../x' }, 'BAD_MESSAGE', 400],
    [operazioni, 'file.upload.begin', { sessionId: 's1', nome: 'a/b.txt', dimensione: 1, sha256: 'a'.repeat(64) }, 'QUERY_INVALID', 400],
    [operazioni, 'shell.exec', {}, 'UNKNOWN_OPERATION', 404],
    [operazioni, 'session.events', { sessionId: 's1' }, 'BAD_MESSAGE', 400],
    [operazioni, 'session.library.delete', { sessionId: 's1', voceId: 'v1' }, 'CONFIRMATION_REQUIRED', 409],
  ];
  for (const [ops, op, args, code, stato] of casi) {
    const e = await ops.esegui(op, args, contesto).then(() => null, (x) => x);
    assert.deepEqual([e?.code, e?.stato], [code, stato], op);
  }
});

test('COPIE-09 D-36: uno stato del ponte è lo stesso che dà la rotta del PC; un rifiuto che non si sa leggere è incerto', async (t) => {
  const sorgente = readFileSync(fileURLToPath(new URL('../src/http-app.mjs', import.meta.url)), 'utf8');
  const tabella = sorgente.slice(sorgente.indexOf('const STATUS_BY_CODE'));
  for (const [code, stato] of Object.entries(STATI_DEI_RIFIUTI)) {
    const riga = new RegExp(`\\b${code}: (\\d{3})\\b`, 'u').exec(tabella);
    if (riga) assert.equal(Number(riga[1]), stato, code);
  }
  const { operazioni } = banco(t, { rifiuto: { erroreAvvio: 'guasto', code: 'LIBRARY_READ_FAILED' } });
  await assert.rejects(operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto), { code: 'LIBRARY_READ_FAILED', stato: 500 });
});

test('COPIE-10 D-37: un guasto del disco non porta il percorso del PC, e dice un codice che il dispositivo conosce', async (t) => {
  const { operazioni, scambio } = banco(t);
  writeFileSync(join(scambio, 'dati-offerti'), 'un file al posto della cartella');
  const e = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto).then(() => null, (x) => x);
  assert.deepEqual([e?.code, e?.stato, e?.reason], ['OPERATION_FAILED', 500, 'save-failed']);
  assert.equal(e.message.includes(scambio), false);
  assert.doesNotMatch(e.message, /[A-Za-z]:[\\/]/u);
});

test('RICERCA-ESPORTA-03 una ricerca che non ha prodotto niente e un rifiuto del registro non portano percorsi del PC, e un codice fuori elenco diventa OPERATION_FAILED', async (t) => {
  const vuota = banco(t, { ricerca: { id: 'r1', domanda: 'Quanto costa?' } });
  await assert.rejects(vuota.operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto), { code: 'RESEARCH_CONFLICT' });
  const { operazioni } = banco(t, { rifiuto: { erroreAvvio: 'Cannot read C:\\Users\\persona\\dati\\r1.json', code: 'RESEARCH_STORE_UNAVAILABLE' } });
  await assert.rejects(operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto), (e) => e.code === 'OPERATION_FAILED' && !e.message.includes('persona'));
  await assert.rejects(operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto), (e) => e.code === 'OPERATION_FAILED' && !e.message.includes('persona'));
});

test('PERCORSI-URL un indirizzo web resta intero; un percorso del PC no, anche dentro file:', () => {
  for (const url of ['https://example.com/home/news/articolo-1', 'https://www.gov.it/var/storage/doc.pdf', 'http://host/tmp/a/b.txt', 'vedi https://x.it/Users/mario/profilo qui', 'https://example.com/a?x=1#/home/y', '../home/x/y.txt', 'a/home/b/c']) {
    assert.equal(senzaPercorsiAssoluti(url), url, url);
  }
  assert.equal(senzaPercorsiAssoluti('file:///home/persona/doc.txt'), '…/doc.txt');
  assert.equal(senzaPercorsiAssoluti('file:///C:/Users/persona/doc.txt'), '…/doc.txt');
  assert.equal(senzaPercorsiAssoluti('in /home/persona/doc.txt'), 'in …/doc.txt');
  assert.equal(senzaPercorsiAssoluti('percorso:/home/anna/segreti/note.txt'), 'percorso:…/note.txt');
  assert.equal(senzaPercorsiAssoluti('PATH=/usr/bin:/home/anna/.local/bin:/opt').includes('anna'), false);
  for (const url of ['http://1.2.3.4:80/var/a/b', 'https://home/x/y']) assert.equal(senzaPercorsiAssoluti(url), url, url);
  assert.equal(senzaPercorsiAssoluti('(/mnt/c/Users/persona/a.txt)'), '(…/a.txt)');
  assert.equal(senzaPercorsiAssoluti('C:\\Users\\persona\\doc.txt'), '…/doc.txt');
});

test('COPIE-11 punto 8: una copia non si legge più dopo la revoca, e torna leggibile col consenso', async (t) => {
  const b = banco(t);
  const offerta = await b.operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  b.cartelle.consentita = async () => false;
  await assert.rejects(leggi(b.operazioni, offerta), { code: 'CONSENT_REQUIRED', stato: 403 });
  b.cartelle.consentita = async () => true;
  assert.ok((await leggi(b.operazioni, offerta)).dati);
});

test('COPIE-12 punti 9-11: una voce o una ricerca eliminata da un\'altra strada non si legge più, e la copia sparisce', async (t) => {
  const b = banco(t, { ricerca: { id: 'r1', titolo: 'Prezzi', stato: 'conclusa', domanda: 'Quanto?', contenutoRapporto: 'Costa poco.' } });
  const voce = await b.operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  const ricerca = await b.operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto);
  assert.equal(b.copie().length, 2);
  b.sessionRegistry.elencaVersioniLibreria = async () => ({ erroreAvvio: 'no', code: 'LIBRARY_NOT_FOUND' });
  await assert.rejects(leggi(b.operazioni, voce), { code: 'FILE_GONE', stato: 410 });
  assert.equal(b.copie().length, 1);
  b.sessionRegistry.leggiRicerca = async () => ({ ricerca: null });
  await assert.rejects(leggi(b.operazioni, ricerca), { code: 'FILE_GONE', stato: 410 });
  assert.equal(b.copie().length, 0);
});

test('COPIE-13 file.read di un file della conversazione non guarda la Libreria', async (t) => {
  const b = banco(t);
  const copia = await b.file.copiaDelFile({ dispositivoId: 'x', sessionId: 's1', fileId: 'nessuno' });
  assert.equal(copia, null);
});

test('COPIE-14 M1: una copia di una cartella bloccata dice FILE_GONE, non chiede un consenso che non può avere', async (t) => {
  const bloccate = [];
  const b = banco(t, { bloccate });
  const offerta = await b.operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  bloccate.push(b.progetto);
  b.cartelle.consentita = async () => false;
  await assert.rejects(leggi(b.operazioni, offerta), { code: 'FILE_GONE', stato: 410 });
  await assert.rejects(b.operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v2' }, contesto), { code: 'FILE_GONE', stato: 410 });
  bloccate.length = 0;
  await assert.rejects(leggi(b.operazioni, offerta), { code: 'CONSENT_REQUIRED', stato: 403 }, 'sbloccata e senza consenso è una revoca');
  b.cartelle.consentita = async () => true;
  assert.ok((await leggi(b.operazioni, offerta)).dati, 'la copia è ancora lì');
});

test('COPIE-15 M3: l\'esportazione non sopravvive alla voce del rapporto eliminata', async (t) => {
  const voci = new Set(['rep1']);
  const b = banco(t, { ricerca: { id: 'r1', titolo: 'Prezzi', stato: 'conclusa', domanda: 'Quanto?', contenutoRapporto: 'Rapporto riservato.', reportLibraryId: 'rep1' } });
  b.sessionRegistry.elencaVersioniLibreria = async (_s, id) => (voci.has(id) ? { ok: true, versioni: [], totale: 0 } : { erroreAvvio: 'no', code: 'LIBRARY_NOT_FOUND' });
  const esporta = () => b.operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto);
  assert.ok((await leggi(b.operazioni, await esporta())).dati, 'col rapporto si legge');
  const offerta = await esporta(); // scaricarla tutta la toglie: serve una copia nuova
  voci.delete('rep1');
  await assert.rejects(leggi(b.operazioni, offerta), { code: 'FILE_GONE', stato: 410 });
  assert.equal(b.copie().length, 0, 'e la copia sparisce');
});

test('COPIE-16 M3: una ricerca senza rapporto non guarda la Libreria', async (t) => {
  const b = banco(t, { ricerca: { id: 'r1', titolo: 'Prezzi', stato: 'conclusa', domanda: 'Quanto?', contenutoRapporto: 'x', reportLibraryId: null } });
  b.sessionRegistry.elencaVersioniLibreria = async () => { throw new Error('non doveva guardare'); };
  const offerta = await b.operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto);
  assert.ok((await leggi(b.operazioni, offerta)).dati);
});

test('COPIE-17 N4: la forma si giudica prima del consenso, anche per le voci senza rotta', async (t) => {
  const { chiamate, operazioni } = banco(t, { consentita: false, ricerca: { id: 'r1', titolo: 'x', stato: 'conclusa', domanda: 'y', contenutoRapporto: 'z' } });
  for (const [op, args] of [
    ['session.library.fetch', { voceId: '../x' }], ['session.library.fetch', { voceId: 7 }], ['session.library.fetch', {}],
    ['session.research.export', { ricercaId: '../x' }], ['session.research.export', { ricercaId: 'r1', formato: 7 }], ['session.research.export', { ricercaId: 'r1', tono: {} }], ['session.research.export', {}],
    ['session.library.rename', { voceId: 'v1', corpo: 'x' }], ['session.library.rename', { voceId: 'v1', corpo: [] }], ['session.undo', { turn: 1, corpo: 'x' }],
  ]) await assert.rejects(operazioni.esegui(op, { sessionId: 's1', ...args }, contesto), { code: 'BAD_MESSAGE', stato: 400 }, `${op} ${JSON.stringify(args)}`);
  assert.equal(chiamate.length, 0);
  for (const [op, args] of [['session.library.fetch', { voceId: 'v1' }], ['session.research.export', { ricercaId: 'r1', formato: 'md' }], ['session.library.rename', { voceId: 'v1', corpo: { nome: 'x' } }], ['session.undo', { turn: 1, corpo: {} }]]) {
    await assert.rejects(operazioni.esegui(op, { sessionId: 's1', ...args }, contesto), { code: 'CONSENT_REQUIRED' }, `${op}: la forma giusta arriva al consenso`);
  }
});

test('COPIE-18 N9: un guasto passeggero non cancella la copia, e finché dura la copia non esce', async (t) => {
  const b = banco(t);
  const offerta = await b.operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  const sana = b.sessionRegistry.elencaVersioniLibreria;
  for (const code of ['LIBRARY_READ_FAILED', 'LIBRARY_MALFORMED']) {
    b.sessionRegistry.elencaVersioniLibreria = async () => ({ erroreAvvio: 'C:\\Users\\Anna\\voce', code });
    await assert.rejects(leggi(b.operazioni, offerta), (e) => e.code === 'OPERATION_FAILED' && e.stato === 500 && !/Anna/u.test(e.message), code);
    assert.equal(b.copie().length, 1, 'la copia resta');
  }
  b.sessionRegistry.elencaVersioniLibreria = async () => { throw new Error('disco giù'); };
  await assert.rejects(leggi(b.operazioni, offerta), { message: 'disco giù' });
  assert.equal(b.copie().length, 1);
  b.sessionRegistry.elencaVersioniLibreria = sana;
  assert.ok((await leggi(b.operazioni, offerta)).dati, 'a guasto finito si legge');
});

test('COPIE-19 N9: lo stesso per una ricerca e per la voce del suo rapporto', async (t) => {
  const b = banco(t, { ricerca: { id: 'r1', titolo: 'Prezzi', stato: 'conclusa', domanda: 'Quanto?', contenutoRapporto: 'Rapporto.', reportLibraryId: 'rep1' } });
  const offerta = await b.operazioni.esegui('session.research.export', { sessionId: 's1', ricercaId: 'r1', formato: 'md' }, contesto);
  const sana = b.sessionRegistry.leggiRicerca;
  b.sessionRegistry.leggiRicerca = async () => ({ ok: true, ricerca: null, errore: 'giornale illeggibile' });
  await assert.rejects(leggi(b.operazioni, offerta), { code: 'OPERATION_FAILED', stato: 500 });
  assert.equal(b.copie().length, 1, 'ricerca illeggibile, non eliminata');
  b.sessionRegistry.leggiRicerca = sana;
  b.sessionRegistry.elencaVersioniLibreria = async () => ({ erroreAvvio: 'x', code: 'LIBRARY_READ_FAILED' });
  await assert.rejects(leggi(b.operazioni, offerta), { code: 'OPERATION_FAILED', stato: 500 });
  assert.equal(b.copie().length, 1, 'rapporto illeggibile, non eliminato');
  b.sessionRegistry.elencaVersioniLibreria = async () => ({ erroreAvvio: 'x', code: 'LIBRARY_NOT_FOUND' });
  await assert.rejects(leggi(b.operazioni, offerta), { code: 'FILE_GONE', stato: 410 });
  assert.equal(b.copie().length, 0, 'quando la voce non esiste davvero si toglie');
});

test('COPIE-20 N9: la sessione che non esiste più toglie la copia', async (t) => {
  const b = banco(t);
  const offerta = await b.operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
  b.sessionRegistry.elencaVersioniLibreria = async () => ({ erroreAvvio: 'Session not found', code: 'NOT_FOUND' });
  await assert.rejects(leggi(b.operazioni, offerta), { code: 'FILE_GONE', stato: 410 });
  assert.equal(b.copie().length, 0);
});


for (const [coda, nome] of [['\u00a0', 'spazio duro'], ['\u3000', 'spazio ideografico'], [' ', 'spazio']]) {
  test(`COPIE-21 D7: una cartella bloccata col nome che finisce con uno ${nome} resta bloccata`, { skip: coda === ' ' && process.platform === 'win32' }, async (t) => {
    const bloccate = [];
    const ricerca = { id: 'r1', domanda: 'Quanto costa?', contenutoRapporto: 'Costa poco.' };
    const { operazioni, progetto, sessionRegistry } = banco(t, { bloccate, ricerca });
    const fermo = join(progetto, `fermo${coda}`);
    mkdirSync(fermo);
    sessionRegistry.cartellaPerChatFile = async () => ({ ok: true, cartella: fermo });
    const o = await operazioni.esegui('session.library.fetch', { sessionId: 's1', voceId: 'v1' }, contesto);
    bloccate.push(fermo);
    await assert.rejects(leggi(operazioni, o), { code: 'FILE_GONE' });
    await assert.rejects(operazioni.esegui('session.library.list', { sessionId: 's1' }, contesto), { code: 'FOLDER_BLOCKED', stato: 409 });
    await assert.rejects(operazioni.esegui('session.research.list', { sessionId: 's1' }, contesto), { code: 'FOLDER_BLOCKED', stato: 409 });
    bloccate.length = 0;
    assert.equal(Buffer.from((await leggi(operazioni, o)).dati, 'base64url').toString(), '# la nota vera v1', 'sbloccata, torna');
  });
}
